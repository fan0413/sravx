import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as selection from '../common/web-purchase.mjs';
import { catalogProduct } from '../common/product-classification.mjs';

function pageFor(product, enabled = false) {
  const source = fs.readFileSync(new URL('../pages/product-detail/index.vue', import.meta.url), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1]
    .replace(/^import .*$/gm, '').replace('export default', 'globalThis.component =');
  const added = [], messages = [];
  const context = { ...selection, SravxProductPurchaseH5: {}, api: { getProductDetail: async () => catalogProduct(product), structuredCheckoutEnabled: () => enabled }, cart: { add: item => added.push(item) }, uni: { showToast: item => messages.push(item.title), reLaunch() {} }, setTimeout() {} };
  vm.createContext(context); vm.runInContext(source, context);
  const component = context.component, page = component.data();
  for (const [key, fn] of Object.entries(component.methods)) page[key] = fn.bind(page);
  for (const [key, fn] of Object.entries(component.computed)) Object.defineProperty(page, key, { get: fn.bind(page) });
  return { page, added, messages };
}
test('mini uses the same explicit zero price, images, colors and selected fulfillment as web', async () => {
  const product = { id: 1, stock: 2, price: 10, images: '["https://media.example.test/one.png"]', params: { 颜色: '银色', 核心材质: '测试材质' }, specs: [{ name: '零价测试型号', price: 0, shipping_promise: '测试发货', shipping_note: '型号说明' }, { name: '第二型号', price: 20, shipping_note: '第二说明' }] };
  const { page, added } = pageFor(product);
  await page.load(1); assert.equal(page.displayPrice, 'RMB 0.00'); assert.equal(page.images.length, 1);
  assert.equal(page.shipping.note, '型号说明'); page.add(); assert.equal(added[0].price, 0);
  page.selectModel(page.modelOptions[1]); assert.equal(page.shipping.note, '第二说明');
  assert.equal(page.params[0].value, '测试材质');
});
test('missing price, empty inventory and disabled structured checkout never fall back to legacy cart', async () => {
  for (const product of [{ id: 1 }, { id: 1, price: 1, stock: 0 }, { id: 1, price: 1, stock: 'broken' }, { id: 1, price: 1, is_on_sale: 0 }]) {
    const fixture = pageFor(product); await fixture.page.load(1); fixture.page.add(); assert.equal(fixture.added.length, 0);
  }
  const product = { id: 1, price: 1, models: [{ id: 2, name: '测试型号' }], colors: [{ id: 3, name: '测试颜色' }], skus: [{ id: 4, model_id: 2, color_id: 3, available: 1, price_fen: 100, is_on_sale: 1 }] };
  const blocked = pageFor(product); await blocked.page.load(1); blocked.page.add();
  assert.equal(blocked.added.length, 0); assert.match(blocked.messages[0], /暂未开放/);
  const enabled = pageFor(product, true); await enabled.page.load(1); enabled.page.add(); assert.equal(enabled.added[0].skuId, 4);
});

test('accessories hide technical parameters without hiding product story or selection', async () => {
  const fixture = pageFor({ id: 1, series: 'accessories', tool_group: 'accessories', classification_source: 'normalized', price: 1, params: { 核心材质: '旧信息' }, detail_images: ['https://media.example.test/story.png'] });
  await fixture.page.load(1);
  assert.equal(fixture.page.params.length, 0);
  assert.equal(fixture.page.detailImages.length, 1);
  assert.equal(fixture.page.modelOptions.length, 1);
  const template = fs.readFileSync(new URL('../pages/product-detail/index.vue', import.meta.url), 'utf8').split('<script>')[0];
  assert.match(template, /<view v-if="params.length" class="spec">/);
  for (const series of ['basic', 'pro', 'master']) {
    const scissors = pageFor({ id: 1, series, tool_group: 'straight', classification_source: 'normalized', price: 1, params: { 核心材质: '测试材质' } });
    await scissors.page.load(1);
    assert.equal(scissors.page.params.length, 5);
    assert.equal(scissors.page.params[0].value, '测试材质');
  }
});

test('repository project entry targets the primary UniApp build with the same AppID', () => {
  const root = JSON.parse(fs.readFileSync(new URL('../../project.config.json', import.meta.url), 'utf8'));
  // UniApp's manifest is JSON with comments rather than strict JSON.
  const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''));
  assert.equal(root.miniprogramRoot, 'sravx/dist/build/mp-weixin/');
  assert.equal(root.appid, manifest['mp-weixin'].appid);
});
