import test from 'node:test'
import assert from 'node:assert/strict'
import { imageList, priceValue, modelOptions, colorOptions, selectedSku, purchaseItem, selectionShipping, selectionPrice } from '../common/web-purchase.mjs'

const legacy = { id: 1, name: '测试商品', price: 500, specs: [{ name: '7', price: 500 }, { name: '8', price: 620 }], colors: ['银色', '黑色'] }
const structured = { id: 2, name: '测试商品', models: [{ id: 1, name: '7' }, { id: 2, name: '8' }], colors: [{ id: 1, name: '银色' }, { id: 2, name: '黑色' }], skus: [{ id: 10, model_id: 1, color_id: 2, price_fen: 62000, available: 2 }, { id: 11, model_id: 2, color_id: 1, price_fen: 50000, available: 0 }] }
test('legacy selected variant and quantity are preserved in cart payload', () => {
  const item = purchaseItem(legacy, modelOptions(legacy)[1], colorOptions(legacy)[1], 2, null, false)
  assert.equal(item.price, 620); assert.equal(item.quantity, 2); assert.equal(item.selectedSpecName, '8'); assert.equal(item.selectedColor, undefined); assert.equal(item.skuId, 0)
})
test('structured price and sku come from available model/color combination', () => {
  const item = purchaseItem(structured, modelOptions(structured)[0], colorOptions(structured)[1], 2, null, false)
  assert.equal(item.price, 620); assert.equal(item.skuId, 10)
  assert.equal(selectedSku(structured, 1)?.id, 10); assert.equal(modelOptions(structured)[1].available, false)
})
test('out-of-stock combination and over-stock quantity cannot enter cart', () => {
  assert.throws(() => purchaseItem(structured, modelOptions(structured)[1], colorOptions(structured)[0], 1, null, false))
  assert.throws(() => purchaseItem(structured, modelOptions(structured)[0], colorOptions(structured)[1], 3, null, false))
  assert.throws(() => purchaseItem(legacy, modelOptions(legacy)[0], colorOptions(legacy)[0], 1.5, null, false))
})
test('missing prices are not invented as zero; explicitly zero stays valid', () => {
  assert.equal(priceValue(null), null); assert.equal(priceValue(''), null); assert.equal(priceValue(undefined), null); assert.equal(priceValue('broken'), null); assert.equal(priceValue(0), 0)
  assert.equal(modelOptions({ name: '测试商品' })[0].available, false)
})
test('stock and paid service are guarded, informational service remains explicit', () => {
  assert.equal(modelOptions({ ...legacy, stock: 0 })[0].available, false)
  assert.throws(() => purchaseItem(legacy, modelOptions(legacy)[0], colorOptions(legacy)[0], 1, { id: 1, displayOnly: false }, true))
  const item = purchaseItem(legacy, modelOptions(legacy)[0], colorOptions(legacy)[0], 1, { id: 1, displayOnly: true }, true)
  assert.equal(item.protectDisplayOnly, true); assert.equal(item.protectOfferId, 1)
})
test('image and color normalization handles absent and malformed data safely', () => {
  assert.deepEqual(imageList('["/one.png","/two.png"]'), ['/one.png', '/two.png']); assert.deepEqual(imageList('null'), [])
  assert.equal(colorOptions({ colors: [{ name: '银色', swatch: 'url(fake)' }] })[0].swatch, '')
  assert.equal(colorOptions({})[0].name, '默认颜色')
})
test('explicit empty model shipping does not inherit another model delay; off-sale structured price is blocked', () => {
  const shipping = selectionShipping({ shipping_note: 'other model', shipping_delay_reason: 'delay' }, { shipping_note: '', shipping_delay_reason: '', shipping_promise: 'normal' })
  assert.equal(shipping.note, ''); assert.equal(shipping.reason, ''); assert.equal(shipping.promise, 'normal')
  assert.equal(selectionPrice({ ...structured, is_on_sale: 0 }, modelOptions(structured)[0], 2), null)
})
