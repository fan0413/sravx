# 第一批小程序 API 兼容合同（本地准备）

更新：2026-09-10。此文档根据 `miniprogram/utils/api.js` 的静态调用点整理，只定义待实现的兼容边界；未部署 API、未修改小程序、未改变 CloudBase 或生产数据。

## 范围结论

- 第一批为 7 天内有实际调用证据的 14 个函数：`address`、`admin-banner`、`admin-order`、`admin-product`、`admin-stats`、`banner`、`category`、`coupon`、`giftCard`、`login`、`order`、`product`、`scissors`、`user`。
- `paymentProxy` 与 CloudBase Run 的 `payment-api` 属支付链路，负责人决定最后改动；本合同不定义其新接口或切换方式。
- `contact` 在小程序有静态调用，但 7 天调用指标为零，按照负责人“仅保留有实际应用的”决定，不进入首批新 API。切换前必须决定该入口显示维护提示还是恢复迁移，不能让它无声失败。
- 零调用的后台、物流、低代码和模板函数继续作为旧端观察/退役候选，未获准下线。

## 客户端现有调用合同

| 业务域 | 现有函数与 action | 第一批新服务处理 | 风险/验收重点 |
|---|---|---|---|
| 登录 | `login`（无 action） | 微信登录 code 换取服务端会话；手机号授权流程独立校验。 | 不信任客户端 OpenID；不记录登录 code、手机号原文或会话密钥。 |
| 用户与积分 | `user`: `getInfo`、`updateInfo`、`getPoints`、`getPointsLogs`、`getMemberLevel` | 会话身份决定用户；积分只读查询与写入事务分离。 | 不能由客户端指定用户 ID 或积分余额。 |
| 商品 | `product`: `home`、`list`、`detail`、`pointsList`、`pointsDetail` | 新商品目录从空状态开始，读取 COS 对象键并签发受限访问。 | 历史订单仍用历史快照，不能跳转到新商品。 |
| 分类与轮播 | `category`: `list`、`tree`；`banner`（`position` 参数） | 空目录阶段返回稳定空集或明确维护状态。 | 不引用 CloudBase 临时链接。 |
| 地址 | `address`: `list`、`add`、`update`、`delete`、`setDefault` | 每次按会话所有者筛选；默认地址切换用事务。 | IDOR/越权读写测试必须通过。 |
| 优惠券 | `coupon`: `list`、`my`、`receive`、`check` | 同时覆盖小程序已调用 action 与两份本地源码出现过的 action 并集，待线上安全制品比对后确认最终保留项。 | DR-03 未决前禁止旧券用于新目录；领取和核销必须有事务与唯一约束。 |
| 礼品卡 | `giftCard`: `redeem`、`confirmProductAddress`、`records` | 兑换和商品礼品地址确认使用同一事务边界。 | 兑换码不进日志；重复提交仅产生一次有效兑换。 |
| 剪刀与售后 | `scissors`: `list`、`bind`、`unbind`、`warranty`、`afterSaleDetail`、`afterSaleApply`、`afterSaleShip` | 合同覆盖 D/E 两份本地源码出现过的 action 并集，再以安全线上制品比对收敛。 | 序列号唯一性、绑定归属、售后记录归属都需越权测试。 |
| 订单与积分订单 | `order`: `list`、`detail`、`create`、`createPointsOrder`、`listPointsOrders`、`getPointsOrderDetail`、`cancelPointsOrder`、`refundPointsOrder`、`applyPointsRefund`、`cancel`、`confirmReceive`、`getWaybillToken`、`applyRefund`、`listRefundRequests` | 仅准备合同；实际写入、退款、物流和支付依赖支付模块最后一并演练。 | 写操作必须服务端事务和持久化幂等；冻结/回调协议见迁移计划第 13 节。 |
| 管理端 | `admin-banner`、`admin-order`、`admin-product`、`admin-stats` 的动作见函数合同盘点 | 管理端会话和角色权限独立于小程序用户会话。 | 每个写操作记录审计事件；无管理员角色不可访问。 |

## 已识别的不兼容点与改造原则

1. 当前 `callFunction` 在认证调用中可附带客户端 `openid`。新服务只接受服务端验证的会话身份，忽略任何请求体中的用户标识。
2. 当前积分下单由客户端生成 `idempotencyKey`。新服务保留该键作为请求去重输入，但必须绑定会话用户、请求摘要和数据库唯一约束；不能只靠“先查询再写入”。
3. 当前 API 层把云函数 `{ success, data, error }` 包装成 Promise。新 API 在小程序改造时应保留等价的成功/失败语义，并为业务错误提供稳定错误码；具体 URL、Header 和 Token 格式留待认证合同完成后定义。
4. 商品、分类、积分商品和轮播会由负责人重新上传。新 API 不复制 CloudBase 旧媒体，也不将旧对象 URL 写入目标库。

## 本轮未放行事项

- 未取得所有线上函数的安全制品标识和完整调用方证据，B-01/B-02 仍未放行。
- 登录会话、管理员 RBAC、优惠券规则、订单写入、支付回调入站、旧版兼容桥都尚未实现或演练。
- 任何 API 部署、小程序替换、域名绑定、支付配置、生产数据导入或 CloudBase 资源变更均不包含在本轮。

## 下一步

先建立不含支付的本地 API 工程骨架与会话/权限接口测试；其后按本合同逐模块实现只读目录与用户域，再进入订单、礼品卡和支付专项演练。代码实现开始前需按变更安全协议取得负责人对具体代码范围的确认。
