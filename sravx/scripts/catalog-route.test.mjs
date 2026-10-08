import test from 'node:test'
import assert from 'node:assert/strict'
import { catalogRoute } from '../common/catalog-route.mjs'
test('same-page navigation resolves every series and resets stale filters', () => {
  for (const series of ['basic', 'pro', 'master', 'accessories']) assert.deepEqual(catalogRoute('#/pages/shop/index?series=' + series), { series, tool: 'all' })
  assert.deepEqual(catalogRoute('#/pages/shop/index'), { series: 'all', tool: 'all' })
})
test('refresh and back preserve valid tool context', () => {
  assert.deepEqual(catalogRoute('#/pages/shop/index?series=basic&tool=curved'), { series: 'basic', tool: 'curved' })
  assert.deepEqual(catalogRoute('#/pages/shop/index?series=unknown&tool=unknown'), { series: 'all', tool: 'all' })
  assert.equal(catalogRoute('#/pages/product-detail/index?id=64'), null)
})
