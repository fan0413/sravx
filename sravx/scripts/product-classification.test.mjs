import test from 'node:test'
import assert from 'node:assert/strict'
import { categoriesForSeries, productClassification, catalogProduct, collectProducts, catalogResult } from '../common/product-classification.mjs'
const categories = [{ id: 1, name: 'Basic', is_show: 1 }, { id: 2, name: 'Pro', is_show: 1 }, { id: 3, name: 'Master' }, { id: 4, name: '配件' }, { id: 11, parent_id: 1, name: '直剪' }, { id: 12, parent_id: 2, name: '直剪' }, { id: 13, parent_id: 1, name: '牙剪' }, { id: 14, parent_id: 1, name: '鱼骨剪', is_show: 0 }]
test('series filters isolate siblings and exclude hidden categories', () => {
  assert.deepEqual(categoriesForSeries(categories, 'basic', 'straight').map(x => x.id), [11])
  assert.deepEqual(categoriesForSeries(categories, 'pro', 'straight').map(x => x.id), [12])
  assert.deepEqual(categoriesForSeries(categories, 'accessories').map(x => x.id), [4])
  assert.deepEqual(categoriesForSeries(categories, 'master', 'straight'), [])
})
test('saved metadata overrides ambiguous names and structured fields', () => {
  const p = { name: 'Master 弯剪', series: 'pro', tool_group: 'curved', params: JSON.stringify({ 目录系列: 'basic', 目录分类: 'straight' }) }
  assert.deepEqual(productClassification(p), { series: 'basic', tool: 'straight' })
})
test('legacy products resolve their category ancestry without renaming products', () => {
  assert.deepEqual(productClassification({ name: '工具 A', category_id: 13 }, categories), { series: 'basic', tool: 'thinning' })
  assert.deepEqual(productClassification({ name: 'Pro 鱼骨剪' }), { series: 'pro', tool: 'fishbone' })
})
test('accessories never use scissors subcategories', () => {
  assert.deepEqual(productClassification({ params: { 目录系列: 'accessories', 目录分类: 'straight' } }), { series: 'accessories', tool: 'accessories' })
})
test('technical parameters reach both frontends and retain undisplayed fields', () => {
  const product = catalogProduct({ params: JSON.stringify({ 核心材质: '测试材质', 手柄材质: '测试手柄', 尺寸: '测试尺寸', '重量(g)': '0', 质保周期: '测试周期', 附加说明: '保留' }) })
  assert.equal(product.core_material, '测试材质'); assert.equal(product.weight, '0'); assert.equal(product.params.附加说明, '保留')
  assert.equal(catalogResult({ products: [product], total: 1 }).products[0].size, '测试尺寸')
})
test('catalog reads all pages instead of truncating at 20 or 100', async () => {
  const pages = []
  const rows = await collectProducts(async ({ page }) => { pages.push(page); return page === 1 ? [{ id: 1 }, { id: 2 }] : [{ id: 3 }] }, 2)
  assert.deepEqual(pages, [1, 2]); assert.equal(rows.length, 3)
})
test('pagination propagates read failures rather than a misleading empty category', async () => {
  await assert.rejects(collectProducts(async () => { throw new Error('read failed') }), /read failed/)
})
