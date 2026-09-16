# 第一批小程序 API 兼容合同（本地准备）

更新：2026-09-17。此文档根据 `miniprogram/utils/api.js` 的静态调用点整理，只定义待实现的兼容边界；未切换小程序流量、未改变 CloudBase 或生产数据。

## 范围结论

- 第一批只迁移可在“仅保留用户基础资料、目录从空状态重建”的目标范围内独立运行的链路：`login`、`user`、`banner`、`category`、`product`，以及为用户资料服务的 `address`。
- 小程序已加入受开关控制的目标登录兼容层：关闭时继续调用 CloudBase `login`；开启后使用微信 code 换取目标服务会话。认证请求再按 `profile`、`addresses`、`inquiries` 分项开关决定是否走目标 API，默认仍全部关闭，直到各自通过导入与真实设备回归。
- `coupon`、`giftCard`、`order`、积分订单、支付、物流、售后和历史剪刀数据不在本批目标范围。旧 CloudBase 只作历史参考，不删除、不向目标库复制。
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
| 优惠券 | `coupon`: `list`、`my`、`receive`、`check` | 本批不迁移，旧数据不导入。未来若重新启用，单独设计新的发放、领取、核销和审计规则。 | 禁止将旧券用于新目录或恢复旧权益。 |
| 礼品卡 | `giftCard`: `redeem`、`confirmProductAddress`、`records` | 本批不迁移，旧余额和兑换记录不导入。未来若重新启用，单独完成幂等、事务和对账演练。 | 兑换码不得进入日志；不得恢复旧礼品卡权益。 |
| 剪刀与售后 | `scissors`: `list`、`bind`、`unbind`、`warranty`、`afterSaleDetail`、`afterSaleApply`、`afterSaleShip` | 合同覆盖 D/E 两份本地源码出现过的 action 并集，再以安全线上制品比对收敛。 | 序列号唯一性、绑定归属、售后记录归属都需越权测试。 |
| 订单与积分订单 | `order`: `list`、`detail`、`create`、`createPointsOrder`、`listPointsOrders`、`getPointsOrderDetail`、`cancelPointsOrder`、`refundPointsOrder`、`applyPointsRefund`、`cancel`、`confirmReceive`、`getWaybillToken`、`applyRefund`、`listRefundRequests` | 本批不迁移、不导入历史订单，也不开放目标端写入。 | 后续必须按迁移计划第 13 节完成事务、持久化幂等、支付回调入站和冻结演练。 |
| 管理端 | `admin-banner`、`admin-order`、`admin-product`、`admin-stats` 的动作见函数合同盘点 | 管理端会话和角色权限独立于小程序用户会话。 | 每个写操作记录审计事件；无管理员角色不可访问。 |

## 已识别的不兼容点与改造原则

1. 当前 `callFunction` 在认证调用中可附带客户端 `openid`。新服务只接受服务端验证的会话身份，忽略任何请求体中的用户标识。
2. 当前积分下单由客户端生成 `idempotencyKey`。新服务保留该键作为请求去重输入，但必须绑定会话用户、请求摘要和数据库唯一约束；不能只靠“先查询再写入”。
3. 当前 API 层把云函数 `{ success, data, error }` 包装成 Promise。新 API 在小程序改造时应保留等价的成功/失败语义，并为业务错误提供稳定错误码；具体 URL、Header 和 Token 格式留待认证合同完成后定义。
4. 商品、分类、积分商品和轮播会由负责人重新上传。新 API 不复制 CloudBase 旧媒体，也不将旧对象 URL 写入目标库。
5. 认证迁移开关不能作为总开关使用。订单、积分订单、礼品卡、剪刀绑定与售后等未列入分项开关的请求必须始终回退 CloudBase，直至资金或对应业务阶段单独放行。

## 本轮未放行事项

- 未取得所有线上函数的安全制品标识和完整调用方证据，B-01/B-02 仍未放行。
- 微信登录、用户资料和目录读取已有目标 API 与受开关控制的小程序兼容层；尚未在真实用户环境启用或验收。
- 管理员 RBAC、优惠券规则、订单写入、支付回调入站、物流和旧版兼容桥仍未实现或演练。
- 任何 API 部署、小程序替换、域名绑定、支付配置、生产数据导入或 CloudBase 资源变更均不包含在本轮。

## 下一步

先完成用户资料最终导入前的真实设备回归，再按本合同启用登录、用户与空目录读取；订单、礼品卡和支付只在各自专项设计与演练放行后处理。
