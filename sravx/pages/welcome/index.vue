<template>
  <!-- #ifdef H5 -->
  <ScissorOrbitH5 @catalog="enterSite" />
  <!-- #endif -->
  <!-- #ifndef H5 -->
  <view class="welcome-redirect">正在进入首页</view>
  <!-- #endif -->
</template>

<script>
// #ifdef H5
import ScissorOrbitH5 from '../../components/ScissorOrbitH5.vue'
// #endif

export default {
  // #ifdef H5
  components: { ScissorOrbitH5 },
  // #endif
  methods: {
    enterSite() { uni.reLaunch({ url: '/pages/index/index' }) }
  },
  onLoad() {
    // 小程序不使用官网欢迎页，保持原有首页作为启动页。
    // #ifndef H5
    uni.reLaunch({ url: '/pages/index/index' })
    // #endif
  }
}
</script>

<style>
.welcome-redirect{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f4f6f8;color:#69727e;font-size:28rpx}
</style>
