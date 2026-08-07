const api = require('../../utils/api')
const app = getApp()
const {
  mapGoodsOrders,
  mapPointsOrders,
  filterOrdersByTab,
  getOrderDetailRoute
} = require('./orderList.helper')

Page({
  data: {
    activeTab: 'all',
    tabs: [
      { key: 'all', name: '全部' },
      { key: 'completed', name: '已完成' },
      { key: 'pending', name: '未完成' }
    ],
    orderTypeTabs: [
      { key: 'goods', name: '商品订单' },
      { key: 'points', name: '积分订单' }
    ],
    activeOrderType: 'goods',
    orders: [],
    displayedOrders: [],
    goodsOrders: [],
    pointsOrders: [],
    groupedOrders: {
      goodsOrders: [],
      pointsOrders: []
    },
    loading: true,
    page: 1,
    pageSize: 20,
    hasMore: true,
    loadingMore: false,
    navBarHeight: 0,
    refresherTriggered: false
  },

  onLoad(options) {
    this.initNavLayout()
    if (options.status) {
      this.setData({ activeTab: options.status })
    }
    this.loadOrders()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ active: 2 })
    }
    if (this._didFirstShow) {
      this.loadOrders()
    }
    this._didFirstShow = true
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading && !this.data.loadingMore) {
      this.loadMoreOrders()
    }
  },

  initNavLayout() {
    const menuRect = wx.getMenuButtonBoundingClientRect()
    const sysInfo = wx.getSystemInfoSync()
    const ratio = 750 / sysInfo.screenWidth
    const navBarHeight = Math.ceil((menuRect.bottom + 8) * ratio)
    this.setData({ navBarHeight })
  },

  mapTabToApiStatus(tab) {
    if (tab === 'pending') return 'pending'
    if (tab === 'completed') return 'finished'
    return undefined
  },

  buildGroupedOrders(goodsOrders, pointsOrders) {
    return filterOrdersByTab(this.data.activeTab, goodsOrders, pointsOrders)
  },

  buildDisplayedOrders(groupedOrders, orderType) {
    if (!groupedOrders) return []
    return orderType === 'points' ? (groupedOrders.pointsOrders || []) : (groupedOrders.goodsOrders || [])
  },

  async loadOrders() {
    const pageSize = this.data.pageSize
    this.setData({ loading: true })
    const hasPhone = typeof app.hasPhoneAuthorized === 'function'
      ? app.hasPhoneAuthorized()
      : !!(app.globalData.userInfo && app.globalData.userInfo.phone)
    if (!hasPhone) {
      this.setData({
        orders: [],
        displayedOrders: [],
        goodsOrders: [],
        pointsOrders: [],
        groupedOrders: { goodsOrders: [], pointsOrders: [] },
        loading: false,
        page: 1,
        hasMore: false,
        refresherTriggered: false
      })
      return
    }
    try {
      const status = this.mapTabToApiStatus(this.data.activeTab)
      const [goodsResult, pointsResult] = await Promise.allSettled([
        api.getOrderList(status, 1, pageSize),
        api.getPointsOrderList(status, 1, pageSize)
      ])
      if (goodsResult.status !== 'fulfilled') throw goodsResult.reason
      const goodsList = goodsResult.value || []
      const pointsRaw = pointsResult.status === 'fulfilled' ? pointsResult.value : { list: [] }
      const pointsList = Array.isArray(pointsRaw) ? pointsRaw : ((pointsRaw && pointsRaw.list) || [])
      const normalizedGoods = mapGoodsOrders(goodsList || [])
      const normalizedPoints = mapPointsOrders(pointsList || [])
      const groupedOrders = this.buildGroupedOrders(normalizedGoods, normalizedPoints)
      const displayedOrders = this.buildDisplayedOrders(groupedOrders, this.data.activeOrderType)
      this.setData({
        orders: displayedOrders,
        displayedOrders,
        goodsOrders: normalizedGoods,
        pointsOrders: normalizedPoints,
        groupedOrders,
        loading: false,
        page: 1,
        hasMore: (goodsList || []).length >= pageSize || (pointsList || []).length >= pageSize,
        refresherTriggered: false
      })
    } catch (e) {
      console.error('[orderList] loadOrders', e)
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' })
      this.setData({ loading: false, refresherTriggered: false })
    }
  },

  async loadMoreOrders() {
    if (!this.data.hasMore || this.data.loading || this.data.loadingMore) return
    const pageSize = this.data.pageSize
    const nextPage = this.data.page + 1
    this.setData({ loadingMore: true })
    try {
      const status = this.mapTabToApiStatus(this.data.activeTab)
      const [goodsResult, pointsResult] = await Promise.allSettled([
        api.getOrderList(status, nextPage, pageSize),
        api.getPointsOrderList(status, nextPage, pageSize)
      ])
      if (goodsResult.status !== 'fulfilled') throw goodsResult.reason
      const goodsList = goodsResult.value || []
      const pointsRaw = pointsResult.status === 'fulfilled' ? pointsResult.value : { list: [] }
      const pointsList = Array.isArray(pointsRaw) ? pointsRaw : ((pointsRaw && pointsRaw.list) || [])
      const normalizedGoods = mapGoodsOrders(goodsList || [])
      const normalizedPoints = mapPointsOrders(pointsList || [])
      const mergedGoods = this.data.goodsOrders.concat(normalizedGoods)
      const mergedPoints = this.data.pointsOrders.concat(normalizedPoints)
      const groupedOrders = this.buildGroupedOrders(mergedGoods, mergedPoints)
      const displayedOrders = this.buildDisplayedOrders(groupedOrders, this.data.activeOrderType)
      this.setData({
        orders: displayedOrders,
        displayedOrders,
        goodsOrders: mergedGoods,
        pointsOrders: mergedPoints,
        groupedOrders,
        loadingMore: false,
        page: nextPage,
        hasMore: (goodsList || []).length >= pageSize || (pointsList || []).length >= pageSize
      })
    } catch (e) {
      console.error('[orderList] loadMore', e)
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' })
      this.setData({ loadingMore: false })
    }
  },

  async onRefresh() {
    this.setData({ refresherTriggered: true })
    await this.loadOrders()
  },

  onTabChange(e) {
    const index = e.currentTarget.dataset.index
    const tab = this.data.tabs[index]
    if (tab.key === this.data.activeTab) return

    this.setData({ activeTab: tab.key, activeOrderType: 'goods' })
    this.loadOrders()
  },

  onOrderTypeChange(e) {
    const orderType = e.currentTarget.dataset.type
    if (!orderType || orderType === this.data.activeOrderType) return
    const displayedOrders = this.buildDisplayedOrders(this.data.groupedOrders, orderType)
    this.setData({
      activeOrderType: orderType,
      displayedOrders,
      orders: displayedOrders
    })
  },

  onBack() {
    wx.navigateBack()
  },

  onOrderTap(e) {
    const orderId = e.currentTarget.dataset.id
    const orderType = e.currentTarget.dataset.type || 'goods'
    wx.navigateTo({
      url: getOrderDetailRoute(orderType, orderId)
    })
  },

  async onCancelOrder(e) {
    const orderId = e.currentTarget.dataset.id
    const orderType = e.currentTarget.dataset.type || 'goods'
    wx.showModal({
      title: '确认取消',
      content: '确定要取消该订单吗？',
      confirmColor: '#B8956A',
      success: async (res) => {
        if (!res.confirm) return
        try {
          if (orderType === 'points') {
            await api.cancelPointsOrder(orderId)
          } else {
            await api.cancelOrder(orderId)
          }
          wx.showToast({ title: '订单已取消', icon: 'success' })
          this.loadOrders()
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '取消失败', icon: 'none' })
        }
      }
    })
  },

  async onConfirmReceive(e) {
    const orderId = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认收货',
      content: '确认已收到商品？',
      confirmColor: '#B8956A',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await api.confirmReceive(orderId)
          wx.showToast({ title: '已确认收货', icon: 'success' })
          this.loadOrders()
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' })
        }
      }
    })
  },

  onRefundOrder(e) {
    const orderId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/orderAfterSale/orderAfterSale?orderId=${orderId}&type=refund`
    })
  },

  onApplyPointsRefund(e) {
    const orderId = Number(e.currentTarget.dataset.id)
    if (!orderId || Number.isNaN(orderId)) return
    wx.showModal({
      title: '申请退款',
      content: '确认提交积分订单退款申请？未发货/已取消会自动退款，其余状态由后台审批。',
      confirmColor: '#B8956A',
      success: async (res) => {
        if (!res.confirm) return
        try {
          const result = await api.applyPointsRefundRequest({
            orderId,
            refundReason: '用户发起退款申请'
          })
          const isAuto = !!(result && result.autoRefund)
          wx.showToast({
            title: isAuto ? '已自动退款' : '已提交审批',
            icon: 'success'
          })
          this.loadOrders()
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '申请失败', icon: 'none' })
        }
      }
    })
  },

  async onPayPointsOrder(e) {
    const orderId = Number(e.currentTarget.dataset.id)
    const name = e.currentTarget.dataset.name || 'Sravx 积分订单'
    if (!orderId || Number.isNaN(orderId)) return
    try {
      wx.showLoading({ title: '调起支付...', mask: true })
      const payParams = await api.createPaymentOrder({
        orderId,
        orderType: 'points',
        description: name
      })
      if (!payParams || !payParams.timeStamp || !payParams.nonceStr || !payParams.package || !payParams.paySign) {
        throw new Error('支付参数不完整，请稍后重试')
      }
      wx.hideLoading()
      await new Promise((resolve, reject) => {
        wx.requestPayment({
          timeStamp: payParams.timeStamp,
          nonceStr: payParams.nonceStr,
          package: payParams.package,
          signType: payParams.signType || 'RSA',
          paySign: payParams.paySign,
          success: resolve,
          fail: reject
        })
      })
      wx.showToast({ title: '支付成功', icon: 'success' })
      this.loadOrders()
    } catch (err) {
      wx.hideLoading()
      const msg = (err && (err.errMsg || err.message)) || '支付失败'
      if (msg.includes('requestPayment:fail cancel') || msg.indexOf('-2') !== -1) {
        wx.showToast({ title: '已取消支付', icon: 'none' })
        return
      }
      wx.showToast({ title: msg, icon: 'none' })
    }
  },

  onAfterSaleOrder(e) {
    const orderId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/orderAfterSale/orderAfterSale?orderId=${orderId}&type=aftersale`
    })
  },

  onGoShop() {
    wx.switchTab({ url: '/pages/shop/shop' })
  }
});
