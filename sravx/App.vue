<script>
// 旧订单等尚未切走的能力仍通过 CloudBase 兼容层读取。
// 导航和页面 UI 均由 UniApp/Vue 实现；此初始化会在旧链路完成核验后统一移除。
export default {
  onLaunch() {
    if (wx.cloud) wx.cloud.init({ env: 'cloud1-3g5eswzf0c3a9e0e', traceUser: true })
  }
}
</script>

<style>
page {
  background: #F4F6F8;
  color: #0B0D10;
  font-family: "SF Pro Display", "SF Pro Text", -apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", Arial, sans-serif;
  font-kerning: normal;
  text-rendering: geometricPrecision;
}
page, button, input, textarea { letter-spacing: .1px; }
button::after { border: 0; }
</style>
