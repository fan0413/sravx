const api = require('../../utils/api')
const app = getApp()

Page({
  data: {
    addressList: [],
    showEditor: false,
    editIndex: -1,
    currentAddressId: null,
    selectedId: null,   // 选择模式下已勾选的地址ID
    form: {
      name: '',
      phone: '',
      province: '',
      city: '',
      district: '',
      detail: '',
      tag: '',
      is_default: 0
    },
    regionText: '',
    from: '',
    isSelectMode: false  // 是否为选择模式（来自商品详情页）
  },

  onLoad(options) {
    const from = options.from || ''
    // 选择模式：来自商品详情页、确认订单页、积分商品详情页或礼品卡兑换页
    const isSelectMode = from === 'detail' || from === 'confirmOrder' || from === 'pointsDetail' || from === 'giftCard'
    this.setData({ from, isSelectMode })
    // 选择模式下接收传入的已选地址ID
    if (isSelectMode && options.selectedId) {
      this.setData({ selectedId: Number(options.selectedId) })
    }
    this.loadAddresses()
  },

  onShow() {
    this.loadAddresses()
  },

  async loadAddresses() {
    try {
      wx.showLoading({ title: '加载中...', mask: true })
      const list = await api.getAddressList().catch(() => [])
      const addressList = Array.isArray(list) ? list : []
      this.setData({ addressList })
      wx.hideLoading()
    } catch (err) {
      wx.hideLoading()
      console.error('LoadAddresses error:', err)
      this.setData({ addressList: [] })
    }
  },

  onAddNew() {
    this.setData({
      showEditor: true,
      editIndex: -1,
      currentAddressId: null,
      form: {
        name: '',
        phone: '',
        province: '',
        city: '',
        district: '',
        detail: '',
        tag: '',
        is_default: 0
      },
      regionText: ''
    })
  },

  // 选择模式：点击地址卡片 = 立即选中并返回
  onSelect(e) {
    if (!this.data.isSelectMode) return
    const index = e.currentTarget.dataset.index
    const addr = this.data.addressList[index]
    if (!addr) return

    this.setData({ selectedId: addr.id })

    // 直接将选中地址通过页面栈传回，并返回上一页
    const pages = getCurrentPages()
    const prevPage = pages[pages.length - 2]
    if (prevPage) {
      if (this.data.from === 'giftCard') {
        if (typeof prevPage.onGiftCardAddressSelected === 'function') {
          prevPage.onGiftCardAddressSelected(addr)
        } else {
          prevPage.setData({ selectedAddress: addr })
        }
      } else {
        prevPage.setData({ address: addr })
      }
    }
    wx.navigateBack()
  },

  onEdit(e) {
    const index = e.currentTarget.dataset.index
    const addr = this.data.addressList[index]
    if (!addr) return

    this.setData({
      showEditor: true,
      editIndex: index,
      currentAddressId: addr.id,
      form: {
        name: addr.name || '',
        phone: addr.phone || '',
        province: addr.province || '',
        city: addr.city || '',
        district: addr.district || '',
        detail: addr.detail || '',
        tag: addr.tag || '',
        is_default: addr.is_default || 0
      },
      regionText: addr.province + ' ' + addr.city + ' ' + addr.district
    })
  },

  onInputName(e) {
    this.setData({ 'form.name': e.detail.value })
  },

  onInputPhone(e) {
    this.setData({ 'form.phone': e.detail.value })
  },

  onRegionChange(e) {
    const [province, city, district] = e.detail.value
    this.setData({
      'form.province': province,
      'form.city': city,
      'form.district': district,
      regionText: e.detail.value.join(' ')
    })
  },

  onInputDetail(e) {
    this.setData({ 'form.detail': e.detail.value })
  },

  async onSave() {
    const { form, editIndex, addressList, currentAddressId } = this.data

    if (!form.name || !form.phone || !form.province || !form.detail) {
      wx.showToast({ title: '请填写完整信息', icon: 'none' })
      return
    }

    try {
      wx.showLoading({ title: '保存中...', mask: true })

      let savedAddress = null

      if (editIndex >= 0) {
        // 更新地址
        await api.updateAddress({
          id: currentAddressId,
          name: form.name,
          phone: form.phone,
          province: form.province,
          city: form.city,
          district: form.district,
          detail: form.detail,
          tag: form.tag,
          is_default: form.is_default
        })
        savedAddress = {
          id: currentAddressId,
          ...form,
          contact: form.name
        }
      } else {
        // 新增地址
        const saved = await api.addAddress({
          name: form.name,
          phone: form.phone,
          province: form.province,
          city: form.city,
          district: form.district,
          detail: form.detail,
          tag: form.tag,
          is_default: form.is_default
        })
        savedAddress = {
          id: saved && saved.id,
          ...form,
          contact: form.name
        }
      }

      wx.hideLoading()
      wx.showToast({ title: '保存成功', icon: 'success' })
      if (this.data.from === 'giftCard' && savedAddress && savedAddress.id) {
        const pages = getCurrentPages()
        const prevPage = pages[pages.length - 2]
        if (prevPage) {
          if (typeof prevPage.onGiftCardAddressSelected === 'function') {
            prevPage.onGiftCardAddressSelected(savedAddress)
          } else {
            prevPage.setData({ selectedAddress: savedAddress })
          }
        }
        wx.navigateBack()
        return
      }
      this.setData({ showEditor: false })
      this.loadAddresses()
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: err.message || '保存失败', icon: 'none' })
    }
  },

  onCancelEdit() {
    this.setData({ showEditor: false })
  },

  async onDelete(e) {
    const index = e.currentTarget.dataset.index
    const addr = this.data.addressList[index]
    if (!addr || !addr.id) return

    wx.showModal({
      title: '',
      content: '确定删除该地址？',
      confirmColor: '#B8956A',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '删除中...', mask: true })
            await api.deleteAddress(addr.id)
            wx.hideLoading()
            wx.showToast({ title: '删除成功', icon: 'success' })
            this.loadAddresses()
          } catch (err) {
            wx.hideLoading()
            wx.showToast({ title: err.message || '删除失败', icon: 'none' })
          }
        }
      }
    })
  }
});
