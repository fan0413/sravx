Component({
  data: {
    active: 0,
    list: [
      {
        pagePath: '/pages/home/home',
        text: '首页',
        icon: 'home'
      },
      {
        pagePath: '/pages/shop/shop',
        text: '商城',
        icon: 'shop'
      },
      {
        pagePath: '/pages/orderList/orderList',
        text: '订单',
        icon: 'order'
      },
      {
        pagePath: '/pages/userCenter/userCenter',
        text: '我的',
        icon: 'user'
      }
    ]
  },

  methods: {
    switchTab(e) {
      const index = e.currentTarget.dataset.index
      const item = this.data.list[index]
      if (!item || !item.pagePath) return
      wx.switchTab({ url: item.pagePath })
    }
  }
})
