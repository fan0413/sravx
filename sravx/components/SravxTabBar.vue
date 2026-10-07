<template>
  <view class="tab-bar">
      <view v-for="item in items" :key="item.path" class="tab-item" :class="{ active: activePath === item.path }" @tap="go(item.path)">
        <view class="icon-wrap">
          <image
            class="nav-icon"
            :class="{ 'brand-icon': item.path === '/pages/index/index' }"
            :src="activePath === item.path ? item.activeIconAsset : item.iconAsset"
            mode="aspectFit"
          />
      </view>
      <text>{{ item.text }}</text>
    </view>
  </view>
</template>

<script>
export default {
  props: { activePath: { type: String, required: true } },
  data() { return { items: [
    { path: '/pages/index/index', text: '首页', iconAsset: '/static/navigation/sravx-mark.png', activeIconAsset: '/static/navigation/sravx-mark.png' },
    { path: '/pages/cart/index', text: '购物袋', iconAsset: '/static/navigation/shopping-bag.png', activeIconAsset: '/static/navigation/shopping-bag-active.png' },
    { path: '/pages/order-list/index', text: '订单', iconAsset: '/static/navigation/clipboard-list.png', activeIconAsset: '/static/navigation/clipboard-list-active.png' },
    { path: '/pages/user-center/index', text: '我的', iconAsset: '/static/navigation/user-round.png', activeIconAsset: '/static/navigation/user-round-active.png' }
  ] } },
  methods: {
    go(path) { if (path !== this.activePath) uni.reLaunch({ url: path }) }
  }
}
</script>

<style scoped>
.tab-bar{position:fixed;z-index:100;right:0;bottom:0;left:0;display:flex;height:116rpx;padding-bottom:env(safe-area-inset-bottom);box-sizing:content-box;background:rgba(255,255,255,.96);border-top:1rpx solid rgba(174,183,195,.45);box-shadow:0 -8rpx 28rpx rgba(11,13,16,.05)}.tab-item{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding-top:8rpx;color:#69727E}.tab-item text{font-size:22rpx;font-weight:500;letter-spacing:.5rpx}.tab-item.active{color:#0B0D10}.tab-item.active text{font-weight:700}.icon-wrap{width:50rpx;height:50rpx;margin-bottom:5rpx;display:flex;align-items:center;justify-content:center}.nav-icon{width:42rpx;height:42rpx;opacity:.82}.nav-icon.brand-icon{width:34rpx;height:34rpx;opacity:.5}.active .nav-icon{opacity:1;transform:scale(1.04)}.active .nav-icon.brand-icon{opacity:.72;transform:none}
</style>
