<template>
  <view class="page">
    <view v-if="!showEditor" class="address-list">
      <view v-for="(address, index) in addresses" :key="address.id || index" class="address-card" :class="{ selectable: selectMode, selected: Number(selectedId) === Number(address.id) }" @tap="selectAddress(address)">
        <view v-if="selectMode" class="check"><view class="circle" :class="{ checked: Number(selectedId) === Number(address.id) }">✓</view></view>
        <view class="address-content"><text class="detail">{{ addressText(address) }}</text><view class="meta"><text>{{ address.name || address.contact }}</text><text>{{ address.phone }}</text><text v-if="address.tag" class="tag">{{ address.tag }}</text></view></view>
        <button v-if="!selectMode" class="edit" @tap.stop="editAddress(index)">编辑</button>
      </view>
      <view v-if="!loading && !addresses.length" class="empty">暂无收货地址</view>
      <view class="bottom"><button class="primary" @tap="newAddress">{{ from === 'detail' ? '新增地址' : '新增收货地址' }}</button></view>
    </view>

    <view v-else class="editor">
      <view class="field"><text>收货人</text><input v-model="form.name" placeholder="请输入姓名" /></view>
      <view class="field"><text>手机号</text><input v-model="form.phone" type="number" maxlength="11" placeholder="请输入手机号" /></view>
      <view class="field"><text>所在地区</text><picker mode="region" :value="region" @change="changeRegion"><view :class="regionText ? 'value' : 'placeholder'">{{ regionText || '请选择省/市/区' }}</view></picker></view>
      <view class="field detail-field"><text>详细地址</text><textarea v-model="form.detail" maxlength="100" auto-height placeholder="街道、楼栋、门牌号等" /></view>
      <view class="editor-actions"><button class="primary" @tap="saveAddress">保存地址</button><button class="cancel" @tap="showEditor = false">取消</button></view>
    </view>
  </view>
</template>

<script>
import api from '../../common/api.js'

const emptyForm = () => ({ name: '', phone: '', province: '', city: '', district: '', detail: '', tag: '', is_default: 0 })
export default {
  data() { return { addresses: [], loading: true, showEditor: false, form: emptyForm(), editingId: null, from: '', selectMode: false, selectedId: null } },
  computed: {
    region() { return [this.form.province, this.form.city, this.form.district] },
    regionText() { return this.region.filter(Boolean).join(' ') }
  },
  onLoad(options) { this.from = options.from || ''; this.selectMode = ['detail', 'confirmOrder', 'pointsDetail', 'giftCard'].includes(this.from); this.selectedId = options.selectedId || null; this.loadAddresses() },
  onShow() { if (this.loaded) this.loadAddresses() },
  methods: {
    addressText(address) { return `${address.province || ''}${address.city || ''}${address.district || ''}${address.detail || address.address || ''}` || '地址信息不完整' },
    async loadAddresses() { this.loading = true; try { const result = await api.getAddressList(); this.addresses = api.asList(result) } catch (error) { this.addresses = []; uni.showToast({ title: error.message || '地址加载失败', icon: 'none' }) } finally { this.loading = false; this.loaded = true } },
    newAddress() { this.editingId = null; this.form = emptyForm(); this.showEditor = true },
    editAddress(index) { const address = this.addresses[index]; if (!address) return; this.editingId = address.id; this.form = { ...emptyForm(), ...address, name: address.name || address.contact || '' }; this.showEditor = true },
    changeRegion(event) { const [province, city, district] = event.detail.value; this.form.province = province; this.form.city = city; this.form.district = district },
    selectAddress(address) {
      if (!this.selectMode) return this.editAddress(this.addresses.indexOf(address))
      this.selectedId = address.id
      const keys = { confirmOrder: 'sravx_selected_address', detail: 'sravx_selected_address', pointsDetail: 'sravx_selected_address', giftCard: 'sravx_gift_card_address' }
      uni.setStorageSync(keys[this.from] || 'sravx_selected_address', address)
      uni.navigateBack()
    },
    async saveAddress() {
      const item = this.form
      if (!item.name || !item.phone || !item.province || !item.detail) return uni.showToast({ title: '请填写完整信息', icon: 'none' })
      uni.showLoading({ title: '保存中...', mask: true })
      try {
        const payload = { ...item, id: this.editingId || undefined }
        const saved = this.editingId ? await api.updateAddress(payload) : await api.addAddress(payload)
        const selected = { ...item, id: this.editingId || (saved && saved.id), contact: item.name }
        uni.hideLoading(); uni.showToast({ title: '保存成功', icon: 'success' })
        if (this.from === 'giftCard' && selected.id) { uni.setStorageSync('sravx_gift_card_address', selected); uni.navigateBack(); return }
        this.showEditor = false; await this.loadAddresses()
      } catch (error) { uni.hideLoading(); uni.showToast({ title: error.message || '保存失败', icon: 'none' }) }
    },
    removeAddress(address) { uni.showModal({ content: '确定删除该地址？', confirmColor: '#0B0D10', success: async ({ confirm }) => { if (!confirm) return; try { await api.deleteAddress(address.id); uni.showToast({ title: '删除成功', icon: 'success' }); this.loadAddresses() } catch (error) { uni.showToast({ title: error.message || '删除失败', icon: 'none' }) } } }) }
  }
}
</script>

<style>
.page{min-height:100vh;background:#F4F6F8}.address-list{padding-bottom:92px}.address-card{display:flex;align-items:center;margin-bottom:1px;padding:17px 16px;background:#fff}.address-card.selected{background:linear-gradient(90deg,rgba(184,149,106,.08),#fff)}.check{width:29px;flex-shrink:0}.circle{width:19px;height:19px;box-sizing:border-box;border:1px solid #c7c7cc;border-radius:50%;color:transparent;text-align:center;font-size:13px;line-height:18px}.circle.checked{border-color:#0B0D10;background:#0B0D10;color:#fff}.address-content{flex:1;min-width:0}.detail{display:block;font-size:15px;font-weight:600;line-height:22px}.meta{display:flex;align-items:center;gap:10px;margin-top:6px;color:#636366;font-size:13px}.tag{padding:1px 5px;border:1px solid #0B0D10;border-radius:3px;color:#0B0D10;font-size:10px}.edit{margin:0 0 0 12px;padding:4px 6px;background:transparent;color:#86868b;font-size:12px;line-height:25px}.edit::after,.primary::after,.cancel::after{border:0}.empty{padding:65px 0;color:#86868b;text-align:center;font-size:14px}.bottom{position:fixed;left:0;right:0;bottom:0;padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:#fff;border-top:1px solid #eee}.primary{border-radius:23px;background:#0B0D10;color:#fff;font-size:15px;line-height:45px}.editor{min-height:100vh;padding:0 16px;background:#fff}.field{display:flex;align-items:center;min-height:58px;border-bottom:1px solid #eee}.field>text{width:80px;flex-shrink:0;font-size:15px;font-weight:500}.field input,.field picker,.field textarea{flex:1;min-width:0;font-size:15px}.field picker{padding:18px 0}.placeholder{color:#c7c7cc}.value{color:#0B0D10}.detail-field{align-items:flex-start;padding:17px 0}.detail-field textarea{min-height:42px}.editor-actions{padding:30px 0}.cancel{margin-top:10px;background:transparent;color:#86868b;font-size:14px}
</style>
