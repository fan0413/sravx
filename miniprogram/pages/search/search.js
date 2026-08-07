const api = require('../../utils/api')

Page({
  data: {
    keyword: '',
    products: [],
    loading: false,
    loaded: false,
    focus: true
  },

  onLoad() {
    this.setData({ focus: true })
  },

  onInput(e) {
    const keyword = e.detail.value.trim()
    this.setData({ keyword })
    if (!keyword) {
      this.setData({ products: [], loaded: false })
      return
    }
    if (this._timer) clearTimeout(this._timer)
    this._timer = setTimeout(() => this.doSearch(), 300)
  },

  onClear() {
    this.setData({ keyword: '', products: [], loaded: false, focus: true })
  },

  async doSearch() {
    const keyword = this.data.keyword.trim()
    if (!keyword) return

    this.setData({ loading: true })
    try {
      const products = await api.getProductList({ keyword, pageSize: 50 })
      const list = Array.isArray(products) ? products : []
      this.setData({ products: list, loaded: true, loading: false })
    } catch (err) {
      console.error('[search] doSearch error:', err)
      this.setData({ products: [], loaded: true, loading: false })
    }
  },

  onProductTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/productDetail/productDetail?id=${id}` })
  },

  onUnload() {
    if (this._timer) clearTimeout(this._timer)
  }
});
