const api = require('../../utils/api')

const SERVICE_LABELS = {
  repair: '申请维修',
  replacement: '申请置换'
}

const STATUS_LABELS = {
  submitted: '待受理',
  awaiting_shipment: '待寄回',
  shipped: '已寄回，待收件',
  received: '已收件',
  inspecting: '检测中',
  accepted: '已受理',
  repairing: '维修中',
  replacement_pending: '待置换',
  awaiting_user: '待您确认',
  returning: '待寄回用户',
  completed: '已完成',
  rejected: '未受理',
  cancelled: '已取消'
}

function formatTime(value) {
  if (!value) return ''
  return String(value).replace('T', ' ').slice(0, 16)
}

function normalizeRecord(record) {
  return {
    ...record,
    serviceTypeText: SERVICE_LABELS[record.service_type] || '售后申请',
    statusText: STATUS_LABELS[record.status] || record.status || '处理中',
    createdAtText: formatTime(record.created_at),
    canShip: record.status === 'awaiting_shipment',
    serviceAddress: record.service_address_text || '',
    messages: (record.messages || []).map(message => ({
      ...message,
      isSeller: message.sender_role === 'seller',
      senderText: message.sender_role === 'seller' ? '售后专员' : '您',
      createdAtText: formatTime(message.created_at)
    }))
  }
}

Page({
  data: {
    bindingId: 0,
    scissors: null,
    records: [],
    addresses: [],
    selectedAddressId: 0,
    selectedAddress: null,
    pendingShipment: null,
    serviceType: 'repair',
    description: '',
    shipment: { carrier: '', trackingNo: '', freightAmount: '' },
    loading: true,
    submitting: false
  },

  onLoad(options) {
    const bindingId = Number(options.bindingId)
    if (!bindingId) {
      wx.showToast({ title: '剪刀信息无效', icon: 'none' })
      return
    }
    this.setData({ bindingId })
    this.loadData()
  },

  onShow() {
    if (this.data.bindingId) this.loadData()
  },

  async loadData() {
    if (!this.data.bindingId) return
    this.setData({ loading: true })
    try {
      const [data, addresses] = await Promise.all([
        api.getScissorsAfterSale(this.data.bindingId),
        api.getAddressList()
      ])
      const addressList = addresses || []
      const selectedAddress = addressList.find(item => Number(item.id) === Number(this.data.selectedAddressId)) ||
        addressList.find(item => Number(item.is_default) === 1) || addressList[0] || null
      const records = (data.records || []).map(normalizeRecord)
      this.setData({
        scissors: data.scissors || null,
        records,
        addresses: addressList,
        selectedAddressId: selectedAddress ? Number(selectedAddress.id) : 0,
        selectedAddress,
        pendingShipment: records.find(item => item.canShip) || null,
        loading: false
      })
    } catch (error) {
      this.setData({ loading: false })
      wx.showToast({ title: error.message || '加载售后信息失败', icon: 'none' })
    }
  },

  onSelectService(e) {
    const serviceType = e.currentTarget.dataset.type
    if (SERVICE_LABELS[serviceType]) this.setData({ serviceType })
  },

  onDescriptionInput(e) {
    this.setData({ description: e.detail.value || '' })
  },

  onSelectAddress(e) {
    const id = Number(e.currentTarget.dataset.id)
    const selectedAddress = this.data.addresses.find(item => Number(item.id) === id)
    if (selectedAddress) this.setData({ selectedAddressId: id, selectedAddress })
  },

  onManageAddress() {
    wx.navigateTo({ url: '/pages/addressManage/addressManage' })
  },

  onShipmentInput(e) {
    const field = e.currentTarget.dataset.field
    if (!field) return
    this.setData({ [`shipment.${field}`]: e.detail.value || '' })
  },

  async onSubmit() {
    const description = this.data.description.trim()
    if (description.length < 5) {
      wx.showToast({ title: '请至少说明 5 个字的问题', icon: 'none' })
      return
    }
    if (!this.data.selectedAddressId) {
      wx.showToast({ title: '请先选择维修完成后的收货地址', icon: 'none' })
      return
    }
    if (this.data.submitting) return

    this.setData({ submitting: true })
    try {
      await api.applyScissorsAfterSale({
        bindingId: this.data.bindingId,
        serviceType: this.data.serviceType,
        description,
        recipientAddressId: this.data.selectedAddressId
      })
      this.setData({ description: '' })
      wx.showToast({ title: '申请已提交', icon: 'success' })
      this.loadData()
    } catch (error) {
      wx.showToast({ title: error.message || '提交失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  async onSubmitShipment() {
    const { pendingShipment, shipment } = this.data
    if (!pendingShipment) return
    if (!shipment.carrier.trim() || !shipment.trackingNo.trim() || shipment.freightAmount === '') {
      wx.showToast({ title: '请填写快递公司、单号和实际运费', icon: 'none' })
      return
    }
    try {
      wx.showLoading({ title: '提交中...', mask: true })
      await api.submitScissorsAfterSaleShipping({
        requestId: pendingShipment.id,
        carrier: shipment.carrier.trim(),
        trackingNo: shipment.trackingNo.trim(),
        freightAmount: Number(shipment.freightAmount)
      })
      wx.hideLoading()
      wx.showToast({ title: '物流信息已提交', icon: 'success' })
      this.setData({ shipment: { carrier: '', trackingNo: '', freightAmount: '' } })
      this.loadData()
    } catch (error) {
      wx.hideLoading()
      wx.showToast({ title: error.message || '提交失败', icon: 'none' })
    }
  }
})
