<template>
  <view class="page">
    <view v-if="loading" class="loading">加载物流信息...</view>
    <view v-else>
      <view class="card"><text class="title">物流信息</text><view class="row"><text>快递公司</text><text>{{ company || '--' }}</text></view><view class="row"><text>运单号</text><view><text>{{ expressNo || '--' }}</text><text v-if="expressNo" class="copy" @tap="copy">复制</text></view></view><view class="row"><text>状态</text><text>{{ status || '--' }}</text></view></view>
      <view class="card"><text class="title">物流详情</text><view class="hints"><text v-if="expressNo">物流轨迹将在快递揽收后更新，请稍后查看。</text><text v-if="expressNo">也可以在快递官方渠道搜索运单号 {{ expressNo }} 查询最新进度。</text><text v-else>暂未生成运单号，请联系客服确认发货进度。</text></view></view>
    </view>
  </view>
</template>
<script>
import api from '../../common/api.js'
export default { data() { return { orderId: '', orderNo: '', loading: true, company: '', expressNo: '', status: '' } }, onLoad(options) { this.orderId = options.orderId ? String(options.orderId) : ''; this.orderNo = options.orderNo ? decodeURIComponent(String(options.orderNo)) : ''; if (this.orderId) this.load(); else { this.loading = false; uni.showToast({ title: '缺少订单参数', icon: 'none' }) } }, methods: { async load() { try { const data = await api.getWaybillToken(this.orderId); this.company = data && data.expressCompany || ''; this.expressNo = data && data.expressNo || ''; this.status = data && data.status || ''; if (!this.company && !this.expressNo) uni.showToast({ title: '暂无物流信息', icon: 'none' }) } catch (error) { uni.showToast({ title: '获取物流信息失败', icon: 'none' }) } finally { this.loading = false } }, copy() { if (!this.expressNo) return; uni.setClipboardData({ data: this.expressNo, success: () => uni.showToast({ title: '已复制运单号', icon: 'success' }) }) } } }
</script>
<style>
.page{min-height:100vh;padding:10px;box-sizing:border-box;background:#F4F6F8;color:#0B0D10}.loading{padding-top:100px;text-align:center;color:#636366;font-size:14px}.card{padding:13px;margin-bottom:10px;border-radius:8px;background:#fff}.title{display:block;font-size:15px;font-weight:650}.row{display:flex;justify-content:space-between;align-items:center;margin-top:11px;font-size:13px}.row>text:first-child{color:#8e8e93}.copy{margin-left:8px;padding:2px 7px;border:1px solid #0B0D10;border-radius:3px;color:#0B0D10;font-size:11px}.hints{margin-top:11px}.hints text{display:block;margin-bottom:5px;color:#636366;font-size:12px;line-height:1.6}
</style>
