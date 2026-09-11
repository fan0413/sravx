const api = require('../../utils/api')

Page({
  data: {
    couponCards: [],
    loading: false
  },

  onShow() {
    this.loadCoupons()
  },

  async loadCoupons() {
    try {
      this.setData({ loading: true })
      wx.showLoading({ title: '加载中...', mask: true })
      const coupons = await api.getAvailableCoupons()
      const couponCards = (Array.isArray(coupons) ? coupons : []).map(item => this.toCouponCard(item))
      this.setData({ couponCards })
    } catch (err) {
      console.error('loadCoupons error:', err)
      wx.showToast({ title: '优惠券加载失败', icon: 'none' })
      this.setData({ couponCards: [] })
    } finally {
      wx.hideLoading()
      this.setData({ loading: false })
    }
  },

  toCouponCard(item) {
    const value = Number(item.value || 0)
    const minAmount = Number(item.min_amount || 0)
    return {
      id: item.id,
      couponCode: item.coupon_code || this.buildCouponCode(item),
      title: item.name || '优惠券',
      typeText: '满减券',
      valueText: `￥${value.toFixed(0)}`,
      conditionText: `满${minAmount.toFixed(0)}可用`,
      descriptionText: item.usage_note || item.desc || '全场可用',
      discountText: `减免金额：￥${value.toFixed(2)}`,
      timeText: `${this.formatDate(item.start_time)} - ${this.formatDate(item.expire_time)}`,
      usedDateText: item.used_at ? this.formatDate(item.used_at) : '未使用',
      status: 'unused',
      statusText: '可使用',
      buttonText: '立即使用'
    }
  },

  buildCouponCode(item) {
    const idNum = Number(item.id || 0)
    const idPart = String(Number.isNaN(idNum) ? 0 : idNum).padStart(5, '0')
    const expireDate = this.formatDate(item.expire_time).replace(/\./g, '')
    return `JM${expireDate}${idPart}`
  },

  formatDate(input) {
    if (!input) return '--'
    const str = String(input).replace('T', ' ')
    const datePart = str.slice(0, 10)
    return datePart.replace(/-/g, '.')
  },

  onUseCoupon() {
    wx.navigateTo({ url: '/pages/shop/shop' })
  }
});
