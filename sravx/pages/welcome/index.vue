<template>
  <!-- #ifdef H5 -->
  <SravxOfficialH5 :start-landing="true" />
  <!-- #endif -->
  <!-- #ifndef H5 -->
  <view class="welcome-redirect">正在进入首页</view>
  <!-- #endif -->
</template>

<script>
import SravxOfficialH5 from '../../components/SravxOfficialH5.vue'

export default {
  components: { SravxOfficialH5 },
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
