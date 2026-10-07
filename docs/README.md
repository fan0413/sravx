# SRAVX 项目文档索引

更新日期：2026-09-22。本文用于区分当前执行文档、迁移证据与历史参考，避免以旧设计作为实现依据。

## 当前优先阅读

| 文档 | 用途 |
|---|---|
| [architecture.md](architecture.md) | 当前线上架构、代码导航和运行边界。 |
| [project-status-and-next-tasks.md](project-status-and-next-tasks.md) | 已完成范围、未完成事项和优先级。 |
| [cleanup-and-archive-register.md](cleanup-and-archive-register.md) | 清理候选、保留规则和待确认的破坏性操作。 |
| [cloudbase-to-cloud-server-migration-plan.md](cloudbase-to-cloud-server-migration-plan.md) | 迁移执行基线与放行门槛。 |
| [migration-execution-evidence-2026-09-21.md](migration-execution-evidence-2026-09-21.md) | 已执行迁移的证据与例外记录。 |

## 按主题查阅

| 主题 | 文档 |
|---|---|
| 数据模型与目标范围 | `database-design.md`、`target-data-scope.md`、`target-schema-mapping-draft.md` |
| 云函数去向与兼容 | `cloud-function-disposition-matrix.md`、`active-function-contract-inventory.md` |
| 支付 | `payment-api-migration-inventory.md`、`points-system-go-live-checklist.md` |
| 管理端 | `admin-web-migration-inventory.md`、`admin-rbac-contract.md` |
| 媒体与 COS | `target-cos-storage-architecture.md`、`legacy-media-reference-map.md` |
| 小程序验收 | `uniapp-target-safe-real-device-checklist.md`、`compatibility-test-priority.md` |

## 历史文档使用规则

`technical-architecture.md`、早期 CloudBase 部署文档和历史盘点只用于追溯来源与兼容判断。实现或上线决策应以“当前优先阅读”中的文档为准。
