# 积分系统测试与验收报告

## 1. 范围
- 数据库：`points_products`、`points_orders`、`points_payment_logs`
- 云函数：`product(pointsList/pointsDetail)`、`order(create/list/detail/cancel/refund + 支付回调联动)`
- 支付链路：`payment-api` 创建支付、支付回调、退款

## 2. 单元测试清单（应覆盖）

| 场景 | 预期 |
|---|---|
| 正常兑换 | 创建成功，生成唯一订单号，冻结库存、预扣积分 |
| 库存不足 | 拒绝下单，库存不变化，积分不变化 |
| 重复提交（相同幂等键） | 返回幂等命中，订单仅一条 |
| 并发兑换 | 无超卖，库存和销量一致 |
| 支付超时取消 | 订单取消，积分返还，冻结库存释放 |
| 已支付重复回调 | 幂等返回，不重复扣库存/记流水 |
| 退款成功 | 积分返还，库存回滚，状态置 `refunded` |

## 3. 集成测试闭环（小程序）

1. 浏览积分商品：`pointsMall` 正常展示分类与可兑换标识。
2. 进入详情下单：`pointsProductDetail` 创建积分订单成功。
3. 混合支付：`payment-api/createOrder(orderType=points)` 成功返回支付参数。
4. 回调落账：微信回调后订单推进到 `pending_send`。
5. 详情核验：`pointsOrderDetail` 可见商品快照、支付状态、地址信息。
6. 取消/退款：执行取消或退款后，积分余额和库存回滚一致。

## 4. 性能压测验收标准

- 并发数：100
- 验收口径：
- `stock_available` 不为负，且不出现超卖。
- `users.points` 不为负。
- `points_payment_logs` 幂等键无重复冲突写入。
- 压测脚本：`scripts/tests/points_loadtest.js`

## 5. 对账报告口径

### 5.1 日终积分对账
- 账户余额：
- `users.points(期末) = users.points(期初) + SUM(points_payment_logs.points_change)`
- 流水核对：
- 同一订单 `freeze + confirm + unfreeze/refund` 方向与总量闭合。

### 5.2 库存对账
- `stock_total = stock_available + stock_frozen + sales_count`（按商品核验）
- 订单销量与商品销量一致：
- `SUM(points_orders.quantity where status in paid/pending_send/shipped/completed/refunding/refunded)` 与 `points_products.sales_count` 一致（按业务定义核验退款回滚口径）。

## 6. 本次改造结果

- 已完成：数据库迁移/回滚脚本、积分订单状态机、支付回调双通道、退款通道、前端 API 对接。
- 待执行：真实环境压测与截图留档、联调验收录屏。

## 7. 截图占位（上线前补齐）

- 压测结果截图：`docs/assets/points-loadtest-100-concurrency.png`
- 对账结果截图：`docs/assets/points-reconcile-daily.png`
