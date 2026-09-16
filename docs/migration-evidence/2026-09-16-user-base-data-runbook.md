# 用户基础资料迁移运行手册（2026-09-16）

本手册仅适用于已批准的 `users` 基础资料迁移。它不迁移商品、订单、地址、积分、优惠权益、工具、售后、媒体或会话。

## 受控执行环境

在一台受控迁移主机上执行，主机需同时具备源 CloudBase MySQL 和目标 MySQL 的最小权限迁移账号。源账号只允许读取 `users` 和 `information_schema`；目标账号只允许读取目标结构并向 `users`、`user_identities` 写入一次。

将源、目标连接参数分别保存在主机受限目录的环境文件中，目录权限为 `700`、文件权限为 `600`。环境文件使用以下变量名，但不得进入版本库、Shell 历史、命令行参数或聊天记录：

- 源：`SOURCE_MYSQL_HOST`、`SOURCE_MYSQL_PORT`、`SOURCE_MYSQL_USER`、`SOURCE_MYSQL_PASSWORD`、`SOURCE_MYSQL_DATABASE`
- 目标：`TARGET_MYSQL_HOST`、`TARGET_MYSQL_PORT`、`TARGET_MYSQL_USER`、`TARGET_MYSQL_PASSWORD`、`TARGET_MYSQL_DATABASE`

受控证据与快照放在迁移主机的私有目录，快照文件权限必须为 `600`。不得使用工作区、Git 仓库、对象公开目录或聊天附件保存快照。

## 固定顺序

1. 以最新已审核代码运行 `server/scripts/user-import-preflight.mjs`，分别传入源、目标数据库名和私有报告路径。该步骤只输出结构、汇总数与阻塞代码。
2. 只有预检报告的 `readyForIsolatedImport` 为 `true`，才运行 `server/scripts/user-basic-snapshot.mjs` 创建源库一致性只读快照。
3. 校验快照文件权限、汇总行数、空身份数和身份冲突数；任何异常均停止，不尝试手工修复或删除源记录。
4. 在隔离目标库演练 `server/scripts/import-user-basic-snapshot.mjs --snapshot <私有路径> --apply`。导入器要求目标 `users` 为空，并在一个事务中写入用户和身份绑定。
5. 对隔离库重新运行预检与用户汇总核验。通过后，另行记录生产导入窗口和执行证据；小程序认证开关继续关闭。

## 不通过时的处理

`SOURCE_USERS_WITHOUT_IDENTITY`、`TARGET_IDENTITY_UNIQUENESS_MISSING`、`USER_FIELD_TYPE_MISMATCH` 或任一结构缺失，均不得执行快照或导入。记录不含个人资料的汇总证据后，回到字段映射或身份例外处置。

脚本没有清理、覆盖或删除源数据的功能。目标非空、身份冲突或事务失败时，导入会中止并回滚目标事务。
