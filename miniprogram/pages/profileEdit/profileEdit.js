const app = getApp()
const api = require('../../utils/api')

function normalizeDateOnly(value) {
  if (!value) return ''
  if (typeof value === 'string') {
    const match = value.match(/^\d{4}-\d{2}-\d{2}/)
    return match ? match[0] : ''
  }
  if (value instanceof Date && !isNaN(value.getTime())) {
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return ''
}

function confirmSaveProfile() {
  return new Promise((resolve) => {
    wx.showModal({
      title: '确认保存',
      content: '个人资料每月仅可修改一次，保存后本月将无法再次修改，确定保存吗？',
      confirmText: '确定保存',
      cancelText: '再想想',
      success: (res) => resolve(!!res.confirm),
      fail: () => resolve(false)
    })
  })
}

Page({
  data: {
    form: {
      username: '',
      gender: '',
      birthday: '',
      occupation: ''
    },
    avatar: '/images/logo.png',
    genderOptions: ['男', '女'],
    occupationOptions: ['宠物美容师A级', '宠物美容师B级', '宠物美容师C级', '宠物美容学徒', '其他'],
    occupationIndex: -1,
    birthdayEnd: '2030-12-31',
    saving: false,
    loading: false
  },

  onLoad() {
    this.setBirthdayEnd()
    this.fillForm(app.globalData.userInfo || {})
    this.loadUserInfo()
  },

  setBirthdayEnd() {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    this.setData({ birthdayEnd: `${y}-${m}-${d}` })
  },

  fillForm(userInfo = {}) {
    const gender = userInfo.gender === 'unknown' ? '' : (userInfo.gender || '')
    const occupation = userInfo.occupation || ''
    this.setData({
      form: {
        username: userInfo.username || userInfo.nickname || '',
        gender,
        birthday: normalizeDateOnly(userInfo.birthday),
        occupation
      },
      avatar: userInfo.avatar || '/images/logo.png',
      occupationIndex: this.data.occupationOptions.indexOf(occupation)
    })
  },

  async loadUserInfo() {
    if (!app.globalData.isLoggedIn) {
      wx.redirectTo({ url: '/pages/register/register' })
      return
    }

    try {
      this.setData({ loading: true })
      const userInfo = await api.getUserInfo({})
      if (userInfo) this.fillForm(userInfo)
    } catch (err) {
      console.warn('ProfileEdit load user info failed:', err)
    } finally {
      this.setData({ loading: false })
    }
  },

  onNameInput(e) {
    this.setData({ 'form.username': e.detail.value })
  },

  onGenderTap(e) {
    this.setData({ 'form.gender': e.currentTarget.dataset.value })
  },

  onBirthdayChange(e) {
    this.setData({ 'form.birthday': e.detail.value })
  },

  onOccupationChange(e) {
    const idx = Number(e.detail.value)
    this.setData({
      occupationIndex: idx,
      'form.occupation': this.data.occupationOptions[idx] || ''
    })
  },

  async onSave() {
    if (this.data.saving) return

    const form = this.data.form || {}
    const username = (form.username || '').trim()
    if (!username) {
      wx.showToast({ title: '请输入用户名', icon: 'none' })
      return
    }

    const profilePayload = {
      username,
      gender: form.gender || '',
      birthday: normalizeDateOnly(form.birthday),
      occupation: form.occupation || ''
    }
    const payload = {
      ...profilePayload,
      enforceMonthlyLimit: true
    }

    const confirmed = await confirmSaveProfile()
    if (!confirmed) {
      return
    }

    try {
      this.setData({ saving: true })
      wx.showLoading({ title: '保存中...', mask: true })
      await api.updateUserInfo(payload)

      app.setUserInfo({
        ...(app.globalData.userInfo || {}),
        ...profilePayload,
        nickname: username,
        needsProfileSetup: false
      })
      app.globalData.userProfileUpdated = true

      wx.hideLoading()
      wx.showToast({ title: '保存成功', icon: 'success' })
      setTimeout(() => {
        if (getCurrentPages().length > 1) {
          wx.navigateBack()
        } else {
          wx.switchTab({ url: '/pages/userCenter/userCenter' })
        }
      }, 700)
    } catch (err) {
      wx.hideLoading()
      console.error('ProfileEdit save error:', err)
      const message = (err && err.message) || '保存失败'
      if (message.includes('本月已修改过资料')) {
        wx.showModal({
          title: '暂不能修改',
          content: message,
          showCancel: false,
          confirmText: '知道了'
        })
      } else {
        wx.showToast({ title: message, icon: 'none' })
      }
    } finally {
      this.setData({ saving: false })
    }
  }
})
