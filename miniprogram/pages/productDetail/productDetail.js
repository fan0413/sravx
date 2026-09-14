const app = getApp()
const api = require('../../utils/api')
const share = require('../../utils/share')
const cart = require('../../utils/cart')

const COLOR_SWATCHES = ['#B7B4AE', '#2C2C2E', '#D9D6CF', '#7C8D96', '#8E7665', '#6D8373']

function hasPhoneAuthorized() {
  return typeof app.hasPhoneAuthorized === 'function'
    ? app.hasPhoneAuthorized()
    : !!(app.globalData.userInfo && app.globalData.userInfo.phone)
}

function parseColorSource(value) {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []
  const text = value.trim()
  if (!text) return []
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    return text.split(/[，,、/]/).map(item => item.trim()).filter(Boolean)
  }
}

function normalizeColor(item, index) {
  if (item && typeof item === 'object') {
    return {
      name: String(item.name || item.label || item.value || '默认颜色'),
      swatch: String(item.swatch || item.color || COLOR_SWATCHES[index % COLOR_SWATCHES.length])
    }
  }
  return {
    name: String(item || '默认颜色'),
    swatch: COLOR_SWATCHES[index % COLOR_SWATCHES.length]
  }
}

Page({
  data: {
    product: null,
    productId: '',
    swiperCurrent: 0,
    images: [],
    detailImages: [],
    modelOptions: [],
    selectedModel: '',
    colorOptions: [],
    selectedColor: '',
    displayPrice: '0.00',
    protectSelected: false,
    selectedQuantity: 1,
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
    if (productId) this.loadProduct(productId)
    else this.setData({ loading: false })
  },

  initNavLayout() {
    const menuRect = wx.getMenuButtonBoundingClientRect()
    const sysInfo = wx.getSystemInfoSync()
    const ratio = 750 / sysInfo.screenWidth
    this.setData({ navBarHeight: Math.ceil((menuRect.bottom + 8) * ratio) })
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

      const images = Array.isArray(productData.images) && productData.images.length
        ? productData.images
        : [productData.cover_image || '/images/logo.png']
      const modelOptions = this.extractModelOptions(productData, productData.specs || [])
      const colorOptions = this.extractColorOptions(productData)
      const selectedModel = modelOptions[0] ? modelOptions[0].name : ''
      const selectedColor = colorOptions[0] ? colorOptions[0].name : ''

      this.setData({
        product: productData,
        images,
        detailImages: this.parseDetailImages(productData.detail_images),
        modelOptions,
        selectedModel,
        colorOptions,
        selectedColor,
        displayPrice: modelOptions[0] ? modelOptions[0].priceText : (Number(productData.price) || 0).toFixed(2),
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
    } catch (error) {
      wx.hideLoading()
      console.error('LoadProduct error:', error)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  parseDetailImages(raw) {
    if (!raw) return []
    if (Array.isArray(raw)) return raw.map(item => String(item || '').trim()).filter(Boolean)
    if (typeof raw !== 'string') return []
    const text = raw.trim()
    if (!text) return []
    try {
      const parsed = JSON.parse(text)
      return Array.isArray(parsed) ? parsed.map(item => String(item || '').trim()).filter(Boolean) : [text]
    } catch (error) {
      return [text]
    }
  },

  extractModelOptions(product, specs) {
    const fallbackImage = product.cover_image || (Array.isArray(product.images) && product.images[0]) || '/images/logo.png'
    const basePrice = Number(product.price) || 0
    if (!Array.isArray(specs) || !specs.length) {
      return [{ name: product.model || '标准型号', image: fallbackImage, price: basePrice, priceText: basePrice.toFixed(2), sku: '' }]
    }
    return specs.map(spec => {
      const price = Number(spec.price) > 0 ? Number(spec.price) : basePrice
      return {
        name: String(spec.name || product.model || '标准型号'),
        image: spec.image || fallbackImage,
        price,
        priceText: price.toFixed(2),
        sku: String(spec.sku || '')
      }
    })
  },

  extractColorOptions(product) {
    let params = product.params || {}
    if (typeof params === 'string') {
      try { params = JSON.parse(params) } catch (error) { params = {} }
    }
    const raw = product.colors || product.color_options || product.colorOptions || params['颜色'] || params.color || params.colors || []
    const choices = parseColorSource(raw).map(normalizeColor)
    return choices.length ? choices : [{ name: product.color || '默认颜色', swatch: '#AAA39A' }]
  },

  selectedModelOption() {
    const { modelOptions, selectedModel } = this.data
    return modelOptions.find(item => item.name === selectedModel) || modelOptions[0] || null
  },

  selectedPrice() {
    const model = this.selectedModelOption()
    return model ? model.price : Number(this.data.product && this.data.product.price) || 0
  },

  getSelectedSpecText() {
    const { selectedModel, selectedColor, protectSelected } = this.data
    const entries = []
    if (selectedModel) entries.push(`型号：${selectedModel}`)
    if (selectedColor) entries.push(`颜色：${selectedColor}`)
    if (protectSelected) entries.push('SRAVX Protect：已选')
    return entries.join('；')
  },

  onSwiperChange(e) {
    this.setData({ swiperCurrent: e.detail.current })
  },

  onBack() {
    wx.navigateBack()
  },

  onModelTap(e) {
    const index = Number(e.currentTarget.dataset.index)
    const option = this.data.modelOptions[index]
    if (!option) return
    this.setData({ selectedModel: option.name, displayPrice: option.priceText })
  },

  onColorOptionTap(e) {
    const index = Number(e.currentTarget.dataset.index)
    const option = this.data.colorOptions[index]
    if (!option) return
    this.setData({ selectedColor: option.name })
  },

  onProtectTap(e) {
    this.setData({ protectSelected: e.currentTarget.dataset.value === 'true' })
  },

  onAddToBag() {
    const { product, selectedModel, selectedColor, protectSelected, selectedQuantity } = this.data
    if (!product || !selectedModel || !selectedColor) {
      wx.showToast({ title: '请完成型号与颜色选择', icon: 'none' })
      return
    }
    const model = this.selectedModelOption()
    cart.addItem({
      id: product.id,
      name: product.name,
      price: this.selectedPrice(),
      cover_image: (model && model.image) || product.cover_image || this.data.images[0],
      selectedModel,
      selectedColor,
      protectSelected,
      spec: this.getSelectedSpecText(),
      quantity: selectedQuantity,
      allow_coupon: product.allow_coupon
    })
    wx.showToast({ title: '已加入购物袋', icon: 'success', duration: 700 })
    setTimeout(() => wx.switchTab({ url: '/pages/cart/cart' }), 700)
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
})
