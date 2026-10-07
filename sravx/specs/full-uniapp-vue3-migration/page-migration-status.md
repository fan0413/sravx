# 页面逐条迁移状态

| 原生页面 | Vue 页面 | 当前状态 |
|---|---|---|
| home | pages/index/index.vue | 已按原结构重写，待 HBuilderX 视觉与接口核验 |
| shop | pages/shop/index.vue | 已按原结构重写，待 HBuilderX 视觉与接口核验 |
| cart | pages/cart/index.vue | 已按原结构重写，待 HBuilderX 视觉与购物袋数据核验 |
| search | pages/search/index.vue | 已按原结构重写，待 HBuilderX 搜索与视觉核验 |
| productDetail | pages/product-detail/index.vue | 已按原结构重写，待 HBuilderX 视觉、规格与购物袋核验 |
| confirmOrder | pages/confirm-order/index.vue | 已按原结构重写，待隔离环境交易链路核验 |
| orderList | pages/order-list/index.vue | 已按原结构重写，已通过源码脚本语法检查，待 HBuilderX 视觉、订单接口与隔离交易操作核验 |
| addressManage | pages/address-manage/index.vue | 已按原结构重写，已通过源码脚本语法检查，待 HBuilderX 视觉、地址接口与订单选择回传核验 |
| orderDetail | pages/order-detail/index.vue | 已按原结构重写，已通过源码脚本语法检查，待 HBuilderX 视觉、订单接口与隔离交易操作核验 |
| orderLogistics | pages/order-logistics/index.vue | 已按原结构重写，已通过源码脚本语法检查，待 HBuilderX 视觉与物流接口核验 |
| orderAfterSale | pages/order-after-sale/index.vue | 已按原结构重写，已通过源码脚本语法检查，待 HBuilderX 视觉与隔离售后接口核验 |
| pointsMall | pages/points-mall/index.vue | 已按原结构重写，已通过源码脚本语法检查，待 HBuilderX 视觉、积分商品与会员接口核验 |
| pointsProductDetail | pages/points-product-detail/index.vue | 已按原结构重写，已通过源码脚本语法检查，待 HBuilderX 视觉、会员限制与积分兑换链路核验 |
| pointsOrderDetail | pages/points-order-detail/index.vue | 已按原结构重写，已通过源码脚本语法检查，待 HBuilderX 视觉、积分订单与隔离支付链路核验 |
| userCenter | pages/user-center/index.vue | 已按原结构重写，已通过源码脚本语法检查，待 HBuilderX 视觉、用户资料与剪刀/优惠券接口核验 |
| profileEdit | pages/profile-edit/index.vue | 已按原结构重写，已通过源码脚本语法检查，待 HBuilderX 视觉与隔离用户资料保存核验 |
| couponManage | pages/coupon-manage/index.vue | 已按原结构重写，已通过源码脚本语法检查，待 HBuilderX 视觉与优惠券接口核验 |
| giftCardRedeem | pages/gift-card-redeem/index.vue | 已按原结构重写，已通过源码脚本语法检查，待 HBuilderX 视觉、礼品卡与地址确认接口核验 |
| membership | pages/membership/index.vue | 已按原结构重写，已通过源码脚本语法检查，待 HBuilderX 视觉与会员资料接口核验 |
| myScissors | pages/my-scissors/index.vue | 已按原结构重写，已通过源码脚本语法检查，待 HBuilderX 视觉与剪刀绑定/解绑接口核验 |
| scissorsAfterSale | pages/scissors-after-sale/index.vue | 已按原结构重写，已通过源码脚本语法检查，待 HBuilderX 视觉与隔离剪刀售后接口核验 |
| cooperation | pages/cooperation/index.vue | 已按原结构重写，已通过源码脚本语法检查，待 HBuilderX 视觉与隔离咨询提交核验 |
| splash | pages/splash/index.vue | 已按原结构重写，已通过源码脚本语法检查，待 HBuilderX 启动与登录初始化核验 |
| register | pages/register/index.vue | 已按原结构重写，已通过源码脚本语法检查，待 HBuilderX 手机号授权与隔离资料保存核验 |

构建核验（2026-09-19）：使用 HBuilderX 内置的 Vue 3 微信小程序编译器完成 `mp-weixin` 构建；`pages.json` 中 24 条路由均生成对应页面脚本，且源码目录未发现 `FeaturePage` 或 CommonJS `require()` 遗留引用。此项只证明代码可编译，不替代真机/微信开发者工具中的视觉、登录、接口和交易隔离核验。

导航迁移：原 `custom-tab-bar` 已迁移至 `custom-tab-bar/index.vue`，保留首页、购物袋、订单、我的四项的 CSS 图标结构和选中态，并在 `pages.json` 启用自定义导航栏。

说明：仅页面入口存在不代表功能迁移完成。每页必须完成原结构、交互、接口及视觉对照后才可标记完成。
