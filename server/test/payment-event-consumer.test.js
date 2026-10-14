import assert from 'node:assert/strict';
import { createCipheriv } from 'node:crypto';
import test from 'node:test';
import { encryptInboundPayload } from '../src/payments/wechatpay-callback.js';
import { createPaymentEventConsumer } from '../src/payments/payment-event-consumer.js';

const apiV3Key = '12345678901234567890123456789012';
const inboundEncryptionKey = 'abcdefghijklmnopqrstuvwxyz123456';

function resource(payload) {
  const nonce = 'consumer-nonce'; const aad = 'transaction';
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(apiV3Key), Buffer.from(nonce)); cipher.setAAD(Buffer.from(aad));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final(), cipher.getAuthTag()]);
  return { nonce, associated_data: aad, ciphertext: encrypted.toString('base64') };
}

test('payment event consumer settles a verified success event once and completes its ledger entry', async () => {
  const raw = Buffer.from(JSON.stringify({ resource: resource({ trade_state: 'SUCCESS', out_trade_no: 'order-1', transaction_id: 'wx-1' }) }));
  const encrypted = encryptInboundPayload(raw, inboundEncryptionKey); let complete; let input;
  const consumer = createPaymentEventConsumer({
    inboundRepository: { claimNext: async () => ({ id: 6, event_type: 'TRANSACTION.SUCCESS', payload_nonce: encrypted.nonce, encrypted_payload: encrypted.ciphertext }), complete: async (id, name) => { complete = { id, name }; }, block: async () => assert.fail('must not block') },
    settlementRepository: { settleTransaction: async (value) => { input = value; return { settled: true, duplicate: false }; } }, apiV3Key, inboundEncryptionKey
  });
  assert.deepEqual(await consumer.consumeOne(), { consumed: true, settled: true, duplicate: false });
  assert.deepEqual(input, { outTradeNo: 'order-1', transactionId: 'wx-1' }); assert.deepEqual(complete, { id: 6, name: 'wechat-transaction-settlement' });
});

test('payment event consumer routes an SP mixed-points order to its dedicated settlement', async () => {
  const raw = Buffer.from(JSON.stringify({ resource: resource({ trade_state: 'SUCCESS', out_trade_no: 'SP202609220001', transaction_id: 'wx-points-1' }) }));
  const encrypted = encryptInboundPayload(raw, inboundEncryptionKey); let pointsInput;
  const consumer = createPaymentEventConsumer({
    inboundRepository: { claimNext: async () => ({ id: 61, event_type: 'TRANSACTION.SUCCESS', payload_nonce: encrypted.nonce, encrypted_payload: encrypted.ciphertext }), complete: async () => {}, block: async () => assert.fail('must not block') },
    settlementRepository: {
      settleTransaction: async () => assert.fail('must not use normal-order settlement'),
      settlePointsTransaction: async (value) => { pointsInput = value; return { settled: true, duplicate: false }; }
    }, apiV3Key, inboundEncryptionKey
  });
  assert.deepEqual(await consumer.consumeOne(), { consumed: true, settled: true, duplicate: false });
  assert.deepEqual(pointsInput, { outTradeNo: 'SP202609220001', transactionId: 'wx-points-1' });
});

test('payment event consumer blocks malformed events without settling an order', async () => {
  const encrypted = encryptInboundPayload(Buffer.from('{}'), inboundEncryptionKey); let blocked;
  const consumer = createPaymentEventConsumer({ inboundRepository: { claimNext: async () => ({ id: 7, event_type: 'TRANSACTION.SUCCESS', payload_nonce: encrypted.nonce, encrypted_payload: encrypted.ciphertext }), complete: async () => assert.fail('must not complete'), block: async (_id, _name, code) => { blocked = code; } }, settlementRepository: { settleTransaction: async () => assert.fail('must not settle') }, apiV3Key, inboundEncryptionKey });
  assert.deepEqual(await consumer.consumeOne(), { consumed: true, blocked: true }); assert.equal(blocked, 'UNSUPPORTED_EVENT');
});

test('payment event consumer keeps an infrastructure failure for safe stale-claim replay', async () => {
  const raw = Buffer.from(JSON.stringify({ resource: resource({ trade_state: 'SUCCESS', out_trade_no: 'order-2', transaction_id: 'wx-2' }) }));
  const encrypted = encryptInboundPayload(raw, inboundEncryptionKey); let blocked = false;
  const consumer = createPaymentEventConsumer({
    inboundRepository: { claimNext: async () => ({ id: 8, event_type: 'TRANSACTION.SUCCESS', payload_nonce: encrypted.nonce, encrypted_payload: encrypted.ciphertext }), complete: async () => assert.fail('must not complete'), block: async () => { blocked = true; } },
    settlementRepository: { settleTransaction: async () => { throw new Error('database temporarily unavailable'); } }, apiV3Key, inboundEncryptionKey
  });
  assert.deepEqual(await consumer.consumeOne(), { consumed: true, deferred: true });
  assert.equal(blocked, false);
});

test('payment event consumer settles a verified refund callback idempotently', async () => {
  const raw = Buffer.from(JSON.stringify({ resource: resource({ refund_status: 'SUCCESS', out_refund_no: 'RF-1', refund_id: 'refund-1' }) }));
  const encrypted = encryptInboundPayload(raw, inboundEncryptionKey); let input;
  const consumer = createPaymentEventConsumer({ inboundRepository: { claimNext: async () => ({ id: 9, event_type: 'REFUND.SUCCESS', payload_nonce: encrypted.nonce, encrypted_payload: encrypted.ciphertext }), complete: async () => {}, block: async () => assert.fail('must not block') }, settlementRepository: { settleTransaction: async () => assert.fail('must not settle transaction'), settleRefund: async (value) => { input = value; return { settled: true, duplicate: false }; } }, apiV3Key, inboundEncryptionKey });
  assert.deepEqual(await consumer.consumeOne(), { consumed: true, settled: true, duplicate: false });
  assert.deepEqual(input, { outRefundNo: 'RF-1', refundId: 'refund-1' });
});
