# 首个后台管理员初始化

这份工具用于迁移期间建立首个拥有目录编辑权限的后台账号。它会写入目标生产数据库，必须在业务负责人明确确认账号名、角色和执行时机后才可使用。

## 前置条件

- 目标 API 服务的受限运行账户可读取其受控 MySQL 配置文件；
- 迁移 `003_admin_rbac_and_media_intents.sql` 已完成；
- 已确定账号名，默认角色为 `catalog_editor`；
- 密码通过受控环境变量提供，长度至少 12 位，不能写入 Git、文档、shell 历史或日志。

## 演练与执行

先在服务器上加载受控运行环境，并仅检查参数：

```bash
node /opt/sravx-api/scripts/bootstrap-admin.mjs --username <管理员账号>
```

负责人确认后，在服务器 SSH 终端执行以下命令；密码会以隐藏输入方式要求输入两次，不进入聊天、命令历史或 Git：

```bash
sudo -u deploy node /opt/sravx-api/scripts/bootstrap-admin.mjs --username <管理员账号> --apply --prompt-password
```

工具拒绝覆盖现有同名账号；成功后仅输出成功状态，不输出密码或哈希。只有不具备交互终端的受控自动化场景才使用 `ADMIN_BOOTSTRAP_PASSWORD` 环境变量。

创建完成后，使用后台登录接口验证该账号可获得独立管理员会话；随后在受控审计证据中记录账号已创建和角色已授予的结论，不记录账号名、密码、哈希或会话令牌。
