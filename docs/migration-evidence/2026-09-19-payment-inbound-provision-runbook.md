# 支付入站库创建交接（2026-09-19）

## 已执行的检查

- 目标 API 使用的迁移账号可连接业务库 `sravx_pet`，但权限仅限该库。
- 经负责人确认后，尝试创建独立库 `sravx_payment_inbound`；数据库返回权限拒绝，未创建数据库、表或账号。
- 因此没有降级为在业务事实库中保存回调，也没有开启目标回调路径。

## 数据库管理员执行项

在托管 MySQL 控制台或具备实例级权限的安全会话中，使用 [最小权限模板](../../server/migrations/006_payment_inbound_provision.template.sql)：

1. 创建 `sravx_payment_inbound` 独立库。
2. 在该库执行 `006_payment_inbound_ledger.sql`；先在隔离恢复库验证，再执行生产库。
3. 创建仅允许来自 API 服务器私网地址 `10.0.0.15` 的 `sravx_payment_ingress` 账号，只授予 `payment_inbound_events` 的 `INSERT`、`UPDATE`。
4. 在服务器受控文件 `/home/deploy/.config/sravx/payment-inbound.env` 写入以下变量，权限设为 `0600`、所有者为 `deploy`：

```text
PAYMENT_INBOUND_MYSQL_HOST=...
PAYMENT_INBOUND_MYSQL_PORT=3306
PAYMENT_INBOUND_MYSQL_DATABASE=sravx_payment_inbound
PAYMENT_INBOUND_MYSQL_USER=sravx_payment_ingress
PAYMENT_INBOUND_MYSQL_PASSWORD=...
```

不在此步骤填写或开启 `PAYMENT_CALLBACK_ENABLED`、`WECHAT_PAY_API_V3_KEY`、`WECHAT_PAY_PLATFORM_CERTIFICATES_JSON`、`PAYMENT_INBOUND_ENCRYPTION_KEY`。这些配置属于回调接入与密钥管理阶段，须在演练通过后单独授权。

## 交付后验证

数据库管理员完成前述步骤后，只需告知“入站库已创建”。系统随后会进行不读取业务数据的结构、权限和隔离性验证；仍不会调用微信支付或修改微信支付回调地址。
