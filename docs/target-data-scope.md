# 目标库数据范围（待实施）

更新：2026-09-09。此文件只定义迁移范围，不执行导入、删除或 DDL。

## 已确认：重新建设商品目录

负责人确认新系统的商品主数据和商品图片全部重新上传。因此最终导入不得把以下源表的数据作为新店商品目录写入目标生产库：

| 不导入为新目录的数据 | 原因 | 目标处理 |
|---|---|---|
| `products`、`product_specs` | 商品、价格、库存、规格和图片均由负责人重新建设。 | 目标库初始为空，由新版后台创建。 |
| `categories` | 与重建后的商品目录一起重新定义。 | 目标库初始为空。 |
| `points_products`、`points_product_specs`、`points_categories` | 依赖商品目录、库存和图片。 | 目标库初始为空。 |
| `banners` | 依赖旧图片对象和旧商品/分类跳转。 | 不导入为线上轮播，由新版后台重新上传和配置。 |

不导入仅适用于目标生产库的目录初始化；源 CloudBase 数据不修改、不删除。目标库尚未执行任何导入。

## 必须保留并与目录解耦的历史数据

订单、积分订单、支付、退款、礼品卡、用户、地址、剪刀保修和售后数据仍属于迁移范围。它们必须保留发生时的名称、金额、数量、收货/物流和支付状态；不得为迁移而重新关联到新商品。

| 数据 | 处理要求 |
|---|---|
| `orders`、`order_items`、`order_addresses`、`order_refund_requests` | 保留订单项的商品名称、SKU、价格、数量等快照。旧 `product_id` 仅作历史追溯，不能在新前台用于查询当前商品。 |
| `points_orders`、`points_order_items`、`points_payment_logs`、`points_order_refund_requests` | 保留积分和现金支付、退款与商品文本快照；不尝试映射到新积分商品。 |
| `users`、`addresses`、`user_addresses`、`after_sale_service_addresses` | 保留，按隐私和最小权限规则迁移。 |
| `gift_cards`、`gift_redeem_records`、`points_logs` | 保留余额、兑换和积分账务事实。 |
| `scissors`、`user_scissors`、`scissors_after_sales`、`scissors_after_sale_messages` | 保留序列号、保修与售后链路。若其图片是旧 `cloud://` 文件 ID，新系统只显示“历史图片不可用”，不请求或迁移该对象。 |

历史订单中已有 `product_image`、`product_image_snapshot` 等字段时，可保留原始历史快照值以便审计，但新版 API 和界面不得把其解析为 COS 对象或发起 CloudBase 文件读取。订单详情应以商品文字、金额和规格快照为准。

## 暂停导入，待业务规则确认的数据

| 数据 | 原因 |
|---|---|
| `coupon_rules`、`coupons`、`user_coupons` | 可能绑定旧商品、分类或有效期；重建商品目录后继续生效会产生错误优惠。 |
| `cooperation_inquiries` | 需确认是否属于要保留的业务线索及保留期限。 |

在负责人明确决定“作废、保留但禁用、或重新配置”之前，以上数据不能写入目标生产库。

## 实施前验证

1. 源业务库结构扫描显示唯一外键为 `coupon_rules.coupon_id → coupons.id`；目录相关表没有结构外键阻止“历史数据 + 空目录”演练。优惠券三表必须作为同一待决范围处理。
2. 先在隔离库执行“历史数据 + 空目录”的转换演练，验证无业务查询依赖旧目录。
3. 对订单、支付、退款、积分、礼品卡、售后逐表校验行数、金额汇总与状态分布。
4. 新版 API 增加历史订单与当前商品的明确区分；禁止用旧 `product_id` 自动跳转新商品详情。
5. 仅在冻结写入后的最终快照上执行正式导入；不得长期双写。
