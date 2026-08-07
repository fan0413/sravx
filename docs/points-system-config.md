# 积分系统配置说明（环境变量与权限）

## 1. CloudRun `payment-api` 环境变量

| 变量名 | 必填 | 说明 |
|---|---|---|
| `CLOUDBASE_ENV_ID` | 是 | 云开发环境 ID |
| `PAY_APP_ID` | 是 | 微信小程序 AppID |
| `PAY_MCH_ID` | 是 | 微信支付商户号 |
| `PAY_API_V3_KEY` | 是 | 微信支付 APIv3 密钥 |
| `PAY_PRIVATE_KEY` | 是 | 商户私钥 PEM |
| `PAY_SERIAL_NO` | 是 | 商户证书序列号 |
| `PAY_CALLBACK_URL` | 是 | 回调域名（不含路径） |
| `PAY_PUBLIC_KEY` | 否（建议） | 微信支付平台公钥 |
| `PAY_PUBLIC_KEY_ID` | 否（建议） | 微信支付平台证书序列号 |

## 2. 云函数权限建议

### 2.1 对外可调用动作
- `product.pointsList`
- `product.pointsDetail`
- `order.createPointsOrder`
- `order.listPointsOrders`
- `order.getPointsOrderDetail`
- `order.cancelPointsOrder`
- `order.refundPointsOrder`（如开放给用户则需二次校验）

### 2.2 内部服务专用动作
- `order.updatePaymentStatusByOrderNo`
- `order.getOrderForPayment`
- `order.updateRefundStatus`

### 2.3 安全控制建议
- CloudRun -> 云函数调用增加服务签名或来源白名单。
- 数据库账号使用最小权限（仅允许业务库读写、禁止 DDL）。
- 支付回调必须启用验签，缺失平台公钥时只允许测试环境跳过验签。

## 3. 数据一致性依赖

- `points_orders.idempotency_key` 唯一索引必须存在。
- `points_payment_logs.idempotency_key` 唯一索引必须存在。
- 事务隔离级别建议 `READ COMMITTED` 或以上，库存与积分更新全链路走同一事务。
