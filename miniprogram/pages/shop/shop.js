const preload = require('../../utils/preload')
const share = require('../../utils/share')

const SERIES_OPTIONS = [
  { key: 'all', label: '全部工具', material: '专业工具目录', caption: '按用途浏览' },
  { key: 'basic', label: 'Basic', material: '9Cr', caption: '入门专业款' },
  { key: 'pro', label: 'Pro', material: '440C', caption: '专业主力款' },
  { key: 'master', label: 'Master', material: 'VG10', caption: '高阶专业款' }
]

const GROUPS = [
  { key: 'all', label: '全部' },
  { key: 'straight', label: '直剪' },
  { key: 'curved', label: '弯剪' },
  { key: 'texturizing', label: '造型剪' },
  { key: 'accessories', label: '套装与配件' },
  { key: 'other', label: '其他工具' }
]

function groupKeyForCategory(name) {
  const text = String(name || '')
  if (/直剪/.test(text)) return 'straight'
  if (/弯剪/.test(text)) return 'curved'
  if (/(牙剪|鱼骨剪|柳叶剪|莲蓬剪|魔术剪)/.test(text)) return 'texturizing'
  if (/(套装|配件|服务)/.test(text)) return 'accessories'
  return 'other'
}

function matchesSeries(product, series) {
  if (series === 'all') return true
  const text = `${product.displayName || ''} ${product.name || ''} ${product.desc || ''} ${product.description || ''} ${product.series || ''} ${product.series_name || ''}`.toLowerCase()
  return text.includes(series)
}

function allCatalogProducts(sections) {
  const seen = new Set()
  const products = []
  ;(sections || []).forEach(section => {
    ;(section.products || []).forEach(product => {
      const key = String(product.id)
      if (seen.has(key)) return
      seen.add(key)
      products.push({ ...product, categoryName: section.name })
    })
  })
  return products
}

Page({
  data: {
    categories: [],
    sections: [],
    toolGroups: [],
    subCategories: [],
    seriesCards: [],
    viewMode: 'series',
    activeToolGroup: 'all',
    activeSubCategory: 'all',
    activeSeries: 'all',
    visibleProducts: [],
    displayTitle: '全部专业工具',
    loading: true
  },

  onLoad() {
    share.showShareMenu()
    this.loadData()
  },

  applyShopData(data) {
    this.setData({ categories: data.categories || [], sections: data.sections || [], loading: false }, () => this.rebuildCatalog())
  },

  refreshShopInBackground() {
    preload.preloadShop({ force: true }).then(fresh => { if (fresh) this.applyShopData(fresh) })
  },

  async loadData(options = {}) {
    const cached = !options.force && preload.getCachedShop()
    if (cached) {
      this.applyShopData(cached)
      this.refreshShopInBackground()
      return
    }
    try {
      wx.showLoading({ title: '加载中...', mask: true })
      this.setData({ loading: true })
      const data = await preload.preloadShop({ force: true })
      if (!data) throw new Error('加载失败')
      this.applyShopData(data)
      wx.hideLoading()
    } catch (err) {
      wx.hideLoading()
      console.error('Shop loadData error:', err)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  rebuildCatalog() {
    const sections = this.data.sections || []
    const grouped = new Map()
    GROUPS.forEach(group => grouped.set(group.key, []))
    sections.forEach(section => {
      const category = (this.data.categories || []).find(item => Number(item.id) === Number(section.id)) || section
      const key = groupKeyForCategory(section.name || category.name)
      grouped.get(key).push({ id: section.id, name: section.name || category.name || '未命名分类' })
    })
    const toolGroups = GROUPS.filter(group => group.key === 'all' || grouped.get(group.key).length > 0).map(group => ({
      ...group,
      count: group.key === 'all' ? sections.length : grouped.get(group.key).length
    }))
    const activeToolGroup = toolGroups.some(group => group.key === this.data.activeToolGroup) ? this.data.activeToolGroup : 'all'
    const subCategories = activeToolGroup === 'all' ? [] : [{ id: 'all', name: `全部${toolGroups.find(group => group.key === activeToolGroup)?.label || ''}` }, ...grouped.get(activeToolGroup)]
    const activeSubCategory = subCategories.length === 0 || subCategories.some(item => item.id === this.data.activeSubCategory) ? this.data.activeSubCategory : 'all'
    const products = allCatalogProducts(sections)
    const seriesCards = SERIES_OPTIONS.filter(series => series.key !== 'all').map(series => {
      const matches = products.filter(product => matchesSeries(product, series.key))
      const cover = (matches[0] || {}).image || '/images/logo.png'
      return { ...series, coverImage: cover, productCount: matches.length }
    })
    this.setData({ toolGroups, subCategories, activeToolGroup, activeSubCategory, seriesCards }, () => this.applyFilters())
  },

  applyFilters() {
    const { sections, activeToolGroup, activeSubCategory, activeSeries, toolGroups } = this.data
    const selectedGroup = toolGroups.find(group => group.key === activeToolGroup)
    const allowedSections = (sections || []).filter(section => {
      if (activeToolGroup !== 'all' && groupKeyForCategory(section.name) !== activeToolGroup) return false
      return activeSubCategory === 'all' || section.id === activeSubCategory
    })
    const visibleProducts = allCatalogProducts(allowedSections).filter(product => matchesSeries(product, activeSeries))
    const seriesLabel = SERIES_OPTIONS.find(series => series.key === activeSeries)?.label || ''
    const groupLabel = selectedGroup?.label || '全部'
    this.setData({ visibleProducts, displayTitle: activeSeries === 'all' ? `${groupLabel}专业工具` : `${seriesLabel} · ${groupLabel}` })
  },

  onSeriesTap(e) {
    const key = e.currentTarget.dataset.key
    if (!SERIES_OPTIONS.some(item => item.key === key)) return
    this.setData({ viewMode: 'catalog', activeSeries: key, activeToolGroup: 'all', activeSubCategory: 'all' }, () => this.rebuildCatalog())
  },

  onExploreAll() {
    this.setData({ viewMode: 'catalog', activeSeries: 'all', activeToolGroup: 'all', activeSubCategory: 'all' }, () => this.rebuildCatalog())
  },

  onBackToSeries() {
    this.setData({ viewMode: 'series' })
  },

  onToolGroupTap(e) {
    const key = e.currentTarget.dataset.key
    if (!this.data.toolGroups.some(item => item.key === key)) return
    this.setData({ activeToolGroup: key, activeSubCategory: 'all' }, () => this.rebuildCatalog())
  },

  onSubCategoryTap(e) {
    this.setData({ activeSubCategory: e.currentTarget.dataset.id }, () => this.applyFilters())
  },

  onProductTap(e) {
    wx.navigateTo({ url: `/pages/productDetail/productDetail?id=${e.currentTarget.dataset.id}` })
  },

  onShareAppMessage() { return share.createShareAppMessage({ title: 'Sravx 产品目录', path: '/pages/shop/shop' }) },
  onShareTimeline() { return share.createShareTimeline({ title: 'Sravx 产品目录' }) }
})
