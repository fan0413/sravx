# 支付回调入站基础实现记录（2026-09-19）

## 本次范围

- 重新只读核验线上 `paymentProxy` 与 `wxpayFunctions`：两者仍为 Active，未修改、未停用，也未更改微信支付平台配置。
- 目标 API 新增默认关闭的微信支付回调接收路径：`POST /api/v1/payments/wechat/notifications`。
- 回调仅在 `PAYMENT_CALLBACK_ENABLED=true`、独立入站 MySQL 配置、平台证书、APIv3 密钥和入站加密密钥全部存在时启用；未启用时该路径返回 404。
- 启用后的接收顺序为：保留原始 HTTP 字节 → 按 `Wechatpay-*` 头与对应平台证书验签 → 解密资源 → 对原始报文做 SHA-256 摘要并加密 → 以微信事件 ID 唯一约束写入独立入站库 → 仅在持久化成功后返回 204。
- 新增草案迁移 `server/migrations/006_payment_inbound_ledger.sql`，定义 `payment_inbound_events` 与 `payment_event_consumptions`。原始回调内容仅以 AES-256-GCM 密文保存在入站库；应用未提供读取该内容的 HTTP 接口，也不写入审计日志。

微信支付要求使用 `Wechatpay-Serial` 选择平台证书、以时间戳/随机串/原始报文构造验签串，并使用平台公钥验签；回调资源使用 APIv3 密钥的 AES-256-GCM 加密。[签名验证说明](https://wechatpay-api.gitbook.io/wechatpay-api-v3/qian-ming-zhi-nan-1/qian-ming-yan-zheng) [回调报文解密说明](https://wechatpay-api.gitbook.io/wechatpay-api-v3/qian-ming-zhi-nan-1/zheng-shu-he-hui-tiao-bao-wen-jie-mi)

## 验证

- `server` 自动测试：85 通过，0 失败。
- 覆盖了有效签名与解密、篡改及过期签名拒绝、未启用路径隐藏、只有落库后才确认、以及数据库唯一键去重。
- 已发布目标 API 代码版本 `17e837a`；发布后 `sravx-api` 为 active、`/readyz` 返回 ready、公开 `/health` 返回 200，支付回调路径在本机仍返回 404。
- 经负责人授权，已在现有 `sravx_pet` 库执行入站表迁移，**仅作演练**。应用账号对同一合成事件连续写入两次后得到一条记录、`duplicate_count=1`，随即删除合成记录；两个入站表当前均为 0 行。
- 未创建独立入站数据库，未写入任何真实支付数据，未发起支付、退款或物流请求。

## 尚未完成，不能切换

1. 建立独立于业务事实库的入站 MySQL 库与最小权限账号，并在隔离恢复库执行迁移与重放演练。现有业务库演练不能替代此项。
2. 受控配置平台证书轮换、APIv3 密钥、入站加密密钥和商户 API 私钥；密钥不进入代码库、文档或日志。
3. 实现服务端创建支付订单、订单金额/用户归属复核、退款审批与退款发起；这些操作必须各自具备事务、RBAC、审计和业务幂等约束。
4. 实现消费者：只有业务事务提交后才将入站事件标为已处理，并覆盖付款、退款、关单与库存/积分并发情形。
5. 演练重复通知、消费者提交后宕机、冻结期间到达、未知订单/金额不符、平台证书轮换和逐笔对账。
6. 经负责人明确确认后，才可配置微信支付回调地址、开启目标接收器和进行任何真实支付或退款测试。
