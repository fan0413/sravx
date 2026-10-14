<template>
  <view class="web-buy" :data-product-id="product?.id || ''">
    <SravxH5GlobalNav />
    <view class="buy-local-nav"><view class="buy-width"><text>{{ product?.name || '选购 SRAVX' }}</text><view><BuyButton @click="back">返回产品目录</BuyButton><BuyButton v-if="product" @click="jump('buy-details')">产品参数</BuyButton><BuyButton @click="bag">购物袋</BuyButton></view></view></view>
    <view v-if="loading" class="buy-state" role="status">正在加载商品与可选规格…</view>
    <view v-else-if="error || !product" class="buy-state" role="alert"><text class="buy-state-title">暂时无法查看这件商品</text><text>{{ error || '请从产品目录选择商品。' }}</text><BuyButton v-if="productId" class="buy-primary" @click="load">重新加载</BuyButton><BuyButton class="buy-text-link" @click="back">返回产品目录</BuyButton></view>
    <template v-else>
      <view class="buy-width buy-heading"><view><text class="buy-eyebrow">SRAVX PROFESSIONAL TOOLS</text><text class="buy-title">购买 {{ product.name }}</text><text v-if="product.desc || product.description" class="buy-description">{{ product.desc || product.description }}</text></view><view class="buy-heading-price"><text>{{ unitPriceText }}</text><text>选择适合你的规格。</text></view></view>
      <view class="buy-width buy-layout">
        <view class="buy-gallery-column"><view class="buy-gallery-sticky">
          <view class="buy-image-stage"><image v-if="activeImage && !failedImages.includes(activeImage)" :key="activeImage" :src="activeImage" :alt="product.name + ' 商品图'" mode="aspectFit" @error="imageFailed(activeImage)"/><text v-else class="buy-no-image">暂无商品图片</text></view>
          <view v-if="gallery.length > 1" class="buy-gallery-controls"><BuyButton aria-label="上一张商品图" :disabled="imageIndex <= 0" @click="imageIndex--"><uni-icons type="left" size="18" color="#6e6e73"/></BuyButton><view class="buy-dots"><BuyButton v-for="(image, index) in gallery" :key="image" :aria-label="'查看第 ' + (index + 1) + ' 张商品图'" :aria-pressed="imageIndex === index" :class="{ active: imageIndex === index }" @click="imageIndex = index"/></view><BuyButton aria-label="下一张商品图" :disabled="imageIndex >= gallery.length - 1" @click="imageIndex++"><uni-icons type="right" size="18" color="#6e6e73"/></BuyButton></view>
          <text class="buy-gallery-caption">{{ selectedModel?.name }}</text>
        </view></view>
        <view class="buy-configuration">
          <view class="buy-step"><text class="buy-step-title">型号：<text class="buy-step-description">选择适合你的工具。</text></text><view class="buy-options"><BuyButton v-for="model in models" :key="model.key" class="buy-option" :class="{ selected: modelKey === model.key }" :disabled="!model.available" :aria-pressed="modelKey === model.key" @click="chooseModel(model)"><view><text class="buy-option-name">{{ model.name }}</text><text v-if="model.sku" class="buy-muted">{{ model.sku }}</text></view><text class="buy-option-price">{{ model.available ? priceText(model.price) : '暂不可购买' }}</text></BuyButton></view></view>
          <view v-if="protectOffer" class="buy-step"><text class="buy-step-title">SRAVX Protect：<text class="buy-step-description">了解工具服务。</text></text><text class="buy-step-note">{{ protectOffer.displayOnly ? '当前为权益说明，暂不收费。' : '该服务暂未开放网页购买。' }}</text><view class="buy-options"><BuyButton class="buy-option" :class="{ selected: !protectSelected }" :aria-pressed="!protectSelected" @click="protectSelected = false"><view><text class="buy-option-name">不添加 SRAVX Protect</text><text class="buy-muted">按商品公示的保修规则执行。</text></view><uni-icons v-if="!protectSelected" type="checkmarkempty" size="20" color="#0071e3"/></BuyButton><BuyButton class="buy-option" :disabled="!protectOffer.displayOnly" :class="{ selected: protectSelected }" :aria-pressed="protectSelected" @click="protectSelected = true"><view><text class="buy-option-name">添加 SRAVX Protect</text><text class="buy-muted">具体适用条件与服务规则以下单页公示为准。</text></view><uni-icons v-if="protectSelected" type="checkmarkempty" size="20" color="#0071e3"/></BuyButton></view></view>
          <view v-if="shipping.promise || shipping.reason || shipping.note" class="buy-step"><text class="buy-step-title">发货信息</text><text v-if="shipping.promise" class="buy-step-note">{{ shipping.promise }}</text><text v-if="shipping.reason" class="buy-step-note">{{ shipping.reason }}</text><text v-if="shipping.note" class="buy-step-note">{{ shipping.note }}</text></view><view class="buy-step"><text class="buy-step-title">数量：<text class="buy-step-description">按你的需要选择。</text></text><view class="buy-quantity"><BuyButton aria-label="减少数量" :disabled="quantity <= 1" @click="quantity--"><uni-icons type="minus" size="18" color="#1d1d1f"/></BuyButton><text aria-live="polite">{{ quantity }}</text><BuyButton aria-label="增加数量" :disabled="!canBuy || (stock !== null && quantity >= stock)" @click="quantity++"><uni-icons type="plus" size="18" color="#1d1d1f"/></BuyButton></view><text v-if="!canBuy" class="buy-step-note">{{ blockedReason }}</text></view>
          <view class="buy-summary" aria-live="polite"><text class="buy-summary-title">你的 {{ product.name }}。</text><text class="buy-muted">{{ selectedModel?.name }} · {{ quantity }} 件</text><text v-if="protectSelected" class="buy-muted">已选 SRAVX Protect（权益说明）</text><text class="buy-total">{{ totalPriceText }}</text><text class="buy-step-note">商品金额，运费与其他费用以确认订单页为准。</text><BuyButton class="buy-primary" :disabled="!canBuy || adding" @click="add">{{ adding ? '正在加入…' : '加入购物袋' }}</BuyButton><text v-if="notice" class="buy-notice" role="status">{{ notice }}</text></view>
        </view>
      </view>
      <view id="buy-details" class="buy-details"><view class="buy-width"><text class="buy-section-title">更了解你的工具。</text><view v-if="params.length" class="buy-parameter-grid"><view v-for="param in params" :key="param.label"><text>{{ param.label }}</text><text>{{ param.value }}</text></view></view><view v-if="detailImages.length" class="buy-story"><text class="buy-section-title">产品详情。</text><image v-for="image in detailImages" :key="image" :src="image" :alt="product.name + ' 详情图'" mode="widthFix"/></view></view></view>
      <view class="buy-bottom"><view class="buy-width"><view><text>{{ product.name }}</text><text>{{ selectedModel?.name }}</text></view><view class="buy-bottom-actions"><text>{{ totalPriceText }}</text><BuyButton class="buy-primary" :disabled="!canBuy || adding" @click="add">加入购物袋</BuyButton></view></view></view>
    </template>
  </view>
</template>

<script>
import api from '../common/api.js'
import cart from '../common/cart.js'
import SravxH5GlobalNav from './SravxH5GlobalNav.vue'
import BuyButton from './SravxBuyButton.vue'
import { imageList, priceText, hasStructuredCatalog, modelOptions, colorOptions, selectedSku, selectionPrice, selectionStock, selectionShipping, purchaseItem } from '../common/web-purchase.mjs'

export default {
  components: { SravxH5GlobalNav, BuyButton },
  props: { productId: { type: String, default: '' }, series: { type: String, default: '' }, tool: { type: String, default: '' } },
  data() { return { product: null, loading: true, error: '', modelKey: '', colorKey: '', quantity: 1, imageIndex: 0, failedImages: [], protectSelected: false, adding: false, notice: '', requestId: 0 } },
  computed: {
    models() { return this.product ? modelOptions(this.product) : [] },
    colors() { return [] },
    selectedModel() { return this.models.find(model => model.key === this.modelKey) },
    selectedColor() { return this.colors.find(color => color.key === this.colorKey) },
    structured() { return hasStructuredCatalog(this.product) },
    sku() { return this.product && this.structured ? selectedSku(this.product, this.selectedModel?.id, this.selectedColor?.id) : null },
    unitPrice() { return this.product ? selectionPrice(this.product, this.selectedModel, this.selectedColor?.id) : null },
    unitPriceText() { return priceText(this.unitPrice) },
    totalPriceText() { return priceText(this.unitPrice === null ? null : this.unitPrice * this.quantity) },
    stock() { return selectionStock(this.product, this.sku) },
    shipping() { return selectionShipping(this.product, this.selectedModel, this.sku) },
    canBuy() { return !!this.selectedModel && this.unitPrice !== null && (!this.structured || api.structuredCheckoutEnabled()) && (this.stock === null || (this.stock >= this.quantity && this.quantity > 0)) },
    blockedReason() { return this.structured && !api.structuredCheckoutEnabled() ? '该商品的规格购买暂未开放，请稍后再试。' : '当前规格暂不可购买。' },
    protectOffer() { return (this.product?.protectOffers || []).find(offer => !offer.sku_id || Number(offer.sku_id) === Number(this.sku?.id)) || null },
    gallery() { const p = this.product || {}; const variantImage = this.sku?.image_object_key; const usableVariant = /^(https?:\/\/|\/static\/)/.test(variantImage || '') ? variantImage : ''; return [...new Set([usableVariant, this.selectedModel?.image, ...imageList(p.images), p.cover_image].filter(Boolean))] },
    activeImage() { return this.gallery[this.imageIndex] || '' },
    detailImages() { return imageList(this.product?.detail_images) },
    params() { const p = this.product || {}; if (p.series === 'accessories') return []; return [{ label: '核心材质', value: p.steel_material || p.core_material || '未提供' }, { label: '手柄材质', value: p.handle_material || '未提供' }, { label: '尺寸', value: p.display_size || p.size || '未提供' }, { label: '重量', value: p.weight || '未提供' }, { label: '保修期', value: p.warranty_period || '未提供' }] }
  },
  watch: {
    productId: { immediate: true, handler() { this.load() } },
    modelKey() { this.imageIndex = 0; this.protectSelected = false; this.clampQuantity(); this.saveSelection() },
    colorKey() { this.imageIndex = 0; this.protectSelected = false; this.clampQuantity(); this.saveSelection() },
    quantity() { this.saveSelection() },
    protectSelected() { this.saveSelection() }
  },
  mounted() { document.addEventListener('visibilitychange', this.refreshExpiredMedia) },
  beforeUnmount() { document.removeEventListener('visibilitychange', this.refreshExpiredMedia); ++this.requestId },
  methods: {
    priceText,
    refreshExpiredMedia() {
      if (!document.hidden && !this.loading && Date.parse(this.product?.media_expires_at) <= Date.now()) this.load()
    },
    async load() {
      const requestId = ++this.requestId
      this.loading = true; this.error = ''; this.product = null; this.notice = ''; this.failedImages = []
      if (!/^[1-9]\d*$/.test(this.productId)) { this.loading = false; this.error = '请从产品目录选择有效商品。'; return }
      try {
        const product = await api.getProductDetail(Number(this.productId))
        if (requestId !== this.requestId) return
        if (!product || !product.id) throw new Error('商品不存在或已下架。')
        this.product = product
        const saved = uni.getStorageSync('sravx_web_selection_' + this.productId) || {}
        const model = this.models.find(item => item.key === saved.modelKey && item.available) || this.models.find(item => item.available)
        this.modelKey = model?.key || ''
        const color = this.colors.find(item => item.key === saved.colorKey && this.colorAvailable(item)) || this.colors.find(item => this.colorAvailable(item))
        this.colorKey = color?.key || ''
        this.quantity = Number.isInteger(saved.quantity) && saved.quantity > 0 ? saved.quantity : 1
        this.clampQuantity()
      } catch (error) { if (requestId === this.requestId) this.error = error.message || '商品加载失败，请重试。' }
      finally { if (requestId === this.requestId) this.loading = false }
    },
    colorAvailable(color) { return !this.structured || !!selectedSku(this.product, this.selectedModel?.id, color.id) },
    chooseModel(model) { this.modelKey = model.key; if (!this.selectedColor || !this.colorAvailable(this.selectedColor)) this.colorKey = this.colors.find(color => this.colorAvailable(color))?.key || ''; this.notice = '' },
    chooseColor(color) { this.colorKey = color.key; this.notice = '' },
    clampQuantity() { if (this.stock === null) return; this.quantity = this.stock > 0 ? Math.min(this.quantity, Math.floor(this.stock)) : 1 },
    saveSelection() { if (this.product && !this.loading) uni.setStorageSync('sravx_web_selection_' + this.productId, { modelKey: this.modelKey, quantity: this.quantity }) },
    imageFailed(image) { this.failedImages = [...this.failedImages, image]; this.refreshExpiredMedia() },
    jump(id) { document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }) },
    back() { const query = new URLSearchParams(); if (this.series) query.set('series', this.series); if (this.tool) query.set('tool', this.tool); uni.reLaunch({ url: '/pages/shop/index' + (query.size ? '?' + query.toString() : '') }) },
    bag() { uni.navigateTo({ url: '/pages/cart/index' }) },
    add() {
      if (!this.canBuy || this.adding) return
      this.adding = true
      try { cart.add(purchaseItem(this.product, this.selectedModel, null, this.quantity, this.protectOffer, this.protectSelected)); this.notice = '已加入购物袋'; this.bag() }
      catch (error) { this.notice = error.message || '加入购物袋失败，请重试。' }
      finally { this.adding = false }
    }
  }
}
</script>

<style scoped>
@font-face{font-family:uniicons;src:url('../uni_modules/uni-icons/components/uni-icons/uniicons.ttf') format('truetype')}
.web-buy{--buy-ink:#1d1d1f;--buy-muted:#6e6e73;--buy-blue:#0071e3;min-height:100vh;background:#fff;color:var(--buy-ink);font-family:"SF Pro Display","SF Pro Text","PingFang SC",sans-serif;padding-bottom:100px}
.web-buy .buy-button{margin:0;box-sizing:border-box;border:0;background:transparent;color:inherit;font:inherit;line-height:1.4;cursor:pointer}.web-buy .buy-button::after{display:none}.web-buy .buy-button:focus-visible{outline:3px solid #0071e3;outline-offset:4px}.web-buy .buy-button[disabled]{opacity:.4;cursor:not-allowed}.web-buy text{overflow-wrap:anywhere}.buy-width{width:calc(100% - 96px);max-width:1320px;margin:0 auto;box-sizing:border-box}
.buy-local-nav{background:rgba(255,255,255,.95);border-bottom:1px solid #d2d2d7}.buy-local-nav>.buy-width{display:flex;justify-content:space-between;align-items:center;min-height:58px;gap:24px}.buy-local-nav text{font-size:19px;font-weight:650}.buy-local-nav view>view{display:flex;gap:22px}.buy-local-nav .buy-button{padding:8px 0;font-size:12px;color:var(--buy-muted)}.buy-local-nav .buy-button:hover{color:var(--buy-blue)}
.buy-heading{display:flex;justify-content:space-between;align-items:flex-end;gap:50px;padding:65px 0 52px}.buy-heading>view:first-child{max-width:850px}.buy-eyebrow{display:block;font-size:12px;font-weight:600;letter-spacing:.12em;color:var(--buy-blue)}.buy-title{display:block;margin-top:14px;font-size:clamp(32px,3.7vw,54px);font-weight:700;line-height:1.14;letter-spacing:-.03em}.buy-description{display:block;margin-top:20px;font-size:17px;line-height:1.6;color:var(--buy-muted)}.buy-heading-price{flex-shrink:0;display:flex;flex-direction:column;gap:10px;font-size:17px;text-align:right}.buy-heading-price text:last-child{font-size:12px;color:var(--buy-muted)}
.buy-layout{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(320px,1fr);gap:clamp(44px,6vw,100px);align-items:start;padding-bottom:80px}.buy-gallery-column{height:100%}.buy-gallery-sticky{position:sticky;top:88px}.buy-image-stage{height:clamp(380px,38vw,620px);border-radius:24px;overflow:hidden;background:#f5f5f7;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}.buy-image-stage image{width:100%;height:100%;animation:buy-reveal .35s ease both}.buy-no-image{color:var(--buy-muted);font-size:15px}.buy-gallery-controls{display:flex;align-items:center;justify-content:center;gap:24px;margin-top:22px}.buy-gallery-controls>.buy-button{width:34px;height:34px;border-radius:50%;background:#f5f5f7;display:flex;align-items:center;justify-content:center;padding:0}.buy-dots{display:flex;align-items:center;gap:10px}.buy-dots .buy-button{padding:0;width:7px;height:7px;border-radius:50%;background:#d2d2d7}.buy-dots .buy-button.active{background:var(--buy-ink)}.buy-gallery-caption{display:block;text-align:center;margin-top:16px;color:var(--buy-muted);font-size:13px}
.buy-step{margin-bottom:46px}.buy-step-title{display:block;font-size:25px;font-weight:650;line-height:1.35;letter-spacing:-.025em}.web-buy .buy-step-description{color:var(--buy-muted);margin-inline-start:.3em}.buy-options{display:flex;flex-direction:column;gap:14px;margin-top:22px}.web-buy .buy-option{display:flex;align-items:center;justify-content:space-between;gap:16px;width:100%;padding:22px 20px;border:1px solid #86868b;border-radius:12px;text-align:left;min-height:86px;transition:border-color .15s,box-shadow .15s}.web-buy .buy-option.selected,.web-buy .buy-color.selected{border-color:var(--buy-blue);box-shadow:inset 0 0 0 1px var(--buy-blue)}.buy-option>view{display:flex;flex-direction:column;gap:6px;flex:1}.buy-option-name{font-size:17px;font-weight:600}.buy-option-price{font-size:12px;text-align:right;max-width:120px}.buy-muted{font-size:12px;color:var(--buy-muted);line-height:1.6}.buy-color-label{display:block;margin-top:24px;font-size:14px;font-weight:600}.buy-colors{display:flex;flex-wrap:wrap;gap:12px;margin-top:16px}.web-buy .buy-color{display:flex;align-items:center;gap:9px;padding:12px 16px;min-height:48px;border:1px solid #d2d2d7;border-radius:999px;font-size:13px}.buy-swatch{width:20px;height:20px;border-radius:50%;border:1px solid rgba(0,0,0,.15);flex-shrink:0}.buy-step-note{display:block;margin-top:14px;color:var(--buy-muted);font-size:13px;line-height:1.6}
.buy-quantity{display:flex;align-items:center;justify-content:space-between;width:144px;height:46px;margin-top:22px;border:1px solid #d2d2d7;border-radius:12px}.buy-quantity .buy-button{display:flex;align-items:center;justify-content:center;width:44px;height:44px;padding:0}.buy-quantity>text{font-size:16px;min-width:28px;text-align:center}.buy-summary{padding:30px;background:#f5f5f7;border-radius:18px}.buy-summary-title{display:block;font-size:25px;font-weight:650;line-height:1.2;margin-bottom:14px}.buy-summary>.buy-muted{display:block}.buy-total{display:block;margin-top:28px;font-size:28px;font-weight:650}.web-buy .buy-primary{display:flex;align-items:center;justify-content:center;background:var(--buy-blue);color:#fff;border-radius:999px;padding:13px 25px;min-height:48px;font-size:15px;transition:background .18s;white-space:nowrap}.web-buy .buy-primary:hover:not([disabled]){background:#0077ed}.buy-summary .buy-primary{width:100%;margin-top:24px}.buy-notice{display:block;font-size:13px;margin-top:14px;color:var(--buy-blue)}
.buy-details{padding:75px 0;background:#f5f5f7;scroll-margin-top:85px}.buy-section-title{display:block;font-size:clamp(30px,3vw,44px);line-height:1.2;font-weight:650;letter-spacing:-.025em}.buy-parameter-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:32px 48px;margin-top:46px}.buy-parameter-grid>view{display:flex;flex-direction:column;gap:13px;border-top:1px solid #d2d2d7;padding-top:22px}.buy-parameter-grid text:first-child{font-size:14px;color:var(--buy-muted)}.buy-parameter-grid text:last-child{font-size:20px;font-weight:600}.buy-story{margin-top:80px}.buy-story image{display:block;width:100%;margin-top:35px;border-radius:20px}
.buy-bottom{position:fixed;bottom:0;left:0;right:0;z-index:15;background:rgba(255,255,255,.94);backdrop-filter:blur(20px);border-top:1px solid #d2d2d7;padding:18px 0 calc(18px + env(safe-area-inset-bottom))}.buy-bottom>.buy-width{display:flex;align-items:center;justify-content:space-between;gap:20px}.buy-bottom>.buy-width>view:first-child{display:flex;flex-direction:column;gap:6px;max-width:60%}.buy-bottom text{font-size:17px;font-weight:600}.buy-bottom>.buy-width>view:first-child>text:last-child{font-size:12px;font-weight:400;color:var(--buy-muted)}.buy-bottom-actions{display:flex;align-items:center;gap:30px}.buy-state{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;min-height:65vh;padding:40px 24px;text-align:center;color:var(--buy-muted)}.buy-state-title{font-size:28px;color:var(--buy-ink)}.web-buy .buy-text-link{color:var(--buy-blue);font-size:14px;padding:10px}
@keyframes buy-reveal{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@media(min-width:1800px){.buy-width{max-width:1520px}.buy-layout{grid-template-columns:minmax(0,1.8fr) minmax(360px,1fr)}}
@media(max-width:900px){.buy-width{width:calc(100% - 48px)}.buy-heading{padding:40px 0 32px;display:block}.buy-heading-price{margin-top:22px;text-align:left}.buy-layout{grid-template-columns:1fr;gap:36px}.buy-gallery-sticky{position:static}.buy-image-stage{height:450px}.buy-configuration{max-width:560px;width:100%;margin:auto}.buy-parameter-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.buy-local-nav>.buy-width{gap:15px}.buy-local-nav text{font-size:15px}.buy-local-nav view>view{gap:14px}}
@media(max-width:520px){.buy-width{width:calc(100% - 40px)}.buy-local-nav .buy-button{font-size:11px}.buy-local-nav .buy-button:nth-child(2){display:none}.buy-title{font-size:34px}.buy-image-stage{height:330px;padding:16px;border-radius:18px}.buy-step-title{font-size:24px}.buy-description{font-size:15px}.buy-bottom>.buy-width>view:first-child{display:none}.buy-bottom-actions{width:100%;justify-content:space-between;gap:14px}.buy-bottom-actions>text{font-size:18px}.buy-details{padding:50px 0}.buy-parameter-grid{gap:24px}.buy-summary{padding:25px}.buy-option-price{max-width:100px}.buy-local-nav text{max-width:50%;font-size:13px}}
@media(prefers-reduced-motion:reduce){.buy-image-stage image{animation:none}.web-buy .buy-button{transition:none}}
</style>
