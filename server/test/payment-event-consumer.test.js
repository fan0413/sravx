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
    inboundRepository: { claimNext: async () => ({ id: 6, event_type: 'TRANSACTION.SUCCESS', payload_nonce: encrypted.nonce, encrypted_payload: encrypted.ciphertext }), complete: async (id) => { complete = id; }, block: async () => assert.fail('must not block') },
    settlementRepository: { settleTransaction: async (value) => { input = value; return { settled: true, duplicate: false }; } }, apiV3Key, inboundEncryptionKey
  });
  assert.deepEqual(await consumer.consumeOne(), { consumed: true, settled: true, duplicate: false });
  assert.deepEqual(input, { outTradeNo: 'order-1', transactionId: 'wx-1' }); assert.equal(complete, 6);
});

test('payment event consumer blocks malformed events without settling an order', async () => {
  const encrypted = encryptInboundPayload(Buffer.from('{}'), inboundEncryptionKey); let blocked;
  const consumer = createPaymentEventConsumer({ inboundRepository: { claimNext: async () => ({ id: 7, event_type: 'TRANSACTION.SUCCESS', payload_nonce: encrypted.nonce, encrypted_payload: encrypted.ciphertext }), complete: async () => assert.fail('must not complete'), block: async (_id, code) => { blocked = code; } }, settlementRepository: { settleTransaction: async () => assert.fail('must not settle') }, apiV3Key, inboundEncryptionKey });
  assert.deepEqual(await consumer.consumeOne(), { consumed: true, blocked: true }); assert.equal(blocked, 'UNSUPPORTED_EVENT');
});
