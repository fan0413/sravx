<template>
  <view class="nav" @mouseleave="closeMenu">
    <view class="nav-inner">
      <view class="brand" @click="goHome"><image :src="brandMark" mode="aspectFit" /><text>SRAVX</text></view>
      <view class="nav-links"><button v-for="item in navigation" :key="item.id" class="nav-trigger" :class="{ 'nav-trigger-active': activeMenu === item.id }" @mouseenter="openMenu(item.id)" @focus="openMenu(item.id)">{{ item.label }}</button></view>
      <view class="nav-actions"><navigator class="nav-login" url="/pages/register/index?mode=login">登录</navigator></view>
    </view>
    <view v-if="activeMenu" class="mega-menu" @mouseenter="openMenu(activeMenu)">
      <view class="mega-inner">
        <view v-for="column in menus[activeMenu]" :key="column.title" class="mega-column">
          <text class="mega-kicker">{{ column.title }}</text>
          <button v-for="link in column.links" :key="link.label" class="mega-link" :class="{ 'mega-link-featured': link.featured }" @click="handleMenuLink(link)">{{ link.label }}<text v-if="link.featured">›</text></button>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import brandMark from '@/static/navigation/sravx-mark.png'

export default {
  data() {
    return {
      brandMark,
      activeMenu: null,
      navigation: [{ id: 'products', label: '产品' }, { id: 'craft', label: '理念' }, { id: 'service', label: '服务' }],
      menus: {
        products: [
          { title: '探索系列', links: [{ label: 'Basic 系列', series: 'basic', featured: true }, { label: 'Pro 系列', series: 'pro', featured: true }, { label: 'Master 系列', series: 'master', featured: true }, { label: '配件', shop: true, featured: true }] },
          { title: '按工具选择', links: [{ label: '直剪', shop: true }, { label: '弯剪', shop: true }, { label: '牙剪', shop: true }, { label: '专业配件', shop: true }] },
          { title: '选购支持', links: [{ label: '查看全部产品', shop: true, featured: true }, { label: '如何选择工具', section: 'craft' }] }
        ],
        craft: [
          { title: 'SRAVX 理念', links: [{ label: '为专业工作而造', section: 'product-intro', featured: true }, { label: '为细节而设计', section: 'craft' }] },
          { title: '专业场景', links: [{ label: '日常修剪', shop: true }, { label: '细节处理', shop: true }, { label: '工具组合', shop: true }] },
          { title: '了解品牌', links: [{ label: '探索 SRAVX', section: 'product-intro', featured: true }, { label: '查看产品系列', section: 'collection' }] }
        ],
        service: [
          { title: '工具支持', links: [{ label: '工具档案', section: 'service', featured: true }, { label: '售后服务说明', section: 'service' }] },
          { title: '品牌服务', links: [{ label: '专业支持', section: 'service', featured: true }, { label: '产品目录', shop: true }] },
          { title: '从这里开始', links: [{ label: '进入产品目录', shop: true, featured: true }, { label: '选择你的系列', section: 'collection' }] }
        ]
      }
    }
  },
  methods: {
    openMenu(id) { this.activeMenu = id },
    closeMenu() { this.activeMenu = null },
    handleMenuLink(link) {
      this.closeMenu()
      if (link.series) return this.goSeries(link.series)
      if (link.section) return this.goHome()
      return this.goShop()
    },
    goHome() {
      if (typeof window !== 'undefined') { window.location.hash = '#/pages/index/index'; return }
      uni.reLaunch({ url: '/pages/index/index' })
    },
    goShop() {
      if (typeof window !== 'undefined') { window.location.hash = '#/pages/shop/index'; return }
      uni.navigateTo({ url: '/pages/shop/index' })
    },
    goSeries(series) {
      if (typeof window !== 'undefined') { window.location.hash = '#/pages/shop/index?series=' + encodeURIComponent(series); return }
      uni.navigateTo({ url: '/pages/shop/index?series=' + series })
    }
  }
}
</script>

<style>
.nav{position:sticky;top:0;z-index:20;background:rgba(0,0,0,.88);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);color:#f5f5f7}.nav button,.mega-menu button{margin:0;border:0;background:none}.nav-inner{display:flex;align-items:center;justify-content:space-between;max-width:1120px;min-height:48px;margin:0 auto;padding:0 24px}.brand{display:flex;align-items:center;gap:8px;color:#fff;font-size:14px;font-weight:700;letter-spacing:.12em;cursor:pointer}.brand image{width:25px;height:25px;filter:invert(1)}.nav-links{display:flex;align-items:center;gap:22px}.nav-trigger{padding:15px 5px!important;color:#f5f5f7!important;font-size:13px;line-height:18px}.nav-trigger:hover,.nav-trigger-active{color:#2997ff!important}.nav-login{padding:9px 17px;border-radius:999px;background:#0071e3;color:#fff;font-size:13px;font-weight:600;line-height:18px;text-decoration:none;box-shadow:0 5px 16px rgba(0,113,227,.25)}.nav-login:hover{background:#147ce5}.mega-menu{position:absolute;top:48px;right:0;left:0;overflow:hidden;background:rgba(12,12,13,.98);border-top:1px solid rgba(255,255,255,.08);box-shadow:0 18px 42px rgba(0,0,0,.35)}.mega-inner{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:60px;max-width:920px;margin:0 auto;padding:38px 24px 42px}.mega-column{display:flex;flex-direction:column;align-items:flex-start;gap:11px}.mega-kicker{margin-bottom:7px;color:#86868b;font-size:12px}.mega-link{padding:0!important;color:#d2d2d7!important;font-size:14px;line-height:1.5;text-align:left}.mega-link-featured{color:#fff!important;font-size:23px;font-weight:600}.mega-link text{display:inline-block;margin-left:4px;color:#2997ff;opacity:0;transform:translateX(-6px);transition:opacity .18s ease,transform .18s ease}.mega-link:hover text{opacity:1;transform:translateX(0)}.nav-trigger,.mega-link{border:0!important;outline:0!important;background:transparent!important;box-shadow:none!important}.nav-trigger::after,.mega-link::after{display:none!important;border:0!important}@media(max-width:760px){.nav-inner{padding:0 17px}.nav-links{gap:8px}.nav-trigger{font-size:12px}.nav-login{padding:8px 13px}.mega-inner{grid-template-columns:1fr;gap:24px;padding:26px 24px}.mega-column{gap:8px}.mega-link-featured{font-size:20px}}
</style>
