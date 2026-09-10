# 2026-09-10 会话持久化迁移记录

- 已在隔离、无网络的 MySQL 8 容器中，从受控逻辑备份恢复业务库段并应用 `001_user_sessions.sql`；容器自动清理。
- 已将同一 SQL 应用于目标 MySQL。变更前 30 张表且无 `user_sessions`；变更后 31 张表，新增表 10 个字段、5 个索引。
- 变更后受控零数据基线：`/home/deploy/migration-private/target-with-session-schema-baseline-20260910.json`，权限 0600，31 张表合计 0 行。
- API 已改为为登录令牌签发随机会话标识，只存其 SHA-256 摘要；受保护接口会校验未撤销、未过期的持久化会话。服务已重启且内部健康检查通过。
- 未执行微信登录、未导入源业务数据、未开放公网 API 路由。
