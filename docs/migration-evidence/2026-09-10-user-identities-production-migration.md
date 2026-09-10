# 2026-09-10 统一身份表生产迁移

- 已执行 `server/migrations/002_user_identities.sql`。此前已在无网络隔离 MySQL 容器中以受控逻辑备份完成恢复与迁移演练。
- 变更后目标库为 32 张表；`user_identities` 有 6 个字段、4 个索引。
- 受控基线：`/home/deploy/migration-private/target-with-identity-schema-baseline-20260910.json`，权限 0600。32 张表合计 0 行，`user_identities` 为 0 行。
- API 服务健康检查通过。未修改现有用户、订单、积分、地址或媒体数据；未启用网页登录或小程序新 API 路由。
