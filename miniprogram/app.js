const api = require('./utils/api')

App({
  globalData: {
    userInfo: null,
    isRegistered: false,
    isLoggedIn: false,
    cloudEnvId: 'cloud1-8gk3bptqefbf01d6',
    // Read-only API migration remains disabled until the new HTTPS endpoint is
    // accepted in the mini program's request-domain configuration.
    readOnlyApiMigration: { enabled: false, baseUrl: 'https://api.sravxpet.com' },
    // Authenticated migration traffic remains disabled until the target HTTPS
    // endpoint has passed the internal user-session and address-book checks.
    // Keep every feature false until its independent migration gate passes.
    // Do not enable payment, order, points, tool binding, gift-card or after-sale
    // routes through this configuration.
    authenticatedApiMigration: { enabled: false, baseUrl: 'https://api.sravxpet.com', features: { profile: false, addresses: false, inquiries: false } },
    authenticatedApiSession: null,
    hasPhoneAuth: false,
    userProfileUpdated: false
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error('Please use base library 2.2.3 or above to enable cloud capabilities')
    } else {
      wx.cloud.init({
        env: this.globalData.cloudEnvId,
        traceUser: true
      })
    }
    this.checkLogin()
    this.refreshLoginState()
  },

  checkLogin() {
    try {
      const userInfo = wx.getStorageSync('userInfo')
      const isRegistered = wx.getStorageSync('isRegistered')
      if (userInfo && isRegistered) {
        this.globalData.userInfo = userInfo
        this.globalData.isRegistered = !!(userInfo.userId || userInfo.openid || userInfo.phone)
        this.globalData.isLoggedIn = !!(userInfo.userId || userInfo.openid || userInfo.phone)
        this.globalData.hasPhoneAuth = !!(userInfo && userInfo.phone)
      }
    } catch (e) {
      console.error('Read login state failed:', e)
    }
  },

  setUserInfo(info) {
    this.globalData.userInfo = info
    this.globalData.isRegistered = !!(info && (info.userId || info.openid || info.phone))
    this.globalData.isLoggedIn = !!(info && (info.userId || info.openid || info.phone))
    this.globalData.hasPhoneAuth = !!(info && info.phone)
    wx.setStorageSync('userInfo', info)
    wx.setStorageSync('isRegistered', !!(info && (info.userId || info.openid || info.phone)))
  },

  refreshLoginState() {
    if (!wx.cloud && !this.globalData.authenticatedApiMigration.enabled) return Promise.resolve(null)
    const cachedUser = this.globalData.userInfo || {}

    return api.login().then((loginUser) => {
      if (!loginUser || !loginUser.userId) throw new Error('login failed')
      const merged = {
        ...cachedUser,
        openid: loginUser.openid,
        unionid: loginUser.unionid || cachedUser.unionid,
        userId: loginUser.userId || cachedUser.userId,
        phone: loginUser.phone || cachedUser.phone,
        isNewUser: loginUser.isNewUser,
        needsProfileSetup: loginUser.needsProfileSetup,
        memberLevel: loginUser.memberLevel,
        points: loginUser.points,
        totalPoints: loginUser.totalPoints
      }
      this.setUserInfo(merged)
      return merged
    }).catch((err) => {
      console.warn('Refresh login state failed:', err)
      return null
    })
  },

  hasPhoneAuthorized() {
    const userInfo = this.globalData.userInfo || {}
    return !!userInfo.phone
  },

  logout() {
    this.globalData.userInfo = null
    this.globalData.isRegistered = false
    this.globalData.isLoggedIn = false
    this.globalData.hasPhoneAuth = false
    wx.removeStorageSync('userInfo')
    wx.removeStorageSync('isRegistered')
    // The target API session is independent from the legacy CloudBase login.
    // Revoke it when the opt-in endpoint is active, then always clear local state.
    const migration = this.globalData.authenticatedApiMigration || {}
    const cachedSession = this.globalData.authenticatedApiSession || wx.getStorageSync('sravx_authenticated_api_session')
    const baseUrl = typeof migration.baseUrl === 'string' ? migration.baseUrl.trim().replace(/\/$/, '') : ''
    if (migration.enabled === true && /^https:\/\//.test(baseUrl) && cachedSession && typeof cachedSession.token === 'string') {
      wx.request({
        url: `${baseUrl}/api/v1/auth/session`,
        method: 'DELETE',
        header: { Authorization: `Bearer ${cachedSession.token}` }
      })
    }
    this.globalData.authenticatedApiSession = null
    wx.removeStorageSync('sravx_authenticated_api_session')
  }
});
