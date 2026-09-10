const api = require('../../utils/api')

function calcWarranty(activationDate, warrantyMonths) {
  const months = Number(warrantyMonths)
  const act = new Date(activationDate)
  if (isNaN(act.getTime())) {
    return { type: 'unknown', label: '保修期', text: '未知' }
  }
  const ay = act.getFullYear()
  const am = String(act.getMonth() + 1).padStart(2, '0')
  const ad = String(act.getDate()).padStart(2, '0')
  const actStr = `${ay}年${am}月${ad}日`
  if (!months || months <= 0) {
    return { type: 'lifetime', label: '保修期', text: '终身保修' }
  }
  const expire = new Date(act)
  expire.setMonth(expire.getMonth() + months)
  const ey = expire.getFullYear()
  const em = String(expire.getMonth() + 1).padStart(2, '0')
  const ed = String(expire.getDate()).padStart(2, '0')
  const expireStr = `${ey}年${em}月${ed}日`
  const now = new Date()
  return {
    type: expire < now ? 'expired' : 'valid',
    label: '保修期',
    text: `${actStr} - ${expireStr}`
  }
}

Page({
  data: {
    scissors: [],
    showBindModal: false,
    snInput: '',
    binding: false,
    loading: true
  },

  onLoad() {
    this.loadScissors()
  },

  onShow() {
    this.loadScissors()
  },

  async loadScissors() {
    try {
      this.setData({ loading: true })
      const list = await api.getMyScissors().catch(() => [])
      const scissors = (Array.isArray(list) ? list : []).map(item => ({
        ...item,
        warranty: calcWarranty(item.activation_date, item.warranty_months)
      })).sort((a, b) => {
        const order = { lifetime: 0, valid: 1, expired: 2, unknown: 3 }
    const left = order[a.warranty.type] === undefined ? 3 : order[a.warranty.type]
    const right = order[b.warranty.type] === undefined ? 3 : order[b.warranty.type]
    return left - right
      })
      this.setData({ scissors, loading: false })
    } catch (err) {
      console.error('[myScissors] loadScissors error:', err)
      this.setData({ loading: false, scissors: [] })
    }
  },

  onCardTap(e) {
    const item = e.currentTarget.dataset.item
    const bindingId = Number(item && item.id)
    if (!bindingId) return
    wx.navigateTo({
      url: `/pages/scissorsAfterSale/scissorsAfterSale?bindingId=${bindingId}`
    })
  },

  onShowBindModal() {
    this.setData({ showBindModal: true, snInput: '' })
  },

  onCloseBindModal() {
    this.setData({ showBindModal: false, snInput: '' })
  },

  onSnInput(e) {
    this.setData({ snInput: e.detail.value })
  },

  async onConfirmBind() {
    const sn = this.data.snInput.trim()
    if (!sn) {
      wx.showToast({ title: '请输入 SN 码', icon: 'none' })
      return
    }
    if (sn.length < 8) {
      wx.showToast({ title: 'SN 码格式不正确', icon: 'none' })
      return
    }
    const existing = this.data.scissors.find(s => s.sn === sn)
    if (existing) {
      wx.showToast({ title: '该剪刀已绑定', icon: 'none' })
      return
    }
    try {
      this.setData({ binding: true })
      wx.showLoading({ title: '绑定中...', mask: true })
      await api.bindScissors(sn)
      wx.hideLoading()
      wx.showToast({ title: '绑定成功', icon: 'success' })
      this.setData({ showBindModal: false, snInput: '' })
      this.loadScissors()
    } catch (err) {
      wx.hideLoading()
      this.setData({ binding: false })
      wx.showToast({ title: err.message || '绑定失败', icon: 'none' })
    }
  },

  onDeleteDevice(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '',
      content: '确定解除该剪刀绑定？',
      confirmColor: '#B8956A',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '解绑中...', mask: true })
            await api.unbindScissors(Number(id))
            wx.hideLoading()
            wx.showToast({ title: '已解除绑定', icon: 'success' })
            this.loadScissors()
          } catch (err) {
            wx.hideLoading()
            wx.showToast({ title: err.message || '解绑失败', icon: 'none' })
          }
        }
      }
    })
  }
});
