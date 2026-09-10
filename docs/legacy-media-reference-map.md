# 旧媒体引用字段映射

更新：2026-09-10。来源为 2026-09-09 的实时 schema 元数据与负责人确认的“商品和图片重新上传”范围。本文件不包含对象清单、URL 或文件内容。

## 新目录：不导入旧引用

| 表.字段 | 原用途 | 目标处理 |
|---|---|---|
| `products.cover_image`、`products.images`、`products.detail_images`、`products.scissors_card_image` | 商品封面、轮播、详情和剪刀卡片图 | 不导入；新商品重新上传后写入 COS 对象键。 |
| `product_specs.image`、`product_specs.card_image` | 商品规格和规格卡片图 | 不导入；随新规格重新上传。 |
| `categories.icon`、`categories.image` | 商品分类图标/图片 | 不导入；随新分类重新配置。 |
| `points_products.cover_image`、`points_products.images`、`points_products.detail_images` | 积分商品图片 | 不导入；随新积分商品重新上传。 |
| `points_product_specs.image` | 积分商品规格图 | 不导入；随新规格重新上传。 |
| `banners.image`、`banners.mobile_image` | 轮播图 | 不导入；由新版后台重新上传。 |

## 历史事实：保留值，但不再解析或访问旧文件

| 表.字段 | 历史用途 | 目标 API/UI 规则 |
|---|---|---|
| `order_items.product_image` | 普通订单项商品图片快照 | 可以原样保留作审计，但不得请求 CloudBase 或当作 COS 对象键；订单页以文字、规格、金额和数量快照为主。 |
| `points_order_items.product_image`、`points_orders.product_image_snapshot` | 积分订单商品图片快照 | 同上。 |
| `scissors.image`、`scissors.card_image`、`user_scissors.image` | 剪刀与保修卡片图 | 保留历史字段值；新系统显示历史图片不可用或由后台后续补图，禁止自动复制或解析旧对象。 |

## 不属于媒体迁移的同名字段

`addresses.detail`、`after_sale_service_addresses.detail`、`order_addresses.detail`、`user_addresses.detail` 为地址文本；`products.detail` 为商品富文本。它们不应被当作对象键处理。商品富文本不随旧商品目录导入；若未来需要保留富文本，必须先扫描其中的外部图片链接并单独确认。

## 实施约束

1. MySQL 写入新的媒体字段时只接受经 API 校验的 COS 对象键，拒绝 `cloud://`、临时 URL 和任意公网 URL。
2. 旧图片字段仅允许历史只读接口返回，并由服务端标注为 legacy；不得传给 COS 签名 URL 逻辑。
3. 源对象存储在 CloudBase 退役前仍需完成只读分页清单盘点；负责人已确认不复制历史对象，因此该清单用于退役证据和风险确认，不用于媒体迁移。
