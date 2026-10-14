import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { productClassification } from '../common/product-classification.mjs';

const source = fs.readFileSync(new URL('../pages/shop/index.vue', import.meta.url), 'utf8');
test('mini shop keeps one horizontal category strip and prevents chip shrinking', () => {
  const mini = source.split('<!-- #ifndef H5 -->')[1].split('<!-- #endif -->')[0];
  assert.match(mini, /scroll-x :show-scrollbar="false" scroll-with-animation/);
  assert.match(mini, /:scroll-into-view="'tool-' \+ activeToolGroup"/);
  assert.match(source, /\.tool-chips\{display:inline-flex/);
  assert.match(source, /\.tool-chip\{flex:none;white-space:nowrap\}/);
  assert.equal((mini.match(/class="chips/g) || []).length, 1);
  assert.doesNotMatch(mini, /subCategories|activeSubCategory|sub-chip/);
});

test('single category strip selects all matching goods in the current series, not duplicated subcategories', () => {
  const script = source.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '').replace('export default', 'globalThis.component =');
  const context = { api: { productImage: () => '' }, productClassification, SravxPageBack: {}, SravxH5GlobalNav: {} };
  vm.createContext(context); vm.runInContext(script, context);
  const component = context.component, page = { ...component.data(), activeSeries: 'basic' };
  for (const [key, fn] of Object.entries(component.computed)) Object.defineProperty(page, key, { get: fn.bind(page) });
  for (const [key, fn] of Object.entries(component.methods)) page[key] = fn.bind(page);
  const product = (id, series, tool) => ({ id, name: '合成工具', series, tool_group: tool, classification_source: 'normalized' });
  page.sections = [
    { id: 11, name: '直剪', products: [product(1, 'basic', 'straight')] },
    { id: 12, name: '直剪', products: [product(2, 'basic', 'straight')] },
    { id: 13, name: '牙剪', products: [product(3, 'basic', 'thinning')] },
    { id: 14, name: '直剪', products: [product(4, 'pro', 'straight')] }
  ];
  page.selectGroup('straight'); assert.equal(page.visibleProducts.length, 2);
  page.selectGroup('thinning'); assert.equal(page.visibleProducts.length, 1);
  page.selectGroup('all'); assert.equal(page.visibleProducts.length, 3);
  page.selectSeries('pro'); assert.equal(page.visibleProducts.length, 1);
});
