# 源 MySQL 实时资产复核

日期：2026-09-17  
方式：负责人已授权的 CloudBase MCP，只读查询 `information_schema` 与各表 `COUNT(*)`。  
范围：仅表名、引擎、排序规则和汇总行数；未读取、导出或保存任何业务行、个人信息、订单号、地址、兑换码、密钥或连接凭据。

## 结论

- 当前源库有 30 张 InnoDB 基表，未发现视图。
- 表的排序规则同时存在 `utf8mb4_unicode_ci` 与 `utf8mb4_0900_ai_ci`，最终迁移不能擅自合并或转换。
- 精确行数与 2026-09-15 的历史基线不完全相同，例如 `users`、`orders`、`scissors` 和积分支付日志均有变化。因此旧基线只用于规划，最终冻结窗口必须重新采集精确行数、DDL、索引和分块哈希。
- 本轮不是生产数据导出，也不改变当前“只迁 `users` 基础资料、其余业务数据不导出”的业务范围。

## 当前精确行数

| 表 | 行数 | 表 | 行数 |
|---|---:|---|---:|
| `addresses` | 8 | `after_sale_service_addresses` | 0 |
| `banners` | 5 | `categories` | 15 |
| `cooperation_inquiries` | 0 | `coupon_rules` | 4 |
| `coupons` | 13 | `gift_cards` | 10 |
| `gift_redeem_records` | 8 | `order_addresses` | 45 |
| `order_items` | 45 | `order_refund_requests` | 2 |
| `orders` | 45 | `points_categories` | 3 |
| `points_logs` | 11 | `points_order_items` | 0 |
| `points_order_refund_requests` | 0 | `points_orders` | 3 |
| `points_payment_logs` | 5 | `points_product_specs` | 4 |
| `points_products` | 4 | `product_specs` | 23 |
| `products` | 11 | `scissors` | 21 |
| `scissors_after_sale_messages` | 6 | `scissors_after_sales` | 6 |
| `user_addresses` | 0 | `user_coupons` | 0 |
| `user_scissors` | 10 | `users` | 52 |

## 非敏感结构摘要

- `information_schema.TRIGGERS`：当前源库未返回任何触发器。
- `information_schema.EVENTS`：当前源库未返回任何 MySQL 事件。
- 30 张表均有索引；每表索引数介于 2 至 7 个。该统计不替代完整索引定义，最终恢复仍须在受控位置导出和比较原始 DDL、索引列顺序、唯一性、外键、排序规则与 SQL 模式。

## 对放行的影响

- B-03 获得了新的资产范围与汇总证据，但仍未完成：受控源 DDL/索引/触发器/事件导出、最终冻结快照、分块哈希和目标恢复对账。
- 任何完整数据或 DDL 导出必须在负责人确认受控存储位置和执行窗口后进行；本文件不构成该授权。
- 订单、支付、库存、积分、优惠、礼品卡、工具、售后、地址、媒体和咨询数据仍不能据此迁移或切换。
