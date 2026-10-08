// H5 selection adapter. Catalog values remain authoritative; no invented price or stock.
export function imageList(value) {
  if (Array.isArray(value)) return value.filter(item => typeof item === 'string' && item.trim())
  if (typeof value !== 'string' || !value.trim()) return []
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? imageList(parsed) : [] } catch { return [value] }
}
export function priceValue(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}
export function priceText(value) { const price = priceValue(value); return price === null ? '价格待公布' : `RMB ${price.toFixed(2)}` }
export function hasStructuredCatalog(product) { return Array.isArray(product?.skus) && Array.isArray(product?.models) && Array.isArray(product?.colors) }
export function skuAvailable(sku) { return sku && Number(sku.is_on_sale ?? 1) !== 0 && Number(sku.available) > 0 && priceValue(sku.price_fen) !== null }
export function selectedSku(product, modelId, colorId) { return (product.skus || []).find(sku => Number(sku.model_id) === Number(modelId) && Number(sku.color_id) === Number(colorId) && skuAvailable(sku)) || null }
export function modelOptions(product) {
  if (hasStructuredCatalog(product)) return product.models.map(model => {
    const skus = product.skus.filter(sku => Number(sku.model_id) === Number(model.id) && skuAvailable(sku))
    return { ...model, key: `model-${model.id}`, name: String(model.name), price: skus.length ? Math.min(...skus.map(sku => Number(sku.price_fen) / 100)) : null, available: skus.length > 0 }
  })
  const specs = Array.isArray(product.specs) && product.specs.length ? product.specs : [{ name: product.model || '标准型号', price: product.price }]
  return specs.map((spec, index) => ({ ...spec, key: `spec-${index}`, name: String(spec.name || product.model || '标准型号'), price: priceValue(spec.price ?? product.price), available: priceValue(spec.price ?? product.price) !== null && (product.stock === undefined || Number(product.stock) > 0) }))
}
export function colorOptions(product) {
  let params = product.params || {}
  if (typeof params === 'string') { try { params = JSON.parse(params) } catch { params = {} } }
  const raw = product.colors || product.color_options || product.colorOptions || params?.['颜色'] || params?.color || params?.colors || []
  const values = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[，,、/]/).filter(Boolean) : []
  return (values.length ? values : [product.color || '默认颜色']).map((item, index) => {
    const color = typeof item === 'object' && item ? item : { name: item }
    const swatch = String(color.swatch || color.color || '')
    return { id: Number(color.id) || 0, key: `color-${index}`, name: String(color.name || color.label || color.value || '默认颜色'), swatch: /^#[0-9a-f]{3,8}$/i.test(swatch) ? swatch : '' }
  })
}
export function selectionPrice(product, model, colorId) {
  if (hasStructuredCatalog(product)) { const sku = selectedSku(product, model?.id, colorId); return sku ? Number(sku.price_fen) / 100 : null }
  return model?.available ? model.price : null
}
export function purchaseItem(product, model, color, quantity, protectOffer, protectSelected) {
  if (!model || !color || !Number.isInteger(quantity) || quantity < 1) throw new Error('请完成型号、颜色与数量选择')
  const sku = hasStructuredCatalog(product) ? selectedSku(product, model.id, color.id) : null
  const price = selectionPrice(product, model, color.id)
  if (price === null) throw new Error('当前规格暂不可购买')
  const stock = sku ? Number(sku.available) : product.stock === undefined ? null : Number(product.stock)
  if (stock !== null && quantity > stock) throw new Error('选择数量超过可售库存')
  if (protectSelected && (!protectOffer || protectOffer.displayOnly !== true)) throw new Error('该服务暂未开放购买')
  const skuImage = /^(https?:\/\/|\/static\/)/.test(sku?.image_object_key || '') ? sku.image_object_key : ''
  return { id: product.id, skuId: Number(sku?.id) || 0, name: product.name, price,
    cover_image: skuImage || model.image || product.cover_image || imageList(product.images)[0], selectedModel: model.name, selectedColor: color.name,
    protectSelected, protectOfferId: protectSelected ? Number(protectOffer.id) : 0, protectDisplayOnly: protectOffer?.displayOnly === true,
    spec: `型号：${model.name}；颜色：${color.name}${protectSelected ? '；SRAVX Protect：已选' : ''}`, quantity, allow_coupon: product.allow_coupon }
}
