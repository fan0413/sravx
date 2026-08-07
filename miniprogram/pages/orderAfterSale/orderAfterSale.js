const api = require('../../utils/api')

function statusText(status) {
  const map = {
    pending_review: '待审批',
    approved: '审批通过',
    rejected: '已驳回',
    processing: '退款处理中',
    refunded: '已退款'
  }
  return map[status] || status || '未知状态'
}

Page({
  data: {
    orderId: '',
    type: 'refund',
    typeText: '仅退款',
    reason: '',
    records: [],
    loading: true,
    submitting: false
  },

  onLoad(options) {
    const orderId = options.orderId ? String(options.orderId) : ''
    const type = options.type === 'aftersale' ? 'aftersale' : 'refund'
    this.setData({
      orderId,
      type,
      typeText: type === 'aftersale' ? '售后申请' : '仅退款'
    })
    this.loadRecords()
  },

  async loadRecords() {
    if (!this.data.orderId) {
      this.setData({ loading: false, records: [] })
      return
    }
    this.setData({ loading: true })
    try {
      const rows = await api.getRefundRequestList(this.data.orderId)
      const records = (rows || []).map((it) => ({
        id: it.id,
        type: it.request_type === 'aftersale' ? '售后申请' : '仅退款',
        reason: it.reason || '—',
        amount: it.requested_amount || '0.00',
        status: statusText(it.status),
        createdAt: it.created_at || ''
      }))
      this.setData({ records, loading: false })
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' })
    }
  },

  onReasonInput(e) {
    this.setData({ reason: (e.detail && e.detail.value) || '' })
  },

  async onSubmit() {
    if (!this.data.orderId) {
      wx.showToast({ title: '缺少订单号', icon: 'none' })
      return
    }
    if (this.data.type !== 'refund') {
      wx.showToast({ title: '售后申请接口预留中', icon: 'none' })
      return
    }
    if (this.data.submitting) return

    this.setData({ submitting: true })
    try {
      await api.applyRefundRequest({
        orderId: this.data.orderId,
        reason: this.data.reason || '用户申请退款',
        refundType: 'refund_only'
      })
      wx.showToast({ title: '已提交，待管理员审批', icon: 'none' })
      setTimeout(() => {
        wx.navigateBack()
      }, 450)
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '提交失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  }
});
