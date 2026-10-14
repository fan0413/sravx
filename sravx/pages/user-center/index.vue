<template>
  <view class="page-shell">
    <view class="top-nav" :style="{ height: `${navHeight}px`, paddingTop: `${navTop}px` }">
      <sravx-page-back mode="nav" />
      <text class="nav-title">我的</text>
    </view>
    <scroll-view scroll-y class="page" :style="{ paddingTop: `${navHeight}px` }">
      <view class="profile">
        <view class="user"><image :src="user.avatar" mode="aspectFill"/><view><view class="name" @tap="profile"><text>{{ user.username }}</text><text>✎</text></view><view class="badge" :class="levelClass">MEMBER　{{ memberLevel }}</view></view></view>
        <view class="assets"><view @tap="pointsMall"><text class="ui-strong">{{ points }}</text><text class="ui-small">积分</text></view><view @tap="coupons"><text class="ui-strong">{{ couponCount }}</text><text class="ui-small">优惠券</text></view></view>
      </view>
      <view class="section"><view class="head" @tap="scissors"><text>我的剪刀</text><text class="ui-small">{{ scissorsList.length }}把剪刀　›</text></view><view v-if="scissorsList.length" class="scissors"><view v-for="item in scissorsList.slice(0,2)" :key="item.sn || item.id" class="scissor" @tap="scissors"><image :src="item.card_image || item.image || '/static/navigation/sravx-mark.png'" mode="aspectFill"/><text>{{ item.name }}</text></view><view v-if="scissorsList.length>2" class="more" @tap="scissors">查看全部 {{ scissorsList.length }} 把剪刀 ›</view></view><view v-else class="empty" @tap="scissors">暂无绑定剪刀，点击添加</view></view>
      <view class="section menu"><view v-for="item in menu" :key="item.name" class="menu-item" @tap="go(item.url)"><view class="icon"><image class="icon-image" :src="item.iconAsset" mode="aspectFit" /></view><text>{{ item.name }}</text><text>›</text></view><button class="menu-item" open-type="contact" session-from="center"><view class="icon"><image class="icon-image" :src="serviceIcon" mode="aspectFit" /></view><text>在线客服</text><text>›</text></button></view>
      <view class="space"/>
    </scroll-view>
    <SravxTabBar active-path="/pages/user-center/index" />
  </view>
</template>

<script>
import SravxPageBack from '../../components/sravx-page-back/sravx-page-back.vue'

import api from '../../common/api.js'
import auth from '../../common/auth.js'
import SravxTabBar from '../../components/SravxTabBar.vue'
const levels = ['', 'LV1', 'LV2', 'LV3', 'LV4', 'LV5', 'LV6']
const styles = ['', 'normal', 'silver', 'gold', 'diamond', 'black-diamond', 'supreme']
const scoreLevel = points => points >= 40000 ? 6 : points >= 20000 ? 5 : points >= 8000 ? 4 : points >= 3000 ? 3 : points >= 1200 ? 2 : 1
export default {
  components: { SravxPageBack,  SravxTabBar },
  data() { return {
    serviceIcon: '/static/user-menu/headphones-neutral.png', navTop: 8, navHeight: 56,
    user: { username: 'Sravx 用户', avatar: '/static/navigation/sravx-mark.png', phone: '' }, memberLevel: 'LV1', levelClass: 'normal', points: 0, couponCount: 0, scissorsList: [],
    menu: [
      { iconAsset: '/static/user-menu/gift-neutral.png', name: '礼品卡兑换', url: '/pages/gift-card-redeem/index' },
      { iconAsset: '/static/user-menu/map-pin-neutral.png', name: '地址管理', url: '/pages/address-manage/index' },
      { iconAsset: '/static/user-menu/message-circle-neutral.png', name: '合作咨询', url: '/pages/cooperation/index' }
    ]
  } },
  onLoad() { this.initNav(); this.load() },
  onShow() { if (this.loaded) this.load() },
  methods: {
    initNav() { try { const menu = uni.getMenuButtonBoundingClientRect(); this.navTop = menu.top; this.navHeight = menu.bottom + 8 } catch (error) {} },
    signed() { const current = auth.user(); if (current && current.phone) return true; uni.navigateTo({ url: '/pages/register/index' }); return false },
    async load() { const current = auth.user(); if (!current || !current.phone) { this.user = { username: current && (current.username || current.nickname) || 'Sravx 用户', avatar: current && current.avatar || '/static/navigation/sravx-mark.png', phone: '' }; this.points = 0; this.couponCount = 0; this.scissorsList = []; this.loaded = true; return } try { const [profile, scissors, coupons] = await Promise.all([api.getUserInfo().catch(() => null), api.getMyScissors().catch(() => []), api.getAvailableCoupons().catch(() => [])]); const info = profile || current; const level = Math.max(Number(info.member_level) || 1, scoreLevel(info.total_points || 0)); this.user = { username: info.username || info.nickname || 'Sravx 用户', avatar: info.avatar || '/static/navigation/sravx-mark.png', phone: info.phone || '' }; this.memberLevel = levels[level] || 'LV1'; this.levelClass = styles[level] || 'normal'; this.points = info.points || 0; this.couponCount = api.asList(coupons).length; this.scissorsList = api.asList(scissors) } catch (error) { uni.showToast({ title: '加载失败', icon: 'none' }) } finally { this.loaded = true } },
    profile() { if (this.signed()) uni.navigateTo({ url: '/pages/profile-edit/index' }) }, scissors() { if (this.signed()) uni.navigateTo({ url: '/pages/my-scissors/index' }) }, coupons() { if (this.signed()) uni.navigateTo({ url: '/pages/coupon-manage/index' }) }, pointsMall() { uni.navigateTo({ url: '/pages/points-mall/index' }) }, go(url) { if (this.signed()) uni.navigateTo({ url }) }
  }
}
</script>

<style>
.page-shell{height:100vh;background:#F4F6F8}.top-nav{position:fixed;z-index:10;top:0;right:0;left:0;box-sizing:border-box;background:rgba(255,255,255,.96);border-bottom:1px solid rgba(60,60,67,.08)}.nav-title{position:absolute;bottom:13px;left:0;right:0;text-align:center;color:#0B0D10;font-size:16px;font-weight:600}.page{height:100vh;box-sizing:border-box;background:#F4F6F8}.profile,.section{margin:12px 16px 0;overflow:hidden;border-radius:10px;background:#fff;box-shadow:0 3px 10px rgba(29,29,31,.05)}.user{display:flex;align-items:center;padding:17px}.user image{width:56px;height:56px;margin-right:15px;border-radius:50%;background:#eee}.name{display:flex;gap:6px;align-items:center;font-size:18px;font-weight:650}.name text:last-child{color:#69727E;font-size:13px}.badge{display:inline-block;margin-top:7px;padding:4px 7px;border-radius:6px;font-size:10px}.normal{background:#f1f1f3;color:#515154}.silver{background:#e3e3e6;color:#4e4e54}.gold{background:#E9EDF2;color:#4A4A4D}.diamond{background:#3b3d42;color:#E9EDF2}.black-diamond,.supreme{background:#0B0D10;color:#F4F6F8}.assets{display:flex;margin:0 18px;padding:14px 0;border-top:1px solid #eee}.assets view{flex:1;display:flex;align-items:center;flex-direction:column}.assets view+view{border-left:1px solid #eee}.assets .ui-strong{font-size:20px}.assets .ui-small{margin-top:4px;color:#636366;font-size:12px}.section{padding:14px 16px}.head,.menu-item{display:flex;align-items:center;justify-content:space-between}.head>text{font-size:16px;font-weight:650}.head .ui-small{color:#636366;font-size:12px}.scissors{margin-top:11px}.scissor{overflow:hidden;margin-bottom:11px;border-radius:12px;background:#fff;box-shadow:0 5px 12px rgba(29,29,31,.06)}.scissor image{width:100%;height:200px;background:#eee}.scissor text{display:block;padding:11px 13px;font-size:16px;font-weight:650}.more,.empty{padding:14px 0;text-align:center;color:#0B0D10;font-size:13px}.empty{color:#636366}.menu{padding:8px 0!important;border:1px solid #DCE2E9;box-shadow:0 10px 24px rgba(47,39,29,.045)!important}.menu-item{position:relative;display:flex;align-items:center;width:100%;min-height:62px;padding:15px 20px 15px 24px!important;box-sizing:border-box;border:0;border-bottom:1px solid #E9EDF2!important;border-radius:0;background:#fff;color:#0B0D10;font-size:16px!important;line-height:normal;text-align:left;letter-spacing:.2px}.menu-item:last-child{border-bottom:0!important}.menu-item::after{border:0}.menu-item>text:nth-child(2){flex:1;margin-left:14px!important}.menu-item>text:last-child{font-size:22px!important;font-weight:300;color:#a5a5aa!important}.icon{display:flex;flex:0 0 34px;align-items:center;justify-content:center;width:34px;height:34px;border-radius:10px;background:transparent}.icon-image{width:21px;height:21px;display:block}.menu-item:active{background:#F6F8FA}.space{height:126px}
</style>
