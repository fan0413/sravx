import test from 'node:test';
import assert from 'node:assert/strict';
import { validSellingPrice, productStartingPrice } from '../common/product-price.mjs';
import { catalogProduct } from '../common/product-classification.mjs';
import { modelOptions } from '../common/web-purchase.mjs';
test('homepage uses the lowest specification price, selection still uses each specification price', () => {
  const product = catalogProduct({ price: 99, specs: [{ price: 2.5 }, { price: 1.25 }] });
  assert.equal(product.price, 1.25); assert.equal(product.base_price, 99); assert.equal(product.display_price_text, '¥1.25 起');
  assert.deepEqual(modelOptions(product).map(item => item.price), [2.5, 1.25]);
});
test('missing spec price does not fall back to a potentially lower product starting price', () => {
  const product = catalogProduct({ price: 99, specs: [{ price: null }, { price: 2 }] });
  assert.equal(product.price, 2); assert.equal(modelOptions(product)[0].price, null); assert.equal(modelOptions(product)[0].available, false);
  assert.equal(catalogProduct({ price: 99, specs: [{ price: '' }] }).display_price_text, '价格待公布');
});
test('list server price summary and structured SKU price use the same unit and preserve zero on legacy reads', () => {
  assert.equal(productStartingPrice({ price: 99, display_price: 2 }), 2);
  assert.equal(productStartingPrice({ price: 99, display_price: null }), null);
  assert.equal(productStartingPrice({ price: 99, skus: [{ price_fen: 125, is_on_sale: 1 }, { price_fen: 1, is_on_sale: 0 }] }), 1.25);
  assert.equal(productStartingPrice({ specs: [{ price: 0 }, { price: 3 }] }), 0);
});
test('editor prices require explicit positive two-decimal amounts', () => {
  for (const value of ['', ' ', undefined, null, 0, -1, '1.234', Infinity, true, 'broken']) assert.equal(validSellingPrice(value), false);
  for (const value of [0.01, '2.50', 2, '99.99']) assert.equal(validSellingPrice(value), true);
});
