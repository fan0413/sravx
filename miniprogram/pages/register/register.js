const app = getApp()
const api = require('../../utils/api')
const phoneAuth = require('../../utils/phoneAuth')

Page({
  data: {
    username: '',
    gender: '',
    birthday: '',
    occupation: '',
    occupationIndex: -1,
    occupationOptions: ['宠物美容师A级', '宠物美容师B级', '宠物美容师C级', '宠物美容学徒', '其他'],
    canSubmit: false,
    hasPhone: false
  },

  onLoad() {
    this.syncHasPhone()
  },

  onShow() {
    this.syncHasPhone()
  },

  syncHasPhone() {
    const u = app.globalData.userInfo || {}
    this.setData({ hasPhone: !!u.phone })
  },

  onInputUsername(e) {
    this.setData({ username: e.detail.value })
    this.checkForm()
  },

  onSelectGender(e) {
    this.setData({ gender: e.currentTarget.dataset.value })
    this.checkForm()
  },

  onBirthdayChange(e) {
    this.setData({ birthday: e.detail.value })
    this.checkForm()
  },

  onOccupationChange(e) {
    const idx = e.detail.value
    this.setData({
      occupationIndex: idx,
      occupation: this.data.occupationOptions[idx]
    })
    this.checkForm()
  },

  checkForm() {
    const { username, gender, birthday, occupation } = this.data
    this.setData({
      canSubmit: username.trim() !== '' && gender !== '' && birthday !== '' && occupation !== ''
    })
  },

  getProfilePayload() {
    return {
      username: this.data.username.trim(),
      gender: this.data.gender,
      birthday: this.data.birthday,
      occupation: this.data.occupation
    }
  },

  async onGetPhoneNumber(e) {
    console.log('[Register] onGetPhoneNumber:', e.detail)
    if (e.detail.errMsg !== 'getPhoneNumber:ok') {
      console.log('[Register] 手机号授权被拒绝或失败:', e.detail.errMsg)
      phoneAuth.showRequiredToast('请授权手机号后继续使用')
      return
    }
    if (!this.data.canSubmit) {
      console.log('[Register] 表单未填完，忽略')
      return
    }
    const { code } = e.detail
    if (!code && !e.detail.cloudID && !(e.detail.encryptedData && e.detail.iv)) {
      console.log('[Register] 未获取到 phone code')
      phoneAuth.showRequiredToast('未获取到手机号授权凭证，请重试')
      return
    }

    let phoneRes = null
    let lastErr = null
    for (let i = 0; i < 2; i++) {
      try {
        phoneRes = await phoneAuth.loginWithPhoneDetail(e.detail, {
          profile: this.getProfilePayload(),
          loadingTitle: '绑定中...'
        })
        break
      } catch (err) {
        lastErr = err
        console.error(`[Register] login 尝试 ${i + 1}/2 失败:`, err)
        if (i < 1) await new Promise(r => setTimeout(r, 1500))
      }
    }

    if (!phoneRes || !phoneRes.phone) {
      console.error('[Register] 获取手机号失败:', lastErr || 'phone为空')
      phoneAuth.showRequiredToast((lastErr && lastErr.userMessage) || '手机号绑定失败，请重新授权')
      return
    }

    await this.saveAndRedirect(phoneRes, { skipProfileSave: !!phoneRes.profileSaved })
  },

  async fallbackSubmit() {
    phoneAuth.showRequiredToast('请授权手机号后继续使用')
  },

  async saveProfile() {
    await api.updateUserInfo(this.getProfilePayload())
  },

  async ensureLoginResult(loginRes = {}) {
    if (loginRes && (loginRes.openid || loginRes.userId)) return loginRes

    const refreshed = await api.login({
      profile: this.getProfilePayload()
    })

    return {
      ...refreshed,
      ...loginRes,
      openid: refreshed.openid,
      unionid: refreshed.unionid,
      userId: loginRes.userId || refreshed.userId,
      phone: loginRes.phone || refreshed.phone,
      isNewUser: loginRes.isNewUser !== undefined ? loginRes.isNewUser : refreshed.isNewUser,
      needsProfileSetup: refreshed.needsProfileSetup,
      memberLevel: refreshed.memberLevel,
      points: refreshed.points,
      totalPoints: refreshed.totalPoints
    }
  },

  async saveAndRedirect(phoneRes, options = {}) {
    let loginRes
    wx.showLoading({ title: '淇濆瓨涓?..', mask: true })
    try {
      loginRes = await this.ensureLoginResult(phoneRes)
      if (!options.skipProfileSave) {
        await this.saveProfile()
      }
    } catch (e) {
      wx.hideLoading()
      console.error('[Register] updateUserInfo error:', e)
      wx.showToast({ title: '资料保存失败，请重试', icon: 'none' })
      return
    }
    wx.hideLoading()

    const userInfo = app.globalData.userInfo || {}
    app.setUserInfo({
      ...userInfo,
      openid: loginRes.openid,
      unionid: loginRes.unionid,
      phone: loginRes.phone,
      userId: loginRes.userId,
      username: this.data.username,
      nickname: this.data.username,
      gender: this.data.gender,
      birthday: this.data.birthday,
      occupation: this.data.occupation,
      needsProfileSetup: false,
      isNewUser: loginRes.isNewUser,
      memberLevel: loginRes.memberLevel,
      points: loginRes.points,
      totalPoints: loginRes.totalPoints
    })

    wx.showToast({ title: '注册成功', icon: 'success', duration: 1500 })
    setTimeout(() => wx.switchTab({ url: '/pages/home/home' }), 1500)
  },

  async localOnlyRedirect() {
    wx.showLoading({ title: '登录中...', mask: true })
    let loginRes
    try {
      loginRes = await api.login({
        profile: this.getProfilePayload()
      })
    } catch (e) {
      wx.hideLoading()
      console.error('[Register] login without phone error:', e)
      wx.showToast({ title: '登录失败，请重试', icon: 'none' })
      return
    }
    wx.hideLoading()

    const userInfo = app.globalData.userInfo || {}
    app.setUserInfo({
      ...userInfo,
      openid: loginRes.openid,
      unionid: loginRes.unionid,
      phone: loginRes.phone || userInfo.phone,
      userId: loginRes.userId,
      username: this.data.username,
      nickname: this.data.username,
      gender: this.data.gender,
      birthday: this.data.birthday,
      occupation: this.data.occupation,
      needsProfileSetup: false,
      isNewUser: loginRes.isNewUser,
      memberLevel: loginRes.memberLevel,
      points: loginRes.points,
      totalPoints: loginRes.totalPoints
    })
    wx.showToast({ title: '注册成功', icon: 'success', duration: 1500 })
    setTimeout(() => wx.switchTab({ url: '/pages/home/home' }), 1500)
  },

  async onSubmit() {
    if (!this.data.canSubmit) return
    const userInfo = app.globalData.userInfo || {}
    if (userInfo.phone) {
      await this.saveAndRedirect({ phone: userInfo.phone, userId: userInfo.userId, isNewUser: false })
    } else {
      phoneAuth.showRequiredToast('请授权手机号后继续使用')
    }
  }
});
