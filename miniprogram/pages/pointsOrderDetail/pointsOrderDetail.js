const api = require('../../utils/api')

function pointsStatusText(status) {
  const m = {
    pending_send: '待发货',
    pending_payment: '待支付',
    paid: '已支付',
    shipped: '待收货',
    completed: '已完成',
    cancelled: '已取消',
    refunding: '退款审核中',
    refunded: '已退款'
  }
  return m[status] || '处理中'
}

function maskPhone(phone) {
  if (!phone || String(phone).length < 7) return phone || ''
  const s = String(phone)
  return `${s.slice(0, 3)}****${s.slice(-4)}`
}

Page({
  data: {
    loading: true,
    loadError: '',
    order: null,
    goods: []
  },

  onLoad(options) {
    const raw = options.id != null && options.id !== '' ? decodeURIComponent(String(options.id)) : ''
    this._orderQuery = raw
    if (!raw) {
      this.setData({ loading: false, loadError: '缺少订单参数' })
      return
    }
    this.loadDetail()
  },

  async loadDetail() {
    this.setData({ loading: true, loadError: '' })
    try {
      const data = await api.getPointsOrderDetail(this._orderQuery)
      const goods = (data.items || []).map((it) => ({
        id: it.id,
        name: it.product_name || '积分商品',
        image: it.product_image || '/images/logo.png',
        spec: it.spec_text || '默认规格',
        quantity: Number(it.quantity) || 1,
        pointsPrice: Number(it.points_price) || 0
      }))
      const payableCash = Number(data.payable_cash || (data.payment_detail && data.payment_detail.payable_cash) || 0)
      this.setData({
        loading: false,
        order: {
          id: data.id,
          orderNo: data.order_no,
          status: data.status,
          statusText: pointsStatusText(data.status),
          createdAt: data.created_at,
          consignee: data.receiver_name || '—',
          phone: maskPhone(data.receiver_phone || ''),
          address: data.address_text || '—',
          totalPoints: Number(data.total_points) || 0,
          payableCash,
          payableCashText: payableCash.toFixed(2),
          paymentStatus: data.payment_status || (data.payment_detail && data.payment_detail.payment_status) || '',
          paymentChannel: data.payment_channel || (data.payment_detail && data.payment_detail.payment_channel) || '',
          logisticsCompany: data.logistics_company || '',
          logisticsNo: data.logistics_no || ''
        },
        goods
      })
    } catch (e) {
      console.error('[pointsOrderDetail]', e)
      this.setData({
        loading: false,
        loadError: (e && e.message) || '加载失败'
      })
    }
  },

  onRetry() {
    if (this._orderQuery) this.loadDetail()
  },

  onGoLogistics() {
    const { order } = this.data
    if (!order) return
    wx.navigateTo({
      url: `/pages/orderLogistics/orderLogistics?orderId=${order.id}&orderNo=${encodeURIComponent(order.orderNo || '')}`
    })
  },

  async onPayOrder() {
    const { order, goods } = this.data
    if (!order || order.status !== 'pending_payment' || !(order.payableCash > 0)) return
    if (this._paying) return
    this._paying = true
    try {
      wx.showLoading({ title: '调起支付...', mask: true })
      const firstGoods = goods && goods[0]
      const payParams = await api.createPaymentOrder({
        orderId: order.id,
        orderType: 'points',
        description: (firstGoods && firstGoods.name) || 'Sravx 积分订单'
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
      this.loadDetail()
    } catch (err) {
      wx.hideLoading()
      const msg = (err && (err.errMsg || err.message)) || '支付失败'
      if (msg.includes('requestPayment:fail cancel') || msg.indexOf('-2') !== -1) {
        wx.showToast({ title: '已取消支付', icon: 'none' })
        return
      }
      wx.showToast({ title: msg, icon: 'none' })
    } finally {
      this._paying = false
    }
  },

  onCancelOrder() {
    const { order } = this.data
    if (!order || order.status !== 'pending_payment') return
    wx.showModal({
      title: '取消订单',
      content: '取消后将退回已扣积分并释放库存，确认取消吗？',
      confirmText: '确认取消',
      success: async (res) => {
        if (!res.confirm) return
        try {
          wx.showLoading({ title: '取消中...', mask: true })
          await api.cancelPointsOrder(order.id)
          wx.hideLoading()
          wx.showToast({ title: '已取消', icon: 'success' })
          this.loadDetail()
        } catch (err) {
          wx.hideLoading()
          wx.showToast({ title: (err && err.message) || '取消失败', icon: 'none' })
        }
      }
    })
  },

  onCopyLogisticsNo() {
    const no = (this.data.order && this.data.order.logisticsNo) || ''
    if (!no) return
    wx.setClipboardData({
      data: no,
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
    })
  }
});
