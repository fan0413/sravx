const preload = require('../../utils/preload')
const share = require('../../utils/share')

Page({
  data: {
    categories: [],
    activeCategory: 0,
    sections: [],
    scrollToView: '',
    isClickScroll: false,
    loading: true
  },

  sectionOffsets: [],

  onLoad() {
    share.showShareMenu()
    this.loadData()
  },

  applyShopData(data) {
    this.setData({
      categories: data.categories || [],
      sections: data.sections || [],
      activeCategory: data.activeCategory || 0,
      loading: false
    })
    setTimeout(() => this.calcSectionOffsets(), 300)
  },

  refreshShopInBackground() {
    preload.preloadShop({ force: true }).then((fresh) => {
      if (fresh) this.applyShopData(fresh)
    })
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

  onReady() {
    setTimeout(() => this.calcSectionOffsets(), 300)
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ active: 1 })
    }
  },

  async calcSectionOffsets() {
    const query = wx.createSelectorQuery().in(this)
    this.data.sections.forEach(section => {
      query.select('#' + section.anchorId).boundingClientRect()
    })
    query.select('.product-area').boundingClientRect()
    query.exec(res => {
      if (!res) return
      const containerRect = res[res.length - 1]
      if (!containerRect) return
      const containerTop = containerRect.top
      this.sectionOffsets = res.slice(0, -1)
        .filter(r => r)
        .map((r, i) => ({
          index: i,
          top: r.top - containerTop
        }))
    })
  },

  onCategoryTap(e) {
    const index = e.currentTarget.dataset.index
    const section = this.data.sections[index]
    if (!section) return

    this.setData({
      activeCategory: index,
      isClickScroll: true,
      scrollToView: section.anchorId
    })

    setTimeout(() => {
      this.setData({ isClickScroll: false })
    }, 600)
  },

  onProductScroll(e) {
    if (this.data.isClickScroll) return

    const scrollTop = e.detail.scrollTop
    const offsets = this.sectionOffsets
    if (!offsets || offsets.length === 0) return

    let active = 0
    for (let i = offsets.length - 1; i >= 0; i--) {
      if (scrollTop >= offsets[i].top - 20) {
        active = i
        break
      }
    }

    if (active !== this.data.activeCategory) {
      this.setData({ activeCategory: active })
    }
  },

  onProductTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/productDetail/productDetail?id=${id}` })
  },

  onShareAppMessage() {
    return share.createShareAppMessage({
      title: 'Sravx 商城',
      path: '/pages/shop/shop'
    })
  },

  onShareTimeline() {
    return share.createShareTimeline({
      title: 'Sravx 商城'
    })
  }
});
