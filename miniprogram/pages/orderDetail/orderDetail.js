const api = require('../../utils/api')

function statusText(status, autoCancel) {
  if (status === 'cancelled' && (autoCancel === 1 || autoCancel === true)) {
    return '超时关闭'
  }
  const m = {
    pending_payment: '待付款',
    paid: '待发货',
    shipped: '待收货',
    received: '已收货',
    completed: '已完成',
    cancelled: '已取消',
    refunding: '退款中',
    refunded: '已退款'
  }
  return m[status] || '未知状态'
}

function fmtMoney(v) {
  if (v === undefined || v === null) return '0.00'
  const n = Number(v)
  if (Number.isNaN(n)) return String(v)
  return n.toFixed(2)
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
      const data = await api.getOrderDetail(this._orderQuery)
      const addr = data.address || {}
      const fullAddress = [addr.province, addr.city, addr.district, addr.detail].filter(Boolean).join('')

      const goods = (data.items || []).map((it) => ({
        id: it.id,
        name: it.product_name,
        image: it.product_image || '/images/logo.png',
        spec: it.spec_desc || '默认',
        quantity: it.quantity,
        price: fmtMoney(it.price)
      }))

      this.setData({
        loading: false,
        order: {
          id: data.id,
          orderNo: data.order_no,
          status: data.status,
          latestRefundStatus: data.latest_refund_status || '',
          statusText: statusText(data.status, data.auto_cancel),
          createdAt: data.created_at,
          consignee: addr.name || '—',
          phone: maskPhone(addr.phone || addr.contact || ''),
          address: fullAddress || '—',
          totalAmount: fmtMoney(data.total_amount),
          payAmount: fmtMoney(data.pay_amount),
          logisticsCompany: data.logistics_company || '',
          logisticsNo: data.logistics_no || ''
        },
        goods
      })
    } catch (e) {
      console.error('[orderDetail]', e)
      this.setData({
        loading: false,
        loadError: (e && e.message) || '加载失败'
      })
    }
  },

  onRetry() {
    if (this._orderQuery) this.loadDetail()
  },

  async onPayTap() {
    const { order, goods } = this.data
    if (!order || !order.id) return
    wx.showLoading({ title: '调起支付...', mask: true })
    try {
      const payParams = await api.createPaymentOrder({
        orderId: order.id,
        description: (goods[0] && goods[0].name) || 'Sravx 商品订单'
      })
      if (payParams.paid) {
        wx.hideLoading()
        wx.showToast({ title: '支付成功', icon: 'success' })
        this.loadDetail()
        return
      }
      if (!payParams || !payParams.timeStamp || !payParams.nonceStr || !payParams.package || !payParams.paySign) {
        throw new Error('支付参数不完整')
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
      const errMsg = (err && err.errMsg) || (err && err.message) || '支付失败'
      if (errMsg.includes('requestPayment:fail cancel') || errMsg.indexOf('-2') !== -1) {
        wx.showToast({ title: '已取消支付', icon: 'none' })
        return
      }
      wx.showToast({ title: errMsg, icon: 'none' })
    }
  },

  onCancelOrder() {
    const { order } = this.data
    if (!order || !order.id) return
    wx.showModal({
      title: '确认取消',
      content: '确定要取消该订单吗？',
      confirmColor: '#B8956A',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await api.cancelOrder(order.id)
          wx.showToast({ title: '订单已取消', icon: 'success' })
          this.loadDetail()
        } catch (e) {
          wx.showToast({ title: (e && e.message) || '取消失败', icon: 'none' })
        }
      }
    })
  },

  onConfirmReceive() {
    const { order } = this.data
    if (!order || !order.id) return
    wx.showModal({
      title: '确认收货',
      content: '确认已收到商品？',
      confirmColor: '#B8956A',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await api.confirmReceive(order.id)
          wx.showToast({ title: '已确认收货', icon: 'success' })
          this.loadDetail()
        } catch (e) {
          wx.showToast({ title: (e && e.message) || '操作失败', icon: 'none' })
        }
      }
    })
  },

  onGoLogistics() {
    const { order } = this.data
    if (!order) return
    wx.navigateTo({
      url: `/pages/orderLogistics/orderLogistics?orderId=${order.id}&orderNo=${encodeURIComponent(order.orderNo || '')}`
    })
  },

  onGoAfterSale() {
    const { order } = this.data
    if (!order) return
    wx.navigateTo({
      url: `/pages/orderAfterSale/orderAfterSale?orderId=${order.id}`
    })
  },

  onApplyRefund() {
    const { order } = this.data
    if (!order) return
    const isShipped = order.status === 'shipped'
    const tipTitle = isShipped ? '申请退款' : '确认退款'
    const tipContent = isShipped
      ? '订单已发货，退款需管理员审核。确认申请退款？'
      : '订单未发货，退款将立即处理。确认退款？'

    wx.showModal({
      title: tipTitle,
      content: tipContent,
      confirmColor: '#B8956A',
      success: async (res) => {
        if (!res.confirm) return
        try {
          wx.showLoading({ title: isShipped ? '提交中...' : '退款中...', mask: true })
          const refundResult = await api.applyRefundRequest({
            orderId: order.id,
            reason: isShipped ? '已发货订单退款' : '未发货自动退款',
            refundType: 'refund_only'
          })
          wx.hideLoading()

          if (refundResult.autoApproved) {
            wx.showLoading({ title: '处理退款...', mask: true })
            try {
              await api.refundOrder({ orderId: order.id, reason: '未发货自动退款' })
              wx.hideLoading()
              wx.showToast({ title: '退款申请已提交', icon: 'success', duration: 2000 })
            } catch (e) {
              wx.hideLoading()
              console.error('[OrderDetail] 退款接口失败:', e)
              wx.showToast({ title: '退款中，请稍后在订单查看', icon: 'none', duration: 2500 })
            }
          } else {
            wx.showToast({ title: '退款申请已提交，等待审核', icon: 'success', duration: 2000 })
          }

          setTimeout(() => this.loadDetail(), 2000)
        } catch (e) {
          wx.hideLoading()
          console.error('[OrderDetail] 退款申请失败:', e)
          wx.showToast({ title: (e && e.message) || '申请失败', icon: 'none' })
        }
      }
    })
  },

  onApplyAfterSale() {
    const { order } = this.data
    if (!order) return
    wx.navigateTo({
      url: `/pages/orderAfterSale/orderAfterSale?orderId=${order.id}&type=aftersale`
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
