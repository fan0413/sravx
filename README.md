# SRAVX 主开发仓库

主开发目录：`E:\sravxapp`。`D:\saven` 仅为历史备份，后续代码修改、提交与推送均在 E 盘执行。

| 目录 | 内容 |
|---|---|
| `sravx/` | 当前官网 H5 与微信小程序 UniApp 源码 |
| `server/` | 目标 API、数据库迁移、后端测试 |
| `admin-web/` | 管理端 Vue 前端 |
| `docs/` | 项目状态、架构、迁移执行计划与证据 |
| `miniprogram/`、`cloudfunctions/`、`cloudrun/` | 旧系统兼容源码与历史参考 |

先阅读 [项目状态](docs/project-status-and-next-tasks.md)、[主开发目录约定](docs/workspace-primary-e-drive.md) 与 [执行规则](AGENTS.md)。生产迁移仍遵循 [迁移执行计划](docs/cloudbase-to-cloud-server-migration-plan.md)。

本地检查：在 `server` 执行 `npm test`；在 `admin-web` 执行 `npm run build`；在 `sravx` 执行 `npx cross-env UNI_INPUT_DIR=. uni build -p h5` 或 `npm run build:mp-weixin`。各模块先通过锁文件安装依赖，环境配置单独管理，不提交密钥或构建输出。
