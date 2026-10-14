import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function apiFixture(target = true, payments = target) {
  let source = fs.readFileSync(new URL('../common/api.js', import.meta.url), 'utf8')
    .replace(/^import .*$/gm, '')
    .replace(/import\.meta\.env\.([A-Z_]+)/g, (_, key) => JSON.stringify(key === 'VITE_SRAVX_API_PAYMENTS' ? String(payments) : key.startsWith('VITE_SRAVX_API_') ? String(target) : ''))
    .replace('export default api', 'globalThis.api = api');
  const requests = [], cloud = [];
  const context = { catalogBase: () => '', Date, Math, catalogProduct: x => x, catalogResult: x => x, collectProducts() {}, readCatalog: (_web, action) => action(), uni: {
    login: options => options.success({ code: 'synthetic-code' }), setStorageSync() {}, removeStorageSync() {},
    getStorageSync: () => 'synthetic-session', request(options) { requests.push(options); options.success({ statusCode: 200, data: { success: true, data: { orderId: 123, id: 456, token: 'synthetic-token' } } }); }
  }, wx: { cloud: { callFunction(options) { cloud.push(options); options.success({ result: { success: true, data: { orderId: 123 } } }); } } } };
  vm.createContext(context); vm.runInContext(source, context);
  return { api: context.api, requests, cloud };
}

test('target address CRUD and normal order payment use HTTP without legacy calls', async () => {
  const { api, requests, cloud } = apiFixture();
  await api.getAddressList(); await api.addAddress({ name: 'synthetic', phone: '13800000000', detail: 'synthetic' });
  await api.updateAddress({ id: 456, name: 'synthetic' });
  const order = await api.createOrder({ productId: 1, addressId: 456 });
  assert.equal(order.__sravxOrderBackend, 'target');
  await api.createPaymentOrder({ orderId: order.orderId, backend: order.__sravxOrderBackend });
  assert.equal(cloud.length, 0);
  assert.ok(requests[0].url.endsWith('/api/v1/addresses'));
  assert.ok(requests.at(-1).url.endsWith('/api/v1/payments/wechat/orders/123'));
  assert.equal(requests.at(-1).data.orderType, 'goods');
});

const routes = [
  ['getUserInfo', [], '/api/v1/me', 'GET'], ['updateUserInfo', [{}], '/api/v1/me', 'PUT'],
  ['getUserPoints', [], '/api/v1/me/points', 'GET'], ['getPointsLogs', [], '/api/v1/me/points/logs', 'GET'], ['getMemberLevel', [], '/api/v1/me/membership', 'GET'],
  ['deleteAddress', [1], '/api/v1/addresses/1', 'DELETE'], ['setDefaultAddress', [1], '/api/v1/addresses/1/default', 'PUT'],
  ['getAvailableCoupons', [], '/api/v1/coupons', 'GET'], ['getMyCoupons', [], '/api/v1/me/coupons', 'GET'], ['receiveCoupon', [1], '/api/v1/coupons/1/claims', 'POST'], ['checkCoupon', [1, 10], '/api/v1/coupons/claims/1/check', 'POST'],
  ['getMyScissors', [], '/api/v1/tools', 'GET'], ['bindScissors', ['SYNTHETIC-SN'], '/api/v1/tools', 'POST'], ['unbindScissors', [1], '/api/v1/tools/1', 'DELETE'], ['getWarrantyInfo', ['SYNTHETIC-SN'], '/api/v1/tools/warranty', 'GET'],
  ['getScissorsAfterSale', [1], '/api/v1/tools/1/after-sales', 'GET'], ['applyScissorsAfterSale', [{ bindingId: 1 }], '/api/v1/tools/1/after-sales', 'POST'], ['submitScissorsAfterSaleShipping', [{ requestId: 1 }], '/api/v1/after-sales/1/shipment', 'POST'],
  ['getOrderList', [], '/api/v1/orders', 'GET'], ['getOrderDetail', [1], '/api/v1/orders/1', 'GET'], ['cancelOrder', [1], '/api/v1/orders/1', 'POST'], ['confirmReceive', [1], '/api/v1/orders/1/receive', 'POST'], ['getWaybillToken', [1], '/api/v1/orders/1/waybill', 'GET'],
  ['applyRefundRequest', [{ orderId: 1 }], '/api/v1/refund-requests', 'POST'], ['getRefundRequestList', [1], '/api/v1/refund-requests', 'GET'],
  ['createPointsOrder', [{}], '/api/v1/points-orders', 'POST'], ['getPointsOrderList', [], '/api/v1/points-orders', 'GET'], ['getPointsOrderDetail', [1], '/api/v1/points-orders/1', 'GET'], ['cancelPointsOrder', [1], '/api/v1/points-orders/1', 'POST'],
  ['getGiftCardRedeemRecords', [], '/api/v1/gift-card-redemptions', 'GET'], ['redeemGiftCard', ['SYNTHETIC'], '/api/v1/gift-cards/redeem', 'POST'], ['confirmGiftCardProductAddress', [{ recordId: 1 }], '/api/v1/gift-card-redemptions/1/address', 'POST'],
  ['submitCooperation', [{}], '/api/v1/inquiries', 'POST'], ['createCheckoutQuote', [{}], '/api/v1/checkout/quotes', 'POST'],
  ['getHomeProducts', [], '/api/v1/catalog/home', 'GET'], ['getCategoryList', [], '/api/v1/catalog/categories', 'GET'], ['getBanners', [], '/api/v1/catalog/banners', 'GET'], ['getPointsProducts', [], '/api/v1/catalog/points-products', 'GET']
];
for (const [method, args, path, verb] of routes) test(`server-only route ${method}`, async () => {
  const f = apiFixture(false, false); await f.api[method](...args);
  assert.equal(f.cloud.length, 0); assert.equal(f.requests.length, 1);
  assert.equal(new URL(f.requests[0].url, 'https://api.sravxpet.com').pathname, path); assert.equal(f.requests[0].method, verb);
  if (method === 'redeemGiftCard') assert.ok(f.requests[0].data.idempotencyKey);
});
test('login uses server code exchange and gaps do not trigger legacy or financial execution', async () => {
  const f = apiFixture(false); await f.api.login();
  assert.ok(f.requests[0].url.endsWith('/api/v1/auth/wechat/session')); assert.equal(f.requests[0].header.Authorization, undefined);
  assert.equal(f.cloud.length, 0);
  await assert.rejects(f.api.applyPointsRefundRequest({ orderId: 1 }), /尚未接入服务器/);
  await assert.rejects(f.api.refundOrder({ orderId: 1 }), /管理端审核/);
  assert.equal(f.requests.length, 2);
});
test('production entry contains neither expired environment nor cloud calls', () => {
  for (const file of ['../App.vue', '../common/api.js']) {
    const text = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /wx\.cloud|callFunction|paymentProxy|cloud1-|VITE_SRAVX_API_MIGRATION/);
  }
});

test('default and old build flags still use server; explicit cached legacy IDs are rejected', async () => {
  const legacy = apiFixture(false);
  const order = await legacy.api.createOrder({ productId: 1 });
  assert.equal(order.__sravxOrderBackend, 'target');
  await legacy.api.createPaymentOrder({ orderId: order.orderId, backend: order.__sravxOrderBackend });
  assert.equal(legacy.requests.length, 2);
  assert.equal(legacy.cloud.length, 0);
  const disabled = apiFixture(true, false);
  await disabled.api.createPaymentOrder({ orderId: 123, backend: 'target' });
  await assert.rejects(disabled.api.createPaymentOrder({ orderId: 123, backend: 'cloud' }), /旧环境已停用/);
  assert.equal(disabled.cloud.length, 0);
});

function addressFixture() {
  const source = fs.readFileSync(new URL('../pages/address-manage/index.vue', import.meta.url), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1]
    .replace(/^import .*$/gm, '').replace('export default', 'globalThis.page =');
  const selected = [], messages = []; let calls = 0, returned = 0;
  const context = { SravxPageBack: {}, api: { addAddress: async () => { calls++; return { id: 456 }; } }, uni: { showLoading() {}, hideLoading() {}, showToast: x => messages.push(x.title), setStorageSync: (...args) => selected.push(args), navigateBack: () => returned++ } };
  vm.createContext(context); vm.runInContext(source, context);
  const page = context.page.data();
  for (const [name, method] of Object.entries(context.page.methods)) page[name] = method.bind(page);
  return { page, selected, messages, calls: () => calls, returned: () => returned };
}

test('saved address from checkout is selected and returns immediately; duplicate save blocked', async () => {
  const f = addressFixture();
  Object.assign(f.page, { from: 'confirmOrder', selectMode: true, form: { name: 'synthetic', phone: '13800000000', province: 'synthetic', city: 'synthetic', district: 'synthetic', detail: 'synthetic' } });
  await Promise.all([f.page.saveAddress(), f.page.saveAddress()]);
  assert.equal(f.calls(), 1); assert.equal(f.returned(), 1);
  assert.equal(f.selected[0][0], 'sravx_selected_address'); assert.equal(f.selected[0][1].id, 456);
  assert.equal(f.page.saving, false);
});

test('checkout uses only custom navigation and forwards actual order source', () => {
  const config = fs.readFileSync(new URL('../pages.json', import.meta.url), 'utf8');
  assert.match(config, /pages\/confirm-order\/index[^\n]+navigationStyle": "custom"/);
  const source = fs.readFileSync(new URL('../pages/confirm-order/index.vue', import.meta.url), 'utf8');
  assert.match(source, /backend:order\.__sravxOrderBackend/);
  assert.match(source, /backend:result\.__sravxOrderBackend/);
  assert.match(source, /\.nav\{box-sizing:border-box\}/);
});
