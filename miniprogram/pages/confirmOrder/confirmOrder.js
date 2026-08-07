const api = require('../../utils/api')

Page({
  data: {
    product: null,
    address: null,
    selectedCoupon: null,
    pendingSelectedCoupon: null,
    couponPopupVisible: false,
    coupons: [],
    remark: '',
    navBarHeight: 0,
    loading: true,
    isPointsOrder: false,
    // 计算后的金额
    orderAmount: '0',
    cashAmount: '0.00',
    couponDiscount: '0.00',
    finalAmount: '0'
  },

  onLoad(options) {
    this.initNavLayout()
    const isPointsOrder = options.isPointsOrder === 'true'
    this.setData({ isPointsOrder })
    let allowCoupon = 1
    
    // 解析从商品详情页传递过来的数据
    if (options.productData) {
      try {
        const product = JSON.parse(decodeURIComponent(options.productData))
        allowCoupon = product.allow_coupon

        // 自动计算前端的显示金额
        this.setData({
          product,
          loading: false
        }, () => {
          this.recalculateAmount()
        })
      } catch (e) {
        console.error('解析商品数据失败', e)
        wx.showToast({ title: '数据加载失败', icon: 'none' })
      }
    } else {
      this.setData({ loading: false })
    }
    
    // 加载收货地址
    this.loadAddress()
    
    // 加载优惠券
    if (!isPointsOrder && allowCoupon !== 0) {
      this.loadCoupons()
    }
  },

  onShow() {
    // 从地址选择页返回时，通过页面栈获取选中的地址
    const pages = getCurrentPages()
    const prevPage = pages[pages.length - 2]
    if (prevPage && prevPage.data && prevPage.data.address) {
      this.setData({ address: prevPage.data.address })
    }
  },

  initNavLayout() {
    const menuRect = wx.getMenuButtonBoundingClientRect()
    const sysInfo = wx.getSystemInfoSync()
    const ratio = 750 / sysInfo.screenWidth
    const navBarHeight = Math.ceil((menuRect.bottom + 8) * ratio)
    this.setData({ navBarHeight })
  },

  async loadAddress() {
    try {
      const addressList = await api.getAddressList()
      if (addressList && addressList.length > 0) {
        const defaultAddress = addressList.find(a => a.is_default === 1) || addressList[0]
        this.setData({ address: defaultAddress })
      }
    } catch (e) {
      console.error('加载地址失败', e)
    }
  },

  async loadCoupons() {
    try {
      const coupons = await api.getAvailableCoupons()
      const product = this.data.product
      const orderAmount = product ? Number(product.price) * (product.quantity || 1) : 0
      const availableCoupons = (coupons || []).filter((c) => {
        const min = Number(c.min_amount) || 0
        return product && orderAmount >= min
      }).map((c) => ({
        ...c,
        popupDesc: c.usage_note || c.desc || '全场可用',
        popupDate: `${this.formatDate(c.start_time)} - ${this.formatDate(c.expire_time)}`
      }))
      this.setData({ coupons: availableCoupons })
    } catch (e) {
      console.error('加载优惠券失败', e)
    }
  },

  formatDate(input) {
    if (!input) return '--'
    const str = String(input).replace('T', ' ')
    return str.slice(0, 10).replace(/-/g, '.')
  },

  // 计算并更新订单金额（仅满减券）
  recalculateAmount() {
    const { product, selectedCoupon, isPointsOrder } = this.data
    if (!product) return

    const orderAmount = Number(product.price) * (product.quantity || 1)

    if (isPointsOrder) {
      const cashAmount = Number(product.supportMixedPay ? product.cashPrice : 0) * (product.quantity || 1)
      this.setData({
        orderAmount: orderAmount.toString(),
        cashAmount: cashAmount.toFixed(2),
        couponDiscount: '0.00',
        finalAmount: orderAmount.toString()
      })
      return
    }

    let couponDiscount = 0

    if (selectedCoupon) {
      const val = Number(selectedCoupon.value)
      couponDiscount = val
    }

    const finalAmount = Math.max(0, orderAmount - couponDiscount)

    this.setData({
      orderAmount: orderAmount.toFixed(2),
      couponDiscount: couponDiscount.toFixed(2),
      finalAmount: finalAmount.toFixed(2)
    })
  },

  onBack() {
    wx.navigateBack()
  },

  onAddressTap() {
    const addressId = this.data.address ? this.data.address.id : ''
    wx.navigateTo({
      url: `/pages/addressManage/addressManage?from=confirmOrder&selectedId=${addressId}`
    })
  },

  onCouponTap() {
    const { coupons } = this.data
    if (!coupons || coupons.length === 0) {
      wx.showToast({ title: '暂无可用优惠券', icon: 'none' })
      return
    }
    this.setData({
      couponPopupVisible: true,
      pendingSelectedCoupon: this.data.selectedCoupon
    })
  },

  onRemoveCoupon() {
    this.setData({ selectedCoupon: null }, () => {
      this.recalculateAmount()
    })
  },

  onCouponMaskTap() {
    this.setData({ couponPopupVisible: false })
  },

  onCouponPanelTap() {
    // 阻止冒泡，避免点击面板内容关闭弹层
  },

  onCouponItemTap(e) {
    const index = Number(e.currentTarget.dataset.index)
    const coupons = this.data.coupons || []
    if (Number.isNaN(index) || !coupons[index]) return
    this.setData({ pendingSelectedCoupon: coupons[index] })
  },

  onCouponConfirm() {
    this.setData(
      {
        selectedCoupon: this.data.pendingSelectedCoupon || null,
        couponPopupVisible: false
      },
      () => this.recalculateAmount()
    )
  },

  onCouponClear() {
    this.setData(
      {
        pendingSelectedCoupon: null,
        selectedCoupon: null,
        couponPopupVisible: false
      },
      () => this.recalculateAmount()
    )
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value })
  },

  onDecreaseQty() {
    const { product } = this.data
    if (!product) return
    const currentQty = Math.max(1, parseInt(product.quantity || 1, 10) || 1)
    const nextQty = Math.max(1, currentQty - 1)
    if (nextQty === currentQty) return
    this.setData({
      product: {
        ...product,
        quantity: nextQty
      }
    }, () => {
      if (!this.data.isPointsOrder) {
        this.loadCoupons()
      }
      this.recalculateAmount()
    })
  },

  onIncreaseQty() {
    const { product } = this.data
    if (!product) return
    const currentQty = Math.max(1, parseInt(product.quantity || 1, 10) || 1)
    const nextQty = currentQty + 1
    this.setData({
      product: {
        ...product,
        quantity: nextQty
      }
    }, () => {
      if (!this.data.isPointsOrder) {
        this.loadCoupons()
      }
      this.recalculateAmount()
    })
  },

  async onSubmitOrder() {
    const { address, product, selectedCoupon, remark, isPointsOrder } = this.data

    if (!address) {
      wx.showToast({ title: '请选择收货地址', icon: 'none' })
      return
    }

    if (!product) {
      wx.showToast({ title: '商品信息异常', icon: 'none' })
      return
    }

    // 防止重复提交
    if (this._submitting) return
    this._submitting = true

    if (isPointsOrder) {
      wx.showLoading({ title: '兑换中...', mask: true })
      try {
        const rawResult = await api.createPointsOrder({
          pointsProductId: product.id,
          addressId: address.id,
          quantity: product.quantity || 1,
          selectedSpecName: product.selectedColor || '',
          remark
        })
        const result = rawResult && rawResult.data ? rawResult.data : rawResult

        if (result && result.needCashPayment) {
          wx.showLoading({ title: '调起支付...', mask: true })
          const payParams = await api.createPaymentOrder({
            orderId: result.orderId,
            orderType: 'points',
            description: product.name || 'Sravx 积分订单'
          })

          if (!payParams || !payParams.timeStamp || !payParams.nonceStr || !payParams.package || !payParams.paySign) {
            throw new Error('支付参数不完整，请检查下单接口返回')
          }

          wx.hideLoading()
          this._submitting = false
          await new Promise((resolve, reject) => {
            wx.requestPayment({
              timeStamp: payParams.timeStamp,
              nonceStr: payParams.nonceStr,
              package: payParams.package,
              signType: payParams.signType || 'RSA',
              paySign: payParams.paySign,
              success: resolve,
              fail: reject
            })
          })

          wx.showToast({ title: '支付成功', icon: 'success' })
          const nextId = result.orderId || result.orderNo
          setTimeout(() => {
            wx.redirectTo({
              url: `/pages/pointsOrderDetail/pointsOrderDetail?id=${encodeURIComponent(String(nextId))}`
            })
          }, 1200)
          return
        }

        wx.hideLoading()
        wx.showToast({ title: '兑换成功', icon: 'success' })
        const nextId = result && (result.orderId || result.orderNo)
        setTimeout(() => {
          if (!nextId) {
            // 如果拿不到具体订单id，跳回个人中心/订单列表
            wx.switchTab({ url: '/pages/orderList/orderList' })
            return
          }
          // 跳转到积分订单详情页（替换当前页面栈，避免用户返回再次到下单页）
          wx.redirectTo({
            url: `/pages/pointsOrderDetail/pointsOrderDetail?id=${encodeURIComponent(String(nextId))}`
          })
        }, 1500)
      } catch (e) {
        this._submitting = false
        wx.hideLoading()
        const msg = (e && (e.errMsg || e.message)) || '兑换失败'
        if (msg.includes('requestPayment:fail cancel') || msg.indexOf('-2') !== -1) {
          wx.showToast({ title: '已取消支付，订单保留待支付', icon: 'none', duration: 2500 })
          return
        }
        wx.showToast({ title: (e && e.message) || '兑换失败', icon: 'none' })
      }
      return
    }

    wx.showLoading({ title: '创建订单...', mask: true })

    try {
      // 步骤1：创建订单
      const selectedCouponId = selectedCoupon && (selectedCoupon.user_coupon_id || selectedCoupon.userCouponId || selectedCoupon.id)
      const orderResult = await api.createOrder({
        addressId: address.id,
        productId: product.id,
        quantity: product.quantity || 1,
        selectedColor: product.selectedColor || '',
        couponId: selectedCouponId != null ? selectedCouponId : null,
        remark
      })

      if (!orderResult || !orderResult.orderId) {
        throw new Error('订单创建失败')
      }

      const orderId = orderResult.orderId

      // 步骤2：获取微信支付参数
      wx.showLoading({ title: '调起支付...', mask: true })
      console.log('[ConfirmOrder] before createPaymentOrder:', { orderId })

      const payParams = await api.createPaymentOrder({
        orderId,
        description: product.name || 'Sravx 商品订单'
      })

      console.log('[ConfirmOrder] pay params:', payParams)

      // 已支付（如0元订单）
      if (payParams.paid) {
        wx.hideLoading()
        wx.showToast({ title: '下单成功', icon: 'success' })
        setTimeout(() => this.goToOrderList(), 1500)
        return
      }

      // 步骤3：调起微信支付
      if (!payParams || !payParams.timeStamp || !payParams.nonceStr || !payParams.package || !payParams.paySign) {
        throw new Error('支付参数不完整，请检查下单接口返回')
      }

      this._submitting = false
      wx.hideLoading()

      await new Promise((resolve, reject) => {
        wx.requestPayment({
          timeStamp: payParams.timeStamp,
          nonceStr: payParams.nonceStr,
          package: payParams.package,
          signType: payParams.signType || 'RSA',
          paySign: payParams.paySign,
          success: (res) => {
            console.log('[ConfirmOrder] requestPayment success')
            resolve(res)
          },
          fail: (err) => {
            console.error('[ConfirmOrder] requestPayment fail:', JSON.stringify({
              errMsg: err && err.errMsg ? err.errMsg : '',
              errCode: err && err.errCode ? err.errCode : ''
            }))
            reject(err)
          }
        })
      })

      // 支付成功
      wx.showToast({ 
        title: '支付成功', 
        icon: 'success',
        duration: 2000
      })

      setTimeout(() => this.goToOrderList(), 2000)

    } catch (err) {
      this._submitting = false
      console.error('[ConfirmOrder] error:', err)
      console.error('[ConfirmOrder] error JSON:', JSON.stringify(err || {}))
      
      const errMsg = err.errMsg || err.message || '操作失败'

      // 用户取消支付
      if (errMsg.includes('requestPayment:fail cancel') || errMsg.indexOf('-2') !== -1) {
        wx.showToast({ title: '已取消支付，订单保留', icon: 'none', duration: 2500 })
        return
      }

      // 支付失败但订单可能已创建
      if (errMsg.includes('requestPayment:fail') && !errMsg.includes('cancel')) {
        wx.showModal({
          title: '支付提示',
          content: '订单已创建，但支付未完成。可在"我的订单"中继续支付。',
          confirmText: '去订单',
          success: (res) => {
            if (res.confirm) this.goToOrderList()
          }
        })
        return
      }

      wx.showToast({ title: errMsg || '提交失败', icon: 'none' })
    }
  },

  goToOrderList() {
    wx.switchTab({
      url: '/pages/orderList/orderList'
    })
  }
});
