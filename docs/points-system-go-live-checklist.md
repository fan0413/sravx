# 积分系统上线检查清单

## 1. 灰度发布步骤

1. 执行数据库迁移：`scripts/mysql/points_system_migration.sql`。
2. 发布云函数：`order`、`product`，并确认 `payment-api` 已部署最新版本。
3. 先灰度内部账号（白名单用户）验证以下链路：
- 浏览积分商品
- 创建积分订单
- 混合支付回调
- 详情查询
- 取消/退款
4. 灰度比例从 5% -> 20% -> 50% -> 100% 逐步放量，每阶段观察 30 分钟。

## 2. 环境变量与配置核对

### 2.1 CloudRun `payment-api`
- `CLOUDBASE_ENV_ID`
- `PAY_APP_ID`
- `PAY_MCH_ID`
- `PAY_API_V3_KEY`
- `PAY_PRIVATE_KEY`
- `PAY_SERIAL_NO`
- `PAY_CALLBACK_URL`
- `PAY_PUBLIC_KEY`（建议配置，回调验签）
- `PAY_PUBLIC_KEY_ID`（建议配置，回调验签）

### 2.2 云函数权限
- `order` 与 `product` 允许登录用户调用。
- `order.updatePaymentStatusByOrderNo`、`updateRefundStatus` 仅允许内部服务调用（通过网关/签名/白名单控制）。
- 云函数具备 MySQL 连接权限，且最小权限账户只开放必要库表。

## 3. 监控指标

- 订单指标：
- `points_orders` 创建成功率
- `pending_payment` 超时滞留数
- `refunding` 长时间未闭合数
- 资金与积分指标：
- `points_payment_logs` 幂等冲突数
- 用户积分负值数（应为 0）
- 支付指标：
- `payment-api` 回调成功率
- 回调验签失败率
- 微信支付下单失败率
- 库存指标：
- `points_products.stock_available` 最小值（不应 < 0）
- 库存对账差异数（库存与销量不一致）

## 4. 回滚方案

1. 应用层回滚：
- 回滚 `order`、`product` 云函数至上一稳定版本。
- 回滚 `payment-api` 容器版本。
2. 数据层回滚：
- 在确认无新积分订单写入后执行 `scripts/mysql/points_system_rollback.sql`。
3. 紧急止血：
- 将积分商品全部下架（`points_products.is_on_sale=0`）。
- 暂停积分订单入口（小程序开关）。

## 5. 验收结论门槛

- 100 并发压测无超卖、无积分负值。
- 日终对账：积分余额与流水净额一致。
- 库存对账：库存与订单销量一致。
- 支付回调重放不产生重复扣减（幂等通过）。
