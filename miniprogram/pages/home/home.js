const preload = require('../../utils/preload')
const share = require('../../utils/share')

Page({
  data: {
    banners: [],
    products: [],
    categories: [],
    swiperCurrent: 0,
    navBarTop: 0,
    navBarHeight: 64,
    capsuleRight: 200,
    scrollPaddingTop: 0,
    loading: true
  },

  onLoad() {
    share.showShareMenu()
    this.initNavLayout()
    this.loadData()
  },

  initNavLayout() {
    const menuRect = wx.getMenuButtonBoundingClientRect()
    const sysInfo = wx.getSystemInfoSync()
    const ratio = 750 / sysInfo.screenWidth

    const navBarTop = Math.ceil(menuRect.top * ratio)
    const navBarHeight = Math.ceil(menuRect.height * ratio)
    const capsuleRight = Math.ceil((sysInfo.screenWidth - menuRect.left + 8) * ratio)
    const scrollPaddingTop = Math.ceil((menuRect.bottom + 12) * ratio)

    this.setData({ navBarTop, navBarHeight, capsuleRight, scrollPaddingTop })
  },

  applyHomeData(data) {
    this.setData({
      banners: data.banners || [],
      products: data.products || [],
      categories: data.categories || [],
      loading: false
    })
  },

  refreshHomeInBackground() {
    preload.preloadHome({ force: true }).then((fresh) => {
      if (fresh) this.applyHomeData(fresh)
    })
  },

  async loadData(options = {}) {
    const cached = !options.force && preload.getCachedHome()
    if (cached) {
      this.applyHomeData(cached)
      this.refreshHomeInBackground()
      return
    }

    try {
      wx.showLoading({ title: '加载中...', mask: true })

      const data = await preload.preloadHome({ force: true })
      if (!data) throw new Error('加载失败')
      this.applyHomeData(data)

      wx.hideLoading()
    } catch (err) {
      wx.hideLoading()
      console.error('Home loadData error:', err)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ active: 0 })
    }
  },

  onSwiperChange(e) {
    this.setData({ swiperCurrent: e.detail.current })
  },

  onSearchTap() {
    wx.navigateTo({ url: '/pages/search/search' })
  },

  onBrowseTap() {
    wx.navigateTo({ url: '/pages/shop/shop' })
  },

  onProductTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/productDetail/productDetail?id=${id}` })
  },

  onPullDownRefresh() {
    this.loadData({ force: true }).finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  onShareAppMessage() {
    return share.createShareAppMessage({
      title: 'Sravx',
      path: '/pages/home/home'
    })
  },

  onShareTimeline() {
    return share.createShareTimeline({
      title: 'Sravx'
    })
  }
})
