const cart = require('../../utils/cart')

function formatPrice(value) {
  return (Number(value) || 0).toFixed(2)
}

Page({
  data: {
    items: [],
    totalCount: 0,
    totalPrice: '0.00'
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ active: 1 })
    }
    this.loadCart()
  },

  loadCart() {
    const items = cart.getCart().map(item => ({ ...item, priceText: formatPrice(item.price) }))
    const totalCount = items.reduce((total, item) => total + item.quantity, 0)
    const totalPrice = formatPrice(items.reduce((total, item) => total + item.price * item.quantity, 0))
    this.setData({ items, totalCount, totalPrice })
  },

  onDecrease(e) {
    const index = Number(e.currentTarget.dataset.index)
    const item = this.data.items[index]
    if (!item) return
    if (item.quantity <= 1) {
      this.onRemove(e)
      return
    }
    cart.updateQuantity(index, item.quantity - 1)
    this.loadCart()
  },

  onIncrease(e) {
    const index = Number(e.currentTarget.dataset.index)
    const item = this.data.items[index]
    if (!item) return
    cart.updateQuantity(index, item.quantity + 1)
    this.loadCart()
  },

  onRemove(e) {
    const index = Number(e.currentTarget.dataset.index)
    wx.showModal({
      title: '移出购物袋',
      content: '确定移除这件商品？',
      confirmColor: '#6E6256',
      success: result => {
        if (!result.confirm) return
        cart.removeItem(index)
        this.loadCart()
      }
    })
  },

  onCheckout(e) {
    const index = Number(e.currentTarget.dataset.index)
    const item = this.data.items[index]
    if (!item) return
    const productData = encodeURIComponent(JSON.stringify({
      id: item.id,
      name: item.name,
      price: item.price,
      cover_image: item.cover_image,
      selectedModel: item.selectedModel,
      selectedColor: item.selectedColor,
      protectSelected: item.protectSelected,
      spec: item.spec,
      quantity: item.quantity,
      allow_coupon: item.allow_coupon
    }))
    wx.navigateTo({ url: `/pages/confirmOrder/confirmOrder?productData=${productData}` })
  },

  onGoProducts() {
    wx.switchTab({ url: '/pages/home/home' })
  }
})
