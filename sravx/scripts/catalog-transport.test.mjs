import test from 'node:test'
import assert from 'node:assert/strict'
import { catalogBase, readCatalog, allowedCatalogRequest } from '../common/catalog-transport.mjs'
test('H5 defaults to same origin in development and production; mini retains server base', () => {
  assert.equal(catalogBase({ web: true, dev: true }), '/sravx-catalog')
  assert.equal(catalogBase({ web: true, dev: false, configuredBase: '/catalog/', defaultBase: 'remote' }), '/catalog')
  assert.equal(catalogBase({ web: true, dev: false, defaultBase: 'remote' }), '')
  assert.equal(catalogBase({ web: true, dev: false, configuredBase: 'https://fixture.invalid/', defaultBase: 'remote' }), 'https://fixture.invalid')
  assert.equal(catalogBase({ web: false, dev: true, defaultBase: 'remote' }), 'remote')
})
test('both clients preserve catalog errors without switching to another fact source', async () => {
  const original = new Error('HTTP 503'); let calls = 0
  await assert.rejects(readCatalog(true, () => Promise.reject(original), () => { calls++; }), error => error === original)
  assert.equal(calls, 0)
  await assert.rejects(readCatalog(false, () => Promise.reject(original), () => { calls++; return 'mini fallback' }), error => error === original)
  assert.equal(calls, 0)
})
test('proxy permits catalog reads only', () => {
  for (const path of ['categories', 'home', 'banners?position=home', 'products?page=1', 'products/42', 'points-products/42']) assert(allowedCatalogRequest('/sravx-catalog/api/v1/catalog/' + path, 'GET'))
  for (const path of ['orders', 'catalog/products/42/stock', 'catalog/products/../orders', 'catalog/categories/extra']) assert.equal(allowedCatalogRequest('/sravx-catalog/api/v1/' + path, 'GET'), false)
  assert.equal(allowedCatalogRequest('/sravx-catalog/api/v1/catalog/products', 'POST'), false)
})
