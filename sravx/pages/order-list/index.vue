<template>
  <view class="page-shell">
    <view class="nav-bar" :style="{ height: navBarHeight + 'px' }">
      <view class="nav-back" @tap="goBack"><text>‹</text></view>
      <text class="nav-title">我的订单</text>
      <view class="nav-space" />
    </view>
    <view class="filter-tabs" :style="{ top: navBarHeight + 'px' }">
      <view v-for="tab in tabs" :key="tab.key" class="filter-tab" :class="{ active: activeTab === tab.key }" @tap="changeTab(tab.key)">
        <text>{{ tab.name }}</text><view v-if="activeTab === tab.key" class="indicator" />
      </view>
    </view>

    <scroll-view class="order-scroll" scroll-y refresher-enabled :refresher-triggered="refreshing" @refresherrefresh="refresh" @scrolltolower="loadMore">
      <view class="content" :style="{ paddingTop: (navBarHeight + 50) + 'px' }">
        <view v-if="!loading && hasAnyOrders" class="type-switch">
          <view v-for="tab in orderTypeTabs" :key="tab.key" class="type-tab" :class="{ active: activeOrderType === tab.key }" @tap="changeOrderType(tab.key)">{{ tab.name }}</view>
        </view>

        <view v-if="!loading && displayedOrders.length">
          <view v-for="order in displayedOrders" :key="order.id" class="order-card" @tap="openOrder(order)">
            <view class="order-head"><text>订单号 {{ order.order_no || order.id }}</text><text class="status" :class="order.statusClass">{{ order.statusText }}</text></view>
            <view class="product-row">
              <image class="product-image" :src="order.displayImage" mode="aspectFill" />
              <view class="product-info">
                <text class="product-name">{{ order.displayName }}</text>
                <text class="product-meta">{{ order.orderType === 'points' ? '积分兑换' : '商品订单' }} · {{ order.quantity }}件</text>
                <text class="price">{{ order.orderType === 'points' ? order.points + ' 积分' : '¥' + money(order.amount) }}</text>
              </view>
            </view>
            <view class="order-foot">
              <text class="time">{{ activeTab === 'completed' ? '完成' : '下单' }} · {{ activeTab === 'completed' ? order.completedTime : order.createdTime }}</text>
              <view class="actions" @tap.stop>
                <button v-if="order.status === 'pending_payment'" class="action secondary" @tap="cancelOrder(order)">取消订单</button>
                <button v-if="order.orderType === 'points' && order.status === 'pending_payment' && order.amount > 0" class="action primary" @tap="payPointsOrder(order)">继续支付</button>
                <button v-if="order.orderType === 'goods' && order.status === 'paid'" class="action secondary" @tap="refundGoods(order)">申请退款</button>
                <text v-if="order.orderType === 'goods' && order.status === 'refunding'" class="action-note">退款处理中</text>
                <button v-if="order.orderType === 'points' && canRefundPoints(order)" class="action secondary" @tap="refundPoints(order)">申请退款</button>
                <text v-if="order.orderType === 'points' && order.status === 'refunding'" class="action-note">退款审核中</text>
                <button v-if="order.orderType === 'goods' && order.status === 'shipped'" class="action primary" @tap="confirmReceive(order)">确认收货</button>
                <button v-if="order.orderType === 'goods' && order.status === 'completed'" class="action secondary" @tap="afterSale(order)">申请售后</button>
              </view>
            </view>
          </view>
        </view>
        <view v-else-if="!loading && hasAnyOrders" class="list-empty">当前筛选下暂无订单</view>
        <view v-if="hasMore && displayedOrders.length" class="more">{{ loadingMore ? '加载中...' : '上拉加载更多' }}</view>
        <view v-else-if="displayedOrders.length" class="more">没有更多订单</view>

        <view v-if="!loading && !hasAnyOrders" class="empty-state">
          <view class="empty-mark" /><text class="empty-title">还没有订单</text><text class="empty-desc">发现适合你的专业工具</text>
          <button class="shop-button" @tap="goShop">去商城</button>
        </view>
        <view v-if="loading" class="loading">加载中...</view>
      </view>
    </scroll-view>
    <SravxTabBar active-path="/pages/order-list/index" />
  </view>
</template>

<script>
import { goBackOrParent } from '../../common/navigation.mjs'

import api from '../../common/api.js'
import auth from '../../common/auth.js'
import SravxTabBar from '../../components/SravxTabBar.vue'

const FALLBACK_IMAGE = '/static/navigation/sravx-mark.png'
const formatTime = (value) => {
  if (!value) return '—'
  const valueText = String(value).replace('T', ' ')
  const match = valueText.match(/^(\d{4}-\d{2}-\d{2})\s(\d{2}:\d{2})/)
  return match ? `${match[1]} ${match[2]}` : valueText.slice(0, 16)
}
const getStatusText = (status, autoCancel) => {
  if (status === 'cancelled' && (autoCancel === 1 || autoCancel === true)) return '超时关闭'
  return ({ pending_payment: '待付款', paid: '待发货', pending_send: '待发货', shipped: '待收货', received: '已收货', completed: '已完成', cancelled: '已取消', refunding: '退款中', refunded: '已退款' })[status] || '未知状态'
}
const getStatusClass = status => ({ pending_payment: 'pending', paid: 'pending', pending_send: 'pending', shipped: 'shipped', received: 'shipped', completed: 'completed', cancelled: 'cancelled', refunding: 'cancelled', refunded: 'cancelled' })[status] || ''
const isFinished = (type, status, autoCancel) => type === 'goods' ? status === 'completed' || status === 'refunded' || (status === 'cancelled' && Number(autoCancel || 0) !== 1) : ['completed', 'cancelled', 'refunded'].includes(status)
const isPending = (type, status) => type === 'goods' ? ['pending_payment', 'paid', 'shipped', 'received', 'refunding'].includes(status) : ['pending_payment', 'paid', 'pending_send', 'shipped', 'refunding'].includes(status)
const goodsOrder = (order) => {
  const first = Array.isArray(order.items) ? order.items[0] || {} : {}
  return { ...order, orderType: 'goods', displayImage: order.cover_image || order.product_image || first.product_image || FALLBACK_IMAGE, displayName: order.product_name || first.product_name || '未命名商品', quantity: Number(order.quantity || first.quantity || 1) || 1, amount: Number(order.pay_amount || order.total_amount || 0) || 0, statusText: getStatusText(order.status, order.auto_cancel), statusClass: getStatusClass(order.status), createdTime: formatTime(order.created_at), completedTime: formatTime(order.completed_at || order.updated_at || order.created_at) }
}
const pointsOrder = (order) => ({ ...order, orderType: 'points', displayImage: order.product_image_snapshot || FALLBACK_IMAGE, displayName: order.product_name_snapshot || '积分商品', quantity: Number(order.quantity || 1) || 1, points: Number(order.total_points || 0) || 0, amount: Number(order.payable_cash || order.total_cash || 0) || 0, statusText: getStatusText(order.status, order.auto_cancel), statusClass: getStatusClass(order.status), createdTime: formatTime(order.created_at), completedTime: formatTime(order.completed_at || order.updated_at || order.created_at) })

export default {
  components: { SravxTabBar },
  data() {
    return { navBarHeight: 44, tabs: [{ key: 'all', name: '全部' }, { key: 'completed', name: '已完成' }, { key: 'pending', name: '未完成' }], orderTypeTabs: [{ key: 'goods', name: '商品订单' }, { key: 'points', name: '积分订单' }], activeTab: 'all', activeOrderType: 'goods', goodsOrders: [], pointsOrders: [], displayedOrders: [], page: 1, pageSize: 20, hasMore: true, loading: true, loadingMore: false, refreshing: false }
  },
  onLoad(options) {
    this.activeTab = options.status || 'all'
    const info = uni.getSystemInfoSync()
    this.navBarHeight = (info.statusBarHeight || 20) + 44
    this.fetchOrders()
  },
  onShow() { if (this.loadedOnce) this.fetchOrders() },
  computed: {
    hasAnyOrders() { return this.goodsOrders.length > 0 || this.pointsOrders.length > 0 }
  },
  methods: {
    money(value) { return Number(value || 0).toFixed(2) },
    statusForApi() { return this.activeTab === 'pending' ? 'pending' : this.activeTab === 'completed' ? 'finished' : undefined },
    grouped(goods, points) {
      if (this.activeTab === 'completed') return { goods: goods.filter(item => isFinished('goods', item.status, item.auto_cancel)), points: points.filter(item => isFinished('points', item.status, item.auto_cancel)) }
      if (this.activeTab === 'pending') return { goods: goods.filter(item => isPending('goods', item.status)), points: points.filter(item => isPending('points', item.status)) }
      return { goods, points }
    },
    syncDisplay() { const set = this.grouped(this.goodsOrders, this.pointsOrders); this.displayedOrders = this.activeOrderType === 'points' ? set.points : set.goods },
    async fetchOrders() {
      this.loading = true
      try {
        const profile = auth.user()
        if (!profile || !profile.phone) { this.goodsOrders = []; this.pointsOrders = []; this.hasMore = false; this.syncDisplay(); return }
        const status = this.statusForApi()
        const [goodsResult, pointsResult] = await Promise.allSettled([api.getOrderList(status, 1, this.pageSize), api.getPointsOrderList(status, 1, this.pageSize)])
        if (goodsResult.status !== 'fulfilled') throw goodsResult.reason
        const goods = api.asList(goodsResult.value).map(goodsOrder)
        const points = pointsResult.status === 'fulfilled' ? api.asList(pointsResult.value).map(pointsOrder) : []
        this.goodsOrders = goods; this.pointsOrders = points; this.page = 1; this.hasMore = goods.length >= this.pageSize || points.length >= this.pageSize; this.syncDisplay()
      } catch (error) { uni.showToast({ title: error.message || '加载失败', icon: 'none' }) }
      finally { this.loading = false; this.refreshing = false; this.loadedOnce = true }
    },
    async loadMore() {
      if (!this.hasMore || this.loading || this.loadingMore) return
      this.loadingMore = true
      try {
        const page = this.page + 1; const status = this.statusForApi()
        const [goodsResult, pointsResult] = await Promise.allSettled([api.getOrderList(status, page, this.pageSize), api.getPointsOrderList(status, page, this.pageSize)])
        if (goodsResult.status !== 'fulfilled') throw goodsResult.reason
        const goods = api.asList(goodsResult.value).map(goodsOrder); const points = pointsResult.status === 'fulfilled' ? api.asList(pointsResult.value).map(pointsOrder) : []
        this.goodsOrders = this.goodsOrders.concat(goods); this.pointsOrders = this.pointsOrders.concat(points); this.page = page; this.hasMore = goods.length >= this.pageSize || points.length >= this.pageSize; this.syncDisplay()
      } catch (error) { uni.showToast({ title: error.message || '加载失败', icon: 'none' }) }
      finally { this.loadingMore = false }
    },
    refresh() { this.refreshing = true; this.fetchOrders() },
    changeTab(tab) { if (tab !== this.activeTab) { this.activeTab = tab; this.activeOrderType = 'goods'; this.fetchOrders() } },
    changeOrderType(type) { this.activeOrderType = type; this.syncDisplay() },
    goBack() { goBackOrParent('/pages/index/index') },
    goShop() { uni.reLaunch({ url: '/pages/index/index' }) },
    openOrder(order) { uni.navigateTo({ url: `${order.orderType === 'points' ? '/pages/points-order-detail/index?id=' : '/pages/order-detail/index?id='}${order.id}${order.orderType === 'points' ? '' : `&backend=${encodeURIComponent(order.__sravxOrderBackend || 'target')}`}` }) },
    cancelOrder(order) { uni.showModal({ title: '确认取消', content: '确定要取消该订单吗？', confirmColor: '#0B0D10', success: async ({ confirm }) => { if (!confirm) return; try { await (order.orderType === 'points' ? api.cancelPointsOrder(order.id) : api.cancelOrder(order.id, order.__sravxOrderBackend)); uni.showToast({ title: '订单已取消', icon: 'success' }); this.fetchOrders() } catch (error) { uni.showToast({ title: error.message || '取消失败', icon: 'none' }) } } }) },
    confirmReceive(order) { uni.showModal({ title: '确认收货', content: '确认已收到商品？', confirmColor: '#0B0D10', success: async ({ confirm }) => { if (!confirm) return; try { await api.confirmReceive(order.id, order.__sravxOrderBackend); uni.showToast({ title: '已确认收货', icon: 'success' }); this.fetchOrders() } catch (error) { uni.showToast({ title: error.message || '操作失败', icon: 'none' }) } } }) },
    refundGoods(order) { uni.navigateTo({ url: `/pages/order-after-sale/index?orderId=${order.id}&type=refund&backend=${encodeURIComponent(order.__sravxOrderBackend || 'cloud')}` }) },
    afterSale(order) { uni.navigateTo({ url: `/pages/order-after-sale/index?orderId=${order.id}&type=aftersale&backend=${encodeURIComponent(order.__sravxOrderBackend || 'cloud')}` }) },
    canRefundPoints(order) { return ['paid', 'pending_send', 'cancelled', 'shipped', 'completed'].includes(order.status) },
    refundPoints(order) { uni.showModal({ title: '申请退款', content: '确认提交积分订单退款申请？积分退款功能尚未接入，请联系客服处理。', confirmColor: '#0B0D10', success: async ({ confirm }) => { if (!confirm) return; try { const result = await api.applyPointsRefundRequest({ orderId: Number(order.id), refundReason: '用户发起退款申请' }); uni.showToast({ title: result && result.autoRefund ? '已自动退款' : '已提交审批', icon: 'success' }); this.fetchOrders() } catch (error) { uni.showToast({ title: error.message || '申请失败', icon: 'none' }) } } }) },
    async payPointsOrder(order) {
      try { uni.showLoading({ title: '调起支付...', mask: true }); const payment = await api.createPaymentOrder({ orderId: Number(order.id), orderType: 'points', description: order.displayName || 'Sravx 积分订单' }); if (!payment || !payment.timeStamp || !payment.nonceStr || !payment.package || !payment.paySign) throw new Error('支付参数不完整，请稍后重试'); uni.hideLoading(); await uni.requestPayment({ timeStamp: payment.timeStamp, nonceStr: payment.nonceStr, package: payment.package, signType: payment.signType || 'RSA', paySign: payment.paySign }); uni.showToast({ title: '支付成功', icon: 'success' }); this.fetchOrders() }
      catch (error) { uni.hideLoading(); const message = error.errMsg || error.message || '支付失败'; uni.showToast({ title: message.includes('requestPayment:fail cancel') ? '已取消支付' : message, icon: 'none' }) }
    }
  }
}
</script>

<style>
.page-shell{height:100vh;background:#F4F6F8;color:#0B0D10}.nav-bar{position:fixed;z-index:10;top:0;left:0;right:0;display:flex;align-items:flex-end;padding:0 12px 10px;background:rgba(255,255,255,.96);box-sizing:border-box;border-bottom:1px solid #E9EDF2}.nav-back,.nav-space{width:36px;height:34px;display:flex;align-items:center}.nav-back text{font-size:35px;line-height:26px;color:#0B0D10}.nav-title{flex:1;text-align:center;font-size:17px;font-weight:700}.filter-tabs{position:fixed;z-index:9;left:0;right:0;height:46px;background:rgba(255,255,255,.96);display:flex;border-bottom:1px solid #E9EDF2}.filter-tab{flex:1;position:relative;display:flex;align-items:center;justify-content:center;color:#86868b;font-size:13px}.filter-tab.active{font-weight:700;color:#0B0D10}.indicator{position:absolute;bottom:5px;width:16px;height:2px;border-radius:9px;background:#0B0D10}.order-scroll{height:100vh}.content{padding:14px 18px 100px;box-sizing:border-box}.type-switch{display:flex;padding:3px;margin-bottom:14px;background:#E9EDF2;border-radius:12px}.type-tab{flex:1;padding:8px;text-align:center;border-radius:9px;font-size:12px;color:#69727E}.type-tab.active{color:#0B0D10;background:#fff;font-weight:650;box-shadow:0 1px 4px rgba(11,13,16,.08)}.order-card{margin-bottom:10px;overflow:hidden;border:1px solid #E9EDF2;border-radius:16px;background:#fff;box-shadow:0 5px 18px rgba(11,13,16,.035)}.order-head,.order-foot{display:flex;align-items:center;justify-content:space-between;padding:11px 14px;border-bottom:1px solid #F1F1F3;font-size:11px;color:#86868b}.status{font-size:13px;font-weight:650;color:#0B0D10}.status.shipped{color:#69727E}.status.completed{color:#4A4A4D}.status.cancelled{color:#86868b}.product-row{display:flex;padding:13px 14px}.product-image{width:77px;height:77px;border-radius:9px;background:#ECEEF0}.product-info{display:flex;flex:1;min-width:0;margin-left:12px;flex-direction:column;justify-content:center}.product-name{font-size:14px;line-height:20px;font-weight:650;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}.product-meta{margin-top:5px;font-size:11px;color:#86868b}.price{margin-top:6px;font-size:14px;font-weight:700}.order-foot{min-height:42px;padding-top:7px;padding-bottom:7px;border-top:1px solid #F1F1F3;border-bottom:0;background:#FCFCFD}.time{flex:1;font-size:11px}.actions{display:flex;align-items:center;gap:6px}.action{margin:0;padding:6px 10px;line-height:18px;border-radius:16px;font-size:11px}.action::after{border:0}.secondary{background:#fff;border:1px solid #D1D1D6;color:#0B0D10}.primary{background:#0B0D10;color:#fff}.action-note{font-size:11px;color:#86868b}.list-empty,.loading,.more{padding:28px 10px;text-align:center;color:#86868b;font-size:13px}.more{padding:16px}.empty-state{display:flex;align-items:center;flex-direction:column;padding:176rpx 20px 120rpx}.empty-mark{position:relative;width:48px;height:42px;margin-bottom:18px;box-sizing:border-box;border:1.5px solid #AEB7C3;border-radius:7px;background:#fff}.empty-mark::before{position:absolute;top:-7px;left:12px;width:20px;height:10px;box-sizing:border-box;border:1.5px solid #AEB7C3;border-bottom:0;border-radius:7px 7px 0 0;content:''}.empty-mark::after{position:absolute;top:16px;left:15px;width:16px;border-top:1.5px solid #AEB7C3;content:''}.empty-title{font-size:18px;font-weight:700;letter-spacing:.2px}.empty-desc{margin-top:8px;color:#86868b;font-size:13px}.shop-button{margin-top:22px;padding:0 27px;border-radius:21px;background:#0B0D10;color:#fff;font-size:14px;line-height:40px}.shop-button::after{border:0}
</style>
