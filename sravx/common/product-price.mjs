/** 编辑价格必须大于0，最多两位小数；这里的单位是元。 */
export function validSellingPrice(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return false
  const text = String(value).trim()
  return /^\d+(?:\.\d{1,2})?$/.test(text) && Number(text) > 0 && Number(text) <= 99999999.99
}
function number(value) {
  if (value === null || value === undefined || value === '' || (typeof value !== 'number' && typeof value !== 'string')) return null
  const result = Number(value)
  return Number.isFinite(result) && result >= 0 ? result : null
}
/** 计算列表起价：SKU用分转元，普通规格使用元；没有有效价格时返回null而不是0。 */
export function productStartingPrice(product = {}) {
  if (Array.isArray(product.skus) && (product.skus.length || product.models?.length || product.colors?.length)) {
    const values = product.skus.filter(sku => Number(sku.is_on_sale ?? 1) !== 0).map(sku => number(sku.price_fen)).filter(value => value !== null && Number.isInteger(value)).map(value => value / 100)
    return values.length ? Math.min(...values) : null
  }
  if (Array.isArray(product.specs) && product.specs.length) {
    const values = product.specs.map(spec => number(spec.price)).filter(value => value !== null)
    return values.length ? Math.min(...values) : null
  }
  return number(Object.hasOwn(product, 'display_price') ? product.display_price : product.price)
}
export function startingPriceText(value) { return value === null ? '价格待公布' : `¥${Number(value).toFixed(2)} 起` }
