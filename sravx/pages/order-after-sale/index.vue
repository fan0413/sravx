<template>
  <sravx-page-back root-only />

  <view class="page"><view v-if="orderId" class="tip">未发货订单申请后直接全额原路退款；已发货订单需人工审核。退款到账以微信结果为准。</view><view class="card"><view class="row"><text class="type">{{ typeText }}</text><text class="status">提交申请</text></view><textarea v-model="reason" maxlength="200" class="reason-input" placeholder="请输入退款原因（选填）"/><button class="submit" :class="{ disabled: submitting }" @tap="submit">{{ submitting ? '提交中...' : '提交申请' }}</button></view><view class="tip">历史申请记录</view><view v-if="loading" class="tip">加载中...</view><view v-else-if="records.length"><view v-for="item in records" :key="item.id" class="card"><view class="row"><text class="type">{{ item.type }}</text><text class="status">{{ item.status }}</text></view><text class="reason">原因：{{ item.reason }}</text><view class="row"><text class="time">{{ item.createdAt }}</text><text class="amount">¥{{ item.amount }}</text></view></view></view><view v-else class="tip">暂无申请记录</view></view>
</template>
<script>
import SravxPageBack from '../../components/sravx-page-back/sravx-page-back.vue'

import api from '../../common/api.js'
import { refundSubmissionMessage } from '../../common/refund-status.mjs'
const textFor = value => ({ pending_review: '待审批', approved: '审批通过', rejected: '已驳回', processing: '退款处理中', refunded: '已退款' })[value] || value || '未知状态'
export default {
  components: { SravxPageBack },
  data() { return { orderId: '', backend: 'target', type: 'refund', typeText: '仅退款', reason: '', records: [], loading: true, submitting: false, refundKey: 'refund_' + Date.now() + '_' + Math.random().toString(36).slice(2) } },
  onLoad(options) {
    this.orderId = options.orderId ? String(options.orderId) : '';
    this.backend = options.backend === 'cloud' ? 'cloud' : 'target';
    this.type = options.type === 'aftersale' ? 'aftersale' : 'refund';
    this.typeText = this.type === 'aftersale' ? '售后申请' : '仅退款';
    this.load();
  },
  methods: {
    async load() {
      if (!this.orderId) { this.loading = false; return }
      this.loading = true;
      try {
        const rows = await api.getRefundRequestList(this.orderId, this.backend);
        this.records = api.asList(rows).map(item => ({ id: item.id, type: item.request_type === 'return_and_refund' ? '退货退款' : '仅退款', reason: item.reason || '—', amount: item.requested_amount || '0.00', status: textFor(item.status), createdAt: item.created_at || '' }));
      } catch (error) { uni.showToast({ title: error.message || '加载失败', icon: 'none' }) }
      finally { this.loading = false }
    },
    async submit() {
      if (!this.orderId) return uni.showToast({ title: '缺少订单号', icon: 'none' });
      if (this.type !== 'refund') return uni.showToast({ title: '售后申请接口预留中', icon: 'none' });
      if (this.submitting) return;
      this.submitting = true;
      try {
        const result = await api.applyRefundRequest({ orderId: this.orderId, backend: this.backend, reason: this.reason || '用户申请退款', refundType: 'refund_only', idempotencyKey: this.refundKey });
        uni.showToast({ title: refundSubmissionMessage(result), icon: 'none' });
        await this.load();
      } catch (error) { uni.showToast({ title: error.message || '提交失败', icon: 'none' }) }
      finally { this.submitting = false }
    }
  }
}
</script>
<style>
.page{min-height:100vh;padding:10px;box-sizing:border-box;background:#F4F6F8}.tip{padding:0 4px 8px;color:#636366;font-size:12px;line-height:1.5}.card{margin-bottom:10px;padding:13px;border-radius:8px;background:#fff}.row{display:flex;align-items:center;justify-content:space-between}.type{font-size:14px;font-weight:650}.status{color:#0B0D10;font-size:12px;font-weight:650}.reason-input{width:100%;height:70px;margin-top:10px;padding:8px;box-sizing:border-box;border-radius:6px;background:#f8f8f8;font-size:12px}.submit{margin-top:10px;border-radius:19px;background:#0B0D10;color:#fff;font-size:13px;line-height:38px}.submit::after{border:0}.submit.disabled{opacity:.6}.reason{display:block;margin:8px 0;font-size:12px;color:#666}.time{font-size:11px;color:#8e8e93}.amount{font-size:13px;font-weight:650}
</style>
