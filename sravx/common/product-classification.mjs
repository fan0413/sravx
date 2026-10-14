import { productStartingPrice, startingPriceText } from './product-price.mjs'
export const SERIES_OPTIONS = [
  { key: 'basic', label: 'Basic' }, { key: 'pro', label: 'Pro' },
  { key: 'master', label: 'Master' }, { key: 'accessories', label: '配件' }
]
export const TOOL_OPTIONS = [
  { key: 'straight', label: '直剪' }, { key: 'curved', label: '弯剪' },
  { key: 'thinning', label: '牙剪' }, { key: 'fishbone', label: '鱼骨剪' },
  { key: 'texturizing', label: '造型剪' }
]
// Stored inside the existing params JSON so legacy and target catalogs share
// classification without enabling structured checkout or changing the schema.
export function readParams(value) {
  if (typeof value === 'string') { try { value = JSON.parse(value) } catch { return {} } }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}
export function seriesKey(value) {
  const text = String(value || '').trim().toLowerCase().replace(/^sravx\s*/, '').replace(/\s*系列$/, '')
  return SERIES_OPTIONS.find(item => item.key === text || item.label === text)?.key || ''
}
export function toolKey(value) {
  const text = String(value || '').trim()
  return TOOL_OPTIONS.find(item => item.key === text || item.label === text)?.key || ''
}
export function categorySeries(category, categories) {
  const seen = new Set()
  while (category && !seen.has(category.id)) {
    seen.add(category.id)
    const key = seriesKey(category.name)
    if (key) return key
    category = categories.find(item => item.id === category.parent_id)
  }
  return ''
}
export function categoriesForSeries(categories, series, tool = '') {
  return categories.filter(category => {
    if (category.is_show === 0) return false
    const owner = categorySeries(category, categories)
    if (owner && owner !== series) return false
    if (seriesKey(category.name)) return series === 'accessories'
    if (series === 'accessories') return owner === series
    return Boolean(toolKey(category.name)) && (!tool || toolKey(category.name) === tool)
  })
}
export function productClassification(product = {}, categories = []) {
  if (product.classification_source === 'normalized') return { series: seriesKey(product.series), tool: product.series === 'accessories' ? 'accessories' : toolKey(product.tool_group) };
  const params = readParams(product.params)
  const category = categories.find(item => item.id === Number(product.category_id || product.categoryId))
  const text = [product.name, product.short_name, product.displayName, product.desc, product.description, product.series_name, product.categoryName, product.category_name].filter(Boolean).join(' ')
  const series = seriesKey(params['目录系列']) || seriesKey(product.series) || categorySeries(category, categories) ||
    SERIES_OPTIONS.find(item => item.key === 'accessories' ? /配件|套装|收纳|养护|保养|服务/.test(text) : new RegExp(`\\b${item.key}\\b`, 'i').test(text))?.key || ''
  const tool = series === 'accessories' ? 'accessories' : toolKey(params['目录分类']) || toolKey(product.tool_group) || toolKey(category?.name) ||
    TOOL_OPTIONS.find(item => text.includes(item.label))?.key || (/柳叶剪|莲蓬剪|魔术剪/.test(text) ? 'texturizing' : 'other')
  return { series, tool }
}
export function catalogProduct(product = {}) {
  const params = readParams(product.params)
  const classification = productClassification(product)
  const displayPrice = productStartingPrice(product)
  return { ...product, base_price: product.base_price ?? product.price, price: displayPrice, display_price: displayPrice, display_price_text: startingPriceText(displayPrice), params, series: classification.series, tool_group: classification.tool,
    steel_material: params['核心材质'] ?? product.steel_material,
    display_size: params['尺寸'] ?? product.display_size,
    core_material: params['核心材质'] ?? product.core_material,
    handle_material: params['手柄材质'] ?? product.handle_material,
    size: params['尺寸'] ?? product.size, weight: params['重量(g)'] ?? product.weight,
    warranty_period: params['质保周期'] ?? product.warranty_period }
}
export async function collectProducts(readPage, pageSize = 20) {
  const products = [], seen = new Set()
  for (let page = 1; page <= 100; page++) {
    const result = await readPage({ page, pageSize })
    const rows = Array.isArray(result) ? result : result?.list || result?.products || result?.data || []
    if (!Array.isArray(rows)) throw new Error('商品列表格式无效')
    for (const row of rows) {
      if (seen.has(String(row.id))) continue
      seen.add(String(row.id)); products.push(row)
    }
    if (rows.length < pageSize || (Number.isFinite(Number(result?.total)) && products.length >= Number(result.total))) return products
  }
  throw new Error('商品数量超过单次加载范围，请缩小分类范围')
}
export function catalogResult(result) {
  if (Array.isArray(result)) return result.map(catalogProduct)
  const next = { ...result }
  for (const key of ['products', 'list', 'data']) if (Array.isArray(next[key])) next[key] = next[key].map(catalogProduct)
  return next
}
