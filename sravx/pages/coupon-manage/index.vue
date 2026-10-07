<template>
  <view class="page">
    <view v-if="loading" class="loading">优惠券加载中...</view>
    <view v-else>
      <text class="heading">我的优惠券</text>
      <view v-if="coupons.length" class="list"><view v-for="item in coupons" :key="`mine-${item.claimId}`" class="coupon"><view class="left"><text class="ui-small">满减券</text><text class="ui-strong">￥{{ item.value }}</text><text class="ui-small">满{{ item.min }}可用</text></view><view class="right"><view><text class="name">{{ item.name }}</text><text class="badge">可使用</text></view><text class="ellipsis">{{ item.desc }}</text><text>{{ item.time }}</text><button @tap="shop">去使用</button></view></view></view>
      <view v-else class="empty"><text class="ui-strong">暂无可使用优惠券</text><text>领取活动优惠券后可在下单时使用</text></view>
      <text v-if="campaigns.length" class="heading activity-heading">可领取活动</text>
      <view v-if="campaigns.length" class="list"><view v-for="item in campaigns" :key="`campaign-${item.id}`" class="coupon campaign"><view class="left"><text class="ui-small">活动券</text><text class="ui-strong">￥{{ item.value }}</text><text class="ui-small">满{{ item.min }}可用</text></view><view class="right"><view><text class="name">{{ item.name }}</text><text class="badge available">可领取</text></view><text class="ellipsis">{{ item.desc }}</text><text>{{ item.time }}</text><button :disabled="claiming===item.id" @tap="claim(item)">{{ claiming===item.id ? '领取中' : '立即领取' }}</button></view></view></view>
    </view>
  </view>
</template>

<script>
import api from '../../common/api.js'
const format = value => value ? String(value).replace('T', ' ').slice(0, 10).replace(/-/g, '.') : '--'
const view = item => ({ id: item.id, claimId: item.user_coupon_id || item.claim_id || item.id, name: item.name || '优惠券', value: Number(item.value || 0).toFixed(0), min: Number(item.min_amount || 0).toFixed(0), desc: item.usage_note || item.desc || '全场可用', time: `${format(item.start_time)} - ${format(item.expire_time)}` })
export default {
  data() { return { coupons: [], campaigns: [], loading: false, claiming: null } },
  onShow() { this.load() },
  methods: {
    async load() {
      this.loading = true
      try {
        const [mine, available] = await Promise.all([api.getMyCoupons('unused'), api.getAvailableCoupons()])
        this.coupons = api.asList(mine).map(view)
        const claimed = new Set(this.coupons.map(item => Number(item.id)))
        this.campaigns = api.asList(available).filter(item => !claimed.has(Number(item.id))).map(view)
      } catch (error) {
        this.coupons = []; this.campaigns = []
        uni.showToast({ title: error.message || '优惠券加载失败', icon: 'none' })
      } finally { this.loading = false }
    },
    async claim(item) {
      if (this.claiming || !item || !item.id) return
      this.claiming = item.id
      try { await api.receiveCoupon(item.id); uni.showToast({ title: '领取成功', icon: 'success' }); await this.load() }
      catch (error) { uni.showToast({ title: error.message || '领取失败', icon: 'none' }) }
      finally { this.claiming = null }
    },
    shop() { uni.navigateTo({ url: '/pages/shop/index' }) }
  }
}
</script>

<style>
.page{min-height:100vh;padding:18px 10px 34px;box-sizing:border-box;background:#F4F6F8}.loading{padding:40px;text-align:center;color:#6b7280;font-size:12px}.heading{display:block;margin:4px 4px 10px;font-size:16px;font-weight:650}.activity-heading{margin-top:24px}.list{display:flex;flex-direction:column;gap:8px}.coupon{display:flex;overflow:hidden;border:1px solid #e5e7eb;border-radius:10px;background:#fff}.left{display:flex;width:82px;align-items:center;flex-direction:column;justify-content:center;padding:8px;background:linear-gradient(#0B0D10,#0B0D10);color:#fff}.campaign .left{background:linear-gradient(#0B0D10,#0B0D10)}.left .ui-small{font-size:10px}.left .ui-strong{font-size:22px}.right{position:relative;display:flex;min-height:92px;flex:1;padding:9px 10px 34px;box-sizing:border-box;flex-direction:column;gap:3px;color:#6b7280;font-size:10px}.right>view{display:flex;justify-content:space-between;align-items:center}.name{color:#111827;font-size:14px;font-weight:650}.badge{padding:2px 6px;border-radius:9px;background:#F4F6F8;color:#4A4A4D;font-size:9px}.available{background:#F4F6F8;color:#0B0D10}.ellipsis{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.right button{position:absolute;right:9px;bottom:7px;margin:0;padding:0 12px;border-radius:15px;background:#111827;color:#fff;font-size:10px;line-height:28px}.right button[disabled]{opacity:.55}.right button::after{border:0}.empty{display:flex;align-items:center;flex-direction:column;padding:35px 10px;border-radius:10px;background:#fff;gap:7px}.empty .ui-strong{font-size:15px}.empty text{color:#6b7280;font-size:11px}
</style>
