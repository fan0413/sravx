# 剪刀保修只读链路迁移记录（2026-09-17）

## 本轮范围

新增目标 API `GET /api/v1/tools/warranty?sn=...`，仅返回当前已登录用户自己已绑定工具的保修信息。

小程序 `getWarrantyInfo` 已具备目标 API 适配，但 `authenticatedApiMigration.features.toolsRead` 保持 `false`；现网小程序仍调用 CloudBase `scissors.warranty`。

## 安全与兼容处理

- 目标端不接受客户端传入用户 ID 或 OpenID，而是通过签名会话确定用户。
- 只有 `user_scissors` 中属于该用户且 SN 相同的记录可以读取；未知或他人 SN 返回 404。
- 此限制比旧函数按任意 SN 查询的行为更严格，避免借保修查询枚举其他工具资料。
- 本轮不启用工具绑定、解绑、积分发放、保修权益写入或售后写入。工具绑定会同时改变用户积分，归入积分事务迁移阶段处理。

## 验证

`server/npm test`：78 项通过、0 项失败。新增测试确认接口使用签名用户范围查询、未知 SN 返回 404。

## 部署核验

目标 API 制品已发布到 `sravx-api`。服务状态为 active，`/health` 和 `/readyz` 均成功；未认证访问保修接口返回 401。小程序配置未改动。
