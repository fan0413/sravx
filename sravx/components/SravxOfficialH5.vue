<template>
  <view class="official">
    <view v-if="showLanding" id="top" class="landing-welcome" :class="{ 'landing-fallback': landingFallback }" style="position:relative;display:flex;align-items:center;justify-content:center;min-height:100vh;overflow:hidden;background:#000;color:#f5f5f7;">
      <view class="landing-grain"></view><view class="landing-frost"></view>
      <view class="landing-word" aria-label="Hi, SRAVX" style="position:absolute;z-index:2;top:43%;left:50%;display:flex;color:#f5f5f7;font-family:Arial,sans-serif;font-size:clamp(48px,9vw,150px);font-style:italic;font-weight:300;letter-spacing:-.08em;"><text v-for="(letter, index) in welcomeLetters" :key="letter + '-' + index" class="landing-letter" :style="{ animationDelay: (index * 0.11) + 's' }">{{ letter }}</text></view>
      <image class="landing-logo" :src="brandMark" mode="aspectFit" style="position:absolute;top:22%;left:50%;z-index:3;width:126px;height:126px;filter:invert(1);opacity:1;transform:translateX(-50%);" />
      <view class="landing-copy" style="position:absolute;top:60%;left:50%;z-index:4;display:flex;flex-direction:column;align-items:center;gap:10px;color:rgba(245,245,247,.7);font-size:13px;letter-spacing:.08em;line-height:1.45;white-space:nowrap;transform:translateX(-50%);"><text>PROFESSIONAL GROOMING TOOLS</text><text>为新时代的工作方式而造</text></view>
      <button class="landing-enter" style="position:absolute;top:71%;left:50%;z-index:4;display:inline-flex;align-items:center;gap:16px;padding:12px 15px 12px 23px;border:1px solid #0071e3;border-radius:999px;background:#081a2c;color:#fff;opacity:1;transform:translateX(-50%);" @click="enterSite"><text>进入官网</text><view class="landing-enter-core"></view></button>
    </view>
    <view v-else class="site-page">
      <view id="top" class="nav" @mouseleave="closeMenu">
        <view class="nav-inner">
          <view class="brand" @click="scrollTo('product-intro')"><image :src="brandMark" mode="aspectFit" /><text>SRAVX</text></view>
          <view class="nav-links"><button v-for="item in navigation" :key="item.id" class="nav-trigger" :class="{ 'nav-trigger-active': activeMenu === item.id }" @mouseenter="openMenu(item.id)" @focus="openMenu(item.id)">{{ item.label }}</button></view>
          <view class="nav-actions"><navigator class="nav-login" url="/pages/register/index?mode=login">登录</navigator></view>
        </view>
        <view v-if="activeMenu" class="mega-menu" @mouseenter="openMenu(activeMenu)"><view class="mega-inner"><view v-for="column in menus[activeMenu]" :key="column.title" class="mega-column"><text class="mega-kicker">{{ column.title }}</text><button v-for="link in column.links" :key="link.label" class="mega-link" :class="{ 'mega-link-featured': link.featured }" @click="handleMenuLink(link)">{{ link.label }}<text v-if="link.featured">›</text></button></view></view></view>
      </view>
      <view id="product-intro" class="product-stage stage-pro">
        <view class="stage-copy reveal-ready"><text class="stage-kicker">SRAVX PRO SERIES</text><text class="stage-title">SRAVX Pro</text><text class="stage-subtitle">让判断，落在手上。</text><text class="stage-summary">为连续修剪与细节控制准备的专业工具系列。</text><view class="stage-actions"><button class="button-primary" @click="goSeries('pro')">进一步了解</button><button class="button-outline button-dark" @click="goShop">查看系列</button></view></view>
        <view class="pro-word" aria-hidden="true">PRO</view><image class="stage-product stage-product-pro reveal-ready" :src="heroImage" mode="aspectFit" />
      </view>
      <view id="collection" class="product-stage stage-air">
        <view class="stage-copy reveal-ready"><text class="stage-kicker">SRAVX AIR SERIES</text><text class="stage-title">SRAVX Air</text><text class="stage-subtitle">轻盈入手，专注不减。</text><text class="stage-summary">面向日常高频工作，保持清爽、直接的操作节奏。</text><view class="stage-actions"><button class="button-primary" @click="goSeries('basic')">进一步了解</button><button class="button-outline" @click="goShop">查看全部产品</button></view></view>
        <image class="stage-product stage-product-air reveal-ready" :src="thinningImage" mode="aspectFit" />
      </view>
      <view id="craft" class="series-grid">
        <view class="series-card series-master reveal-ready" @click="goSeries('master')"><text class="card-kicker">MASTER SERIES</text><text class="card-title">留给细节，更多余地。</text><text class="card-copy">针对需要耐心处理的修剪场景。</text><text class="card-link">进一步了解 <text>›</text></text><image :src="thinningImage" mode="aspectFit" /></view>
        <view id="service" class="series-card series-support reveal-ready" @click="goShop"><text class="card-kicker">TOOLS &amp; ACCESSORIES</text><text class="card-title">一套工具，匹配一段工作节奏。</text><text class="card-copy">直剪、弯剪、牙剪与专业配件，按你的实际需求组合。</text><text class="card-link">探索产品目录 <text>›</text></text><view class="support-mark"><image :src="brandMark" mode="aspectFit" /></view></view>
      </view>
      <view class="product-closing reveal-ready"><text class="stage-kicker">SRAVX PROFESSIONAL</text><text>下一把，属于你的工作方式。</text><button class="button-primary" @click="goShop">进入产品目录</button></view>
      <view class="footer"><view class="brand"><image :src="brandMark" mode="aspectFit" /><text>SRAVX</text></view><text>专业宠物美容工具</text><text>产品信息与服务内容以官方最终发布页面为准。</text></view>
    </view>
  </view>
</template>

<script>
import brandMark from '@/static/navigation/sravx-mark.png'
import heroImage from '@/static/official/hero-curved-scissor.png'
import thinningImage from '@/static/official/thinning-scissor.png'
export default {
  props: {
    startLanding: { type: Boolean, default: false }
  },
  data() {
    return {
      brandMark, heroImage, thinningImage, showLanding: this.startLanding, landingFallback: false, landingTimer: null, activeMenu: null, revealObserver: null,
      welcomeLetters: ['H', 'i', ',', ' ', 'S', 'R', 'A', 'V', 'X'],
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
  mounted() {
    if (!this.showLanding) { this.$nextTick(() => this.setupReveal()); return }
    this.landingTimer = setTimeout(() => { this.landingFallback = true }, 3200)
  },
  beforeUnmount() { if (this.revealObserver) this.revealObserver.disconnect(); if (this.landingTimer) clearTimeout(this.landingTimer) },
  methods: {
    enterSite() {
      if (this.landingTimer) clearTimeout(this.landingTimer)
      if (typeof window !== 'undefined') { window.location.replace('#/pages/index/index'); return }
      this.showLanding = false
      this.$nextTick(() => this.setupReveal())
    },
    setupReveal() {
      if (typeof window === 'undefined') return
      if (this.revealObserver) this.revealObserver.disconnect()
      const elements = document.querySelectorAll('.official .reveal-ready')
      const revealAll = () => elements.forEach((element) => element.classList.add('is-revealed'))
      if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { revealAll(); return }
      this.revealObserver = new IntersectionObserver((entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) { entry.target.classList.add('is-revealed'); this.revealObserver.unobserve(entry.target) }
      }), { rootMargin: '0px 0px -8% 0px', threshold: 0.12 })
      elements.forEach((element) => this.revealObserver.observe(element))
    },
    openMenu(id) { this.activeMenu = id },
    closeMenu() { this.activeMenu = null },
    handleMenuLink(link) { this.closeMenu(); if (link.series) return this.goSeries(link.series); if (link.section) return this.scrollTo(link.section); return this.goShop() },
    scrollTo(id) { uni.pageScrollTo({ selector: '#' + id, duration: 450 }) },
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
.official{min-height:100vh;background:#fff;color:#1d1d1f;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","PingFang SC","Microsoft YaHei",sans-serif}.official button{margin:0;border:0;background:none}.landing-welcome{position:relative;display:flex;align-items:center;justify-content:center;min-height:100vh;overflow:hidden;background:#000;color:#f5f5f7}.landing-grain{position:absolute;inset:0;background-image:radial-gradient(circle,rgba(255,255,255,.4) 0 .55px,transparent .7px);background-size:9px 9px;opacity:.06}.landing-frost{position:absolute;inset:0;background:radial-gradient(circle at 50% 42%,rgba(239,246,252,.12),transparent 31%),rgba(231,241,248,.07);backdrop-filter:blur(28px) saturate(120%);-webkit-backdrop-filter:blur(28px) saturate(120%);animation:frostOut 2.6s cubic-bezier(.16,1,.3,1) both}.landing-word{position:relative;z-index:2;display:flex;align-items:baseline;color:#f5f5f7;font-family:"Bahnschrift","Arial",sans-serif;font-size:clamp(108px,18vw,390px);font-style:italic;font-weight:300;letter-spacing:-.08em;transform:translate(-50%,-50%) translateY(7vh) scale(.43);animation:wordSettle 2.6s cubic-bezier(.16,1,.3,1) both}.landing-letter{display:inline-block;opacity:0;filter:blur(9px);transform:translate(-.11em,.09em) rotate(-5deg) skewX(-8deg);animation:letterIn .5s cubic-bezier(.16,1,.3,1) both}.landing-letter:nth-child(4){width:.22em}.landing-logo{position:absolute;top:calc(50% - clamp(150px,14vw,270px));left:50%;z-index:3;width:clamp(132px,12vw,230px);height:clamp(132px,12vw,230px);filter:invert(1);opacity:0;transform:translateX(-50%) scale(.82);animation:logoIn .55s cubic-bezier(.16,1,.3,1) 2.05s both}.landing-copy{position:absolute;top:70vh;left:50%;z-index:4;display:flex;flex-direction:column;align-items:center;gap:10px;color:rgba(245,245,247,.64);font-size:13px;letter-spacing:.08em;line-height:1.45;white-space:nowrap;transform:translateX(-50%);animation:riseIn .45s cubic-bezier(.16,1,.3,1) 2.13s both}.landing-copy text:first-child{color:#0071e3;font-size:11px;font-weight:600;letter-spacing:.15em}.landing-enter{position:absolute;top:80vh;left:50%;z-index:4;display:inline-flex;align-items:center;gap:20px;overflow:hidden;padding:12px 12px 12px 26px;border:1px solid rgba(0,113,227,.95)!important;border-radius:999px!important;background:rgba(0,113,227,.13)!important;color:#f5f5f7;font-size:14px;font-weight:600;letter-spacing:.12em;line-height:1;box-shadow:0 0 38px rgba(0,113,227,.24),inset 0 0 20px rgba(0,113,227,.10);transform:translateX(-50%);cursor:pointer;animation:riseIn .45s cubic-bezier(.16,1,.3,1) 2.25s both}.landing-enter::before{position:absolute;top:-70%;left:-65%;width:36%;height:240%;content:"";background:linear-gradient(90deg,transparent,rgba(255,255,255,.32),transparent);transform:rotate(22deg);animation:buttonSheen 3.8s cubic-bezier(.16,1,.3,1) infinite}.landing-enter>text,.landing-enter-core{position:relative;z-index:1}.landing-enter:hover{background:rgba(0,113,227,.28)!important;transform:translate(-50%,-2px)}.landing-enter-core{position:relative;width:42px;height:42px;border-radius:50%;background:#0071e3;box-shadow:0 0 0 5px rgba(0,113,227,.14),0 0 24px rgba(0,113,227,.7)}.landing-enter-core::before{position:absolute;top:50%;left:50%;width:9px;height:9px;content:"";border-top:2px solid #fff;border-right:2px solid #fff;transform:translate(-60%,-50%) rotate(45deg)}.landing-enter-core::after{position:absolute;inset:-8px;content:"";border:1px solid rgba(0,113,227,.68);border-radius:50%;animation:coreOrbit 2.1s linear infinite}@keyframes letterIn{0%{opacity:0;filter:blur(9px);transform:translate(-.11em,.09em) rotate(-5deg) skewX(-8deg)}100%{opacity:1;filter:none;transform:none}}@keyframes wordSettle{0%,57%{transform:translate(-50%,-50%) translateY(-1vh) scale(1)}100%{transform:translate(-50%,-50%) translateY(7vh) scale(.43)}}@keyframes frostOut{0%,62%{opacity:1}100%{opacity:0}}@keyframes logoIn{to{opacity:1;transform:translateX(-50%) scale(1)}}@keyframes riseIn{from{opacity:0;transform:translate(-50%,9px)}to{opacity:1;transform:translate(-50%,0)}}@keyframes coreOrbit{to{transform:scale(1.3);opacity:0}}@keyframes buttonSheen{0%,52%{opacity:0}57%{opacity:1}78%,100%{transform:translateX(460%) rotate(22deg);opacity:0}}
.site-page{background:#fff}.nav{position:sticky;top:0;z-index:20;background:rgba(0,0,0,.88);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);color:#f5f5f7}.nav-inner{display:flex;align-items:center;justify-content:space-between;max-width:1120px;min-height:48px;margin:0 auto;padding:0 24px}.brand{display:flex;align-items:center;gap:8px;color:#fff;font-size:14px;font-weight:700;letter-spacing:.12em;cursor:pointer}.brand image{width:25px;height:25px;filter:invert(1)}.nav-links{display:flex;align-items:center;gap:22px}.nav-trigger{padding:15px 5px!important;color:#f5f5f7!important;font-size:13px;line-height:18px}.nav-trigger:hover,.nav-trigger-active{color:#2997ff!important}.nav-login{padding:9px 17px;border-radius:999px;background:#0071e3;color:#fff;font-size:13px;font-weight:600;line-height:18px;text-decoration:none;box-shadow:0 5px 16px rgba(0,113,227,.25)}.nav-login:hover{background:#147ce5}.mega-menu{position:absolute;top:48px;right:0;left:0;overflow:hidden;background:rgba(12,12,13,.98);border-top:1px solid rgba(255,255,255,.08);box-shadow:0 18px 42px rgba(0,0,0,.35)}.mega-inner{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:60px;max-width:920px;margin:0 auto;padding:38px 24px 42px}.mega-column{display:flex;flex-direction:column;align-items:flex-start;gap:11px}.mega-kicker{margin-bottom:7px;color:#86868b;font-size:12px}.mega-link{padding:0!important;color:#d2d2d7!important;font-size:14px;line-height:1.5;text-align:left}.mega-link-featured{color:#fff!important;font-size:23px;font-weight:600}.mega-link text{display:inline-block;margin-left:4px;color:#2997ff;opacity:0;transform:translateX(-6px);transition:opacity .18s ease,transform .18s ease}.mega-link:hover text{opacity:1;transform:translateX(0)}
.nav-trigger{border:0!important;outline:0!important;background:transparent!important;box-shadow:none!important}.nav-trigger::after{display:none!important;border:0!important}
.product-stage{position:relative;display:flex;flex-direction:column;align-items:center;min-height:780px;overflow:hidden;text-align:center}.stage-pro{background:#000;color:#f5f5f7}.stage-air{min-height:740px;background:#f5f5f7;color:#1d1d1f}.stage-copy{position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;max-width:620px;padding:72px 24px 0}.stage-kicker,.card-kicker{color:#0071e3;font-size:13px;font-weight:700;letter-spacing:.11em}.stage-title{margin-top:9px;font-size:clamp(46px,5vw,72px);font-weight:700;letter-spacing:-.055em;line-height:1.02}.stage-subtitle{margin-top:7px;font-size:clamp(24px,2.3vw,34px);font-weight:500;letter-spacing:-.04em}.stage-summary{max-width:400px;margin-top:11px;color:#a1a1a6;font-size:16px;line-height:1.5}.stage-air .stage-summary{color:#6e6e73}.stage-actions{display:flex;gap:13px;margin-top:19px}.button-primary,.button-outline{min-height:39px;padding:10px 17px!important;border-radius:999px!important;font-size:14px;font-weight:600;line-height:19px}.button-primary{background:#0071e3!important;color:#fff!important}.button-primary:hover{background:#147ce5!important}.button-outline{border:1px solid #0071e3!important;color:#0071e3!important}.button-dark{border-color:#2997ff!important;color:#2997ff!important}.pro-word{position:absolute;top:255px;left:50%;z-index:0;color:transparent;font-size:clamp(170px,25vw,410px);font-weight:800;letter-spacing:-.12em;line-height:.85;-webkit-text-stroke:1px rgba(255,255,255,.21);transform:translateX(-50%)}.stage-product{position:absolute;bottom:0;left:50%;z-index:1;max-width:86%;transform:translateX(-50%)}.stage-product-pro{width:min(1060px,87vw);height:420px;filter:drop-shadow(0 18px 26px rgba(105,176,208,.18))}.stage-product-air{width:min(780px,74vw);height:370px;filter:drop-shadow(0 28px 24px rgba(0,0,0,.11))}.series-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:12px;background:#fff}.series-card{position:relative;display:flex;flex-direction:column;align-items:center;min-height:560px;overflow:hidden;padding:56px 30px 0;text-align:center;cursor:pointer}.series-master{background:#121214;color:#f5f5f7}.series-support{background:#f5f5f7;color:#1d1d1f}.series-card .card-title{max-width:440px;margin-top:10px;font-size:clamp(30px,3vw,44px);font-weight:700;letter-spacing:-.05em;line-height:1.08}.card-copy{max-width:330px;margin-top:10px;color:#86868b;font-size:15px;line-height:1.5}.card-link{position:relative;z-index:2;margin-top:17px;color:#2997ff;font-size:15px;font-weight:600}.series-card image{position:absolute;bottom:-33px;left:50%;width:86%;height:340px;transform:translateX(-50%)}.series-master image{filter:drop-shadow(0 20px 23px rgba(0,0,0,.55))}.support-mark{position:absolute;bottom:55px;left:50%;width:180px;height:180px;border-radius:50%;background:radial-gradient(circle,#fff 0 35%,#e3e8ec 70%,transparent 71%);transform:translateX(-50%)}.support-mark image{position:absolute;inset:38px;width:auto;height:auto;filter:none;transform:none}.product-closing{display:flex;flex-direction:column;align-items:center;gap:16px;padding:105px 24px;background:#fff;color:#1d1d1f;text-align:center}.product-closing>text:nth-child(2){font-size:clamp(34px,4vw,54px);font-weight:700;letter-spacing:-.05em}.footer{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:26px max(24px,calc((100vw - 1120px)/2));background:#f5f5f7;color:#6e6e73;font-size:12px}.footer .brand{color:#1d1d1f;font-size:12px}.footer .brand image{filter:none}.reveal-ready{opacity:0;transform:translateY(24px);transition:opacity .75s cubic-bezier(.16,1,.3,1),transform .75s cubic-bezier(.16,1,.3,1)}.is-revealed{opacity:1;transform:none}
@media(max-width:760px){.landing-word{font-size:clamp(72px,19vw,140px);transform:translate(-50%,-50%) translateY(7vh) scale(.57)}.landing-logo{top:calc(50% - 105px);width:112px;height:112px}.landing-copy{top:69vh;font-size:10px;gap:7px}.landing-copy text:first-child{font-size:8px}.landing-enter{top:81vh;gap:15px;padding:10px 10px 10px 21px;font-size:11px}.landing-enter-core{width:35px;height:35px}@keyframes wordSettle{0%,57%{transform:translate(-50%,-50%) translateY(-1vh) scale(1)}100%{transform:translate(-50%,-50%) translateY(7vh) scale(.57)}}.nav-inner{padding:0 17px}.nav-links{gap:8px}.nav-trigger{font-size:12px}.nav-login{padding:8px 13px}.mega-inner{grid-template-columns:1fr;gap:24px;padding:26px 24px}.mega-column{gap:8px}.mega-link-featured{font-size:20px}.product-stage{min-height:650px}.stage-air{min-height:610px}.stage-copy{padding-top:60px}.stage-summary{font-size:14px}.stage-product-pro{width:112vw;height:320px}.stage-product-air{width:104vw;height:280px}.pro-word{top:305px;font-size:42vw}.series-grid{grid-template-columns:1fr;gap:10px;padding:10px}.series-card{min-height:450px;padding-top:45px}.series-card image{height:270px}.footer{flex-direction:column;align-items:flex-start;padding:26px 20px}.footer text:last-child{line-height:1.5}.stage-actions{gap:8px}.button-primary,.button-outline{padding:9px 13px!important;font-size:13px}}
@media(prefers-reduced-motion:reduce){.landing-frost,.landing-word,.landing-letter,.landing-logo,.landing-copy,.landing-enter,.landing-enter::before,.landing-enter-core::after{animation:none}.landing-frost{display:none}.landing-word{transform:translateY(7vh) scale(.43)}.landing-letter,.landing-logo,.landing-copy,.landing-enter{opacity:1}.landing-logo{transform:translateX(-50%)}.landing-copy{transform:translateX(-50%)}.landing-enter{transform:translateX(-50%)}.reveal-ready{opacity:1;transform:none;transition:none}}
/* 动画无法执行时，3.2 秒后只强制展示最终内容，避免首屏再次空白。 */
.landing-fallback .landing-frost{display:none}.landing-fallback .landing-word{animation:none!important;transform:translate(-50%,-50%) translateY(7vh) scale(.43)!important}.landing-fallback .landing-letter{animation:none!important;opacity:1!important;filter:none!important;transform:none!important}.landing-fallback .landing-logo{animation:none!important;opacity:1!important;transform:translateX(-50%)!important}.landing-fallback .landing-copy,.landing-fallback .landing-enter{animation:none!important;opacity:1!important;transform:translateX(-50%)!important}
</style>
