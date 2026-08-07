const app = getApp()
const api = require('../../utils/api')
const preload = require('../../utils/preload')

Page({
  data: {
    countdown: 3,
    loading: true
  },

  timer: null,

  onLoad() {
    this.initLogin()
  },

  onUnload() {
    this.clearTimer()
  },

  async initLogin() {
    try {
      const loginResult = await api.login()
      console.log('Login result:', loginResult)

      app.setUserInfo({
        openid: loginResult.openid,
        unionid: loginResult.unionid,
        userId: loginResult.userId,
        isNewUser: loginResult.isNewUser,
        needsProfileSetup: loginResult.needsProfileSetup,
        phone: loginResult.phone,
        memberLevel: loginResult.memberLevel,
        points: loginResult.points,
        username: loginResult.isNewUser ? 'New User' : 'User'
      })

      preload.preloadStartup({ includeUser: !!loginResult.phone })
      this.setData({ loading: false })
      this.startCountdown()
    } catch (err) {
      console.error('Login failed:', err)
      preload.preloadStartup()
      this.setData({ loading: false })
      this.startCountdown()
    }
  },

  startCountdown() {
    this.timer = setInterval(() => {
      const next = this.data.countdown - 1
      if (next <= 0) {
        this.clearTimer()
        this.navigate()
        return
      }
      this.setData({ countdown: next })
    }, 1000)
  },

  clearTimer() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  },

  onSkip() {
    this.clearTimer()
    this.navigate()
  },

  navigate() {
    wx.switchTab({ url: '/pages/home/home' })
  }
});
