import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicCatalogRepository } from '../src/media/public-catalog.js';
import { productUpdateInput } from '../src/media/admin-catalog-input.js';
import { catalogProduct } from '../../sravx/common/product-classification.mjs';
import { modelOptions, colorOptions, selectionShipping } from '../../sravx/common/web-purchase.mjs';

const key = 'catalog/products/fixture/main.png';
const ref = { existingObjectKey: key };
const fulfillment = { shippingType: 'normal', shipDeadlineDays: 2, shippingPromise: '测试发货承诺', shippingNote: '测试说明' };
test('one admin product payload reaches a common catalog with all variant media and fulfillment', async () => {
  const input = productUpdateInput({ name: '合成测试工具', price: 1, categoryId: 11, stock: 2, hasSpec: 1,
    coverImage: ref, images: [ref], detailImages: [ref], scissorsCardImage: ref,
    params: { 目录系列: 'basic', 目录分类: 'straight', 核心材质: '测试材质', 尺寸: '测试尺寸', 颜色: '银色' }, ...fulfillment,
    specs: [{ name: '测试型号', price: 1, sku: 'FIXTURE', image: ref, cardImage: ref, ...fulfillment }] });
  // Isolated persisted row representation, not a production DB connection.
  const row = { id: 1, name: input.name, category_id: input.categoryId, price: input.price, stock: input.stock, params: JSON.stringify(input.params),
    cover_image: key, images: JSON.stringify([key]), detail_images: JSON.stringify([key]), scissors_card_image: key,
    specs: input.specs.map(spec => ({ name: spec.name, price: spec.price, sku: spec.sku, image: key, card_image: key, shipping_type: spec.shippingType, ship_deadline_days: spec.shipDeadlineDays, shipping_promise: spec.shippingPromise, shipping_note: spec.shippingNote })) };
  const calls = [];
  const repository = createPublicCatalogRepository({ getProduct: async () => row }, { clock: () => 0, mediaSigner: { issueGetUrl: async (key, expires) => { calls.push({ key, expires }); return 'https://media.example.test/main.png?fixture=1'; } } });
  const result = await repository.getProduct(1);
  assert.equal(calls.length, 1); assert.equal(calls[0].expires, 900);
  assert.equal(row.cover_image, key); // Never overwrite stored object references with expiring URLs.
  assert.equal(result.specs[0].card_image, result.cover_image);
  assert.deepEqual(result.images, [result.cover_image]);
  assert.deepEqual(result.detail_images, [result.cover_image]);
  assert.equal(result.media_expires_at, '1970-01-01T00:15:00.000Z');
  for (const client of ['web', 'miniprogram']) {
    const product = catalogProduct(result), model = modelOptions(product)[0];
    assert.equal(product.series, 'basic', client); assert.equal(product.tool_group, 'straight');
    assert.equal(product.core_material, '测试材质'); assert.equal(model.price, 1);
    assert.equal(colorOptions(product)[0].name, '银色');
    assert.equal(selectionShipping(product, model).note, '测试说明');
  }
});
test('public signing is scoped to repository results; unsupported references are not leaked', async () => {
  const signed = [];
  const repository = createPublicCatalogRepository({ listCategories: async () => [{ image: 'catalog/categories/fixture.png', icon: 'private/customer.png' }], getProduct: async () => null }, { mediaSigner: { issueGetUrl: async key => { signed.push(key); return 'https://media.example.test/fixture.png'; } } });
  const result = await repository.listCategories();
  assert.equal(result[0].icon, ''); assert.deepEqual(signed, ['catalog/categories/fixture.png']);
  assert.equal(await repository.getProduct(1), null);
});
test('missing signer or invalid signing output fails rather than inventing a public address', async () => {
  const base = { getProduct: async () => ({ cover_image: key }) };
  await assert.rejects(createPublicCatalogRepository(base).getProduct(1), /signing is unavailable/);
  await assert.rejects(createPublicCatalogRepository(base, { mediaSigner: { issueGetUrl: async () => 'http://unsafe.test/file' } }).getProduct(1), /Invalid public/);
});
test('home, lists, structured SKU and media lists resolve references without mutating records', async () => {
  const data = { products: [{ cover_image: key, skus: [{ image_object_key: key }], media: [{ object_key: key }] }], categories: [{ image: '/static/fixture.png' }] };
  const repository = createPublicCatalogRepository({ home: async () => data }, { mediaSigner: { issueGetUrl: async () => 'https://media.example.test/fixture.png' } });
  const result = await repository.home();
  assert.match(result.products[0].skus[0].image_object_key, /^https:/);
  assert.match(result.products[0].media[0].object_key, /^https:/);
  assert.equal(result.categories[0].image, '/static/fixture.png');
  assert.equal(data.products[0].media[0].object_key, key);
});
