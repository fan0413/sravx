import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as selection from '../common/web-purchase.mjs';
import { catalogProduct } from '../common/product-classification.mjs';

function componentFor(product, enabled = false) {
  const source = fs.readFileSync(new URL('../components/SravxProductPurchaseH5.vue', import.meta.url), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1]
    .replace(/^import .*$/gm, '').replace('export default', 'globalThis.component =');
  const added = [], saved = new Map(); let reads = 0;
  const context = { ...selection, SravxH5GlobalNav: {}, BuyButton: {}, api: { getProductDetail: async () => { reads++; return catalogProduct(product); }, structuredCheckoutEnabled: () => enabled }, cart: { add: item => added.push(item) }, uni: { getStorageSync: key => saved.get(key), setStorageSync: (key, value) => saved.set(key, value), navigateTo() {} }, document: { hidden: false } };
  vm.createContext(context); vm.runInContext(source, context);
  const component = context.component, page = { ...component.data(), productId: String(product.id) };
  for (const [key, fn] of Object.entries(component.methods)) page[key] = fn.bind(page);
  for (const [key, fn] of Object.entries(component.computed)) Object.defineProperty(page, key, { get: fn.bind(page) });
  return { page, added, reads: () => reads };
}

test('actual H5 component uses common images, params, zero price and model fulfillment', async () => {
  const fixture = componentFor({ id: 1, stock: 2, images: '["https://media.example.test/one.png"]', params: { 核心材质: '测试材质', 颜色: '银色' }, specs: [{ name: '测试型号', price: 0, shipping_note: '型号说明' }, { name: '第二型号', price: 2, shipping_note: '第二说明' }] });
  const p = fixture.page; await p.load();
  assert.equal(p.unitPriceText, 'RMB 0.00'); assert.equal(p.gallery.length, 1); assert.equal(p.params[0].value, '测试材质');
  assert.equal(p.shipping.note, '型号说明'); p.add(); assert.equal(fixture.added[0].price, 0);
  p.chooseModel(p.models[1]); assert.equal(p.shipping.note, '第二说明'); assert.equal(p.unitPriceText, 'RMB 2.00');
});

test('actual H5 component blocks invalid stock, missing price and unopened structured checkout', async () => {
  for (const product of [{ id: 1 }, { id: 1, price: 1, stock: 0 }, { id: 1, price: 1, stock: 'broken' }, { id: 1, price: 1, is_on_sale: 0 }]) {
    const fixture = componentFor(product); await fixture.page.load(); fixture.page.add(); assert.equal(fixture.added.length, 0);
  }
  const fixture = componentFor({ id: 1, models: [{ id: 2, name: '测试型号' }], colors: [{ id: 3, name: '测试颜色' }], skus: [{ id: 4, model_id: 2, color_id: 3, price_fen: 100, available: 1 }] });
  await fixture.page.load(); fixture.page.add(); assert.equal(fixture.added.length, 0); assert.match(fixture.page.blockedReason, /暂未开放/);
});

test('expired media refresh is a catalog read and retains saved selection', async () => {
  const fixture = componentFor({ id: 1, price: 2, stock: 2, media_expires_at: '1970-01-01T00:00:00Z', specs: [{ name: '第一型号', price: 1 }, { name: '第二型号', price: 2 }] });
  await fixture.page.load(); fixture.page.chooseModel(fixture.page.models[1]); fixture.page.saveSelection();
  fixture.page.refreshExpiredMedia(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(fixture.reads(), 2); assert.equal(fixture.page.selectedModel.name, '第二型号'); assert.equal(fixture.added.length, 0);
});

test('accessories hide the H5 technical grid while retaining gallery and story', async () => {
  const fixture = componentFor({ id: 1, series: 'accessories', tool_group: 'accessories', classification_source: 'normalized', price: 1, images: ['https://media.example.test/cover.png'], detail_images: ['https://media.example.test/story.png'] });
  await fixture.page.load();
  assert.equal(fixture.page.params.length, 0);
  assert.equal(fixture.page.gallery.length, 1);
  assert.equal(fixture.page.detailImages.length, 1);
  const template = fs.readFileSync(new URL('../components/SravxProductPurchaseH5.vue', import.meta.url), 'utf8').split('<script>')[0];
  assert.match(template, /<view v-if="params.length" class="buy-parameter-grid">/);
});
