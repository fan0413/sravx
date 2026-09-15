# MySQL 实时表与行数基线（2026-09-15）

## 采集方式

对源 MySQL 运行只读 `information_schema` 表清单查询和逐表 `COUNT(*)`。未查询或输出任何业务记录字段、个人信息、订单号、地址、兑换码或支付信息。

## 范围变化

当前源库有 **30 张**业务表，不再是迁移计划早期记录的 27 张。新增纳入范围的表为：`after_sale_service_addresses`、`scissors_after_sales`、`scissors_after_sale_messages`。

## 精确行数

| 表 | 行数 | 表 | 行数 |
|---|---:|---|---:|
| addresses | 8 | after_sale_service_addresses | 0 |
| banners | 5 | categories | 15 |
| cooperation_inquiries | 0 | coupon_rules | 4 |
| coupons | 13 | gift_cards | 10 |
| gift_redeem_records | 8 | order_addresses | 45 |
| order_items | 45 | order_refund_requests | 2 |
| orders | 45 | points_categories | 3 |
| points_logs | 11 | points_order_items | 0 |
| points_order_refund_requests | 0 | points_orders | 3 |
| points_payment_logs | 5 | points_product_specs | 4 |
| points_products | 4 | product_specs | 23 |
| products | 11 | scissors | 21 |
| scissors_after_sale_messages | 6 | scissors_after_sales | 6 |
| user_addresses | 0 | user_coupons | 0 |
| user_scissors | 10 | users | 52 |

## 结论

本基线只用于确认当前迁移范围和演练规模，不能替代最终冻结后的全量计数、分块哈希、关联完整性扫描和备份恢复校验。任何目标库导入或生产切换前，必须重新采集同口径结果。
