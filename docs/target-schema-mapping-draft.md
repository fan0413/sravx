# 目标 MySQL 结构映射草案

状态：负责人已于 2026-09-10 批准“30 张表、目标库全空、去除确认的多余字段”。目标库结构已创建；未导入任何业务数据，也未修改源库。

## 建模原则

- 目标库以最终冻结时点的源 schema 为迁移基线，不能用现有 14 表设计文档替代。
- 新商品、分类、积分商品、轮播和图片由负责人重新上传：对应目标表保留业务结构但不导入旧目录主数据。
- 历史交易、用户、积分、礼品卡、剪刀和售后保留事实记录；历史商品快照不自动关联新商品。
- 字段清理只限已列候选，须先在隔离恢复库验证并取得批准。

## 表域映射

| 表域 | 表 | 目标初始化 | 历史处理 |
|---|---|---|---|
| 新目录 | `categories`、`products`、`product_specs`、`banners`、`points_categories`、`points_products`、`points_product_specs` | 建表后为空 | 不导入为新目录；历史订单保留自身快照。 |
| 用户与地址 | `users`、`addresses`、`user_addresses` | 迁移 | 保留原主键和身份关联；新会话另行建立。 |
| 普通订单与退款 | `orders`、`order_items`、`order_addresses`、`order_refund_requests` | 迁移 | 保留金额、状态、快照和退款事实；与新目录解耦。 |
| 积分订单与账本 | `points_orders`、`points_order_items`、`points_order_refund_requests`、`points_payment_logs`、`points_logs` | 迁移 | 不按历史流水重算用户余额；保留原值和差异。 |
| 优惠券 | `coupons`、`coupon_rules`、`user_coupons` | 待决 | 旧券默认不用于新目录，待负责人决定禁用留档或重建。 |
| 礼品卡 | `gift_cards`、`gift_redeem_records` | 迁移 | 保留兑换状态和唯一性；新兑换使用事务与幂等约束。 |
| 剪刀与售后 | `scissors`、`user_scissors`、`after_sale_service_addresses`、`scissors_after_sales`、`scissors_after_sale_messages` | 迁移 | 保留历史 SN、绑定和售后事实；媒体只保留旧引用文本，不解析为新 COS。 |
| 合作咨询 | `cooperation_inquiries` | 待决 | 先确认保留期限与访问权限。 |

## 待批准的清理候选

`order_items.spec_data`、`order_items.scissors_sn`、`points_logs.operator_id`、`points_logs.operator_name` 已按负责人确认从**目标库**结构移除；源库未修改。`order_items.discount_price` 有历史值，必须保留。

## 已执行核验

- 目标库：30 张表、520 个字段、153 条索引项。
- 目标库全部表精确行数合计为 0。
- 四个已确认移除字段在目标库中均不存在。
- 结构脚本仅存于服务器受控迁移目录，不含业务数据；基于受控源备份生成并记录哈希。
