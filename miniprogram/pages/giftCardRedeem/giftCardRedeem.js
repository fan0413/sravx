const app = getApp()
const api = require('../../utils/api')

function normalizeCode(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 32)
}

function formatDate(input) {
  if (!input) return '--'
  const str = String(input).replace('T', ' ')
  return str.slice(0, 16).replace(/-/g, '.')
}

function hasPhoneAuthorized() {
  return typeof app.hasPhoneAuthorized === 'function'
    ? app.hasPhoneAuthorized()
    : !!(app.globalData.userInfo && app.globalData.userInfo.phone)
}

Page({
  data: {
    cardCode: '',
    previewCode: 'XXXX-XXXX-XXXX',
    canRedeem: false,
    redeeming: false,
    confirmingAddress: false,
    pendingAddressAutoConfirm: false,
    result: null,
    selectedAddress: null,
    records: [],
    rules: [
      '礼品卡仅可绑定至当前登录账号，兑换成功后不可转赠或撤销。',
      '请确认兑换码完整无误，字母不区分大小写。',
      '商品礼品需要收货地址；积分和优惠券会自动发放至当前账号。'
    ]
  },

  onLoad() {
    if (!this.ensurePhoneAuthorized()) return
    this.loadDefaultAddress()
    this.loadRecords()
  },

  onShow() {
    if (!this.ensurePhoneAuthorized()) return
    if (app.globalData.isLoggedIn && !this.data.selectedAddress) {
      this.loadDefaultAddress()
    }
    this.confirmPendingAddressIfReady()
  },

  ensurePhoneAuthorized() {
    if (hasPhoneAuthorized()) return true
    wx.navigateTo({ url: '/pages/register/register' })
    return false
  },

  onCodeInput(e) {
    const cardCode = normalizeCode(e.detail.value)
    this.updateCode(cardCode)
  },

  updateCode(cardCode) {
    this.setData({
      cardCode,
      previewCode: cardCode || 'XXXX-XXXX-XXXX',
      canRedeem: cardCode.replace(/-/g, '').length >= 8,
      result: null
    })
  },

  onClearCode() {
    this.updateCode('')
  },

  onPasteCode() {
    wx.getClipboardData({
      success: (res) => {
        const code = normalizeCode(res.data)
        if (!code) {
          wx.showToast({ title: '剪贴板没有兑换码', icon: 'none' })
          return
        }
        this.updateCode(code)
      }
    })
  },

  onScanCode() {
    wx.scanCode({
      onlyFromCamera: false,
      success: (res) => {
        const code = normalizeCode(res.result)
        if (!code) {
          wx.showToast({ title: '未识别到兑换码', icon: 'none' })
          return
        }
        this.updateCode(code)
      }
    })
  },

  async onRedeem() {
    if (this.data.redeeming) return
    if (!this.ensurePhoneAuthorized()) return
    const code = this.data.cardCode.trim()
    if (!this.data.canRedeem) {
      wx.showToast({ title: '请输入有效兑换码', icon: 'none' })
      return
    }
    if (!app.globalData.isLoggedIn) {
      wx.showModal({
        title: '需要登录',
        content: '登录后才能兑换礼品卡。',
        confirmText: '去登录',
        confirmColor: '#B8956A',
        success: (res) => {
          if (res.confirm) wx.navigateTo({ url: '/pages/register/register' })
        }
      })
      return
    }

    try {
      this.setData({ redeeming: true, result: null })
      const payload = { code }
      if (this.data.selectedAddress && this.data.selectedAddress.id) {
        payload.addressId = this.data.selectedAddress.id
      }
      const data = await api.redeemGiftCard(payload)
      const result = this.buildSuccessResult(data)
      wx.showToast({ title: '兑换成功', icon: 'success' })
      this.setData({
        cardCode: '',
        previewCode: 'XXXX-XXXX-XXXX',
        canRedeem: false,
        result
      })
      this.loadRecords()
    } catch (err) {
      const msg = err && err.message ? err.message : '兑换失败，请稍后再试'
      this.setData({
        result: {
          type: 'error',
          title: '兑换未完成',
          desc: msg.includes('function') || msg.includes('giftCard') ? '礼品卡服务暂未开通，请联系客服处理。' : msg
        }
      })
    } finally {
      this.setData({ redeeming: false })
    }
  },

  buildSuccessResult(data = {}) {
    const benefitText = data.benefitText || data.reward_text || data.name || '礼品卡权益已到账'
    return {
      type: 'success',
      giftType: data.giftType || '',
      recordId: data.recordId || null,
      orderId: data.orderId || null,
      orderNo: data.orderNo || '',
      nextAction: data.nextAction || '',
      actionText: data.actionText || '',
      title: data.title || '兑换成功',
      desc: benefitText
    }
  },

  async loadDefaultAddress() {
    if (!hasPhoneAuthorized()) return
    if (!app.globalData.isLoggedIn) return
    try {
      const list = await api.getAddressList().catch(() => [])
      const addressList = Array.isArray(list) ? list : []
      const selectedAddress = addressList.find(item => item.is_default === 1) || addressList[0] || null
      if (selectedAddress && !this.data.selectedAddress) {
        this.setData({ selectedAddress })
      }
    } catch (err) {
      console.warn('[giftCardRedeem] loadDefaultAddress error:', err)
    }
  },

  onAddressTap() {
    if (!this.ensurePhoneAuthorized()) return
    const selectedId = this.data.selectedAddress ? this.data.selectedAddress.id : ''
    wx.navigateTo({
      url: `/pages/addressManage/addressManage?from=giftCard&selectedId=${selectedId}`
    })
  },

  onGiftCardAddressSelected(address) {
    if (!address || !address.id) return
    this.setData({
      selectedAddress: address,
      pendingAddressAutoConfirm: true
    })
  },

  confirmPendingAddressIfReady() {
    const result = this.data.result
    if (
      this.data.pendingAddressAutoConfirm &&
      result &&
      result.nextAction === 'select_address' &&
      this.data.selectedAddress &&
      this.data.selectedAddress.id &&
      !this.data.confirmingAddress
    ) {
      this.setData({ pendingAddressAutoConfirm: false })
      this.onConfirmProductAddress()
    }
  },

  async onConfirmProductAddress() {
    if (!this.ensurePhoneAuthorized()) return
    const result = this.data.result
    const address = this.data.selectedAddress
    if (!result || !result.recordId) {
      wx.showToast({ title: '缺少兑换记录', icon: 'none' })
      return
    }
    if (!address || !address.id) {
      wx.showToast({ title: '请选择收货地址', icon: 'none' })
      return
    }
    if (this.data.confirmingAddress) return

    try {
      this.setData({ confirmingAddress: true })
      wx.showLoading({ title: '生成订单...', mask: true })
      const data = await api.confirmGiftCardProductAddress({
        recordId: result.recordId,
        addressId: address.id
      })
      wx.hideLoading()
      this.setData({ pendingAddressAutoConfirm: false })
      wx.showToast({ title: '订单已生成', icon: 'success' })
      this.setData({
        result: this.buildSuccessResult(data),
        pendingAddressAutoConfirm: false
      })
      this.loadRecords()
    } catch (err) {
      wx.hideLoading()
      this.setData({ pendingAddressAutoConfirm: false })
      wx.showToast({ title: (err && err.message) || '提交失败', icon: 'none' })
    } finally {
      this.setData({ confirmingAddress: false })
    }
  },

  onResultAction() {
    if (!this.ensurePhoneAuthorized()) return
    const result = this.data.result
    if (!result || !result.nextAction) return
    if (result.nextAction === 'select_address') {
      if (!this.data.selectedAddress) {
        this.onAddressTap()
        return
      }
      this.onConfirmProductAddress()
      return
    }
    if (result.nextAction === 'order_detail' && result.orderId) {
      wx.navigateTo({ url: `/pages/orderDetail/orderDetail?id=${encodeURIComponent(String(result.orderId))}` })
      return
    }
    if (result.nextAction === 'coupon_list') {
      wx.navigateTo({ url: '/pages/couponManage/couponManage' })
      return
    }
    if (result.nextAction === 'points_mall') {
      wx.navigateTo({ url: '/pages/pointsMall/pointsMall' })
    }
  },

  async loadRecords() {
    if (!hasPhoneAuthorized()) return
    if (!app.globalData.isLoggedIn) return
    try {
      const res = await api.getGiftCardRedeemRecords(1, 5)
      const list = Array.isArray(res) ? res : (res && (res.list || res.records)) || []
      const records = list.map((item, index) => ({
        id: item.id || `${item.code || 'gift'}-${index}`,
        title: item.title || item.card_name || '礼品卡兑换',
        valueText: item.valueText || item.value_text || item.reward_text || item.amount_text || '已到账',
        timeText: formatDate(item.redeemed_at || item.created_at || item.time),
        giftType: item.giftType || item.gift_type || '',
        nextAction: item.nextAction || '',
        fulfillmentStatus: item.fulfillmentStatus || item.fulfillment_status || '',
        orderId: item.orderId || item.order_id || null
      }))
      this.setData({ records })
    } catch (err) {
      console.warn('[giftCardRedeem] loadRecords error:', err)
      this.setData({ records: [] })
    }
  },

  onRecordTap(e) {
    if (!this.ensurePhoneAuthorized()) return
    const index = Number(e.currentTarget.dataset.index)
    const record = this.data.records[index]
    if (!record) return
    if (record.nextAction === 'select_address') {
      this.setData({
        result: {
          type: 'success',
          giftType: 'product',
          recordId: record.id,
          nextAction: 'select_address',
          actionText: '确认收货地址',
          title: '商品礼品待确认地址',
          desc: '请选择收货地址后生成礼品订单'
        }
      })
      return
    }
    if (record.orderId) {
      wx.navigateTo({ url: `/pages/orderDetail/orderDetail?id=${encodeURIComponent(String(record.orderId))}` })
    }
  }
})
