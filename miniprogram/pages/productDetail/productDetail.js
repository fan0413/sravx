const app = getApp()
const api = require('../../utils/api')
const share = require('../../utils/share')

function hasPhoneAuthorized() {
  return typeof app.hasPhoneAuthorized === 'function'
    ? app.hasPhoneAuthorized()
    : !!(app.globalData.userInfo && app.globalData.userInfo.phone)
}

Page({
  data: {
    product: null,
    productId: '',
    specs: [],
    swiperCurrent: 0,
    images: [],
    detailImages: [],
    selectedSpec: null,
    colorOptions: [],
    selectedColor: '',
    pendingSelectedColor: '',
    selectedQuantity: 1,
    pendingQuantity: 1,
    colorPopupVisible: false,
    address: null,
    addressList: [],
    navBarHeight: 0,
    loading: true,
    mainParams: {
      coreMaterial: '--',
      handleMaterial: '--',
      size: '--',
      weight: '--',
      warrantyPeriod: '--'
    }
  },

  onLoad(options) {
    share.showShareMenu()
    this.initNavLayout()
    const productId = options.id
    this.setData({ productId: productId || '' })
    if (productId) {
      this.loadProduct(productId)
    } else {
      this.setData({ loading: false })
    }
  },

  onShow() {
    // 从地址选择页返回时，address 已被 addressManage 页面通过页面栈设置
    // 无需额外处理，setData 已在对方页面完成
  },

  initNavLayout() {
    const menuRect = wx.getMenuButtonBoundingClientRect()
    const sysInfo = wx.getSystemInfoSync()
    const ratio = 750 / sysInfo.screenWidth
    const navBarHeight = Math.ceil((menuRect.bottom + 8) * ratio)
    this.setData({ navBarHeight })
  },

  ensurePhoneAuthorized() {
    if (hasPhoneAuthorized()) return true
    wx.navigateTo({ url: '/pages/register/register' })
    return false
  },

  async loadProduct(productId) {
    try {
      wx.showLoading({ title: '加载中...', mask: true })
      this.setData({ loading: true })

      const productData = await api.getProductDetail(Number(productId))

      if (!productData) {
        wx.showToast({ title: '商品不存在', icon: 'none' })
        this.setData({ loading: false })
        return
      }

      // 处理图片（可能是字符串或数组）
      let images = []
      if (productData.images && Array.isArray(productData.images)) {
        images = productData.images
      } else if (productData.cover_image) {
        images = [productData.cover_image]
      }

      // 如果没有图片，使用默认
      if (images.length === 0) {
        images = ['/images/logo.png']
      }

      // 处理规格
      const detailImages = this.parseDetailImages(productData.detail_images)
      const specs = productData.specs || []
      let selectedSpec = specs.length > 0 ? specs[0].name : null
      const colorOptions = this.extractColorOptions(productData, specs)
      const selectedColor = colorOptions[0] ? colorOptions[0].name : ''

      // 获取默认收货地址
      let defaultAddress = null
      if (hasPhoneAuthorized()) {
        try {
          const addressList = await api.getAddressList()
          if (addressList && addressList.length > 0) {
            defaultAddress = addressList.find(a => a.is_default === 1) || addressList[0]
          }
        } catch (e) {
          console.error('Load address failed:', e)
        }
      }

      this.setData({
        product: productData,
        specs,
        images,
        detailImages,
        selectedSpec,
        colorOptions,
        selectedColor,
        addressList: [],
        address: defaultAddress,
        mainParams: {
          coreMaterial: productData.core_material || '--',
          handleMaterial: productData.handle_material || '--',
          size: productData.size || '--',
          weight: productData.weight ? `${productData.weight}` : '--',
          warrantyPeriod: productData.warranty_period || '--'
        },
        loading: false
      })

      wx.hideLoading()
    } catch (err) {
      wx.hideLoading()
      console.error('LoadProduct error:', err)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  parseDetailImages(rawDetailImages) {
    if (!rawDetailImages) return []
    if (Array.isArray(rawDetailImages)) {
      return rawDetailImages.map(item => String(item || '').trim()).filter(Boolean)
    }
    if (typeof rawDetailImages === 'string') {
      const trimmed = rawDetailImages.trim()
      if (!trimmed) return []
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) {
          return parsed.map(item => String(item || '').trim()).filter(Boolean)
        }
      } catch (e) { }
      return [trimmed]
    }
    return []
  },

  extractColorOptions(productData, specs) {
    const basePrice = Number(productData && productData.price) || 0
    const fallbackImage = productData && (productData.cover_image || (Array.isArray(productData.images) ? productData.images[0] : ''))

    if (!specs || specs.length === 0) {
      return [{
        name: '默认规格',
        image: fallbackImage || '/images/logo.png',
        priceText: basePrice.toFixed(2)
      }]
    }

    return specs.map(spec => ({
      name: spec.name,
      image: spec.image || fallbackImage || '/images/logo.png',
      priceText: (spec.price > 0 ? spec.price : basePrice).toFixed(2)
    }))
  },

  getSelectedSpecText() {
    const { selectedColor, selectedSpec } = this.data
    if (selectedColor) return `商品规格：${selectedColor}`
    if (selectedSpec) return String(selectedSpec)
    return '默认规格'
  },

  onSwiperChange(e) {
    this.setData({ swiperCurrent: e.detail.current })
  },

  onBack() {
    wx.navigateBack()
  },

  onAddressTap() {
    if (!this.ensurePhoneAuthorized()) return
    const addressId = this.data.address ? this.data.address.id : ''
    wx.navigateTo({
      url: `/pages/addressManage/addressManage?from=detail&selectedId=${addressId}`
    })
  },

  onSpecTap() {
    const { colorOptions } = this.data
    if (!colorOptions || colorOptions.length === 0) {
      wx.showToast({ title: '暂无可选商品规格', icon: 'none' })
      return
    }
    this.setData({
      colorPopupVisible: true,
      pendingSelectedColor: this.data.selectedColor || '',
      pendingQuantity: 1
    })
  },

  onColorMaskTap() {
    this.setData({
      colorPopupVisible: false,
      pendingSelectedColor: '',
      pendingQuantity: 1
    })
  },

  onColorPanelTap() {
    // 阻止冒泡，避免点击面板内容关闭弹层
  },

  onColorOptionTap(e) {
    const index = Number(e.currentTarget.dataset.index)
    const { colorOptions } = this.data
    if (Number.isNaN(index) || !colorOptions[index]) return
    this.setData({
      pendingSelectedColor: colorOptions[index].name
    })
  },

  onDecreasePendingQty() {
    const current = Math.max(1, Number(this.data.pendingQuantity) || 1)
    if (current <= 1) return
    this.setData({ pendingQuantity: current - 1 })
  },

  onIncreasePendingQty() {
    const current = Math.max(1, Number(this.data.pendingQuantity) || 1)
    this.setData({ pendingQuantity: current + 1 })
  },

  onBuyFromPopup() {
    if (!this.ensurePhoneAuthorized()) return
    const { pendingSelectedColor, selectedColor, pendingQuantity } = this.data
    const finalColor = pendingSelectedColor || selectedColor
    const finalQuantity = Math.max(1, Number(pendingQuantity) || 1)
    this.setData({
      selectedColor: finalColor,
      selectedQuantity: finalQuantity,
      colorPopupVisible: false,
      pendingSelectedColor: '',
      pendingQuantity: 1
    }, () => {
      this.goToConfirmOrder()
    })
  },

  onColorConfirm() {
    const { pendingSelectedColor, selectedColor, pendingQuantity } = this.data
    this.setData({
      selectedColor: pendingSelectedColor || selectedColor,
      selectedQuantity: Math.max(1, Number(pendingQuantity) || 1),
      colorPopupVisible: false,
      pendingSelectedColor: '',
      pendingQuantity: 1
    })
  },

  goToConfirmOrder() {
    if (!this.ensurePhoneAuthorized()) return
    const { product, selectedColor, colorOptions } = this.data

    if (!product) {
      wx.showToast({ title: '商品信息异常', icon: 'none' })
      return
    }

    // 匹配选中的颜色选项获取它的价格
    let passPrice = product.price
    if (selectedColor && colorOptions && colorOptions.length > 0) {
      const opt = colorOptions.find(o => o.name === selectedColor)
      if (opt && opt.priceText) {
        passPrice = opt.priceText
      }
    }

    // 跳转确认订单页，传递商品数据
    const productData = encodeURIComponent(JSON.stringify({
      id: product.id,
      name: product.name,
      desc: product.desc,
      price: passPrice,
      cover_image: product.cover_image || (product.images && product.images[0]),
      selectedColor: selectedColor || '',
      spec: this.getSelectedSpecText(),
      quantity: this.data.selectedQuantity || 1,
      allow_coupon: product.allow_coupon
    }))

    wx.navigateTo({
      url: `/pages/confirmOrder/confirmOrder?productData=${productData}`
    })
  },

  onBuyNow() {
    if (!this.ensurePhoneAuthorized()) return
    const { colorOptions } = this.data
    if (!colorOptions || colorOptions.length === 0) {
      wx.showToast({ title: '暂无可选商品规格', icon: 'none' })
      return
    }
    this.setData({
      colorPopupVisible: true,
      pendingSelectedColor: this.data.selectedColor || '',
      pendingQuantity: 1
    })
  },

  onGoHome() {
    wx.switchTab({ url: '/pages/home/home' })
  },

  onShareAppMessage() {
    const product = this.data.product || {}
    const productId = product.id || this.data.productId
    return share.createShareAppMessage({
      title: product.name || 'Sravx 商品',
      path: productId ? `/pages/productDetail/productDetail?id=${productId}` : '/pages/shop/shop',
      imageUrl: product.cover_image || (Array.isArray(product.images) && product.images[0])
    })
  },

  onShareTimeline() {
    const product = this.data.product || {}
    const productId = product.id || this.data.productId
    return share.createShareTimeline({
      title: product.name || 'Sravx 商品',
      query: productId ? `id=${productId}` : '',
      imageUrl: product.cover_image || (Array.isArray(product.images) && product.images[0])
    })
  }
});
