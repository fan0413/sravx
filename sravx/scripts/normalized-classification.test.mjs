import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogProduct } from '../common/product-classification.mjs';
test('web and mini shared contract trusts normalized classification, not stale params or guessed names', () => {
  const product = catalogProduct({id:1,name:'Pro 直剪',classification_source:'normalized',series:'basic',tool_group:'thinning',price:1,params:{目录系列:'pro',目录分类:'straight'}});
  assert.equal(product.series,'basic');assert.equal(product.tool_group,'thinning');
  const accessory = catalogProduct({classification_source:'normalized',series:'accessories',tool_group:'accessories',price:1});
  assert.equal(accessory.tool_group,'accessories');
});
