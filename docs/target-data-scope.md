# 目标库数据范围（待实施）

更新：2026-09-17。此文件只定义迁移范围，不执行导入、删除或 DDL。

## 已确认：不导入商品目录

负责人确认新系统的商品主数据和商品图片全部重新上传。因此目标生产库不得导入以下源表的数据：

| 不导入的数据 | 表 |
|---|---|
| 商品、价格、库存、规格和图片 | `products`、`product_specs` |
| 商品分类和首页轮播 | `categories`、`banners` |
| 积分商品目录 | `points_categories`、`points_products`、`points_product_specs` |

源 CloudBase 数据不修改、不删除；目标目录由新版后台重新创建。

## 已确认：目标仅保留用户基础资料

负责人确认：目标库不保留任何其他历史业务数据。该决定仅限制**旧数据迁移**，不限制后续在新系统中重新创建商品目录或产生新的业务记录。

- 仅 `users` 的获批准身份、账户状态和基础资料可进入目标库，并生成 `user_identities`。
- 历史优惠券、礼品卡、订单、积分、地址、剪刀、售后、咨询和媒体均不导入目标库。
- CloudBase 源数据保持不变、不可删除，作为历史只读参考，直到最终迁移验收和正式退役批准。

## 已确认：本批仅迁移用户基础资料

本批仅处理源 `users` 表中的用户身份、账户状态和基础资料，并在目标侧生成 `user_identities` 绑定。新会话和头像字段不迁移。

为遵守数据最小化原则，本批不迁移地址簿、积分余额和流水、会员等级、累计消费、优惠券、礼品卡、剪刀档案、售后、媒体文件或合作咨询。未迁移积分账本和订单前，不得迁移或重算 `points`、`total_points`、`total_spent`、`order_count`、`member_level`。

| 本批处理 | 处理要求 |
|---|---|
| `users` | 仅迁移登录识别所需的 OpenID/UnionID、用户主键、账户状态及基础资料字段；导入前在隔离库核验字段映射。 |
| `user_identities`（目标新增） | 从已核验的 OpenID/UnionID 生成唯一身份绑定；空值、冲突及一人多身份例外人工处理，不能自动合并。 |

## 本轮明确不导出

| 数据范围 | 表 |
|---|---|
| 普通订单与退款 | `orders`、`order_items`、`order_addresses`、`order_refund_requests` |
| 积分订单、支付与账本 | `points_orders`、`points_order_items`、`points_order_refund_requests`、`points_payment_logs`、`points_logs` |
| 地址、优惠权益、工具与售后 | `addresses`、`user_addresses`、`after_sale_service_addresses`、`coupons`、`coupon_rules`、`user_coupons`、`gift_cards`、`gift_redeem_records`、`scissors`、`user_scissors`、`scissors_after_sales`、`scissors_after_sale_messages` |
| 其他业务资料 | `cooperation_inquiries` |

历史优惠券和礼品卡在目标库不导入、不补发、不恢复余额或兑换记录。相关旧 CloudBase 数据不删除；如未来启用新优惠券或礼品卡，应作为新业务独立设计、重新创建并完成合规与交易演练。

## 实施前验证

1. 在受控私有位置导出冻结时点的完整源 DDL，以及仅 `users` 的最小字段快照；个人信息不得进入 Git、普通文档或聊天记录。
2. 先在隔离库核验目标 `users` 结构、字段映射、主键保留和 OpenID/UnionID 唯一性，再执行任何正式导入。
3. 记录源与目标的汇总行数、身份绑定数量、空身份数量和冲突数量；日志不得输出用户资料值、手机号或身份标识。
4. 对目标登录做内部测试，确认已有用户被识别为原账户；新会话由目标登录流程生成，不复制旧会话令牌。
5. 仅在冻结快照上执行正式导入；小程序认证迁移开关继续关闭，直至隔离验证通过并另行放行。
