const LEVELS = [
  { id: 1, name: 'LV1', cls: 'level-1', min: 0, desc: '注册即享' },
  { id: 2, name: 'LV2', cls: 'level-2', min: 1200, desc: '约2把' },
  { id: 3, name: 'LV3', cls: 'level-3', min: 3000, desc: '约5把' },
  { id: 4, name: 'LV4', cls: 'level-4', min: 8000, desc: '约12把' },
  { id: 5, name: 'LV5', cls: 'level-5', min: 20000, desc: '约30把' },
  { id: 6, name: 'LV6', cls: 'level-6', min: 40000, desc: '约60把' }
]

const BENEFITS_DATA = [
  {
    category: '基础身份',
    items: [
      { name: 'SN全球唯一身份识别', minLevel: 1 },
      { name: '数字版《剪刀养护手册》', minLevel: 1 },
      { name: '会员专属数字化档案', minLevel: 1 }
    ]
  },
  {
    category: '售后保障',
    items: [
      { name: '原厂1对1技术咨询', minLevel: 1 },
      { name: '出厂级二次精度校准', minLevel: 1 },
      { name: '原厂保养服务(积分)', minLevel: 2 },
      { name: '保养期【备用剪】申请', minLevel: 4 },
      { name: '保养绿色通道：3天内维保养完成', minLevel: 5 }
    ]
  },
  {
    category: '物流特权',
    items: [
      { name: '标准物流包邮(首购)', minLevel: 1 },
      { name: '标准地区顺丰往返补贴', minLevel: 1 },
      { name: '全国地区顺丰往返补贴', minLevel: 3 }
    ]
  },
  {
    category: '专属选购',
    items: [
      { name: '基础配件购买权', minLevel: 1 },
      { name: '专业级耗材积分换购', minLevel: 2 },
      { name: '限定版色彩/涂层选购', minLevel: 3 },
      { name: '新品内测/先行购买权', minLevel: 5 }
    ]
  },
  {
    category: '高级定制',
    items: [
      { name: 'SN码后四位专属连号', minLevel: 5 },
      { name: '主理人1对1调校建议', minLevel: 6 },
      { name: '专属黑金收藏级包装盒', minLevel: 6 }
    ]
  }
]

Page({
  data: {
    levels: LEVELS,
    benefits: BENEFITS_DATA,
    currentLevel: 1,
    currentLevelInfo: LEVELS[0],
    previewLevelId: 1,
    points: 0,
    totalPoints: 0,
    nextLevelNeed: 1200,
    username: 'Sravx 用户',
    scrollPaddingTop: 0
  },

  onLoad() {
    this.initNavLayout()
    this.loadMemberData()
  },

  initNavLayout() {
    const menuRect = wx.getMenuButtonBoundingClientRect()
    const sysInfo = wx.getSystemInfoSync()
    const ratio = 750 / sysInfo.screenWidth
    const scrollPaddingTop = Math.ceil(menuRect.bottom * ratio)
    this.setData({ scrollPaddingTop })
  },

  loadMemberData() {
    const pages = getCurrentPages()
    const prevPage = pages[pages.length - 2]
    let totalPoints = 0
    let points = 0
    let username = 'Sravx 用户'

    if (prevPage && prevPage.data) {
      totalPoints = Number(prevPage.data.totalPoints) || 0
      points = Number(prevPage.data.points) || 0
      username = (prevPage.data.userInfo && prevPage.data.userInfo.username) || 'Sravx 用户'
    }

    const currentLevel = this.calcLevel(totalPoints)
    const currentLevelInfo = LEVELS.find(l => l.id === currentLevel) || LEVELS[0]

    let nextLevelNeed = 0
    if (currentLevel < 6) {
      const next = LEVELS.find(l => l.id === currentLevel + 1)
      if (next) {
        nextLevelNeed = next.min - totalPoints
        if (nextLevelNeed < 0) nextLevelNeed = 0
      }
    }

    this.setData({
      currentLevel,
      currentLevelInfo,
      previewLevelId: currentLevel,
      totalPoints,
      points,
      nextLevelNeed,
      username
    })
  },

  calcLevel(tp) {
    const total = Number(tp) || 0
    if (total >= 40000) return 6
    if (total >= 20000) return 5
    if (total >= 8000) return 4
    if (total >= 3000) return 3
    if (total >= 1200) return 2
    return 1
  },

  onPreviewLevel(e) {
    const id = Number(e.currentTarget.dataset.id)
    const info = this.data.levels.find(l => l.id === id)
    this.setData({ previewLevelId: id, currentLevelInfo: info })
  },

  onResetPreview() {
    const info = this.data.levels.find(l => l.id === this.data.currentLevel)
    this.setData({ previewLevelId: this.data.currentLevel, currentLevelInfo: info })
  }
});
