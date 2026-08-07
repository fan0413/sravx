const api = require('../../utils/api')
const share = require('../../utils/share')
const app = getApp()

Page({
  data: {
    points: 0,
    username: 'Sravx 用户',
    avatar: '/images/logo.png',
    memberLevel: 'LV1',
    memberLevelNo: 1,
    levelClass: 'level-normal',
    products: [],
    categories: [],
    activeCategoryId: 0,
    loading: true
  },

  onLoad() {
    share.showShareMenu()
    this.loadData()
  },

  onPullDownRefresh() {
    this.loadData().finally(() => wx.stopPullDownRefresh())
  },

  async loadData() {
    this.setData({ loading: true })
    try {
      const hasPhone = typeof app.hasPhoneAuthorized === 'function'
        ? app.hasPhoneAuthorized()
        : !!(app.globalData.userInfo && app.globalData.userInfo.phone)
      const [userInfo, products] = await Promise.all([
        hasPhone ? api.getUserInfo({}).catch(() => null) : Promise.resolve(null),
        api.getPointsProducts(this.data.activeCategoryId).catch(() => ({ products: [], categories: [] }))
      ])

      const levelMap = {
        1: 'LV1',
        2: 'LV2',
        3: 'LV3',
        4: 'LV4',
        5: 'LV5',
        6: 'LV6'
      }

      const levelClassMap = {
        1: 'level-normal',
        2: 'level-silver',
        3: 'level-gold',
        4: 'level-diamond',
        5: 'level-black-diamond',
        6: 'level-supreme'
      }
      const pointsMallData = Array.isArray(products)
        ? { products, categories: [] }
        : (products || { products: [], categories: [] })
      const categories = [{ id: 0, name: '全部' }].concat(Array.isArray(pointsMallData.categories) ? pointsMallData.categories : [])

      const memberLevelNo = Number((userInfo && userInfo.member_level) || pointsMallData.current_member_level || 1) || 1

      this.setData({
        points: userInfo && userInfo.points ? userInfo.points : 0,
        username: (userInfo && (userInfo.nickname || userInfo.username)) || 'Sravx 用户',
        avatar: (userInfo && userInfo.avatar) || '/images/logo.png',
        memberLevel: levelMap[memberLevelNo] || 'LV1',
        memberLevelNo,
        levelClass: levelClassMap[memberLevelNo] || 'level-normal',
        products: Array.isArray(pointsMallData.products)
          ? pointsMallData.products.map((item) => {
            const minLevel = Number(item.min_member_level || 1) || 1
            return {
              ...item,
              min_member_level: minLevel,
              min_member_level_name: item.min_member_level_name || levelMap[minLevel] || 'LV1',
              can_redeem: item.can_redeem !== false
            }
          })
          : [],
        categories,
        loading: false
      })
    } catch (e) {
      console.error('[pointsMall] loadData error:', e)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  onItemTap(e) {
    const item = e.currentTarget.dataset.item || {}
    if (!item.id) return
    if (item.can_redeem === false) {
      wx.showToast({
        title: `需${item.min_member_level_name || '更高会员等级'}可兑换`,
        icon: 'none'
      })
      return
    }
    wx.navigateTo({
      url: `/pages/pointsProductDetail/pointsProductDetail?id=${item.id}`
    })
  },

  onCategoryTap(e) {
    const cid = Number(e.currentTarget.dataset.id) || 0
    if (cid === this.data.activeCategoryId) return
    this.setData({ activeCategoryId: cid }, () => this.loadData())
  },

  onShareAppMessage() {
    return share.createShareAppMessage({
      title: 'Sravx 积分商城',
      path: '/pages/pointsMall/pointsMall'
    })
  },

  onShareTimeline() {
    return share.createShareTimeline({
      title: 'Sravx 积分商城'
    })
  }
});
