import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import { createWechatPayRefundClient } from '../src/payments/wechatpay-refund-client.js';
import { createWechatPayRefundRequester } from '../src/payments/wechatpay-refund-requester.js';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
function client(request, notifyUrl = 'https://api.sravxpet.com/api/v1/payments/wechat/notifications') { return createWechatPayRefundClient({ mchId: '1111315527', merchantSerialNo: 'SERIAL-1', merchantPrivateKeyPath: '/private/key.pem', notifyUrl, request, readPrivateKey: () => privateKey.export({ type: 'pkcs8', format: 'pem' }), now: () => 1_800_000_000 }); }

test('refund client signs a server-owned full refund request', async () => {
  let sent;
  const result = await client(async (value) => { sent = value; return { status: 200, data: { refund_id: 'refund-1', status: 'PROCESSING' } }; }).createRefund({ outRefundNo: 'RF-1', transactionId: 'TX-1', refundAmountFen: 9900, totalAmountFen: 9900, reason: '审核退款' });
  assert.deepEqual(result, { refundId: 'refund-1', status: 'PROCESSING', outRefundNo: 'RF-1' });
  assert.equal(sent.path, '/v3/refund/domestic/refunds');
  assert.deepEqual(JSON.parse(sent.body).amount, { refund: 9900, total: 9900, currency: 'CNY' });
  assert.match(sent.headers.authorization, /^WECHATPAY2-SHA256-RSA2048 /);
});

test('refund client refuses an unsafe amount and requester refuses another path', async () => {
  const api = client(async () => assert.fail('must not request'));
  await assert.rejects(api.createRefund({ outRefundNo: 'RF-1', transactionId: 'TX-1', refundAmountFen: 10000, totalAmountFen: 9900 }));
  assert.throws(() => client(async () => assert.fail('must not request'), 'http://unsafe.example/callback'));
  const requester = createWechatPayRefundRequester({ fetcher: async () => assert.fail('must not fetch') });
  await assert.rejects(requester({ method: 'POST', path: '/v3/pay/transactions/jsapi', body: '{}', headers: { authorization: 'x' } }));
});
