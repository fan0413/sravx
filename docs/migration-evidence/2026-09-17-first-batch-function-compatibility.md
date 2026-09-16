# 第一批云函数兼容实现记录

日期：2026-09-17

## 已完成的本地实现

- 新 API 运行时已装配微信 code 登录、服务端会话、手机号 code 绑定、用户资料、地址和公开目录仓储。
- 小程序 `login` 已改为受 `authenticatedApiMigration.enabled` 控制：关闭时保持调用 CloudBase `login`；开启后调用目标 API 的会话。资料、地址和咨询另由 `features.profile`、`features.addresses`、`features.inquiries` 分项开关控制，默认关闭。
- 目标登录结果不回传 OpenID 或 UnionID。小程序改以目标用户 ID 和签名会话维持登录态，避免新链路继续依赖客户端身份标识。
- 目录读取仍由独立的 `readOnlyApiMigration.enabled` 控制，目标目录为空时维持既有空集合响应形状。

## 验证

- 服务器 `sravx-api` 服务状态为 active，`/health` 与 `/readyz` 返回成功。
- 服务端测试通过：72 项通过、0 项失败。
- 小程序改动已通过 Node 语法检查；未在微信开发者工具、真实设备或生产小程序中启用。

## 未放行项

- 用户基础资料尚未完成最终快照、写入冻结和正式导入，因此认证迁移开关保持关闭。
- 优惠券、礼品卡、订单、支付、物流、售后及历史剪刀资料均不在本批迁移范围；旧 CloudBase 数据不删除。
- 小程序发布、微信平台配置和生产流量切换仍需要负责人明确确认。
