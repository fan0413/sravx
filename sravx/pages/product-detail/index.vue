<template>
  <!-- #ifdef H5 -->
  <SravxProductPurchaseH5 :product-id="webProductId" :series="webSeries" :tool="webTool"/>
  <!-- #endif -->
  <!-- #ifndef H5 -->
<view class="page"><view class="nav" :style="{height:`${navHeight}rpx`}" @click="back"><view/></view><scroll-view scroll-y class="scroll" :style="{paddingTop:`${navHeight}rpx`}"><view v-if="loading" class="state">加载中…</view><template v-else-if="product"><view v-if="images.length" class="gallery"><swiper class="gallery-swiper" circular @change="swiperCurrent=$event.detail.current"><swiper-item v-for="image in images" :key="image"><view class="frame"><image :src="image" mode="aspectFit"/></view></swiper-item></swiper><view v-if="images.length>1" class="counter">{{swiperCurrent+1}} / {{images.length}}</view></view><view v-else class="gallery image-placeholder"><text>暂无商品图片</text></view><view class="info"><text class="eyebrow">SRAVX PROFESSIONAL TOOLS</text><text class="title">{{product.name}}</text><text class="subtitle">{{product.desc||product.description}}</text></view><view class="config"><text class="config-title">型号：选择适合你的工具。</text><view class="models"><view v-for="item in modelOptions" :key="item.name" class="model" :class="{selected:selectedModel===item.name}" @click="selectModel(item)"><view><text>{{item.name}}</text><text class="ui-small" v-if="item.sku">{{item.sku}}</text></view><text class="ui-strong">{{item.priceText}}</text></view></view><view v-if="shipping.promise || shipping.reason || shipping.note" class="block"><text class="config-title">发货信息</text><text v-if="shipping.promise" class="ui-small intro">{{shipping.promise}}</text><text v-if="shipping.reason" class="ui-small intro">{{shipping.reason}}</text><text v-if="shipping.note" class="ui-small intro">{{shipping.note}}</text></view><view v-if="protectOffer" class="block"><text class="config-title">SRAVX Protect</text><text class="ui-small intro">{{protectOffer.displayOnly?'当前为权益说明，暂不收费。':'延长保修期，获得专属换购权益。'}}</text><view class="protect" :class="{selected:!protectSelected}" @click="protectSelected=false"><view><text>不添加 SRAVX Protect</text><text class="ui-small">保留产品原有保修服务。</text></view><view class="radio"/></view><view class="protect" :class="{selected:protectSelected}" @click="protectSelected=true"><view><text>添加 SRAVX Protect</text><text class="ui-small">具体适用条件与服务规则以下单页公示为准。</text></view><view class="radio"/></view></view></view><view v-if="params.length" class="spec"><text class="eyebrow">TECHNICAL DETAILS</text><text class="spec-title">主要参数</text><view class="table"><view v-for="item in params" :key="item.label"><text>{{item.label}}</text><text>{{item.value}}</text></view></view></view><view v-if="detailImages.length" class="detail"><text class="eyebrow">PRODUCT STORY</text><text class="spec-title">详情展示</text><image v-for="image in detailImages" :key="image" :src="image" mode="widthFix"/></view><view class="bottom-space"/></template></scroll-view><view v-if="product" class="bottom"><view class="mini" @click="home"><view class="home-icon"/><text>首页</text></view><button class="mini" open-type="contact"><view class="chat-icon"/><text>客服</text></button><button class="mini" open-type="share"><view class="share-icon"/><text>分享</text></button><view class="add" @click="add">加入购物袋</view></view></view>
  <!-- #endif -->
</template>
<script>
import { goBackOrParent } from '../../common/navigation.mjs'

// #ifdef H5
import SravxProductPurchaseH5 from '../../components/SravxProductPurchaseH5.vue'
// #endif
import api from '../../common/api.js'
import cart from '../../common/cart.js'
import { imageList, priceText, hasStructuredCatalog, modelOptions, colorOptions, selectedSku, selectionPrice, selectionStock, selectionShipping, purchaseItem } from '../../common/web-purchase.mjs'
export default{
// #ifdef H5
components:{SravxProductPurchaseH5},
// #endif
data(){return{webProductId:'',webSeries:'',webTool:'',product:null,loading:true,navHeight:96,swiperCurrent:0,images:[],detailImages:[],modelOptions:[],selectedModel:'',selectedModelId:0,colorOptions:[],selectedColor:'',selectedColorId:0,selectedSkuId:0,displayPrice:'0.00',protectSelected:false,protectOffer:null}},computed:{
  currentSku(){return this.product && hasStructuredCatalog(this.product) ? selectedSku(this.product,this.selectedModelId,this.selectedColorId) : null},
  shipping(){return selectionShipping(this.product,this.selected(),this.currentSku)},
  selectedProtectOffer(){return (this.product?.protectOffers||[]).find(offer=>!offer.sku_id||Number(offer.sku_id)===Number(this.currentSku?.id))||null},
  params(){const p=this.product||{};if(p.series==='accessories')return[];return[{label:'核心材质',value:p.steel_material||p.core_material||'--'},{label:'手柄材质',value:p.handle_material||'--'},{label:'尺寸',value:p.display_size||p.size||'--'},{label:'重量',value:p.weight||'--'},{label:'保修期',value:p.warranty_period||'--'}]}
},onLoad(query){
// #ifdef H5
this.webProductId=String(query.id||'');this.webSeries=query.series||'';this.webTool=query.tool||'';
// #endif
// #ifndef H5
this.initNav();if(query.id)this.load(query.id);else this.loading=false
// #endif
},onShow(){
// #ifndef H5
if(!this.loading&&this.product&&Date.parse(this.product.media_expires_at)<=Date.now())this.load(this.product.id)
// #endif
},onShareAppMessage(){const p=this.product||{};return{title:p.name||'Sravx 商品',path:p.id?`/pages/product-detail/index?id=${p.id}`:'/pages/shop/index',imageUrl:p.cover_image}},onShareTimeline(){const p=this.product||{};return{title:p.name||'Sravx 商品',query:p.id?`id=${p.id}`:'',imageUrl:p.cover_image}},methods:{
  initNav(){try{const menu=uni.getMenuButtonBoundingClientRect(),sys=uni.getSystemInfoSync();this.navHeight=Math.ceil((menu.bottom+8)*750/sys.screenWidth)}catch(error){this.navHeight=96}},
  isStructured(p){return hasStructuredCatalog(p)},
  refreshSelection(){
    const model=this.selected();
    const sku=this.currentSku;
    this.selectedSkuId=Number(sku?.id)||0;
    this.protectOffer=this.selectedProtectOffer;
    this.displayPrice=priceText(selectionPrice(this.product,model,this.selectedColorId));
  },
  async load(id){
    this.loading=true;
    this.product=null;
    try{
      const p=await api.getProductDetail(Number(id));
      if(!p)throw new Error('商品不存在或已下架');
      this.product=p;
      this.images=imageList(p.images);
      if(!this.images.length&&p.cover_image)this.images=[p.cover_image];
      this.detailImages=imageList(p.detail_images);
      this.modelOptions=modelOptions(p).map(item=>({...item,priceText:priceText(item.price)}));
      this.colorOptions=colorOptions(p);
      const model=this.modelOptions.find(item=>item.available)||this.modelOptions[0];
      this.selectedModel=model?.name||'';
      this.selectedModelId=Number(model?.id)||0;
      const color=this.colorOptions.find(item=>!this.isStructured(p)||selectedSku(p,this.selectedModelId,item.id))||this.colorOptions[0];
      this.selectedColor=color?.name||'';
      this.selectedColorId=Number(color?.id)||0;
      this.protectOffer=Array.isArray(p.protectOffers)?p.protectOffers[0]||null:null;
      this.refreshSelection();
    }catch(error){this.product=null;uni.showToast({title:error.message||'加载失败',icon:'none'})}
    finally{this.loading=false}
  },
  selectModel(item){
    this.selectedModel=item.name;
    this.selectedModelId=Number(item.id)||0;
    if(this.isStructured(this.product)&&!this.currentSku){
      const color=this.colorOptions.find(item=>selectedSku(this.product,this.selectedModelId,item.id));
      this.selectedColor=color?.name||'';
      this.selectedColorId=Number(color?.id)||0;
    }
    this.protectSelected=false;
    this.refreshSelection();
  },
  selectColor(item){this.selectedColor=item.name;this.selectedColorId=Number(item.id)||0;this.protectSelected=false;this.refreshSelection()},
  selected(){return this.modelOptions.find(item=>item.name===this.selectedModel)||this.modelOptions[0]},
  back(){goBackOrParent('/pages/shop/index')},
  home(){uni.reLaunch({url:'/pages/index/index'})},
  add(){
    if(!this.product||!this.selectedModel){uni.showToast({title:'请选择商品规格',icon:'none'});return}
    if(this.isStructured(this.product)&&!api.structuredCheckoutEnabled()){uni.showToast({title:'该商品的规格购买暂未开放',icon:'none'});return}
    try{
      const color=this.colorOptions.find(item=>item.name===this.selectedColor);
      const stock=selectionStock(this.product,this.currentSku);
      if(stock!==null&&stock<1)throw new Error('当前规格暂不可购买');
      cart.add(purchaseItem(this.product,this.selected(),null,1,this.protectOffer,this.protectSelected));
      uni.showToast({title:'已加入购物袋',icon:'success'});
      setTimeout(()=>uni.reLaunch({url:'/pages/cart/index'}),700);
    }catch(error){uni.showToast({title:error.message||'加入购物袋失败',icon:'none'})}
  }
}}
</script>
<style>
/* #ifndef H5 */
.page,.scroll{height:100%;background:#F4F6F8}.nav{position:fixed;top:0;left:0;right:0;z-index:5;display:flex;align-items:flex-end;padding:0 24rpx 12rpx;background:rgba(242,242,247,.88)}.nav view{width:18rpx;height:18rpx;margin:0 0 15rpx 12rpx;border-left:3rpx solid #0B0D10;border-bottom:3rpx solid #0B0D10;transform:rotate(45deg)}.gallery{position:relative;margin:24rpx 28rpx 0;overflow:hidden;border-radius:36rpx;background:linear-gradient(135deg,#E9EDF2 0%,#FFFFFF 58%,#AEB7C3 140%)}.gallery-swiper,.frame{height:632rpx}.image-placeholder{height:632rpx;display:flex;align-items:center;justify-content:center;color:#8e8e93;font-size:26rpx}.frame{display:flex;align-items:center;justify-content:center}.frame image{width:100%;height:100%}.counter{position:absolute;right:20rpx;bottom:20rpx;padding:10rpx 18rpx;border-radius:99rpx;background:rgba(29,29,31,.7);color:#fff;font-size:20rpx}.info{padding:44rpx 42rpx 18rpx}.eyebrow{display:block;font-size:18rpx;font-weight:700;letter-spacing:2.4rpx;color:#69727E}.title{display:block;margin-top:16rpx;font-size:46rpx;line-height:1.18;font-weight:720}.subtitle{display:block;margin-top:14rpx;font-size:27rpx;line-height:1.52;color:#636366}.config,.spec,.detail{margin:18rpx 28rpx 0;padding:44rpx 28rpx 34rpx;border-radius:30rpx;background:#fff}.config-title{display:block;font-size:38rpx;font-weight:720}.models{margin-top:30rpx;display:flex;flex-direction:column;gap:16rpx}.model,.protect{display:flex;align-items:center;justify-content:space-between;padding:22rpx 24rpx;border:2rpx solid #DCE2E9;border-radius:20rpx}.model.selected,.protect.selected{border-color:#0B0D10;box-shadow:inset 0 0 0 2rpx #0B0D10}.model view,.protect>view:first-child{display:flex;flex-direction:column;gap:8rpx}.model text,.protect text{font-size:30rpx;font-weight:650}.model .ui-small,.protect .ui-small,.intro{font-size:22rpx;color:#636366}.block{margin-top:64rpx}.colors{display:flex;flex-wrap:wrap;gap:18rpx;margin-top:30rpx}.color{display:flex;align-items:center;gap:12rpx;padding:16rpx 18rpx;border:2rpx solid #DCE2E9;border-radius:99rpx;font-size:24rpx}.color.selected{border-color:#0B0D10;font-weight:650}.color view{width:30rpx;height:30rpx;border:1rpx solid rgba(0,0,0,.12);border-radius:50%}.intro{display:block;margin-top:14rpx;font-size:27rpx;line-height:1.48}.protect{margin-top:18rpx;min-height:122rpx}.radio{width:28rpx;height:28rpx;border:2rpx solid #aeaeb2;border-radius:50%}.protect.selected .radio{box-sizing:border-box;border:8rpx solid #0B0D10}.spec-title{display:block;margin-top:12rpx;font-size:36rpx;font-weight:720}.table{margin-top:20rpx;overflow:hidden;border-radius:20rpx;background:#F4F6F8}.table view{display:flex;justify-content:space-between;padding:21rpx 24rpx;border-bottom:1rpx solid rgba(60,60,67,.12);font-size:26rpx}.table view text:last-child{color:#636366}.detail image{display:block;width:100%;margin-top:24rpx}.bottom-space{height:190rpx}.bottom{position:fixed;bottom:0;left:0;right:0;z-index:5;display:flex;align-items:center;gap:10rpx;padding:12rpx 24rpx calc(12rpx + env(safe-area-inset-bottom));background:rgba(255,255,255,.92)}.mini{width:72rpx!important;height:84rpx;min-width:72rpx!important;padding:0!important;margin:0!important;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5rpx;background:transparent!important}.mini::after{border:0}.mini text{font-size:19rpx;color:#636366}.home-icon,.chat-icon,.share-icon{width:30rpx;height:26rpx;border:3rpx solid #4a4a4d;border-radius:5rpx}.chat-icon{border-radius:12rpx}.share-icon{border-radius:50%}.add{flex:1;height:88rpx;line-height:88rpx;text-align:center;border-radius:44rpx;background:#0B0D10;color:#fff;font-size:27rpx;font-weight:700;box-shadow:0 10rpx 24rpx rgba(11,13,16,.24)}.state{padding:200rpx;text-align:center;color:#636366}@keyframes proReveal{from{opacity:0;transform:translateY(14rpx)}to{opacity:1;transform:translateY(0)}}.gallery{animation:proReveal .42s cubic-bezier(.2,.8,.2,1) both}.info{animation:proReveal .46s .04s cubic-bezier(.2,.8,.2,1) both}.config{animation:proReveal .5s .08s cubic-bezier(.2,.8,.2,1) both}.spec,.detail{animation:proReveal .5s .12s cubic-bezier(.2,.8,.2,1) both}
/* #endif */
</style>
