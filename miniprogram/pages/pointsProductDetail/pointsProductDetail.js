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
    selectedSpec: null,
    colorOptions: [],
    selectedColor: '',
    pendingSelectedColor: '',
    pendingQuantity: 1,
    colorPopupVisible: false,
    navBarHeight: 0,
    loading: true,
    canRedeem: true,
    minMemberLevel: 1,
    minMemberLevelName: 'LV1',
    currentMemberLevel: 1,
    detailImages: [],
    mainParams: {
      coreMaterial: '--',
      handleMaterial: '--',
      size: '--',
      weight: '--',
      warrantyPeriod: '--'
    },
    defaultAddress: null,
    selectedAddress: null,
    address: null
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
      const productData = await api.getPointsProductDetail(Number(productId))
      if (!productData) {
        wx.showToast({ title: '积分商品不存在', icon: 'none' })
        this.setData({ loading: false })
        return
      }

      let images = []
      if (productData.images && Array.isArray(productData.images)) {
        images = productData.images
      } else if (productData.cover_image) {
        images = [productData.cover_image]
      }
      if (images.length === 0) {
        images = ['/images/logo.png']
      }

      const specs = productData.specs || []
      let selectedSpec = null
      if (specs.length > 0) {
        const firstSpec = specs[0]
        if (typeof firstSpec === 'string') {
          selectedSpec = firstSpec
        } else if (firstSpec && typeof firstSpec === 'object') {
          const firstOption = Array.isArray(firstSpec.options) && firstSpec.options.length > 0 ? firstSpec.options[0] : ''
          selectedSpec = firstOption ? `${firstSpec.name || '规格'}：${firstOption}` : (firstSpec.name || '默认规格')
        }
      }

      const colorOptions = this.extractColorOptions(productData, specs)
      const selectedColor = colorOptions[0] ? colorOptions[0].name : ''
      const detailImages = this.parseDetailImages(productData.detail_images)
      this.setData({
        product: productData,
        specs,
        images,
        selectedSpec,
        colorOptions,
        selectedColor,
        detailImages,
        canRedeem: productData.can_redeem !== false,
        minMemberLevel: Number(productData.min_member_level || 1) || 1,
        minMemberLevelName: productData.min_member_level_name || 'LV1',
        currentMemberLevel: Number(productData.current_member_level || 1) || 1,
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
      console.error('[pointsProductDetail] loadProduct error:', err)
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
    const basePoints = Number(productData && productData.points_price) || 0
    const baseCash = Number(productData && productData.cash_price) || 0
    const fallbackImage = productData && (productData.cover_image || (Array.isArray(productData.images) ? productData.images[0] : ''))
    const mainProductName = String(
      (productData && (productData.short_name || productData.name)) || '默认规格'
    ).trim() || '默认规格'

    const result = [{
      name: mainProductName,
      image: fallbackImage || '/images/logo.png',
      pointsText: `${Math.max(0, basePoints)}`,
      cashText: `${Math.max(0, baseCash)}`,
      isMain: true
    }]

      ; (specs || []).forEach((spec) => {
        if (!spec || typeof spec !== 'object') return
        const specName = String(spec.name || '').trim()
        if (!specName || specName === mainProductName) return
        if (result.some(item => item.name === specName)) return
        const specPoints = spec.points_price != null && !Number.isNaN(Number(spec.points_price))
          ? Number(spec.points_price)
          : basePoints
        const specCash = spec.cash_price != null && !Number.isNaN(Number(spec.cash_price))
          ? Number(spec.cash_price)
          : baseCash
        result.push({
          name: specName,
          image: this.resolveSpecImage(spec, fallbackImage || '/images/logo.png'),
          pointsText: `${Math.max(0, specPoints)}`,
          cashText: `${Math.max(0, specCash)}`,
          isMain: false
        })
      })
    return result
  },

  resolveSpecImage(spec, fallbackImage) {
    const fallback = fallbackImage || '/images/logo.png'
    if (!spec) return fallback
    const raw = spec.option_images
    if (!raw) return fallback
    if (typeof raw === 'object' && !Array.isArray(raw)) {
      const byName = raw[spec.name]
      if (typeof byName === 'string' && byName.trim()) return byName.trim()
      const values = Object.values(raw).filter(v => typeof v === 'string' && v.trim())
      return values.length > 0 ? values[0].trim() : fallback
    }
    if (typeof raw === 'string') {
      const text = raw.trim()
      if (!text) return fallback
      try {
        const parsed = JSON.parse(text)
        if (Array.isArray(parsed)) {
          const first = parsed.find(v => typeof v === 'string' && v.trim())
          return first ? first.trim() : fallback
        }
        if (parsed && typeof parsed === 'object') {
          const values = Object.values(parsed).filter(v => typeof v === 'string' && v.trim())
          return values.length > 0 ? values[0].trim() : fallback
        }
      } catch (e) { }
      return text
    }
    return fallback
  },

  onSwiperChange(e) {
    this.setData({ swiperCurrent: e.detail.current })
  },

  onPreviewGalleryImage(e) {
    const index = Number(e.currentTarget.dataset.index)
    const images = Array.isArray(this.data.images) ? this.data.images.filter(Boolean) : []
    if (!images.length) return
    const current = !Number.isNaN(index) && images[index] ? images[index] : images[0]
    wx.previewImage({ current, urls: images })
  },

  onBack() {
    wx.navigateBack()
  },

  onSpecTap() {
    if (!this.data.canRedeem) {
      wx.showToast({ title: `需${this.data.minMemberLevelName}可兑换`, icon: 'none' })
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

  onColorPanelTap() { },

  onColorOptionTap(e) {
    const index = Number(e.currentTarget.dataset.index)
    const { colorOptions } = this.data
    if (Number.isNaN(index) || !colorOptions[index]) return
    this.setData({ pendingSelectedColor: colorOptions[index].name })
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

  async onRedeemFromPopup() {
    if (!this.data.canRedeem) {
      wx.showToast({ title: `需${this.data.minMemberLevelName}可兑换`, icon: 'none' })
      return
    }
    if (!this.ensurePhoneAuthorized()) return
    const finalSelectedColor = this.data.pendingSelectedColor || this.data.selectedColor
    const finalQuantity = Math.max(1, Number(this.data.pendingQuantity) || 1)
    this.setData({
      selectedColor: finalSelectedColor,
      colorPopupVisible: false,
      pendingSelectedColor: '',
      pendingQuantity: 1
    })
    this.goToConfirmOrder(finalSelectedColor, finalQuantity)
  },

  goToConfirmOrder(selectedColor, quantity) {
    if (!this.ensurePhoneAuthorized()) return
    const { product, colorOptions } = this.data

    if (!product) {
      wx.showToast({ title: '商品信息异常', icon: 'none' })
      return
    }

    let passPoints = product.points_price
    let passCash = Number(product.cash_price) || 0
    if (selectedColor && colorOptions && colorOptions.length > 0) {
      const opt = colorOptions.find(o => o.name === selectedColor)
      if (opt && opt.pointsText) {
        passPoints = opt.pointsText
      }
      if (opt && opt.cashText != null) {
        passCash = Number(opt.cashText) || 0
      }
    }

    const productData = encodeURIComponent(JSON.stringify({
      id: product.id,
      name: product.name,
      desc: product.desc,
      price: passPoints,
      cashPrice: passCash,
      supportMixedPay: Number(product.support_mixed_pay) === 1,
      cover_image: product.cover_image || (product.images && product.images[0]),
      selectedColor: selectedColor || '',
      spec: this.data.selectedSpec || '默认规格',
      quantity: quantity || 1
    }))

    wx.navigateTo({
      url: `/pages/confirmOrder/confirmOrder?productData=${productData}&isPointsOrder=true`
    })
  },

  onGoHome() {
    wx.switchTab({ url: '/pages/home/home' })
  },

  onRedeemNow() {
    if (!this.data.canRedeem) {
      wx.showToast({ title: `需${this.data.minMemberLevelName}可兑换`, icon: 'none' })
      return
    }
    if (!this.ensurePhoneAuthorized()) return
    this.setData({
      colorPopupVisible: true,
      pendingSelectedColor: this.data.selectedColor || '',
      pendingQuantity: 1
    })
  },

  onShareAppMessage() {
    const product = this.data.product || {}
    const productId = product.id || this.data.productId
    return share.createShareAppMessage({
      title: product.name || 'Sravx 积分商品',
      path: productId ? `/pages/pointsProductDetail/pointsProductDetail?id=${productId}` : '/pages/pointsMall/pointsMall',
      imageUrl: product.cover_image || (Array.isArray(product.images) && product.images[0])
    })
  },

  onShareTimeline() {
    const product = this.data.product || {}
    const productId = product.id || this.data.productId
    return share.createShareTimeline({
      title: product.name || 'Sravx 积分商品',
      query: productId ? `id=${productId}` : '',
      imageUrl: product.cover_image || (Array.isArray(product.images) && product.images[0])
    })
  }
});
