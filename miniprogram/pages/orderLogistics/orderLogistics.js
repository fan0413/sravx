const api = require('../../utils/api')

Page({
  data: {
    orderId: '',
    orderNo: '',
    loading: true,
    logisticsCompany: '',
    expressNo: '',
    status: ''
  },

  onLoad(options) {
    const orderId = options.orderId ? String(options.orderId) : ''
    const orderNo = options.orderNo ? decodeURIComponent(String(options.orderNo)) : ''
    this.setData({ orderId, orderNo })

    if (orderId) {
      this.fetchWaybillToken(orderId)
      return
    }

    this.setData({ loading: false })
    wx.showToast({ title: '缺少订单参数', icon: 'none' })
  },

  async fetchWaybillToken(orderId) {
    try {
      const res = await api.getWaybillToken(orderId)
      this.setData({
        loading: false,
        logisticsCompany: res && res.expressCompany ? res.expressCompany : '',
        expressNo: res && res.expressNo ? res.expressNo : '',
        status: res && res.status ? res.status : ''
      })

      if (!res || (!res.expressNo && !res.expressCompany)) {
        wx.showToast({ title: '暂无物流信息', icon: 'none' })
      }
    } catch (e) {
      console.error('[orderLogistics] load failed', e)
      this.setData({ loading: false })
      wx.showToast({ title: '获取物流信息失败', icon: 'none' })
    }
  },

  onCopyExpressNo() {
    const no = this.data.expressNo
    if (!no) return
    wx.setClipboardData({
      data: no,
      success: () => wx.showToast({ title: '已复制运单号', icon: 'success' })
    })
  }
});
