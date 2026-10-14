<template>
  <view v-if="visible" class="page-back-wrap" :class="'page-back-' + mode" :style="mode === 'safe' ? { paddingTop: safeTop + 'px' } : {}">
    <button class="page-back-button" aria-label="返回上级页面" hover-class="page-back-pressed" @tap="back"><text>‹</text><text>返回</text></button>
  </view>
</template>
<script>
import { pageStack, goBackOrParent } from '../../common/navigation.mjs'
export default {
  props: { rootOnly: Boolean, mode: { type: String, default: 'inline' }, fallback: { type: String, default: '' } },
  data() { return { visible: false, safeTop: 0 } },
  mounted() {
    this.visible = !this.rootOnly || pageStack().length <= 1
    if (this.mode === 'safe') {
      const info = uni.getSystemInfoSync()
      this.safeTop = Number(info.statusBarHeight) || 0
      // #ifdef MP-WEIXIN
      const menu = uni.getMenuButtonBoundingClientRect()
      this.safeTop = Math.max(this.safeTop, Number(menu.top) || 0)
      // #endif
    }
  },
  methods: { back() { goBackOrParent(this.fallback || undefined) } }
}
</script>
<style scoped>
.page-back-wrap{display:flex;align-items:center;justify-content:flex-start;padding:8px 14px;box-sizing:border-box}
.page-back-button{display:flex;align-items:center;gap:8px;min-width:70px;min-height:44px;margin:0;padding:0 8px;border:0;border-radius:8px;background:transparent;color:#0B0D10;font:inherit;font-size:14px;line-height:1.2}
.page-back-button::after{border:0}.page-back-button>text:first-child{font-size:30px;line-height:1}.page-back-pressed{background:#F4F6F8}
.page-back-nav{position:absolute;left:4px;bottom:0;z-index:2;padding:0}
.page-back-safe{min-height:60px;background:#FFFFFF}
</style>
