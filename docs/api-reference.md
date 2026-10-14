# 接口函数说明

这份文档按前端会调用的函数整理。代码位置：用户端`sravx/common/api.js`，后台`admin-web/src/api/admin.ts`，后台登录/上传`admin-web/src/lib/target-admin-auth.ts`。

## 先了解这几件事

- 用户端和后台请求函数大多返回Promise，需要用await；失败抛出Error，页面负责提示。
- 后端JSON成功格式为`{ success: true, data: ... }`，失败为`{ success: false, error: { code, message } }`。封装函数已经取出data，不要再读一次result.data。
- 商品目录是公开GET查询；地址、用户和订单需要用户会话；后台接口需要管理员会话和对应权限。
- ID表示数据库记录编号。商品ID、地址ID、订单ID、规格ID、绑定ID不能混用。
- 普通规格price单位为元；结构化SKU的price_fen和报价中以Fen结尾的金额单位为分，显示时除以100。
- 新增订单等操作可以传idempotencyKey。它是同一次提交的防重复编号，重试时要复用原值；不是登录token。

## 用户端：登录和公开商品

| 函数 | 传什么 | 返回或用途 |
|---|---|---|
| login(data = {}) | 可选手机号授权code | 先用微信登录code创建会话，再绑定手机号，返回用户资料；不是网页登录方案 |
| targetToken()、clearTargetSession() | 无 | 读取/清除本地会话，不是HTTP请求 |
| request(path) | 接口路径 | 带当前会话的GET结果；普通业务优先使用已有函数 |
| getHomeProducts() | 无 | 首页商品和分类 |
| getProductList(params = {}) | categoryId、keyword、series、toolGroup、toolSubtype、size、page、pageSize | 商品列表结果；series为basic/pro/master/accessories，toolGroup为straight/curve/thinning/fishbone/styling |
| getAllProducts(params = {}) | 同列表筛选条件 | 分页读完后合并的商品数组 |
| getProductDetail(id) | 商品ID | 商品详情，已经整理分类字段 |
| getPointsProducts(categoryId = 0) | 积分商品分类ID | 积分商品列表 |
| getPointsProductDetail(id) | 积分商品ID | 积分商品详情 |
| getCategoryList() | 无 | 可展示分类列表 |
| getCategoryTree() | 无 | 用parent_id整理的两层分类树；本地加工列表 |
| getBanners(position = 'home') | 展示位置 | 轮播图列表 |
| asList(value) | 接口列表结果 | 把数组、list或products等格式转为数组 |
| productName(item)、productImage(item) | 商品对象 | 显示名称或封面；不发送请求 |

读取示例（不会下单）：

```js
import api from '@/common/api.js'

try {
  const result = await api.getProductList({ series: 'basic', page: 1, pageSize: 20 })
  const products = api.asList(result)
  // 把products赋给页面使用的商品列表。
} catch (error) {
  uni.showToast({ title: error.message, icon: 'none' })
}
```

对应公开路径：GET `/api/v1/catalog/home`、`products`、`products/:id`、`categories`、`banners`、`points-products`、`points-products/:id`。官网当前同域只转发公开目录，不能据此认为网页用户登录或交易已经可用。

## 用户端：资料和地址

| 函数 | 传什么 | 返回或用途 |
|---|---|---|
| getUserInfo() | 无 | 当前用户资料 |
| updateUserInfo(data) | 要修改的资料字段 | 更新结果，允许字段由服务器检查 |
| getUserPoints() | 无 | 当前积分信息 |
| getPointsLogs(page = 1, pageSize = 20) | 分页 | 积分变动记录 |
| getMemberLevel() | 无 | 会员信息 |
| getAddressList() | 无 | 当前用户地址列表 |
| addAddress(data) | name或contact、phone、province、city、district、detail；可选默认地址/标签 | 新增结果 |
| updateAddress(data) | 上述字段及id | 更新结果 |
| deleteAddress(id) | 地址ID | 删除结果 |
| setDefaultAddress(id) | 地址ID | 设置默认地址结果 |

这些请求使用`/api/v1/me`及`/api/v1/addresses`下的路径。后端根据会话确定用户，前端不能传其他用户ID来查看地址。

## 用户端：优惠券和工具售后

| 函数 | 传什么 | 返回或用途 |
|---|---|---|
| getAvailableCoupons() | 无 | 可以领取的优惠券 |
| getMyCoupons(status = 'unused') | 状态 | 我的优惠券 |
| receiveCoupon(couponId) | 优惠券ID | 领取结果，自动附提交编号 |
| checkCoupon(couponId, orderAmount) | 券记录ID、订单金额 | 适用条件结果；最终金额仍由下单接口计算 |
| getMyScissors() | 无 | 我的工具绑定列表 |
| bindScissors(sn) | 剪刀序列号 | 绑定结果 |
| unbindScissors(id) | 绑定记录ID | 解绑结果 |
| getWarrantyInfo(sn) | 序列号 | 质保信息 |
| getScissorsAfterSale(bindingId) | 绑定ID | 售后记录 |
| applyScissorsAfterSale(data) | bindingId及服务类型、问题描述等 | 申请结果，具体字段检查见后端售后仓储 |
| submitScissorsAfterSaleShipping(data) | requestId及物流资料 | 寄回物流更新结果 |

## 用户端：订单和付款

| 函数 | 传什么 | 返回或用途 |
|---|---|---|
| getOrderList(status, page = 1, pageSize = 10) | 状态、分页 | 带list的订单结果，各项补服务器来源标记 |
| getOrderDetail(orderId, backend = 'target') | 订单ID、来源 | 订单详情，cloud来源会拒绝 |
| structuredCheckoutEnabled() | 无 | 当前客户端支持结构化选配；后端仍检查可用状态 |
| createCheckoutQuote(data) | skuId、quantity，可选protectOfferId | quoteId及以分为单位的报价金额 |
| createOrder(data) | 普通商品：productId、addressId、quantity、selectedSpecName；结构化商品：quoteId、addressId；可选remark/couponId/idempotencyKey等 | orderId等订单信息，补__sravxOrderBackend；金额和库存由后端计算 |
| cancelOrder(orderId, backend) | 订单ID、来源 | 取消结果，不等于退款操作 |
| confirmReceive(orderId, backend) | 订单ID、来源 | 收货结果 |
| getWaybillToken(orderId, backend) | 订单ID、来源 | 物流展示所需信息 |
| applyRefundRequest(data) | orderId、原因等，可选backend/idempotencyKey | 退款申请结果；检查状态，不能直接显示“已到账” |
| getRefundRequestList(orderId, backend) | 订单ID、来源 | 退款申请列表 |
| createPaymentOrder(data) | orderId、backend，可选orderType='points' | 微信支付参数或已付款结果；仍需支付及服务端通知确认 |
| refundOrder() | 无 | 明确拒绝用户端直接退款，使用申请流程 |

主要路径为`/api/v1/orders`、`/api/v1/checkout/quotes`、`/api/v1/refund-requests`和`/api/v1/payments/wechat/orders/:id`。订单来源标记只为避免错误跳转，不代替服务器权限检查。

## 用户端：积分、礼品卡、咨询

| 函数 | 传什么 | 返回或用途 |
|---|---|---|
| createPointsOrder(data) | pointsProductId、addressId、quantity、选中规格名等 | orderId、needCashPayment、payableCash等；可能需要现金补差 |
| getPointsOrderList(status, page, pageSize) | 状态和分页 | 积分订单列表 |
| getPointsOrderDetail(orderId) | 积分订单ID | 详情 |
| cancelPointsOrder(orderId, cancelReason = '用户取消') | ID、原因 | 取消结果 |
| applyPointsRefundRequest(data) | 申请内容 | 尚未接入，抛出提示，不回旧环境 |
| getGiftCardRedeemRecords(page = 1, pageSize = 10) | 分页 | 兑换记录 |
| redeemGiftCard(data) | 字符串兑换码，或含code的对象 | 兑换结果，附防重复编号 |
| confirmGiftCardProductAddress(data) | recordId、addressId | 为兑换记录补地址 |
| submitCooperation(data) | name、gender、scale、phone，可选wechat/address/intention | 咨询提交结果 |

## 管理端：函数按用途查

管理函数返回类型和输入字段都定义在admin.ts中。列表通常有查询对象query，保存通常有payload；下表不把每个可选字段重复写一遍，新增字段请同时检查代码类型。

| 用途及函数 | 主要参数 | 返回或注意事项 |
|---|---|---|
| targetAdminLogin、targetAdminLoggedIn、targetAdminLogout | 账号密码/无 | 登录结果、是否登录、退出；会话保存在当前标签页 |
| targetAdminRequest | path、RequestInit | 带会话请求的data，失败抛出Error |
| targetAdminCatalogModeEnabled、targetAdminOperationsModeEnabled、targetAdminModeEnabled | 无 | 当前服务器模式判断，不是权限检查 |
| fetchOverview | 无 | 后台概览 |
| fetchProducts、fetchAdminProducts | ProductQuery | 商品数组/带total的列表 |
| createProduct、createAdminProduct、updateAdminProduct、fetchAdminProductDetail、deleteAdminProduct、restockAdminProduct | 商品payload或id；库存接口含stock | 商品ID、详情或库存结果；保存价格以规格为准 |
| fetchStructuredProductVariants、replaceStructuredProductVariants | 商品id，替换时含规格payload | 结构化规格结果；替换不是追加 |
| fetchAdminPointsProducts、fetchPointsProductDetail、createPointsProduct、updatePointsProduct、togglePointsProduct | 查询、商品id、payload或上下架状态 | 积分商品列表/详情/保存结果 |
| fetchCategories、fetchAdminCategories、createAdminCategory、updateAdminCategory、toggleAdminCategory、deleteAdminCategory | 查询、分类payload、id或显示状态 | 分类列表及维护结果；有子项时不能随意删除 |
| uploadAdminImages、resolveAdminFileUrls | File数组及folder/图片引用数组 | 上传引用数组/临时URL映射 |
| targetAdminUploadImage、targetMediaIntentId | File与folder/图片引用 | 上传许可引用/许可ID；仅支持JPG、PNG、WebP |
| fetchOrders、fetchOrderById、fetchPointsOrders、fetchPointsOrderDetail | 查询或订单id | 普通/积分订单列表与详情 |
| fetchPendingShipOrders、updateOrderShippingAddress、shipOrders、retryWechatShipping、delayOrderShipping | 查询、订单/地址payload、物流资料 | 待发货、地址更新、发货或延迟结果；可能影响真实订单 |
| fetchAdminRefunds、fetchPendingRefundCount、fetchAdminRefundDetail、reviewAdminRefund、executeAdminRefund | 查询、requestId、审核payload | 列表/数量/详情/审核或执行状态；到账仍看最终状态 |
| fetchUsers、fetchUsersWithTotal、fetchAdminUserDetail、updateAdminUser | 查询、用户id或修改payload | 用户列表/详情/更新；不要在演示中使用真实资料 |
| fetchScissorsAfterSales、fetchAfterSaleServiceAddresses、saveAfterSaleServiceAddress、updateScissorsAfterSale、replyScissorsAfterSale | 查询、售后payload、id和回复内容 | 售后工单、服务地址及处理结果 |
| fetchGiftCards、fetchGiftRecords、fetchGiftCardOptions、checkGiftCardCode、createGiftCard、importGiftCards、updateGiftCard | 查询、兑换码或保存/导入payload | 礼品卡及兑换记录；不要打印真实兑换码 |
| fetchAdminCoupons、previewCouponTargets、issueAdminCoupon、deleteAdminCoupon | 查询、预览条件或发券payload、id | 活动列表、预览、发券结果；发券是业务操作 |
| fetchAdminScissors、fetchAdminScissorsBatches、fetchAdminScissorsProducts、batchGenerateScissors、fetchAdminScissorsDetail、deleteUnusedScissors | 查询、批次/序列号payload、id数组 | 剪刀库存与批次结果 |
| fetchAdminBanners、fetchAdminBannerDetail、saveAdminBanner、toggleAdminBanner、updateAdminBannerSort、deleteAdminBanner、fetchBanners | 查询、id、轮播payload、状态/排序 | 轮播列表、详情和保存结果 |
| fetchInquiries、updateInquiryStatus | 查询、id和status | 咨询列表、状态更新 |
| fetchCouponRules、setCouponRule、deleteCouponRule | 旧规则参数 | 旧云开发入口，当前适配器拒绝调用，不当作已接入功能 |
| sfShip、sfBatchShip、sfConfirmShip、sfWaybillPrint、sfRoute、sfCancelWaybill、sfInterceptWaybill、sfHealth | 旧顺丰参数 | 当前服务器模式拒绝旧物流入口，不执行真实演示 |

后台常用路径：`/api/v1/admin/products`、`categories`、`orders`、`refund-requests`、`media/upload-intents`。具体HTTP方法、字段和状态以函数及server.js为准，不是所有函数都等于一个独立HTTP接口。

## 图片上传步骤

1. 用管理员会话申请上传许可，提交类型、文件大小和摘要。
2. 把文件上传到返回的COS地址。
3. 请求确认上传，再将返回引用用于商品保存。
4. 显示图片时重新取临时地址。签名过期后重新读商品，不把临时URL当成永久数据保存。

## 出错时怎么查

先看页面是否登录、请求路径和方法是否正确，再看Error.message或HTTP状态。401先检查会话，403先检查权限或代理限制，404确认记录是否存在，503可能是对应服务未配置或暂时不可用；不要直接换到旧云函数。

本说明按当前代码整理，不等于生产下单、退款、发货都已重新验收。写接口只在获准测试环境中调用。
