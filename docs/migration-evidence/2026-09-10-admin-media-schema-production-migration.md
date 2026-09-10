# 2026-09-10 后台 RBAC 与上传意图表生产迁移

- 已执行 `server/migrations/003_admin_rbac_and_media_intents.sql`；此前已在无网络隔离 MySQL 容器中完成恢复与迁移演练。
- 目标库现为 37 张表，新增 `admin_accounts`、`admin_roles`、`admin_account_roles`、`admin_audit_events` 与 `media_upload_intents`。
- 受控基线：`/home/deploy/migration-private/target-with-admin-media-schema-baseline-20260910.json`，权限 0600。37 张表合计 0 行。
- API 服务健康检查通过。未创建后台账号、角色记录或 COS 上传意图，未配置 COS 密钥，未开放后台或上传接口。
