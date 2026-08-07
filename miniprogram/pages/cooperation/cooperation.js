const api = require('../../utils/api')

Page({
  data: {
    form: {
      name: '',
      gender: '',
      scale: '',
      phone: '',
      wechat: '',
      address: '',
      intention: ''
    },
    genderOptions: ['男', '女'],
    scaleOptions: ['个人', '学校', '门店', '企业'],
    genderIndex: -1,
    scaleIndex: -1,
    submitting: false,
    showConfirm: false
  },

  onNameInput(e) {
    this.setData({ 'form.name': e.detail.value })
  },

  onGenderChange(e) {
    const idx = parseInt(e.detail.value)
    this.setData({ genderIndex: idx, 'form.gender': this.data.genderOptions[idx] })
  },

  onScaleChange(e) {
    const idx = parseInt(e.detail.value)
    this.setData({ scaleIndex: idx, 'form.scale': this.data.scaleOptions[idx] })
  },

  onPhoneInput(e) {
    this.setData({ 'form.phone': e.detail.value })
  },

  onWechatInput(e) {
    this.setData({ 'form.wechat': e.detail.value })
  },

  onAddressInput(e) {
    this.setData({ 'form.address': e.detail.value })
  },

  onIntentionInput(e) {
    this.setData({ 'form.intention': e.detail.value })
  },

  validate() {
    const { name, gender, scale, phone } = this.data.form
    if (!name.trim()) {
      wx.showToast({ title: '请填写称呼', icon: 'none' })
      return false
    }
    if (!gender) {
      wx.showToast({ title: '请选择性别', icon: 'none' })
      return false
    }
    if (!scale) {
      wx.showToast({ title: '请选择规模', icon: 'none' })
      return false
    }
    if (!phone.trim()) {
      wx.showToast({ title: '请填写联系号码', icon: 'none' })
      return false
    }
    if (!/^1\d{10}$/.test(phone.trim())) {
      wx.showToast({ title: '联系号码格式不正确', icon: 'none' })
      return false
    }
    return true
  },

  onSubmit() {
    if (!this.validate()) return
    this.setData({ showConfirm: true })
  },

  onCancelConfirm() {
    this.setData({ showConfirm: false })
  },

  async onConfirmSubmit() {
    if (this.data.submitting) return

    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中...', mask: true })

    try {
      await api.submitCooperation(this.data.form)
      wx.hideLoading()
      this.setData({ showConfirm: false })
      wx.showToast({ title: '提交成功，我们将尽快联系您', icon: 'success', duration: 2000 })
      setTimeout(() => wx.navigateBack(), 2000)
    } catch (err) {
      wx.hideLoading()
      this.setData({ submitting: false })
      wx.showToast({ title: err.message || '提交失败，请重试', icon: 'none' })
    }
  }
});
