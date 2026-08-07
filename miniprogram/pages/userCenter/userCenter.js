const app = getApp()
const preload = require('../../utils/preload')

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

const LEVEL_NAMES = ['', 'LV1', 'LV2', 'LV3', 'LV4', 'LV5', 'LV6']
const LEVEL_CLASSES = ['', 'level-normal', 'level-silver', 'level-gold', 'level-diamond', 'level-black-diamond', 'level-supreme']

function calcMemberLevelByPoints(tp) {
  const total = Number(tp) || 0
  if (total >= 40000) return 6
  if (total >= 20000) return 5
  if (total >= 8000) return 4
  if (total >= 3000) return 3
  if (total >= 1200) return 2
  return 1
}

function normalizeLevel(value) {
  if (typeof value === 'string') {
    return Number(value.replace(/^LV/i, '')) || 1
  }
  return Number(value) || 1
}

function buildDefaultCenterData() {
  return {
    userInfo: { username: 'Sravx 用户', avatar: '/images/logo.png' },
    memberLevel: 'LV1',
    levelClass: 'level-normal',
    points: 0,
    totalPoints: 0,
    coupons: 0,
    scissors: [],
    loading: false
  }
}

function buildUserCenterData(payload) {
  const userRes = payload && payload.userRes
  const scissorsRes = payload && Array.isArray(payload.scissorsRes) ? payload.scissorsRes : []
  const availableCoupons = payload && Array.isArray(payload.availableCoupons) ? payload.availableCoupons : []
  const globalUser = app.globalData.userInfo || {}

  let userInfo = {
    username: globalUser.username || 'Sravx 用户',
    avatar: globalUser.avatar || '/images/logo.png',
    phone: globalUser.phone || '',
    gender: globalUser.gender || '',
    birthday: globalUser.birthday || '',
    occupation: globalUser.occupation || ''
  }
  let resolvedLevel = normalizeLevel(globalUser.memberLevel)
  let points = globalUser.points || 0
  let totalPoints = globalUser.totalPoints || globalUser.total_points || 0

  if (userRes) {
    userInfo = {
      username: userRes.username || userRes.nickname || 'Sravx 用户',
      avatar: userRes.avatar || '/images/logo.png',
      phone: userRes.phone || '',
      gender: userRes.gender || 'unknown',
      birthday: userRes.birthday || '',
      occupation: userRes.occupation || ''
    }
    resolvedLevel = Math.max(
      Number(userRes.member_level) || 1,
      calcMemberLevelByPoints(userRes.total_points || 0)
    )
    points = userRes.points || 0
    totalPoints = userRes.total_points || 0
  }

  const scissors = scissorsRes.map(item => ({
    ...item,
    warranty: calcWarranty(item.activation_date, item.warranty_months)
  })).sort((a, b) => {
    const order = { lifetime: 0, valid: 1, expired: 2, unknown: 3 }
    const left = order[a.warranty.type] === undefined ? 3 : order[a.warranty.type]
    const right = order[b.warranty.type] === undefined ? 3 : order[b.warranty.type]
    return left - right
  })

  return {
    userInfo,
    memberLevel: LEVEL_NAMES[resolvedLevel] || 'LV1',
    levelClass: LEVEL_CLASSES[resolvedLevel] || 'level-normal',
    points,
    totalPoints,
    coupons: availableCoupons.length,
    scissors,
    loading: false
  }
}

Page({
  data: {
    userInfo: { username: 'Sravx 用户', avatar: '/images/logo.png' },
    memberLevel: 'LV1',
    levelClass: 'level-normal',
    points: 0,
    totalPoints: 0,
    coupons: 0,
    scissors: [],
    menuItems: [
      { id: 'gift-card', icon: 'gift', text: '礼品卡兑换', url: '/pages/giftCardRedeem/giftCardRedeem' },
      { id: 'address', icon: 'location', text: '地址管理', url: '/pages/addressManage/addressManage' },
      { id: 'consult', icon: 'consult', text: '合作咨询', url: '/pages/cooperation/cooperation' }
    ],
    loading: false,
    scrollPaddingTop: 0
  },

  onLoad() {
    this.initNavLayout()
    this.loadData()
  },

  initNavLayout() {
    const menuRect = wx.getMenuButtonBoundingClientRect()
    const sysInfo = wx.getSystemInfoSync()
    const ratio = 750 / sysInfo.screenWidth
    const scrollPaddingTop = Math.ceil((menuRect.bottom + 12) * ratio)
    this.setData({ scrollPaddingTop })
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ active: 3 })
    }
    const force = !!app.globalData.userProfileUpdated
    app.globalData.userProfileUpdated = false
    this.loadData({ force })
  },

  applyUserCenterData(payload) {
    this.setData(buildUserCenterData(payload))
  },

  refreshUserCenterInBackground() {
    preload.preloadUserCenter({ force: true }).then((fresh) => {
      if (fresh) this.applyUserCenterData(fresh)
    })
  },

  async loadData(options = {}) {
    const cached = !options.force && preload.getCachedUserCenter()
    const cachedHasPhone = typeof app.hasPhoneAuthorized === 'function'
      ? app.hasPhoneAuthorized()
      : !!(app.globalData.userInfo && app.globalData.userInfo.phone)
    if (cached && app.globalData.isLoggedIn && cachedHasPhone) {
      this.applyUserCenterData(cached)
      this.refreshUserCenterInBackground()
      return
    }

    try {
      wx.showLoading({ title: '加载中...', mask: true })
      this.setData({ loading: true })

      const hasPhone = typeof app.hasPhoneAuthorized === 'function'
        ? app.hasPhoneAuthorized()
        : !!(app.globalData.userInfo && app.globalData.userInfo.phone)
      if (!app.globalData.isLoggedIn || !hasPhone) {
        this.setData(buildDefaultCenterData())
        wx.hideLoading()
        return
      }

      // 检查登录状态
      if (!app.globalData.isLoggedIn) {
        // 未登录，显示默认数据
        this.setData(buildDefaultCenterData())
        wx.hideLoading()
        return
      }

      const payload = await preload.preloadUserCenter({ force: true })
      this.applyUserCenterData(payload || { userRes: null, scissorsRes: [], availableCoupons: [] })

      wx.hideLoading()
    } catch (err) {
      wx.hideLoading()
      console.error('UserCenter loadData error:', err)
      // 即使出错也显示默认数据
      this.setData(buildDefaultCenterData())
    }
  },

  hasPhoneAuthorized() {
    return typeof app.hasPhoneAuthorized === 'function'
      ? app.hasPhoneAuthorized()
      : !!(app.globalData.userInfo && app.globalData.userInfo.phone)
  },

  goRegisterIfNeeded() {
    if (this.hasPhoneAuthorized()) return false
    wx.navigateTo({ url: '/pages/register/register' })
    return true
  },

  onScissorsTap() {
    if (this.goRegisterIfNeeded()) return
    wx.navigateTo({ url: '/pages/myScissors/myScissors' })
  },

  onMemberTap() {
    if (this.goRegisterIfNeeded()) return
    wx.navigateTo({ url: '/pages/membership/membership' })
  },

  onUserNameTap() {
    if (!app.globalData.isLoggedIn || !this.hasPhoneAuthorized()) {
      wx.navigateTo({ url: '/pages/register/register' })
      return
    }
    wx.navigateTo({ url: '/pages/profileEdit/profileEdit' })
  },

  onMenuTap(e) {
    if (this.goRegisterIfNeeded()) return
    const url = e.currentTarget.dataset.url
    if (url) {
      wx.navigateTo({ url })
    } else {
      wx.showToast({ title: '功能开发中', icon: 'none' })
    }
  },

  onPointsTap() {
    wx.navigateTo({ url: '/pages/pointsMall/pointsMall' })
  },

  onCouponsTap() {
    if (this.goRegisterIfNeeded()) return
    wx.navigateTo({ url: '/pages/couponManage/couponManage' })
  }
});
