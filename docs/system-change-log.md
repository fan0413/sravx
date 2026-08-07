# Saven 系统核心业务变更技术文档

> 本文档涵盖 2026-04 会话期间全部数据库结构、云函数、前端页面的核心变更，供管理后台改版参考。

---

## 目录

1. [商品规格体系重构](#1-商品规格体系重构)
2. [SKU 编码系统](#2-sku-编码系统)
3. [积分商品体系](#3-积分商品体系)
4. [剪刀质保体系](#4-剪刀质保体系)
5. [剪刀卡片展示（前端）](#5-剪刀卡片展示前端)
6. [订单系统](#6-订单系统)
7. [云函数全局修复](#7-云函数全局修复)
8. [数据库完整表结构](#8-数据库完整表结构)
9. [云函数变更清单](#9-云函数变更清单)
10. [前端变更清单](#10-前端变更清单)
11. [测试数据汇总](#11-测试数据汇总)

---

## 1. 商品规格体系重构

### 1.1 核心变更

**从「一行多选项」改为「一行一变体」**，与积分规格表模型完全统一。

| 维度 | 旧模型 | 新模型 |
|------|--------|--------|
| 存储方式 | `options: ["黑","银","金"]` 存一行 | 每个变体独立一行 |
| 价格 | `option_prices` / `price_adjustments` JSON，需前端做加减运算 | `price` 字段直显，绝对值 |
| 图片 | `option_images` JSON | `image` 字段直显 |
| 规格名 | 行名 `name="商品规格"`，选项在 `options` 数组 | 行名 `name="黑色"`，即规格值本身 |

### 1.2 `product_specs` 表结构

```sql
-- 旧结构（已废弃）
id, product_id, name, options, option_images, option_prices,
default_option, price_adjustments, sort_order, price, created_at

-- 新结构
id, product_id, name, image, price, sort_order, sku, created_at
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | BIGINT UNSIGNED PK | 自增 |
| `product_id` | BIGINT UNSIGNED INDEX | 关联 `products.id` |
| `name` | VARCHAR(50) | 规格名称（直显） |
| `image` | VARCHAR(500) NULL | 规格变体图片（云存储 URL） |
| `price` | DECIMAL(10,2) NULL | 规格独立价格（绝对值） |
| `sort_order` | INT | 排序 |
| `sku` | VARCHAR(64) UNIQUE | SKU 编码 |
| `created_at` | DATETIME | 创建时间 |

**删除的列**：`options`, `option_images`, `option_prices`, `default_option`, `price_adjustments`

### 1.3 数据迁移

- 37 行旧数据通过 `JSON_TABLE` 拆分成 95 行
- `price` 自动设为对应 `products.price`
- `image` 从旧 `option_images` JSON 中提取，缺失则用 `products.cover_image` 补
- `has_spec` 标记同步修正：29 个商品设为 `1`

### 1.4 对等对照

`product_specs` 与 `points_product_specs` 现在结构完全对等（名称/图片/价格三位一体，一行一变体）：

| 普通商品 | 积分商品 | 说明 |
|----------|----------|------|
| `product_specs.name` | `points_product_specs.name` | 规格名（直显） |
| `product_specs.image` | `points_product_specs.image` | 规格图 |
| `product_specs.price` | `points_product_specs.points_price` | 价格（绝对值） |
| — | `points_product_specs.cash_price` | 积分商品特有 |

---

## 2. SKU 编码系统

### 2.1 编码规则

```
普通商品变体: P{product_id:04d}-{seq:02d}    例: P0016-01
积分商品变体: PP{points_product_id:04d}-{seq:02d}  例: PP0006-03
```

| 段 | 含义 | 例 |
|----|------|-----|
| `P` / `PP` | 类型前缀（普通/积分） | P / PP |
| `0016` | product_id / points_product_id | 直剪 6.0 |
| `01` | 同一商品下按 sort_order 生成的序号 | 黑色 |

### 2.2 涉及表

| 表 | 加列 | 生成时机 |
|----|------|---------|
| `product_specs` | ➕ `sku` VARCHAR(64) UNIQUE | `admin-product` add/update |
| `points_product_specs` | ➕ `sku` VARCHAR(64) UNIQUE | `admin-points-product` add/update |
| `order_items` | ➕ `sku` VARCHAR(64) | 下单快照写入 |
| `points_order_items` | ➕ `sku` VARCHAR(64) | 下单快照写入 |

> `products` 和 `points_products` **不加 SKU**——它们是 SPU 层，`id` 即可标识。

### 2.3 现有数据

- `product_specs`: 95 行全部有 SKU（`P0016-01` ~ `P0052-01` 等）
- `points_product_specs`: 14 行全部有 SKU（`PP0004-01` ~ `PP0008-03` 等）
- 已验证全局唯一，无重复

---

## 3. 积分商品体系

### 3.1 `points_products` 表

**删除的冗余列**（这些字段属于 `products` 表，通过 `product_id` JOIN 获取）：

`name`, `short_name`, `cover_image`, `desc`, `images`, `detail_images`, `detail`, `params`, `core_material`, `handle_material`, `size`, `weight`, `warranty_period`, `has_spec`, `category_id`, `ext_json`

**保留列**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | BIGINT UNSIGNED PK | 积分商品 ID |
| `product_id` | BIGINT UNSIGNED UNIQUE | 关联 `products.id` |
| `points_price` | INT UNSIGNED | 积分售价 |
| `cash_price` | DECIMAL(10,2) | 现金补差 |
| `stock` / `stock_total` / `stock_available` / `stock_frozen` | INT | 库存四段 |
| `sales_count` | INT | 销量 |
| `is_on_sale` | TINYINT(1) | 上架状态 |
| `min_member_level` | TINYINT UNSIGNED | 最低会员等级 |
| `support_mixed_pay` | TINYINT | 支持混付 |
| `sort_order` / `created_at` / `updated_at` | — | 元数据 |

### 3.2 `points_product_specs` 表

```sql
id, points_product_id, name, image, points_price, cash_price,
sort_order, sku, created_at, updated_at
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `points_price` | INT | 该规格的积分价格（**绝对值，不做加减**） |
| `cash_price` | DECIMAL(10,2) | 该规格的现金价格（**绝对值**） |

**命名变更**：`points_delta` → `points_price`，`cash_delta` → `cash_price`（消除 delta 语义，确认直显模式）

### 3.3 现有数据

| ID | 关联商品 | 积分价 | 库存 | 门槛 | 规格数 |
|----|----------|--------|------|------|--------|
| 1 | Saven 专业直剪礼盒 | 3990 | 48 | LV1 | 0（旧，无规格） |
| 2 | Saven 轻量牙剪 | 2990 | 81 | LV2 | 0（旧，无规格） |
| 3 | Saven 剪刀保养套装 | 990 | 120 | LV3 | 0（旧，无规格） |
| 4 | 专业级直剪 6.0寸 | 3880 | 30 | LV1 | 3 规格 |
| 5 | 专业牙剪 6.0寸 | 4880 | 20 | LV2 | 3 规格（金色+300） |
| 6 | 专业小弯剪 6.0寸 | 5280 | 15 | LV3 | 4 规格（金色+600） |
| 7 | 大师级小弯剪 | 8880 | 8 | LV4 | 1 规格 |
| 8 | 鱼骨剪 专业版 | 5580 | 25 | LV2 | 3 规格（混付 ¥19.90） |

### 3.4 接口变更

**`product` 云函数 — `pointsList` / `pointsDetail`**：
- 新增从 `points_product_specs` 读取规格（之前缺失，始终返回空数组）
- 返回体增加 `specs: [{ name, image, points_price, cash_price, sku }]`
- 容错：表不存在/字段不存在时返回空数组不崩溃

**`admin-points-product` 云函数**：
- 新建，支持 `list | detail | add | update | toggle`
- `add`/`update` 时自动写入 `points_product_specs`，自动生成 SKU
- 不再写 `ext_json`

---

## 4. 剪刀质保体系

### 4.1 质保链路重构

```
之前（冗余）                          现在（归源）
┌─────────────┐                      ┌─────────────┐
│ scissors    │                      │ products    │ ← 唯一源头
│ name ⚠️     │                      │ name        │
│ image ⚠️    │                      │ cover_image │
│ warranty ⚠️ │                      │ warranty_months │
└──────┬──────┘                      └──────┬──────┘
       │ bind 时复制                        │ bind 时 JOIN
       ▼                                    ▼
┌──────────────┐                      ┌──────────────┐
│ user_scissors│ (快照不变)            │ user_scissors│ (快照不变)
└──────────────┘                      └──────────────┘
```

### 4.2 `products` 表

| 操作 | 详情 |
|------|------|
| ➕ `warranty_months` INT DEFAULT 12 | 数字月数，0 = 终身保修 |
| ⏸️ 保留 `warranty_period` VARCHAR | 后台展示用文本 |

现有数据：

| product_id | name | warranty_months |
|------------|------|:---:|
| 16 | 专业级直剪 6.0寸 | 12 |
| 19 | 专业牙剪 6.0寸 | 12 |
| 22 | 专业小弯剪 6.0寸 | 12 |
| 24 | 大师级小弯剪 | **0** |
| 29 | 鱼骨剪 专业版 | 24 |

### 4.3 `scissors` 表

| 操作 | 详情 |
|------|------|
| ❌ DROP `name` | 冗余，JOIN `products` 获取 |
| ❌ DROP `image` | 冗余，JOIN `product_specs` 获取 |
| ❌ DROP `warranty_months` | 冗余，归源到 `products` |

**保留列**：`id, sn, batch_no, product_id, model, produce_date, points_value, status, created_at, updated_at`

### 4.4 `scissors` 云函数变更

| action | 变更 |
|--------|------|
| `list` | 子查询 `product_specs.image` → `products.cover_image` → `us.image` 三级降级 |
| `bind` | JOIN `products` 取 `name/cover_image/warranty_months`，不再从 `scissors` 读数 |
| `warranty` | JOIN `products` 返回商品名和质保 |
| — | 新增 `resolveCloudUrls()` 自动转 `cloud://` 为 HTTPS 临时链接 |
| — | 新增 `getConnection()` 替代 buggy `testConnection`（见 §7） |

### 4.5 `user_scissors` 表

**无需改动**——绑定时的快照机制不变，`warranty_months` 和 `warranty_expire` 都是绑定时刻写入的不可变数据。

---

## 5. 剪刀卡片展示（前端）

### 5.1 页面结构

页面路径：`pages/myScissors/myScissors`

```
┌──────────────────────────────────────┐
│        16:9 剪刀图片卡片              │
│    Saven 大师典藏 6.0寸               │
│    DS-6.0                             │
├──────────────────────────────────────┤
│ SN编码              SV-DS-001        │  ← label左／value右对齐
│ ●保修期              终身保修         │  ← 小圆点 + 仅终身保修金色
└──────────────────────────────────────┘
```

### 5.2 质保期计算逻辑

```javascript
calcWarranty(activation_date, warranty_months):
  warranty_months ≤ 0  →  终身保修（金色圆点+金色文字）
  warranty_months > 0  →  "{激活日} - {到期日}"  格式: xxxx年xx月xx日 - xxxx年xx月xx日
                           未到期 → 绿色圆点+正常黑色文字
                           已到期 → 红色圆点+正常黑色文字
  日期无效              →  质保信息未知
```

### 5.3 图片读取优先级

```
product_specs.image   ← 规格变体图（第一优先）
    ↓ NULL
products.cover_image  ← 商品封面图
    ↓ NULL
user_scissors.image   ← 绑定快照（兜底）
```

`cloud://` 格式由云函数 `resolveCloudUrls()` 转为临时 HTTPS 链接，前端直接用 `item.card_image`。

### 5.4 交互

| 操作 | 行为 |
|------|------|
| 无数据 | Saven Logo + "绑定您的 Saven 剪刀，查看专属卡片与保修信息" |
| 有数据 | 垂直滚动卡片画廊 |
| 点击卡片 | `wx.previewImage` 大图预览 |
| 解除绑定 | 确认弹窗 → `unbindScissors` 云函数 |
| 新增绑定 | SN 码输入弹窗 → `bindScissors` 云函数 |

### 5.5 改动文件

| 文件 | 改动 |
|------|------|
| `myScissors.js` | `calcWarranty()` + 数据格式化 + 卡片点击预览 |
| `myScissors.wxml` | 16:9 卡片 + 信息栏 + 空状态 + SN 绑定弹窗 |
| `myScissors.wxss` | 全量重写（渐变遮罩、毛玻璃标签、圆点状态色） |
| `productDetail.js` | `extractColorOptions` 从 117 行简化到 14 行 |

---

## 6. 订单系统

### 6.1 物流字段统一

| 表 | 旧名 | 新名 |
|----|------|------|
| `orders` | `express_company` | `logistics_company` |
| `orders` | `express_no` | `logistics_no` |

现与 `points_orders` 命名完全统一：

```
orders / points_orders
├── logistics_company
├── logistics_no
├── ship_time
```

### 6.2 积分订单样例数据

用户 `fan`（user_id=10）下覆盖全部状态机：

| ID | 订单号 | 状态 | 商品 | 规格 | 积分 | 快递 |
|----|--------|------|------|------|------|------|
| 13 | PO202604281030001 | **paid** | 专业直剪 6.0 | 黑色 | 3880 | — |
| 14 | PO202604281500002 | **shipped** | 专业牙剪 6.0 | 金色 | 5180 | SF1234567890456 |
| 15 | PO202604281600003 | **completed** | 专业小弯剪 6.0 | 黑色 | 5480 | SF1234567890789 |
| 16 | PO202604281700004 | **cancelled** | 鱼骨剪 专业版 | 默认 | 5580 | — |

**订单明细**（`points_order_items`）全部含 SKU：

| 订单 | SKU | 商品 |
|------|------|------|
| 13 | P0016-02 | 专业级直剪+黑色 |
| 14 | P0019-03 | 专业牙剪+金色 |
| 15 | P0022-02 | 专业小弯剪+黑色 |
| 16 | P0029-01 | 鱼骨剪+默认 |

**积分流水**（`points_logs`）：6 条，每步可追溯。

### 6.3 API 文档对齐

API 文档 `docs/points-system-api.md` 定义的 11 个 action 全部已实现在 `order` 和 `product` 云函数中，无需新增接口。

---

## 7. 云函数全局修复

### 7.1 连接池变量遮蔽 Bug

**受影响的云函数**：`scissors`、`coupon`、`user`

**根因**：

```javascript
// Bug：局部 pool 遮蔽模块级 pool
let pool = await getPool()        // 局部变量
if (!testConnection(pool)) {
    pool = await getPool()        // getPool() 发现模块级 pool 没被清空
}                                 // 返回已过期的连接池
connection = await pool.getConnection()  // 💥 Malformed packet
```

**修复**：

去掉 `testConnection()`，改用 `getConnection()`：先尝试从原 pool 取连接，失败则重建 pool 后重试一次。

```javascript
async function getConnection() {
  let p = await getPool()
  try {
    return await p.getConnection()
  } catch (err) {
    pool = null           // 正确清模块级
    p = await getPool()   // 重建新池
    return await p.getConnection()
  }
}
```

---

## 8. 数据库完整表结构

### 8.1 商品相关

**`products`**（SPU 主表）：

```
id, name, short_name, desc, price, category_id, cover_image, images,
params, detail, detail_images, core_material, handle_material, size,
stock, reserved_stock, sales_count, weight, warranty_period,
warranty_months, has_spec, is_on_sale, is_recommend, sort_order,
created_at, updated_at, deleted_at
```

**`product_specs`**（SKU 变体表）：

```
id, product_id, name, image, price, sort_order, sku, created_at
```

**`points_products`**（积分商品 SPU）：

```
id, product_id, points_price, cash_price, stock, stock_total,
stock_available, stock_frozen, sales_count, is_on_sale,
min_member_level, support_mixed_pay, sort_order, created_at, updated_at
```

**`points_product_specs`**（积分商品 SKU）：

```
id, points_product_id, name, image, points_price, cash_price,
sort_order, sku, created_at, updated_at
```

### 8.2 剪刀相关

**`scissors`**（库存表）：

```
id, sn, batch_no, product_id, model, produce_date,
points_value, status(unused/sold/bound/expired), created_at, updated_at
```

**`user_scissors`**（用户绑定表）：

```
id, user_id, _openid, scissors_id, sn, name, model, image,
activation_date, warranty_months, warranty_expire,
status(active/expired/transferred), source(bind/gift/transfer),
remark, created_at, updated_at
```

### 8.3 订单相关

**`orders`**（普通订单）：

```
id, order_no, user_id, _openid, total_amount, freight, discount_amount,
coupon_amount, points_amount, pay_amount,
status(pending_payment/paid/shipped/received/completed/cancelled/refunding/refunded),
pay_type(wechat/balance/other), pay_time, pay_transaction_id,
ship_time, logistics_company, logistics_no, receive_time,
buyer_message, used_coupon_id, used_points, need_invoice, invoice_title,
cancel_time, complete_time, auto_cancel, created_at, updated_at
```

**`order_items`**（普通订单明细）：

```
id, order_id, _openid, product_id, sku, scissors_id, product_name,
product_image, spec_desc, spec_data, price, quantity, selected_color,
discount_price, scissors_sn, created_at
```

**`points_orders`**（积分订单）：

```
id, order_no, idempotency_key, user_id, _openid, points_product_id,
product_id, product_name_snapshot, product_image_snapshot,
selected_spec_snapshot, quantity, unit_points, total_points,
unit_cash, total_cash, payable_cash,
status, payment_status, payment_channel, pay_transaction_id,
pay_callback_payload, refund_transaction_id,
receiver_name, receiver_phone, address_text,
logistics_company, logistics_no,
pay_time, ship_time, completed_at, cancelled_at, cancel_reason,
remark, created_at, updated_at
```

**`points_order_items`**（积分订单明细）：

```
id, points_order_id, points_product_id, product_name, product_image,
points_price, quantity, spec_text, sku, created_at
```

### 8.4 积分流水

**`points_logs`**：

```
id, user_id, _openid, order_id,
change_type(order_reward/order_deduct/activity_reward/manual_add/manual_deduct),
points, balance, reason, remark, operator_id, operator_name, created_at
```

**`points_payment_logs`**（对账表，已建未写入）：

```
id, order_id, order_no, user_id, _openid, direction, biz_type,
points_change, cash_change, balance_before, balance_after,
idempotency_key, reconcile_date, reconcile_status,
payment_channel, pay_transaction_id, ext_json, remark, created_at
```

---

## 9. 云函数变更清单

| 云函数 | 文件 | 变更类型 | 核心变更 |
|--------|------|:---:|------|
| `product` | `cloudfunctions/product/index.js` | 修改 | 简化 `queryProductSpecs`（去掉 normalizeSpecs）；`pointsList`/`pointsDetail` 新增 specs 查询+返回；所有规格查询加 sku 字段 |
| `admin-product` | `cloudfunctions/admin-product/index.js` | **新建** | 一行一变体规格写入；`writeSpecs` 自动生成 SKU；支持 add/update/delete/restock/list/detail |
| `admin-points-product` | `cloudfunctions/admin-points-product/index.js` | **新建** | 积分规格写入 `points_product_specs`；自动生成 SKU；支持 list/detail/add/update/toggle |
| `scissors` | `cloudfunctions/scissors/index.js` | 修改 | bind JOIN products 取 name/warranty；list 子查询规格图片+cloud URL 转换；修复连接池 bug；warranty JOIN products |
| `coupon` | `cloudfunctions/coupon/index.js` | 修改 | 修复连接池变量遮蔽 bug |
| `user` | `cloudfunctions/user/index.js` | 修改 | 修复连接池变量遮蔽 bug |
| `order` | `cloudfunctions/order/index.js` | 未修改 | 已支持全部 11 个积分订单 action |
| `scissors-admin` | `cloudfunctions/scissors-admin/index.js` | 未修改 | NoSQL 系统，不重叠 |

### 9.1 管理员需关注的云函数

| 云函数 | 用途 | action 列表 |
|--------|------|------------|
| `admin-product` | 商品管理 | `list`, `detail`, `add`, `update`, `delete`, `restock` |
| `admin-points-product` | 积分商品管理 | `list`, `detail`, `add`, `update`, `toggle` |
| `admin-order` | 订单管理 | `list`, `detail`, `refundList`, `refundDetail`, `refundReview` |

---

## 10. 前端变更清单

| 文件 | 变更类型 | 说明 |
|------|:---:|------|
| `pages/myScissors/myScissors.js` | 重写 | `calcWarranty()` 质保计算；`loadScissors()` 卡片数据格式化；卡片点击大图预览 |
| `pages/myScissors/myScissors.wxml` | 重写 | 16:9 卡片；信息栏（SN编码+保修期）；空状态；SN 绑定弹窗 |
| `pages/myScissors/myScissors.wxss` | 重写 | 渐变遮罩、毛玻璃、圆点状态色、尾部对齐布局 |
| `pages/productDetail/productDetail.js` | 简化 | `extractColorOptions` 117→14 行；`selectedSpec` 逻辑简化 |
| `pages/pointsProductDetail/pointsProductDetail.js` | 无需改 | 已有兜底逻辑 |
| `utils/api.js` | 无需改 | 接口没变 |

---

## 11. 测试数据汇总

### 11.1 剪刀（用户 fan）

| SN | 商品 | 激活 | 质保 | 状态 |
|----|------|------|------|:--:|
| SV-DS-001 | 大师级小弯剪 | 2026-04-20 | 终身保修 | 🟡 |
| SV-YJ-001 | 专业牙剪 6.0寸 | 2025-04-01 | 已过期 | 🔴 |
| SV-DZJ-001 | 专业级直剪 6.0寸 | 2026-03-15 | 至 2027-03-15 | 🟢 |
| SV-XWJ-001 | 专业小弯剪 6.0寸 | 2026-04-28 | 至 2027-04-28 | 🟢 |
| SV-YGJ-001 | 鱼骨剪 专业版 | 2026-04-01 | 至 2028-04-01 | 🟢 |

### 11.2 积分订单（用户 fan，user_id=10）

| ID | 订单号 | 状态 | 积分 | 快递 |
|----|--------|------|------|------|
| 1 | PO202604231430001 | refunded | 3990 | SF1234567890123 |
| 13 | PO202604281030001 | paid | 3880 | — |
| 14 | PO202604281500002 | shipped | 5180 | SF1234567890456 |
| 15 | PO202604281600003 | completed | 5480 | SF1234567890789 |
| 16 | PO202604281700004 | cancelled | 5580 | — |

用户当前积分：**940**（与流水末笔一致 ✅）

### 11.3 用户账号

| ID | openid | username | points | total_points | member_level |
|----|--------|----------|--------|:---:|:---:|
| 10 | `oA-s03TgR6UsYY4T0eBCC-VtabFw` | fan | 940 | 60000 | 6 |

---

> **文档版本**：v1.0 ｜ **日期**：2026-04-28 ｜ **环境**：CloudBase `cloud1-8gk3bptqefbf01d6` / MySQL 8.0 ap-shanghai
