import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import test from 'node:test';
import { createWechatPayJsapiClient } from '../src/payments/wechatpay-jsapi-client.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const now = 1_800_000_000;

function client(request) {
  return createWechatPayJsapiClient({
    appId: 'wx-test', mchId: '1111315527', merchantSerialNo: 'SERIAL', merchantPrivateKeyPath: '/secure/key.pem', request,
    readPrivateKey: () => privateKey.export({ type: 'pkcs8', format: 'pem' }), now: () => now
  });
}

test('JSAPI client creates a signed server-controlled transaction and payment parameters', async () => {
  let request;
  const parameters = await client(async (input) => { request = input; return { status: 200, data: { prepay_id: 'prepay-123' } }; }).createTransaction({
    outTradeNo: 'order-20260919', description: 'SRAVX 商品订单', amountFen: 1099, openid: 'openid-1', notifyUrl: 'https://api.sravxpet.com/api/v1/payments/wechat/notifications'
  });
  assert.equal(request.path, '/v3/pay/transactions/jsapi');
  assert.deepEqual(JSON.parse(request.body).amount, { total: 1099, currency: 'CNY' });
  assert.equal(JSON.parse(request.body).out_trade_no, 'order-20260919');
  assert.match(request.headers.authorization, /^WECHATPAY2-SHA256-RSA2048 /);
  assert.equal(parameters.package, 'prepay_id=prepay-123');
  assert.equal(verify('RSA-SHA256', Buffer.from(`wx-test\n${parameters.timeStamp}\n${parameters.nonceStr}\n${parameters.package}\n`), publicKey, Buffer.from(parameters.paySign, 'base64')), true);
});

test('JSAPI client rejects invalid money and refuses a missing prepay id', async () => {
  await assert.rejects(client(async () => ({ status: 200, data: {} })).createTransaction({ outTradeNo: 'order-1', description: '订单', amountFen: 1, openid: 'openid', notifyUrl: 'https://api.sravxpet.com/callback' }), /WECHAT_PAY_TRANSACTION_NOT_CREATED/);
  await assert.rejects(client(async () => ({ status: 200, data: { prepay_id: 'x' } })).createTransaction({ outTradeNo: 'order-1', description: '订单', amountFen: 0, openid: 'openid', notifyUrl: 'https://api.sravxpet.com/callback' }), /amountFen/);
});
