# 源库与数据库设计文档差异

核对日期：2026-09-10。源端依据为实时 CloudBase MySQL 结构汇总及受控 schema 元数据；目标设计依据为 `docs/database-design.md` 的表结构标题。此文件不包含 DDL、业务记录或机密。

## 结论

源库有 30 张表，现有设计文档覆盖其中 14 张，未发现设计文档中存在而源库不存在的表。设计文档缺少 16 张源表，不能直接作为迁移目标库的建表依据。

| 缺少的业务域 | 源表 |
|---|---|
| 地址与售后 | `addresses`、`after_sale_service_addresses`、`order_refund_requests`、`scissors_after_sales`、`scissors_after_sale_messages` |
| 礼品卡 | `gift_cards`、`gift_redeem_records` |
| 积分目录、订单与退款 | `points_categories`、`points_products`、`points_product_specs`、`points_orders`、`points_order_items`、`points_order_refund_requests`、`points_payment_logs` |
| 优惠券与合作咨询 | `coupon_rules`、`cooperation_inquiries` |

## 处理规则

1. 以最终冻结时点的源 schema 为历史事实迁移的结构依据，逐表保留字符集、排序规则、主键、唯一键和已批准的历史兼容字段。
2. 商品、分类、积分商品和轮播的主数据按负责人决定重新上传，不代表其相关历史订单、积分、退款或媒体快照可从 schema 中删除。
3. 字段清理候选只能在隔离恢复库中验证，并经负责人确认后应用于目标 schema；不得修改源库。
4. 在目标库产生任何业务写入前，需完成一份经审批的源表→目标表映射、转换规则和回滚/前向修复说明。
