<template>
  <scroll-view scroll-y class="page"><view class="hero"><text>{{ title }}</text><text class="ui-small">{{ subtitle }}</text></view>
    <view v-if="loading" class="state">加载中…</view>
    <template v-else>
      <view v-if="notice" class="notice">{{ notice }}</view>
      <view v-if="formFields.length" class="form"><input v-for="field in formFields" :key="field.key" v-model="form[field.key]" :placeholder="field.label" :password="field.type==='password'"/><button @click="submit">{{ actionLabel }}</button></view>
      <view v-if="items.length" class="list"><view v-for="(item,index) in items" :key="item.id||item.order_id||item.binding_id||index" class="row" @click="open(item)"><text>{{ item.name||item.title||item.order_no||item.sn||item.code||item.nickname||item.username||`记录 ${index+1}` }}</text><text class="ui-small">{{ description(item) }}</text><text class="ui-strong" v-if="item.price||item.amount||item.points">{{ item.price ? `¥${item.price}` : (item.amount ? `¥${item.amount}` : `${item.points} 积分`) }}</text></view></view>
      <view v-else-if="!formFields.length" class="state">暂无相关记录</view>
    </template>
  </scroll-view>
</template>
<script>
import api from '../common/api.js'
import auth from '../common/auth.js'
const configs={
  coupon:{title:'优惠券',subtitle:'查看和领取可用优惠',load:()=>api.getMyCoupons(),action:()=>api.getAvailableCoupons()},
  orderList:{title:'订单',subtitle:'查看订单进度与售后',load:()=>api.getOrderList('',1,50),open:i=>`/pages/order-detail/index?id=${i.id||i.order_id}`},
  orderDetail:{title:'订单详情',subtitle:'订单状态、收货与退款申请',load:q=>api.getOrderDetail(q.id).then(v=>[v])},
  logistics:{title:'物流信息',subtitle:'查看订单配送进度',load:q=>api.getWaybillToken(q.id).then(v=>[v])},
  afterSale:{title:'订单售后',subtitle:'提交售后申请',fields:[{key:'reason',label:'请填写售后原因'}],action:(f,q)=>api.applyRefundRequest({orderId:q.id,reason:f.reason})},
  pointsMall:{title:'积分商城',subtitle:'使用积分兑换专业工具',load:()=>api.getPointsProducts(0),open:i=>`/pages/points-product-detail/index?id=${i.id}`},
  pointsProduct:{title:'积分商品',subtitle:'选择规格后兑换',load:q=>api.getPointsProductDetail(q.id).then(v=>[v])},
  pointsOrder:{title:'积分订单',subtitle:'查看兑换订单详情',load:q=>api.getPointsOrderDetail(q.id).then(v=>[v])},
  user:{title:'我的',subtitle:'账户、会员、工具与服务',load:()=>api.getUserInfo().then(v=>[v]),open:()=>'/pages/profile-edit/index'},
  profile:{title:'个人资料',subtitle:'更新昵称和基础资料',fields:[{key:'username',label:'昵称'},{key:'gender',label:'性别'},{key:'occupation',label:'职业'}],action:f=>api.updateUserInfo(f)},
  gift:{title:'礼品卡兑换',subtitle:'输入兑换码后由服务端校验',fields:[{key:'code',label:'请输入礼品卡兑换码'}],action:f=>api.redeemGiftCard(f)},
  membership:{title:'会员中心',subtitle:'会员等级与积分权益',load:()=>Promise.all([api.getMemberLevel(),api.getUserPoints()])},
  address:{title:'地址管理',subtitle:'管理订单收货地址',load:()=>api.getAddressList(),fields:[{key:'name',label:'收货人'},{key:'phone',label:'手机号'},{key:'address',label:'详细地址'}],action:f=>api.addAddress(f)},
  scissors:{title:'我的剪刀',subtitle:'绑定工具、查询保修与售后',load:()=>api.getMyScissors(),fields:[{key:'sn',label:'请输入剪刀 SN 码'}],action:f=>api.bindScissors(f.sn),open:i=>`/pages/scissors-after-sale/index?id=${i.id||i.binding_id}`},
  scissorsAfterSale:{title:'剪刀售后',subtitle:'提交维修或置换申请',fields:[{key:'description',label:'请描述需要的服务'}],action:(f,q)=>api.applyScissorsAfterSale({bindingId:q.id,description:f.description,serviceType:'repair'})},
  cooperation:{title:'合作咨询',subtitle:'留下需求，客服将与您联系',fields:[{key:'name',label:'姓名'},{key:'phone',label:'联系电话'},{key:'content',label:'合作需求'}],action:f=>api.submitCooperation(f)},
  register:{title:'登录与注册',subtitle:'请授权手机号完成账户服务',fields:[],action:()=>auth.refresh()},
  splash:{title:'SRAVX',subtitle:'专业宠物美容工具',load:()=>Promise.resolve([])}
}
export default {props:{kind:{type:String,required:true}},data(){return{loading:true,items:[],form:{},query:{}}},computed:{config(){return configs[this.kind]||configs.splash},title(){return this.config.title},subtitle(){return this.config.subtitle},formFields(){return this.config.fields||[]},actionLabel(){return this.kind==='register'?'获取登录状态':'提交'}},onLoad(query){this.query=query||{};this.load()},methods:{async load(){this.loading=true;try{if(this.config.load){const result=await this.config.load(this.query);this.items=api.asList(result);if(!this.items.length&&result&&typeof result==='object'&&!Array.isArray(result))this.items=[result]}}catch(error){uni.showToast({title:error.message||'加载失败',icon:'none'})}finally{this.loading=false}},description(item){return item.status_text||item.status||item.description||item.phone||item.created_at||''},open(item){if(this.config.open){const url=this.config.open(item);if(url)uni.navigateTo({url})}},async submit(){try{const result=await this.config.action(this.form,this.query);uni.showToast({title:'提交成功',icon:'success'});if(result)this.load()}catch(error){uni.showToast({title:error.message||'提交失败',icon:'none'})}}}}
</script>
<style scoped>.page{height:100vh}.hero{padding:58rpx 32rpx 36rpx;display:flex;flex-direction:column;gap:14rpx}.hero text{font-size:54rpx;font-weight:700}.hero .ui-small,.row .ui-small{color:#6e6e73}.notice{margin:0 28rpx 24rpx;padding:22rpx;background:#F4F7FA;color:#69727E;border-radius:16rpx}.list,.form{padding:0 28rpx 80rpx}.row{display:flex;flex-direction:column;gap:10rpx;padding:28rpx 8rpx;border-bottom:1rpx solid #e5e5ea;background:#fff}.row text{font-size:30rpx;font-weight:600}.row .ui-strong{font-size:26rpx}.form input{margin-bottom:18rpx;padding:24rpx;background:#fff;border-radius:14rpx}.form button{margin-top:28rpx;background:#0B0D10;color:#fff;border-radius:48rpx}.state{padding:100rpx 32rpx;text-align:center;color:#6e6e73}</style>
