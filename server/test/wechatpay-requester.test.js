import assert from 'node:assert/strict';
import test from 'node:test';
import { createWechatPayRequester } from '../src/payments/wechatpay-requester.js';

test('WeChat Pay requester only permits the JSAPI transaction endpoint', async () => {
  let url;
  const request = createWechatPayRequester({ fetcher: async (value) => { url = value; return { status: 200, json: async () => ({ prepay_id: 'x' }) }; } });
  assert.deepEqual(await request({ method: 'POST', path: '/v3/pay/transactions/jsapi', body: '{}', headers: { authorization: 'signed' } }), { status: 200, data: { prepay_id: 'x' } });
  assert.equal(url, 'https://api.mch.weixin.qq.com/v3/pay/transactions/jsapi');
  await assert.rejects(request({ method: 'POST', path: '/other', body: '{}', headers: { authorization: 'signed' } }), /Invalid/);
});
