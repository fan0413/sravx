import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { modelOptions, purchaseItem, selectedSku } from '../common/web-purchase.mjs';
test('ordinary purchase needs only a specification, never a color', () => {
  const product = { id: 1, specs: [{ name: '测试规格', price: 0.1 }], stock: 1 };
  const item = purchaseItem(product, modelOptions(product)[0], null, 1, null, false);
  assert.equal(item.selectedSpecName, '测试规格');
  assert.equal(item.selectedColor, undefined);
  assert.doesNotMatch(item.spec, /颜色/);
});
test('retired color combinations cannot select a SKU silently', () => {
  assert.equal(selectedSku({ skus: [{ model_id: 1, available: 1, price_fen: 10 }, { model_id: 1, available: 1, price_fen: 20 }] }, 1), null);
});
test('active purchase templates no longer render color controls', () => {
  for (const file of ['../pages/product-detail/index.vue', '../components/SravxProductPurchaseH5.vue', '../pages/cart/index.vue', '../pages/confirm-order/index.vue']) {
    const template = readFileSync(new URL(file, import.meta.url), 'utf8').split('<script>')[0];
    assert.doesNotMatch(template, /选择你喜欢的颜色|颜色：|颜色 —|v-for="(?:item|color) in (?:colorOptions|colors)"/);
  }
});
