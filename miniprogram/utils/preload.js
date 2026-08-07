const api = require('./api')

const HOME_FALLBACK_BANNERS = [
  { id: 1, image: '/images/logo.png', title: 'Sravx' }
]

const DEFAULT_CATEGORIES = [
  { id: 0, name: '全部商品' }
]

const cache = {
  home: null,
  shop: null,
  userCenter: null
}

function unwrapList(res) {
  if (Array.isArray(res)) return res
  if (res && Array.isArray(res.data)) return res.data
  if (res && Array.isArray(res.list)) return res.list
  if (res && Array.isArray(res.products)) return res.products
  return []
}

function parseImages(rawImages) {
  if (!rawImages) return []
  if (Array.isArray(rawImages)) return rawImages.filter(Boolean)
  if (typeof rawImages === 'string') {
    const text = rawImages.trim()
    if (!text) return []
    try {
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed)) return parsed.filter(Boolean)
    } catch (e) {
      return [text]
    }
    return [text]
  }
  return []
}

function normalizeProductCard(item) {
  if (!item || typeof item !== 'object') return item
  const images = parseImages(item.images)
  const cover = item.cover_image || item.image || images[0] || '/images/logo.png'
  return {
    ...item,
    images,
    image: cover,
    cover_image: cover,
    displayName: item.displayName || item.short_name || item.name || '未命名商品',
    short_name: item.short_name || item.name || '未命名商品',
    desc: item.desc || item.description || ''
  }
}

function normalizeHomeProducts(res) {
  if (Array.isArray(res)) return res.map(normalizeProductCard)
  if (res && Array.isArray(res.products)) return res.products.map(normalizeProductCard)
  if (!res || typeof res !== 'object') return []

  const merged = [
    ...(Array.isArray(res.recommend) ? res.recommend : []),
    ...(Array.isArray(res.newProducts) ? res.newProducts : []),
    ...(Array.isArray(res.hotProducts) ? res.hotProducts : [])
  ]
  const byId = new Map()
  merged.forEach((item) => {
    const key = item && item.id != null ? item.id : `${byId.size}`
    if (item && !byId.has(key)) byId.set(key, item)
  })
  return Array.from(byId.values()).map(normalizeProductCard)
}

function normalizeCategories(res) {
  let categories = unwrapList(res)
  if (categories.length > 0) return categories

  if (Array.isArray(res)) return res
  if (res && Array.isArray(res.children)) return res.children
  return []
}

async function preloadHome(options = {}) {
  if (!options.force && cache.home) return cache.home

  const [bannerRes, productRes] = await Promise.all([
    api.getBanners('home').catch(() => []),
    api.getHomeProducts().catch(() => [])
  ])

  const banners = unwrapList(bannerRes)
  const data = {
    banners: banners.length > 0 ? banners : HOME_FALLBACK_BANNERS,
    products: normalizeHomeProducts(productRes)
  }
  cache.home = data
  return data
}

function getCachedHome() {
  return cache.home
}

async function getCategoryData() {
  let categories = normalizeCategories(await api.getCategoryList().catch(() => []))
  if (categories.length === 0) {
    categories = normalizeCategories(await api.getCategoryTree().catch(() => []))
  }
  return categories.length > 0 ? categories : DEFAULT_CATEGORIES
}

async function preloadShop(options = {}) {
  if (!options.force && cache.shop) return cache.shop

  const categories = await getCategoryData()
  const sections = await Promise.all(categories.map(async (cat) => {
    const anchorId = `section-${cat.id}`
    const res = await api.getProductList({ categoryId: cat.id, pageSize: 20 }).catch(() => [])
    return {
      id: cat.id,
      name: cat.name,
      anchorId,
      products: unwrapList(res).map(normalizeProductCard)
    }
  }))

  const data = { categories, sections, activeCategory: 0 }
  cache.shop = data
  return data
}

function getCachedShop() {
  return cache.shop
}

async function preloadUserCenter(options = {}) {
  if (!options.force && cache.userCenter) return cache.userCenter
  const app = getApp()
  const hasPhone = app && typeof app.hasPhoneAuthorized === 'function'
    ? app.hasPhoneAuthorized()
    : !!(app && app.globalData && app.globalData.userInfo && app.globalData.userInfo.phone)
  if (!hasPhone) {
    const data = { userRes: null, scissorsRes: [], availableCoupons: [] }
    cache.userCenter = data
    return data
  }

  const [userRes, scissorsRes, availableCoupons] = await Promise.all([
    api.getUserInfo({}).catch(() => null),
    api.getMyScissors().catch(() => []),
    api.getAvailableCoupons().catch(() => [])
  ])

  const data = {
    userRes,
    scissorsRes: unwrapList(scissorsRes),
    availableCoupons: unwrapList(availableCoupons)
  }
  cache.userCenter = data
  return data
}

function getCachedUserCenter() {
  return cache.userCenter
}

function preloadStartup(options = {}) {
  const tasks = [
    preloadHome().catch(() => null),
    preloadShop().catch(() => null)
  ]

  if (options.includeUser) {
    tasks.push(preloadUserCenter().catch(() => null))
  }

  return Promise.all(tasks)
}

module.exports = {
  preloadStartup,
  preloadHome,
  getCachedHome,
  preloadShop,
  getCachedShop,
  preloadUserCenter,
  getCachedUserCenter
};
