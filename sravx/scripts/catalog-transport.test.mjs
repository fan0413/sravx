import test from 'node:test'
import assert from 'node:assert/strict'
import { catalogBase, readCatalog, allowedCatalogRequest } from '../common/catalog-transport.mjs'
test('H5 dev uses same origin; production and mini retain explicit bases', () => {
  assert.equal(catalogBase({ web: true, dev: true }), '/sravx-catalog')
  assert.equal(catalogBase({ web: true, dev: false, configuredBase: '/catalog/', defaultBase: 'remote' }), '/catalog')
  assert.equal(catalogBase({ web: false, dev: true, defaultBase: 'remote' }), 'remote')
})
test('H5 preserves original error and never invokes mini cloud fallback', async () => {
  const original = new Error('HTTP 503'); let calls = 0
  await assert.rejects(readCatalog(true, () => Promise.reject(original), () => { calls++; }), error => error === original)
  assert.equal(calls, 0)
  assert.equal(await readCatalog(false, () => Promise.reject(original), () => 'mini fallback'), 'mini fallback')
})
test('proxy permits catalog reads only', () => {
  for (const path of ['categories', 'home', 'banners?position=home', 'products?page=1', 'products/42', 'points-products/42']) assert(allowedCatalogRequest('/sravx-catalog/api/v1/catalog/' + path, 'GET'))
  for (const path of ['orders', 'catalog/products/42/stock', 'catalog/products/../orders', 'catalog/categories/extra']) assert.equal(allowedCatalogRequest('/sravx-catalog/api/v1/' + path, 'GET'), false)
  assert.equal(allowedCatalogRequest('/sravx-catalog/api/v1/catalog/products', 'POST'), false)
})
