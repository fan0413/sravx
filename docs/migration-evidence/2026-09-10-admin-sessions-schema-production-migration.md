# 2026-09-10 管理员会话表生产迁移

- 已执行 `server/migrations/004_admin_sessions.sql`；此前已在无网络隔离 MySQL 容器中按 003→004 顺序完成演练。
- 目标库现为 38 张表；`admin_sessions` 有 10 个字段，当前为 0 行。
- 受控基线：`/home/deploy/migration-private/target-with-admin-sessions-schema-baseline-20260910.json`。38 张表合计 0 行。
- API 服务健康检查通过。未创建管理员账号、角色或后台登录入口，未开放公网 API。
