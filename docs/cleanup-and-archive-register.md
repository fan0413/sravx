# 清理与归档台账

更新日期：2026-09-22。此台账将“可删除”与“看起来多余但仍有用途”分开。生产密钥、生产数据、数据库表、SSH 密钥和回退发布目录在获得负责人确认前不得删除。

## 已完成的安全检查

| 范围 | 发现 | 当前处理 |
|---|---|---|
| 服务器 SSH | `ubuntu` 账号有 3 把授权公钥：1 把用户密钥、2 把迁移密钥。 | 全部保留。每一把都可能是当前或紧急访问路径，需先做逐把登录验证后才可移除。 |
| SSH 配置 | 有 `00-sravx-hardening.conf`、`50-cloud-init.conf`、`99-codex-hardening.conf` 三个配置片段。 | 全部保留；当前服务正常，不能按文件名判断重复。 |
| API 发布目录 | 当前版本加 7 个备份目录，约 88 MB。 | 保留至少当前版本与最近一个已验证回退版本；其余列入轮换候选。 |
| 目标数据库 | 44 张表，包含用户、目录、订单、支付、后台会话和旧兼容 schema。 | 不直接删表。空表不代表无用，当前 API、迁移脚本或兼容逻辑可能依赖它。 |
| 本地小程序 | `E:/sravxapp/sravx` 为当前源码；`D:/saven/uniapp` 为未跟踪旧副本；`D:/saven/miniprogram` 为 CloudBase 历史参考。 | 当前源码保留；旧副本待归档核验；CloudBase 参考保留至退役批准。 |

## 可审查的清理候选

| 候选 | 原因 | 建议动作 | 前置核验 |
|---|---|---|---|
| `/opt/sravx-api.backup-*` 中较早的 6 个版本 | 只有回滚用途，当前共约 75 MB。 | 保留最近一个已验证备份与当前版本，其余先压缩归档，稳定期后删除。 | 确认最近备份可启动、近 7 日无回滚需求。 |
| `D:/saven/uniapp` | 与当前 E 盘 UniApp 不是同一版本，且未被 Git 跟踪。 | 先生成只读清单与压缩归档，再移出工作区。 | 确认 E 盘版本可完整构建，且旧副本不含未合并修改。 |
| `D:/saven/temp_cf`、`temp_sync_backup`、`outputs`、`video_frames`、`temp_images` | 迁移与素材临时目录，总计约 30 MB。 | 按日期压缩到受控归档或删除。 | 检查不被迁移证据、部署脚本或当前构建引用。 |
| `payment-callback-foundation-17e837a.tar.gz` | 本地支付代码快照。 | 移入受控迁移归档。 | 保留 SHA-256 与对应证据引用。 |
| `tmp_mcp_stdout.txt`、`tmp_mcp_stderr.txt` | 旧 MCP 调试输出。 | 删除。 | 确认不含唯一故障证据。 |
| `WXBizDataCrypt.js`、`test-cloudfunction.js`、根目录 `config.json` | 未跟踪的历史辅助文件。 | 先检索引用，再归档或删除。 | 静态引用为零且不属于当前构建入口。 |

## 数据库候选，不自动执行

目标库中的旧兼容表如 `coupons`、`coupon_rules`、`user_coupons` 可能不被当前新优惠券模块使用，但它们属于旧 schema 恢复范围。删除前必须同时满足：

1. 服务器 API、管理端、UniApp 和 CloudBase 兼容路径均无引用；
2. 目标库无业务数据或数据已获得明确处置决定；
3. 已完成可恢复备份和恢复演练；
4. 负责人明确批准具体表名和删除窗口。

## 推荐的保留策略

- SSH：至少保留一个用户控制的密钥和一个可验证的运维密钥；删除前必须在独立终端验证保留密钥可登录。
- 发布目录：保留当前版本、最近一次已验证回退版本及 7 天以内发布记录。
- 数据库：先清理数据和调用依赖，再删表；不将“空表”作为充分理由。
- 本地文件：先归档再删除，归档文件放入 Git 忽略且受权限控制的位置。
- 旧 CloudBase：仅在支付、物流、旧客户端、售后和后台迁移均验收后申请退役。

## 本轮结论（2026-09-22）

- 根目录 `config.json` 是 CloudBase OpenAPI 权限配置，`cloudbaserc.json` 是环境与区域配置；两者内容不同，均保留。
- 根目录 `WXBizDataCrypt.js` 与 `cloudfunctions/login/WXBizDataCrypt.js` 的 SHA-256 完全相同，且当前仓库无根目录副本引用；根目录副本已删除，云函数内副本保留。
- `test-cloudfunction.js` 是旧 CloudBase 支付函数的手动测试脚本。旧支付链路尚未退役，保留到退役验收完成。
- `tmp_mcp_stdout.txt` 与 `tmp_mcp_stderr.txt` 是 2026-04 的失效本地 MCP 调试输出，已删除。
- 静态检索显示 `coupon_rules`、`points_categories`、`points_order_refund_requests`、`user_addresses` 当前未在服务或管理端代码中命中；这不足以证明可删除，仍按本台账的数据库删除前置条件处理。
