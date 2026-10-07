# 全量 uni-app Vue 3 迁移设计

## 设计规格

1. Purpose Statement：为宠物美容师在微信小程序内保留商品选购、工具服务与订单管理能力，并将原生小程序前端统一到便于后续多端复用的 uni-app Vue 3 工程。
2. Aesthetic Direction：Luxury/refined；沿用原有中高端工具品牌的克制、专业与留白，不新增与现有页面冲突的视觉语言。
3. Color Palette：墨黑 `#1D1D1F`、暖白 `#F8F5F0`、雾灰 `#F2F2F7`、石墨灰 `#636366`、铜棕 `#A16E3B`。
4. Typography：微信小程序系统中文字体与现有项目字重规则；此为已有线上品牌兼容约束，不引入外部字体下载。
5. Layout Strategy：保留现有横向商品陈列、图片主导详情和分段信息层级；交易页强调摘要先行、操作固定在底部，避免在高风险操作中隐藏金额或状态。

## 架构

```text
pages/*.vue (Vue 3 Options API / Composition API)
        ↓
common/api.js、common/auth.js、common/cart.js、common/navigation.js
        ↓
wx.cloud.callFunction / uni.request / uni.requestPayment
        ↓
现有 CloudBase 云函数、CloudRun、已放行 HTTPS API
```

- `pages/`：每个原生页面对应一个 Vue 单文件组件；生命周期改用 `onLoad`、`onShow`、`onPullDownRefresh` 等 uni-app 页面钩子。
- `common/api.js`：统一封装 HTTP、云函数调用、错误结构和已放行 API 的特性开关；不在页面直接散落 `wx.cloud.callFunction`。
- `common/auth.js`：管理微信登录、手机号授权、会话缓存和失效清理；页面不传递可伪造的用户身份字段。
- `common/cart.js`：购物袋采用 `uni.getStorageSync` / `uni.setStorageSync`，保持与原有本地存储键兼容或提供一次性迁移。
- `components/tab-bar/`：复刻四项自定义底部导航，使用 `uni.switchTab`。

## 页面批次

| 批次 | 页面 | 风险 |
|---|---|---|
| P1 | 启动、首页、商品、搜索、商品详情、购物袋 | 低-中 |
| P2 | 登录/注册、用户中心、资料、会员、优惠券、地址、合作咨询 | 中-高 |
| P3 | 普通订单、物流、订单售后、积分商城/商品/订单、礼品卡 | 高 |
| P4 | 我的剪刀、剪刀售后、统一支付与交易回归 | 最高 |

## 关键调用策略

- 只读商品接口优先走已验收 HTTPS API；若当前开关未放行，使用既有云函数兼容调用。
- 用户、地址、剪刀、订单、积分、礼品卡等保留原有认证要求和云函数 action。
- 订单、积分、礼品卡、退款、支付参数必须由服务端生成；前端只展示并提交用户选择。
- 支付参数到位后才调用 `uni.requestPayment`；回调、验签、幂等与订单状态均不在前端实现。

## 测试策略

- 静态：Vue 模板与 JavaScript 语法检查、页面路由完整性、无机密扫描。
- 构建：HBuilderX 编译至微信小程序；每批检查控制台与网络请求。
- 功能：只读链路可使用非敏感测试数据；交易链路仅在负责人批准的隔离环境与测试订单中验证。
- 对照：逐项比对原生页面的字段、校验、跳转及错误提示；不以“可打开页面”代替业务验收。
