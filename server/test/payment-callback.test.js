import assert from 'node:assert/strict';
import { createCipheriv, generateKeyPairSync, sign } from 'node:crypto';
import { once } from 'node:events';
import test from 'node:test';
import { createMysqlPaymentInboundRepository } from '../src/repositories/mysql-payment-inbound-repository.js';
import { createWechatPayCallbackService, createWechatPayCertificateProvider, decryptInboundPayload, PaymentCallbackError } from '../src/payments/wechatpay-callback.js';
import { createServer } from '../src/server.js';

const sessionSecret = 'test-only-session-secret-which-is-long-enough-123456';
const apiV3Key = '12345678901234567890123456789012';
const inboundEncryptionKey = 'abcdefghijklmnopqrstuvwxyz123456';
const now = 1_800_000_000_000;
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const serial = 'PAYMENT_PLATFORM_SERIAL_001';

function encryptedResource(payload) {
  const nonce = 'callback-nonce';
  const associatedData = 'transaction';
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(apiV3Key), Buffer.from(nonce));
  cipher.setAAD(Buffer.from(associatedData));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final(), cipher.getAuthTag()]);
  return { algorithm: 'AEAD_AES_256_GCM', nonce, associated_data: associatedData, ciphertext: encrypted.toString('base64'), id: 'resource-1' };
}

function signedRequest({ timestamp = Math.floor(now / 1000), body } = {}) {
  const rawBody = Buffer.from(JSON.stringify(body || {
    id: 'event-123', event_type: 'TRANSACTION.SUCCESS', resource_type: 'encrypt-resource', resource: encryptedResource({ transaction_id: 'wx-transaction-1', out_trade_no: 'order-1' })
  }));
  const nonce = 'nonce-123';
  const message = `${timestamp}\n${nonce}\n${rawBody.toString('utf8')}\n`;
  return {
    rawBody,
    headers: {
      'wechatpay-serial': serial,
      'wechatpay-signature': sign('RSA-SHA256', Buffer.from(message), privateKey).toString('base64'),
      'wechatpay-nonce': nonce,
      'wechatpay-timestamp': String(timestamp)
    }
  };
}

function callbackService(recordVerified) {
  return createWechatPayCallbackService({
    certificateProvider: createWechatPayCertificateProvider({ [serial]: publicKey.export({ type: 'spki', format: 'pem' }) }),
    inboundRepository: { recordVerified }, apiV3Key, inboundEncryptionKey, now: () => now
  });
}

test('verified WeChat Pay callback retains the original bytes and only controlled payment metadata', async () => {
  let stored;
  const service = callbackService(async (event) => { stored = event; return { id: 1, duplicate: false }; });
  const request = signedRequest();
  assert.deepEqual(await service.receive(request), { id: 1, duplicate: false });
  assert.equal(stored.eventId, 'event-123');
  assert.equal(stored.transactionId, 'wx-transaction-1');
  assert.equal(stored.outTradeNo, 'order-1');
  assert.equal(Buffer.compare(decryptInboundPayload(stored.encryptedPayload, stored.payloadNonce, inboundEncryptionKey), request.rawBody), 0);
  assert.equal(stored.payloadSha256.length, 32);
  assert.equal('resource' in stored, false);
});

test('payment callback rejects stale and tampered signed requests before persistence', async () => {
  let writes = 0;
  const service = callbackService(async () => { writes += 1; });
  await assert.rejects(service.receive(signedRequest({ timestamp: Math.floor(now / 1000) - 301 })), (error) => error instanceof PaymentCallbackError && error.code === 'STALE_SIGNATURE');
  const tampered = signedRequest();
  tampered.rawBody[4] ^= 1;
  await assert.rejects(service.receive(tampered), (error) => error instanceof PaymentCallbackError && error.code === 'INVALID_SIGNATURE');
  assert.equal(writes, 0);
});

test('payment callback route is hidden by default and acknowledges only persisted verified events', async (t) => {
  const disabled = createServer({ sessionSecret });
  disabled.listen(0, '127.0.0.1'); await once(disabled, 'listening');
  t.after(() => disabled.close());
  const hidden = await fetch(`http://127.0.0.1:${disabled.address().port}/api/v1/payments/wechat/notifications`, { method: 'POST', body: '{}' });
  assert.equal(hidden.status, 404);

  let saved = 0;
  const enabled = createServer({ sessionSecret, paymentCallbackService: callbackService(async () => { saved += 1; return { id: 1, duplicate: false }; }) });
  enabled.listen(0, '127.0.0.1'); await once(enabled, 'listening');
  t.after(() => enabled.close());
  const request = signedRequest();
  const accepted = await fetch(`http://127.0.0.1:${enabled.address().port}/api/v1/payments/wechat/notifications`, { method: 'POST', headers: request.headers, body: request.rawBody });
  assert.equal(accepted.status, 204);
  assert.equal(saved, 1);
});

test('payment inbound repository uses database uniqueness for duplicate callback idempotency', async () => {
  let query;
  const repository = createMysqlPaymentInboundRepository({ execute: async (sql, values) => { query = { sql, values }; return [{ insertId: 17, affectedRows: 2 }]; } });
  const encryptedPayload = Buffer.alloc(32, 2);
  const result = await repository.recordVerified({
    eventId: 'event-123', eventType: 'TRANSACTION.SUCCESS', resourceType: 'encrypt-resource', resourceId: 'resource-1', transactionId: 'wx-transaction-1', outTradeNo: 'order-1', outRefundNo: null, signatureSerial: serial, signatureTimestamp: 1_800_000_000, payloadSha256: Buffer.alloc(32, 1), payloadNonce: Buffer.alloc(12, 3), encryptedPayload, receivedAt: new Date(now)
  });
  assert.deepEqual(result, { id: 17, duplicate: true });
  assert.match(query.sql, /ON DUPLICATE KEY UPDATE duplicate_count = duplicate_count \+ 1/);
  assert.equal(Buffer.compare(query.values[11], encryptedPayload), 0);
});

test('payment inbound repository reclaims only a stale processing event and keeps consumption state aligned', async () => {
  const statements = [];
  const connection = {
    beginTransaction: async () => statements.push('begin'), commit: async () => statements.push('commit'), rollback: async () => statements.push('rollback'), release: () => statements.push('release'),
    execute: async (sql, values) => {
      statements.push({ sql, values });
      if (/SELECT id, event_id/.test(sql)) return [[{ id: 9, event_id: 'event-9', event_type: 'TRANSACTION.SUCCESS', payload_nonce: Buffer.alloc(12), encrypted_payload: Buffer.alloc(32) }]];
      return [{ affectedRows: 1 }];
    }
  };
  const writes = [];
  const repository = createMysqlPaymentInboundRepository({ getConnection: async () => connection, execute: async (sql, values) => { writes.push({ sql, values }); return [{ affectedRows: 1 }]; } });
  const event = await repository.claimNext('worker-a', { staleAfterSeconds: 90 });
  assert.equal(event.id, 9);
  const select = statements.find((entry) => entry.sql?.includes('FROM payment_inbound_events'));
  assert.match(select.sql, /processing_status = 'processing'/);
  assert.match(select.sql, /INTERVAL 90 SECOND/);
  const claim = statements.find((entry) => entry.sql?.includes('ON DUPLICATE KEY UPDATE status = \'processing\''));
  assert.ok(claim);
  await repository.complete(9, 'worker-a');
  await repository.block(10, 'worker-a', 'INVALID_TRANSACTION');
  assert.equal(writes.filter((entry) => entry.sql.includes('payment_event_consumptions')).length, 2);
  assert.equal(writes.filter((entry) => entry.sql.includes('payment_inbound_events')).length, 2);
});

test('payment inbound health summary returns only aggregate status and oldest pending time', async () => {
  const repository = createMysqlPaymentInboundRepository({ execute: async () => [[
    { status: 'received', total: 2, oldest_pending_at: '2026-09-22T00:00:00.000Z' },
    { status: 'blocked', total: 1, oldest_pending_at: null }
  ]] });
  assert.deepEqual(await repository.healthSummary(), {
    byStatus: { received: 2, processing: 0, processed: 0, blocked: 1 },
    oldestPendingAt: '2026-09-22T00:00:00.000Z'
  });
});
