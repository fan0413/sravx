<template>
  <!-- #ifdef H5 -->
  <scroll-view scroll-y class="h5-shop">
    <SravxH5GlobalNav />
    <sravx-page-back />
    <view v-if="loading" class="h5-state">正在准备产品目录</view>
    <view v-else-if="catalogError" class="h5-state"><text>{{ catalogError }}</text><button @click="load">重新加载</button></view>
    <template v-else>
      <view class="h5-shop-head"><text class="h5-eyebrow">SRAVX PROFESSIONAL TOOLS</text><text>{{ h5CatalogTitle }}</text><text>按系列、用途与工作节奏，找到适合你的工具。</text></view>
      <view class="h5-category-band"><view class="h5-category-shell">
      <button v-if="categoryCanLeft" class="h5-category-arrow h5-category-prev" aria-label="上一组分类" @click="scrollCategories(-1)"><text>‹</text></button>
      <view ref="categoryViewport" class="h5-series-scroll" @scroll="measureCategories">
        <view v-if="['basic', 'pro', 'master'].includes(activeSeries)" class="h5-series-track">
          <view v-for="tool in toolGroups.filter(item => item.key !== 'all')" :key="tool.key" class="h5-series-item" :class="{ 'h5-series-active': activeToolGroup === tool.key }" @click="selectGroup(activeToolGroup === tool.key ? 'all' : tool.key)">
            <view class="h5-series-image"><image src="/static/navigation/sravx-mark.png" mode="aspectFit" /></view>
            <text>{{ tool.label }}</text>
          </view>
        </view>
        <view v-else class="h5-series-track">
          <view v-for="item in seriesCards.filter(item => activeSeries === 'all' || item.key === activeSeries)" :key="item.key" class="h5-series-item" @click="selectH5Series(item.key)">
            <view class="h5-series-image"><image :src="item.coverImage" mode="aspectFit" /></view><text>{{ item.label }}</text><text class="h5-series-caption">{{ item.material }}</text>
          </view>
        </view>
      </view>
      <button v-if="categoryCanRight" class="h5-category-arrow h5-category-next" aria-label="下一组分类" @click="scrollCategories(1)"><text>›</text></button>
      </view></view>
      <view class="h5-explore">
        <text>{{ activeSeries === 'all' ? '探索产品系列。' : '探索' + h5CatalogTitle + '。' }}</text>
        <view v-if="activeSeries === 'all'" class="h5-filter-row"><button v-for="item in h5SeriesFilters" :key="item.key" :class="{ active: activeSeries === item.key }" @click="selectH5Series(item.key)">{{ item.label }}</button></view>
        <view v-if="catalogCards.length" ref="lineupViewport" class="h5-lineup-scroll" @scroll="measureLineup">
          <view class="h5-lineup-track">
            <view v-for="card in catalogCards" :key="card.key" class="h5-lineup-card">
              <view class="h5-lineup-image"><image :src="card.image" mode="aspectFit" /></view>
              <view class="h5-lineup-copy">
                <text class="h5-lineup-series">{{ h5CatalogTitle }}</text>
                <text class="h5-lineup-name">{{ card.label }}</text>
                <text class="h5-lineup-description">{{ card.description }}</text>
                <button class="h5-lineup-action" @click="buyCategory(card.key)">购买 <text>›</text></button>
              </view>
            </view>
          </view>
        </view>
        <view v-if="catalogCards.length" class="h5-lineup-controls">
          <button :disabled="!lineupCanLeft" aria-label="上一组卡片" @click="scrollLineup(-1)"><view class="h5-page-chevron h5-page-chevron-left" /></button>
          <button :disabled="!lineupCanRight" aria-label="下一组卡片" @click="scrollLineup(1)"><view class="h5-page-chevron" /></button>
        </view>
        <template v-if="visibleProducts.length">
          <view class="h5-catalog-title"><text>{{ displayTitle }}</text><text>{{ visibleProducts.length }} 件产品</text></view>
          <scroll-view scroll-x class="h5-product-scroll"><view class="h5-product-track"><view v-for="item in visibleProducts" :key="item.id" class="h5-product-card" @click="detail(item.id)"><view class="h5-product-image"><image :src="item.image" mode="aspectFit" /></view><view class="h5-product-copy"><text>{{ item.categoryName }}</text><text>{{ item.displayName }}</text><text>{{ item.display_price_text }}</text><text>查看详情 <text>›</text></text></view></view></view></scroll-view>
        </template>
        <view v-else-if="!catalogCards.length" class="h5-state">该分类暂未上架商品</view>
      </view>
    </template>
    <view class="h5-footer">产品信息与服务内容以官方最终发布页面为准。</view>
  </scroll-view>
  <!-- #endif -->

  <!-- #ifndef H5 -->
  <scroll-view scroll-y class="page">
    <sravx-page-back mode="safe" />
    <view v-if="loading" class="state">正在准备产品目录</view>
    <template v-else-if="viewMode==='series'">
      <view class="intro"><text>选购 Sravx</text><text class="ui-small">从适合您的专业系列开始</text></view>
      <scroll-view scroll-x class="horizontal"><view class="series-row"><view v-for="item in seriesCards" :key="item.key" class="series-card" @click="selectSeries(item.key)"><image :src="item.coverImage" mode="aspectFill"/><view class="copy"><text class="material">{{item.material}}</text><text class="name">{{item.label}} 系列</text><text class="ui-small">{{item.caption}}</text><text class="ui-small">{{item.productCount}} 件产品</text></view><view class="series-action">查看系列</view></view></view></scroll-view>
      <view class="explore"><text>深入探索</text><view class="explore-card" @click="exploreAll"><view class="grid-icon"/><view><text>按用途浏览全部工具</text><text class="ui-small">直剪、弯剪、造型剪与配件</text></view><view class="arrow"/></view></view>
    </template>
    <template v-else>
      <view class="intro catalog"><text>{{seriesTitle}}</text><text class="ui-small">{{seriesMaterial}}</text></view>
      <view v-if="toolGroups.length" class="tools">
        <text>按用途选</text>
        <scroll-view scroll-x :show-scrollbar="false" scroll-with-animation :scroll-into-view="'tool-' + activeToolGroup" class="horizontal tool-scroll">
          <view class="chips tool-chips">
            <view v-for="item in toolGroups" :id="'tool-' + item.key" :key="item.key" class="chip tool-chip" :class="{active:activeToolGroup===item.key}" @click="selectGroup(item.key)">{{item.label}}</view>
          </view>
        </scroll-view>
      </view>
      <view class="catalog-head"><text>{{displayTitle}}</text><text class="ui-small">{{visibleProducts.length}} 件</text></view>
      <view v-if="!visibleProducts.length" class="state">该分类暂未上架商品</view><view v-else class="grid"><view v-for="item in visibleProducts" :key="item.id" class="product" @click="detail(item.id)"><image :src="item.image" mode="aspectFill"/><view><text class="ui-small">{{item.categoryName}}</text><text>{{item.displayName}}</text></view></view></view>
    </template>
    <view class="bottom-space"/>
  </scroll-view>
  <!-- #endif -->
</template>

<script>
import SravxPageBack from '../../components/sravx-page-back/sravx-page-back.vue'

import api from '../../common/api.js'
import SravxH5GlobalNav from '../../components/SravxH5GlobalNav.vue'
// #ifdef H5
import { catalogRoute } from '../../common/catalog-route.mjs'
// #endif
import { productClassification } from '../../common/product-classification.mjs'
const SERIES=[{key:'all',label:'全部工具',material:'专业工具目录',caption:'按用途浏览'},{key:'basic',label:'Basic',material:'9Cr',caption:'入门专业款'},{key:'pro',label:'Pro',material:'440C',caption:'专业主力款'},{key:'master',label:'Master',material:'VG10',caption:'高阶专业款'},{key:'accessories',label:'配件',material:'收纳与养护',caption:'专业工作配套'}]
const GROUPS=[{key:'all',label:'全部'},{key:'straight',label:'直剪'},{key:'curved',label:'弯剪'},{key:'thinning',label:'牙剪'},{key:'fishbone',label:'鱼骨剪'},{key:'texturizing',label:'造型剪'},{key:'accessories',label:'套装与配件'},{key:'other',label:'其他工具'}]
const SERIES_GROUPS=['all','straight','curved','thinning','fishbone','texturizing']
const SERIES_TOOL_TYPES=[{key:'straight',label:'直剪'},{key:'curved',label:'弯剪'},{key:'thinning',label:'牙剪'},{key:'fishbone',label:'鱼骨剪'},{key:'texturizing',label:'造型剪'}]
function group(value=''){return productClassification(typeof value==='string'?{name:value}:value).tool}
function match(product,series){return series==='all'||productClassification(product).series===series}
function all(sections,categories){const seen=new Set(),out=[];(sections||[]).forEach(section=>{(section.products||[]).forEach(item=>{if(seen.has(String(item.id)))return;seen.add(String(item.id));out.push({...item,series:productClassification(item,categories).series,categoryId:section.id,categoryName:section.name,displayName:item.short_name||item.name||'未命名商品',image:api.productImage(item)||'/static/navigation/sravx-mark.png'})})});return out}
const catalogView = {
  // #ifdef H5
  mounted() {
    this.catalogHashListener = () => this.applyCatalogRoute()
    window.addEventListener('hashchange', this.catalogHashListener)
    this.applyCatalogRoute()
  },
  onShow() { this.applyCatalogRoute() },
  // #endif
  data() { return { categoryCanLeft: false, categoryCanRight: false, lineupCanLeft: false, lineupCanRight: false } },
  updated() {
    this.measureCategories()
    this.measureLineup()
    const viewport = this.categoryElement()
    if (viewport && !this.categoryResizeObserver && typeof ResizeObserver !== 'undefined') {
      this.categoryResizeObserver = new ResizeObserver(() => this.measureCategories())
      this.categoryResizeObserver.observe(viewport)
    }
    const lineup = this.lineupElement()
    if (lineup && !this.lineupResizeObserver && typeof ResizeObserver !== 'undefined') {
      this.lineupResizeObserver = new ResizeObserver(() => this.measureLineup())
      this.lineupResizeObserver.observe(lineup)
    }
  },
  beforeUnmount() {
    if (this.categoryResizeObserver) this.categoryResizeObserver.disconnect()
    if (this.lineupResizeObserver) this.lineupResizeObserver.disconnect()
    // #ifdef H5
    window.removeEventListener('hashchange', this.catalogHashListener)
    // #endif
  },
  watch: {
    activeSeries() { this.$nextTick(() => { const viewport = this.categoryElement(); if (viewport) viewport.scrollLeft = 0; this.measureCategories() }) }
  },
  methods: {
    // #ifdef H5
    applyCatalogRoute() {
      const route = catalogRoute(window.location.hash)
      if (!route) return
      this.viewMode = 'catalog'
      this.activeSeries = route.series
      this.activeToolGroup = route.tool
      this.activeSubCategory = 'all'
    },
    // #endif
    buyCategory(tool) {
      const query = '?series=' + encodeURIComponent(this.activeSeries) + '&tool=' + encodeURIComponent(tool)
      if (typeof window !== 'undefined') window.location.hash = '#/pages/purchase/index' + query
    },
    lineupElement() { const ref = this.$refs.lineupViewport; return ref && (ref.$el || ref) },
    measureLineup() {
      const viewport = this.lineupElement()
      if (!viewport) { this.lineupCanLeft = false; this.lineupCanRight = false; return }
      this.lineupCanLeft = viewport.scrollLeft > 2
      this.lineupCanRight = viewport.scrollWidth - viewport.clientWidth - viewport.scrollLeft > 2
    },
    scrollLineup(direction) {
      const viewport = this.lineupElement()
      if (viewport) viewport.scrollBy({ left: direction * viewport.clientWidth * .8, behavior: 'smooth' })
    },
    categoryElement() { const ref = this.$refs.categoryViewport; return ref && (ref.$el || ref) },
    measureCategories() {
      const viewport = this.categoryElement()
      if (!viewport) return
      this.categoryCanLeft = viewport.scrollLeft > 2
      this.categoryCanRight = viewport.scrollWidth - viewport.clientWidth - viewport.scrollLeft > 2
    },
    scrollCategories(direction) {
      const viewport = this.categoryElement()
      if (viewport) viewport.scrollBy({ left: direction * viewport.clientWidth * .8, behavior: 'smooth' })
    }
  },
  computed: {
    catalogCards() {
      if (this.activeSeries === 'accessories') return []
      const descriptions = { straight: '用于平整修剪与基础轮廓整理。', curved: '用于弧形轮廓与圆润线条修剪。', thinning: '用于毛量调整与自然过渡。', fishbone: '探索鱼骨剪型与对应工具。', texturizing: '探索细节处理与造型工具。' }
      return SERIES_TOOL_TYPES.filter(tool => this.activeToolGroup === 'all' || tool.key === this.activeToolGroup).map(tool => {
        const product = this.allProducts.find(item => match(item, this.activeSeries) && group(item) === tool.key)
        return { ...tool, image: product ? product.image : '/static/navigation/sravx-mark.png', description: descriptions[tool.key] }
      })
    }
  }
}
export default{mixins:[catalogView],components:{ SravxPageBack, SravxH5GlobalNav},data(){return{categories:[],sections:[],viewMode:'series',activeToolGroup:'all',activeSubCategory:'all',activeSeries:'all',loading:true,catalogError:''}},computed:{allProducts(){return all(this.sections,this.categories)},toolGroups(){if(['basic','pro','master'].includes(this.activeSeries))return GROUPS.filter(item=>SERIES_GROUPS.includes(item.key));if(this.activeSeries==='accessories')return[];const keys=new Set(this.allProducts.map(product=>group(product)));return GROUPS.filter(item=>item.key==='all'||keys.has(item.key))},subCategories(){if(this.activeToolGroup==='all')return[];const names=this.sections.filter(section=>group(section.name)===this.activeToolGroup).map(section=>({id:section.id,name:section.name}));return[{id:'all',name:'全部'+((this.toolGroups.find(item=>item.key===this.activeToolGroup)||{}).label||'')},...names]},seriesCards(){return SERIES.filter(item=>item.key!=='all').map(item=>{const found=this.allProducts.filter(product=>match(product,item.key));return{...item,toolTypes:['basic','pro','master'].includes(item.key)?SERIES_TOOL_TYPES:null,coverImage:(found[0]&&found[0].image)||'/static/navigation/sravx-mark.png',productCount:found.length}})},h5SeriesFilters(){return SERIES},h5CatalogTitle(){const series=(SERIES.find(item=>item.key===this.activeSeries)||{}).label||'';return this.activeSeries==='all'?'SRAVX':'SRAVX '+series},visibleProducts(){return this.allProducts.filter(item=>match(item,this.activeSeries)&&(this.activeToolGroup==='all'||group(item)===this.activeToolGroup)&&(this.activeSubCategory==='all'||String(item.categoryId)===String(this.activeSubCategory)))},displayTitle(){const series=(SERIES.find(item=>item.key===this.activeSeries)||{}).label||'',groupLabel=(this.toolGroups.find(item=>item.key===this.activeToolGroup)||{}).label||'全部';return this.activeSeries==='all'?groupLabel+'专业工具':series+' · '+groupLabel},seriesTitle(){return this.activeSeries==='all'?'全部专业工具':((SERIES.find(item=>item.key===this.activeSeries)||{}).label+' 系列')},seriesMaterial(){const item=SERIES.find(series=>series.key===this.activeSeries);return item?item.material+' · '+item.caption:'按用途选择专业工具'}},onLoad(query){if(query.series&&SERIES.some(item=>item.key===query.series)){this.viewMode='catalog';this.activeSeries=query.series}this.load()},methods:{async load(){this.loading=true;this.catalogError='';try{const categories=api.asList(await api.getCategoryList());this.categories=categories;this.sections=await Promise.all(categories.map(async category=>({id:category.id,name:category.name,products:api.asList(await api.getAllProducts({categoryId:category.id}))})))}catch(error){this.catalogError=error.message||'商品目录加载失败，请重试';uni.showToast({title:this.catalogError,icon:'none'})}finally{this.loading=false}},selectSeries(key){this.viewMode='catalog';this.activeSeries=key;this.activeToolGroup='all';this.activeSubCategory='all'},selectH5Series(key){this.activeSeries=key;this.activeToolGroup='all';this.activeSubCategory='all';this.syncH5Route()},selectH5SeriesTool(series,tool){this.activeSeries=series;this.activeToolGroup=tool;this.activeSubCategory='all';this.syncH5Route()},exploreAll(){this.selectSeries('all')},selectGroup(key){this.activeToolGroup=key;this.activeSubCategory='all'},syncH5Route(){if(typeof window==='undefined')return;const suffix=this.activeSeries==='all'?'':'?series='+encodeURIComponent(this.activeSeries);window.history.replaceState(null,'','#/pages/shop/index'+suffix)},detail(id){if(typeof window!=='undefined'){window.location.hash='#/pages/product-detail/index?id='+encodeURIComponent(id);return}uni.navigateTo({url:'/pages/product-detail/index?id='+encodeURIComponent(id)})}}}
</script>

<style>
.h5-shop{height:100vh;background:#f5f5f7;color:#1d1d1f;font-family:"SF Pro Display","PingFang SC","Microsoft YaHei",sans-serif}.h5-global-nav{position:sticky;top:0;z-index:20;background:rgba(0,0,0,.9);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}.h5-global-nav-inner{display:flex;align-items:center;justify-content:space-between;max-width:1120px;min-height:48px;margin:0 auto;padding:0 24px}.h5-global-brand{display:flex;align-items:center;gap:8px;color:#fff;font-size:14px;font-weight:700;letter-spacing:.12em;text-decoration:none}.h5-global-brand image{width:25px;height:25px;filter:invert(1)}.h5-global-links{display:flex;align-items:center;gap:22px}.h5-global-links navigator{padding:15px 5px;color:#f5f5f7;font-size:13px;line-height:18px;text-decoration:none}.h5-global-links navigator:hover,.h5-global-links .is-active{color:#2997ff}.h5-global-login{padding:9px 17px;border-radius:999px;background:#0071e3;color:#fff;font-size:13px;font-weight:600;line-height:18px;text-decoration:none;box-shadow:0 5px 16px rgba(0,113,227,.25)}.h5-global-login:hover{background:#147ce5}.h5-shop-head{display:flex;flex-direction:column;max-width:1120px;margin:0 auto;padding:100px 24px 48px}.h5-shop-head text:nth-child(1){color:#0071e3;font-size:12px;font-weight:700;letter-spacing:.12em}.h5-shop-head text:nth-child(2){margin-top:12px;font-size:clamp(48px,6vw,80px);font-weight:700;letter-spacing:-.065em}.h5-shop-head text:nth-child(3){max-width:430px;margin-top:14px;color:#6e6e73;font-size:18px;line-height:1.5}.h5-series-scroll{white-space:nowrap;background:#fff}.h5-series-track{display:flex;gap:34px;width:max-content;min-width:100%;padding:30px max(24px,calc((100vw - 1120px)/2)) 35px}.h5-series-item{display:flex;flex-direction:column;align-items:center;width:112px;gap:7px;color:#424245;text-align:center;cursor:pointer}.h5-series-item:hover,.h5-series-active{color:#0071e3}.h5-series-image{display:flex;align-items:center;justify-content:center;width:100px;height:76px}.h5-series-image image{width:100%;height:100%}.h5-series-item text:nth-child(2){font-size:13px;font-weight:600}.h5-series-item text:nth-child(3){color:#86868b;font-size:11px}.h5-explore{padding:100px max(24px,calc((100vw - 1120px)/2)) 112px}.h5-explore>text:first-child{display:block;font-size:clamp(38px,4vw,58px);font-weight:700;letter-spacing:-.06em}.h5-filter-row,.h5-tools-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:30px}.h5-filter-row button,.h5-tools-row button{padding:10px 18px;border:0;border-radius:999px;background:#e8e8ed;color:#424245;font-size:14px;cursor:pointer}.h5-filter-row button.active,.h5-tools-row button.active{background:#1d1d1f;color:#fff}.h5-tools-row{margin-top:12px}.h5-tools-row button{background:transparent;box-shadow:inset 0 0 0 1px #d2d2d7}.h5-tools-row button.active{background:#fff;color:#1d1d1f;box-shadow:inset 0 0 0 1px #1d1d1f}.h5-catalog-title{display:flex;align-items:baseline;justify-content:space-between;margin-top:66px}.h5-catalog-title text:first-child{font-size:30px;font-weight:700;letter-spacing:-.04em}.h5-catalog-title text:last-child{color:#6e6e73;font-size:14px}.h5-product-scroll{margin-top:24px;white-space:nowrap}.h5-product-track{display:flex;gap:18px;width:max-content;padding-bottom:20px}.h5-product-card{width:min(330px,78vw);overflow:hidden;border-radius:18px;background:#fff;white-space:normal;cursor:pointer}.h5-product-image{display:flex;align-items:center;justify-content:center;height:300px;background:#fff}.h5-product-image image{width:91%;height:91%;transition:transform .35s cubic-bezier(.16,1,.3,1)}.h5-product-card:hover .h5-product-image image{transform:scale(1.045)}.h5-product-copy{display:flex;flex-direction:column;gap:6px;padding:21px 22px 24px;border-top:1px solid #f0f0f2}.h5-product-copy text:first-child{color:#6e6e73;font-size:12px}.h5-product-copy text:nth-child(2){font-size:19px;font-weight:650}.h5-product-copy text:last-child{margin-top:7px;color:#0071e3;font-size:14px}.h5-state{padding:130px 24px;text-align:center;color:#6e6e73;font-size:15px}.h5-footer{padding:30px 24px;background:#fff;color:#6e6e73;font-size:12px;text-align:center}
.page{height:100vh;background:#F4F6F8}.intro{padding:54rpx 32rpx 38rpx;display:flex;flex-direction:column;gap:15rpx}.intro text{font-size:56rpx;line-height:1.08;font-weight:720}.intro .ui-small,.copy .ui-small{color:#636366;font-size:27rpx}.horizontal{white-space:nowrap}.series-row,.chips{display:flex;gap:20rpx;padding:0 28rpx}.series-card{width:620rpx;overflow:hidden;flex:none;border-radius:34rpx;background:#fff;white-space:normal;box-shadow:0 14rpx 36rpx rgba(29,29,31,.08)}.series-card image{width:620rpx;height:390rpx;background:#E9EDF2}.copy{min-height:210rpx;padding:30rpx 32rpx 24rpx;display:flex;flex-direction:column;gap:12rpx}.material,.product .ui-small{color:#69727E;font-size:21rpx;font-weight:700}.name{font-size:43rpx;font-weight:720}.series-action{padding:34rpx;text-align:center;border-top:1rpx solid #DCE2E9;background:#F4F7FA;font-size:28rpx;font-weight:650}.explore{padding:52rpx 28rpx}.explore>text{display:block;margin-bottom:24rpx;font-size:42rpx;font-weight:720}.explore-card{display:flex;align-items:center;gap:22rpx;padding:28rpx;border-radius:28rpx;background:#fff}.grid-icon{width:58rpx;height:58rpx;border:3rpx solid #AEB7C3;border-radius:12rpx}.explore-card view:nth-child(2){display:flex;flex:1;flex-direction:column;gap:9rpx}.explore-card view:nth-child(2) text{font-size:30rpx;font-weight:650}.arrow{width:16rpx;height:16rpx;border-right:2rpx solid #c7c7cc;border-bottom:2rpx solid #c7c7cc;transform:rotate(-45deg)}.back{padding:26rpx 32rpx 10rpx;color:#0B0D10;font-size:27rpx}.catalog{padding-bottom:40rpx}.tools>text{display:block;padding:0 32rpx 20rpx;font-size:32rpx;font-weight:700}.chips{gap:14rpx}.chip{padding:17rpx 24rpx;border-radius:99rpx;background:#fff;color:#636366;font-size:25rpx}.active{background:#0B0D10;color:#fff;font-weight:650}.sub{padding-top:18rpx}.sub-chip{padding:13rpx 20rpx;border:1rpx solid #d7d7dc;background:transparent;font-size:23rpx}.activeSub{border-color:#0B0D10;background:#F4F7FA;color:#0B0D10}.catalog-head{display:flex;justify-content:space-between;padding:54rpx 32rpx 22rpx}.catalog-head text{font-size:40rpx;font-weight:720}.catalog-head .ui-small{color:#636366}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18rpx;padding:0 28rpx}.product{overflow:hidden;border-radius:26rpx;background:#fff;box-shadow:0 10rpx 28rpx rgba(29,29,31,.06)}.product image{width:100%;height:310rpx;background:#E9EDF2}.product view{min-height:126rpx;padding:20rpx;display:flex;flex-direction:column;gap:8rpx}.product text{font-size:27rpx;font-weight:650}.state{padding:120rpx 40rpx;text-align:center;color:#636366;font-size:27rpx}.bottom-space{height:240rpx}
@media(max-width:760px){.h5-shop-head{padding:68px 20px 34px}.h5-shop-head text:nth-child(2){font-size:52px}.h5-series-track{gap:16px;padding:25px 20px}.h5-series-item{width:94px}.h5-series-image{width:84px;height:64px}.h5-explore{padding:66px 20px 80px}.h5-catalog-title{margin-top:48px}.h5-product-card{width:278px}.h5-product-image{height:248px}.h5-global-nav-inner{padding:0 17px}.h5-global-links{gap:8px}.h5-global-links navigator{font-size:12px}.h5-global-login{padding:8px 13px}}
.h5-series-item{width:168px}.h5-series-item>text:nth-child(2){font-size:13px;font-weight:600}.h5-series-types{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 8px;max-width:168px}.h5-series-types button{margin:0;padding:0;border:0;background:transparent;color:#6e6e73;font-size:11px;line-height:1.45;cursor:pointer}.h5-series-types button:hover{color:#0071e3}.h5-series-caption{color:#86868b;font-size:11px}@media(max-width:760px){.h5-series-item{width:148px}.h5-series-types{max-width:148px}}
.h5-lineup-scroll{margin-top:48px;white-space:nowrap}.h5-lineup-track{display:flex;gap:24px;width:max-content;padding:0 0 24px}.h5-lineup-card{flex:none;width:340px;white-space:normal;text-align:center}.h5-lineup-image{display:flex;align-items:center;justify-content:center;height:260px;border-radius:24px;background:#fff;overflow:hidden}.h5-lineup-image image{width:85%;height:85%;transition:transform .4s ease}.h5-lineup-card:hover image{transform:scale(1.04)}.h5-lineup-copy{display:flex;flex-direction:column;align-items:center;padding:26px 16px 8px}.h5-lineup-series{color:#6e6e73;font-size:12px;letter-spacing:.06em}.h5-lineup-name{margin-top:10px;font-size:28px;font-weight:650;letter-spacing:-.03em}.h5-lineup-description{min-height:44px;margin-top:10px;color:#6e6e73;font-size:15px;line-height:1.5}.h5-lineup-action{display:inline-flex;align-items:center;justify-content:center;gap:8px;width:auto;margin:28px 0 0;padding:12px 22px;border:0;border-radius:999px;background:#0071e3;color:#fff;font-size:14px;line-height:20px;cursor:pointer}.h5-lineup-action::after{display:none}.h5-lineup-action:hover{background:#147ce5}.h5-tools-row button{flex:none;margin:0}.h5-tools-row button::after{display:none}@media(max-width:760px){.h5-lineup-card{width:280px}.h5-lineup-image{height:230px}.h5-lineup-track{gap:18px}}
.h5-category-band{background:#fff}.h5-category-shell{position:relative;max-width:1168px;margin:0 auto;padding:0 40px;box-sizing:border-box}.h5-category-shell .h5-series-scroll{overflow-x:auto;scrollbar-width:none;-ms-overflow-style:none}.h5-category-shell .h5-series-scroll::-webkit-scrollbar{display:none}.h5-category-shell .h5-series-track{min-width:0;width:max-content;gap:34px;padding:30px 0 35px}.h5-category-shell .h5-series-item{flex:none}.h5-category-arrow{position:absolute;top:0;bottom:0;z-index:2;display:flex;align-items:center;justify-content:center;width:32px;margin:0;padding:0;border:0;border-radius:0;background:#fff;color:#6e6e73;font-size:32px;line-height:1;cursor:pointer}.h5-category-arrow::after{display:none}.h5-category-arrow:hover{color:#1d1d1f}.h5-category-prev{left:0}.h5-category-next{right:0}@media(max-width:760px){.h5-category-shell{padding:0 32px}.h5-category-shell .h5-series-track{gap:16px;padding:25px 0}.h5-category-arrow{width:26px}}
.h5-lineup-scroll{overflow-x:auto;margin-left:calc(24px - max(24px, (100vw - 1120px)/2));margin-right:calc(24px - max(24px, (100vw - 1120px)/2));scrollbar-width:none;scroll-snap-type:x proximity}.h5-lineup-scroll::-webkit-scrollbar{display:none}.h5-lineup-track{gap:22px}.h5-lineup-card{width:clamp(260px,18vw,360px);scroll-snap-align:start}.h5-lineup-image{height:clamp(230px,15vw,290px)}.h5-lineup-controls{display:flex;justify-content:flex-end;gap:12px;margin-top:18px}.h5-lineup-controls button{display:flex;align-items:center;justify-content:center;flex:none;width:40px;height:40px;margin:0;padding:0;border:0;border-radius:50%;background:#e8e8ed;color:#6e6e73;font-size:30px;line-height:1;cursor:pointer}.h5-lineup-controls button::after{display:none}.h5-lineup-controls button:disabled{opacity:.35;cursor:default}.h5-lineup-controls button:not(:disabled):hover{background:#dcdce1;color:#1d1d1f}@media(max-width:760px){.h5-lineup-scroll{margin-left:0;margin-right:-20px}.h5-lineup-card{width:260px}.h5-lineup-track{gap:18px;padding-right:20px}}
.h5-lineup-controls{margin-top:32px}.h5-page-chevron{width:9px;height:9px;border-top:3px solid currentColor;border-right:3px solid currentColor;transform:translateX(-2px) rotate(45deg)}.h5-page-chevron-left{transform:translateX(2px) rotate(-135deg)}
.h5-lineup-controls{justify-content:center}
.tool-scroll{width:100%;white-space:nowrap}
.tool-chips{display:inline-flex;min-width:100%;box-sizing:border-box}
.tool-chip{flex:none;white-space:nowrap}
</style>
