import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const bundle = await readFile('dist/build/mp-weixin/common/vendor.js', 'utf8');
// Default HBuilderX/CLI builds now share a server-only implementation.
for (const path of ['/api/v1/addresses', '/api/v1/orders', '/api/v1/payments/wechat/orders/', '/api/v1/auth/wechat/session']) assert.ok(bundle.includes(path), `Missing server route: ${path}`);
assert.doesNotMatch(bundle, /paymentProxy|cloudCall|callFunction|VITE_SRAVX_API_MIGRATION/);
const app = await readFile('dist/build/mp-weixin/app.js', 'utf8');
assert.doesNotMatch(app, /cloud1-|cloud\.init/);
const checkout = JSON.parse(await readFile('dist/build/mp-weixin/pages/confirm-order/index.json', 'utf8'));
assert.equal(checkout.navigationStyle, 'custom');
const source = await readFile('dist/build/mp-weixin/pages/confirm-order/index.js', 'utf8');
assert.match(source, /backend:\w+\.__sravxOrderBackend/);
console.log('服务器构建核验通过：登录/地址/订单/支付直连服务器，无旧云函数调用，单一标题栏及订单来源标记已编入。');
