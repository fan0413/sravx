<template>
  <view class="purchase-page">
    <SravxH5GlobalNav />
    <view class="purchase-content">
      <button class="purchase-back" @click="back">‹ 返回产品目录</button>
      <view v-if="loading" class="purchase-state">正在进入商品选配…</view>
      <view v-else-if="error" class="purchase-state"><text>{{ error }}</text><button @click="load">重新加载</button></view>
      <view v-else-if="!products.length" class="purchase-state">该系列剪型暂无可选商品。</view>
    </view>
  </view>
</template>
<script>
import { goBackOrParent } from '../../common/navigation.mjs'

import api from '../../common/api.js'
import { productClassification } from '../../common/product-classification.mjs'
import SravxH5GlobalNav from '../../components/SravxH5GlobalNav.vue'
export default {
  components: { SravxH5GlobalNav },
  data() { return { series: 'all', tool: '', products: [], loading: true, error: '', active: true } },
  onLoad(query) { this.series = query.series || 'all'; this.tool = query.tool || ''; this.load() },
  onUnload() { this.active = false },
  methods: {
    async load() {
      this.loading = true; this.error = ''
      try {
        const categories = api.asList(await api.getCategoryList())
        const lists = await Promise.all(categories.map(async category => (await api.getAllProducts({ categoryId: category.id })).map(product => ({ ...product, categoryName: category.name }))))
        const seen = new Set()
        this.products = lists.flat().filter(product => {
          const classification = productClassification(product, categories)
          if (seen.has(String(product.id)) || (this.series !== 'all' && classification.series !== this.series) || (this.tool && classification.tool !== this.tool)) return false
          seen.add(String(product.id)); return true
        })
        // Resolve the current category's default product without another selection screen.
        // Replace this route so Back does not reopen the resolver and bounce forward.
        if (this.active && this.products.length) await this.detail(this.products[0].id)
      } catch (error) { this.error = error.message || '商品加载失败，请重试。' }
      finally { this.loading = false }
    },
    back() { if (typeof window !== 'undefined') { window.location.hash = '#/pages/shop/index' + (this.series === 'all' ? '' : '?series=' + encodeURIComponent(this.series)); return } goBackOrParent() },
    detail(id) { return new Promise((resolve, reject) => uni.redirectTo({ url: '/pages/product-detail/index?id=' + encodeURIComponent(id) + '&series=' + encodeURIComponent(this.series) + '&tool=' + encodeURIComponent(this.tool), success: resolve, fail: () => reject(new Error('进入商品选配失败，请重试。')) })) }
  }
}
</script>
<style scoped>
.purchase-page{min-height:100vh;background:#f4f6f8;color:#1d1d1f;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}.purchase-content{max-width:1120px;margin:0 auto;padding:40px 24px 100px}.purchase-back{display:block;width:max-content;margin:0 0 40px;padding:0;background:transparent;border:0;color:#6e6e73;font-size:14px}.purchase-back::after{display:none}.purchase-eyebrow{display:block;color:#0071e3;font-size:12px;font-weight:700;letter-spacing:.1em}.purchase-title{display:block;margin-top:14px;font-size:clamp(32px,4vw,54px);font-weight:700;line-height:1.15}.purchase-intro{display:block;margin-top:18px;color:#6e6e73;font-size:16px;line-height:1.5}.purchase-products{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;margin-top:40px}.purchase-product{overflow:hidden;border-radius:24px;background:#fff}.purchase-product>image{display:block;width:100%;height:300px}.purchase-copy{display:flex;flex-direction:column;gap:12px;padding:28px}.purchase-copy>text:first-child{font-size:24px;font-weight:650}.purchase-copy>text:nth-child(2){color:#6e6e73;font-size:15px;line-height:1.5}.purchase-copy button{width:max-content;margin:12px 0 0;padding:12px 22px;border-radius:999px;background:#0071e3;color:#fff;font-size:14px;line-height:20px}.purchase-copy button::after{display:none}.purchase-state{display:flex;flex-direction:column;align-items:center;gap:20px;padding:100px 24px;color:#6e6e73;text-align:center}@media(max-width:760px){.purchase-products{grid-template-columns:1fr}.purchase-content{padding:28px 20px 70px}}
</style>
