# 积分系统接口文档

> 最后更新：2026-04-28（已同步产品库当前接口实现）

## 1. 云函数：`product`

### 1.1 获取积分商品列表
- **路由**：`product`
- **入参**：`{ action: "pointsList", categoryId?: number }`
- **出参**：

```json
{
  "success": true,
  "data": {
    "current_member_level": 2,
    "categories": [{ "id": 1, "name": "剪刀" }],
    "products": [
      {
        "id": 4,
        "product_id": 16,
        "name": "专业级直剪 6.0寸",
        "short_name": "直剪6.0",
        "cover_image": "https://...",
        "images": [],
        "category_id": 1,
        "points_price": 3880,
        "cash_price": 0,
        "stock_available": 30,
        "stock_frozen": 0,
        "sales_count": 0,
        "is_on_sale": 1,
        "min_member_level": 1,
        "support_mixed_pay": 0,
        "specs": [
          { "name": "默认", "image": "https://...", "points_price": 3880, "cash_price": 0, "sku": "PP0004-01" },
          { "name": "黑色", "image": "https://...", "points_price": 3880, "cash_price": 0, "sku": "PP0004-02" },
          { "name": "金色", "image": null, "points_price": 4180, "cash_price": 0, "sku": "PP0004-03" }
        ],
        "can_redeem": true,
        "current_member_level": 2
      }
    ]
  }
}
```

### 1.2 获取积分商品详情
- **路由**：`product`
- **入参**：`{ action: "pointsDetail", id: number }`
- **出参**：

```json
{
  "success": true,
  "data": {
    "id": 4,
    "product_id": 16,
    "name": "专业级直剪 6.0寸",
    "short_name": "直剪6.0",
    "cover_image": "https://...",
    "images": ["https://..."],
    "detail": "...",
    "detail_images": ["https://..."],
    "params": {},
    "core_material": null,
    "handle_material": null,
    "size": null,
    "weight": null,
    "warranty_period": null,
    "points_price": 3880,
    "cash_price": 0,
    "stock_total": 30,
    "stock_available": 30,
    "stock_frozen": 0,
    "sales_count": 0,
    "is_on_sale": 1,
    "min_member_level": 1,
    "support_mixed_pay": 0,
    "specs": [
      { "name": "默认", "image": "https://...", "points_price": 3880, "cash_price": 0, "sku": "PP0004-01" },
      { "name": "黑色", "image": "https://...", "points_price": 3880, "cash_price": 0, "sku": "PP0004-02" }
    ],
    "can_redeem": true,
    "current_member_level": 2
  }
}
```

### 1.3 获取普通商品详情
- **路由**：`product`
- **入参**：`{ action: "detail", id: number }`
- **specs 出参格式**（一行一变体）：

```json
"specs": [
  { "name": "标准款", "image": "https://...", "price": 259, "sku": "P0048-01" },
  { "name": "高配款", "image": "https://...", "price": 329, "sku": "P0048-02" }
]
```

---

## 2. 云函数：`order`（积分订单）

### 2.1 创建积分订单
- **入参**：`{ action: "createPointsOrder", pointsProductId, quantity, addressId, selectedSpecName?, remark?, idempotencyKey? }`
- **说明**：与实物订单共用订单号生成规则（`PO` 前缀 + 时间片 + 随机串）；创建时冻结库存(`stock_available -> stock_frozen`)并预扣积分。
- **出参**：

```json
{
  "success": true,
  "data": {
    "orderId": 101,
    "orderNo": "PO202604281030001",
    "status": "pending_payment",
    "paymentStatus": "pending",
    "totalPoints": 3880,
    "payableCash": "0.00",
    "userPoints": { "before": 5000, "after": 1120 }
  }
}
```

### 2.2 订单列表
- **入参**：`{ action: "listPointsOrders", status?, page?, pageSize? }`
- **说明**：分页参数 `page/pageSize`。

### 2.3 订单详情
- **入参**：`{ action: "getPointsOrderDetail", orderId? | orderNo? }`
- **出参字段**：商品快照、用户可用积分、支付明细、物流字段（`logistics_company`, `logistics_no`, `ship_time`）。

### 2.4 支付回调落单
- **入参**：`{ action: "updatePaymentStatusByOrderNo", orderNo, transactionId, callbackPayload? }`
- **说明**：同时兼容实物订单与积分订单；积分订单在回调中执行最终确认：状态推进、冻结库存转销量、流水写入。

### 2.5 取消积分订单
- **入参**：`{ action: "cancelPointsOrder", orderId, cancelReason? }`
- **说明**：返还积分、解冻库存并回滚订单状态。

### 2.6 积分订单退款
- **入参**：`{ action: "refundPointsOrder", orderId, refundReason?, refundTransactionId? }`
- **说明**：返还积分和库存，并写入对账流水。

### 2.7 积分订单申请退款（用户侧）
- **入参**：`{ action: "applyPointsRefund", orderId, refundReason? }`
- **规则**：`paid / pending_send / cancelled` 状态自动退款；`shipped / completed` 进入后台审批队列。

### 2.8 查询积分退款申请（后台）
- **入参**：`{ action: "listPointsRefundRequests", adminSecret, status? }`

### 2.9 审批积分退款申请（后台）
- **入参**：`{ action: "reviewPointsRefundRequest", requestId, decision, adminSecret, adminNote?, refundTransactionId? }`
- **规则**：`decision=approve` 执行退款；`decision=reject` 回滚订单状态。

---

## 3. CloudRun：`payment-api`

### 3.1 创建支付单
- **路径**：`POST /api/payment/createOrder`
- **入参**：`{ orderId, openid, orderType?: "normal" | "points", description? }`

### 3.2 支付回调
- **路径**：`POST /api/payment/callback`
- **说明**：回调成功后调用 `order.updatePaymentStatusByOrderNo`。

### 3.3 退款
- **路径**：`POST /api/payment/refund`
- **入参**：`{ orderId, openid, orderType?: "normal" | "points", reason?, totalFee? }`

---

## 4. 剪刀云函数：`scissors`

### 4.1 我的剪刀列表
- **入参**：`{ action: "list" }`（需登录）
- **出参**：

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "sn": "SV-DS-001",
      "name": "大师级小弯剪",
      "model": "DS-6.0",
      "image": "cloud://...",
      "card_image": "https://...",
      "activation_date": "2026-04-20",
      "warranty_months": 0,
      "warranty_expire": "2099-12-31",
      "status": "active",
      "source": "bind"
    }
  ]
}
```

> `card_image` 读取优先级：`product_specs.image` → `products.cover_image` → `user_scissors.image`

### 4.2 绑定剪刀
- **入参**：`{ action: "bind", sn }`（需登录）
- **说明**：从 `scissors` JOIN `products` 获取商品名、封面图和质保月数写入快照。

### 4.3 解绑剪刀
- **入参**：`{ action: "unbind", id }`（需登录）

### 4.4 查询保修信息
- **入参**：`{ action: "warranty", sn }`（需登录）
- **说明**：JOIN `products` 返回商品名、封面图和质保月数。

---

## 5. 错误码规范

| 错误码 | 说明 |
|---|---|
| `INVALID_PARAMS` | 入参缺失或格式错误 |
| `POINTS_PRODUCT_NOT_FOUND` | 积分商品不存在或已下架 |
| `POINTS_STOCK_NOT_ENOUGH` | 积分商品库存不足 |
| `POINTS_NOT_ENOUGH` | 用户积分不足 |
| `ORDER_STATUS_INVALID` | 当前订单状态不允许执行该操作 |
| `IDEMPOTENT_REPLAY` | 重复提交请求（幂等命中） |
| `PAYMENT_CALLBACK_CONFLICT` | 支付回调与订单状态冲突 |
| `REFUND_NOT_ALLOWED` | 不满足退款条件 |
| `INTERNAL_ERROR` | 系统内部错误 |

## 6. 状态机定义（积分订单）

| 状态 | 说明 |
|------|------|
| `pending_payment` | 待支付（冻结库存 + 预扣积分） |
| `paid` | 已支付（已扣积分，等待发货） |
| `pending_send` | 已支付待发货（回调确认后，等同于 paid） |
| `shipped` | 已发货 |
| `completed` | 已完成 |
| `cancelled` | 已取消（返还积分 + 释放冻结库存） |
| `refunding` | 退款中 |
| `refunded` | 已退款（返还积分 + 回滚库存） |

---

## 7. 数据模型速查

### 规格/SKU 编码规则

```
普通商品: P{product_id:04d}-{seq:02d}    例: P0016-01
积分商品: PP{points_product_id:04d}-{seq:02d}  例: PP0006-03
```

### 图片读取

```
剪刀卡片: product_specs.image → products.cover_image → user_scissors.image
积分商品: points_product_specs.image → products.cover_image
```

### 质保归源

`products.warranty_months`（INT, 0=终身） → 绑定快照至 `user_scissors.warranty_months`

### 价格直显

所有规格价格（`product_specs.price` / `points_product_specs.points_price`）均为绝对值，前端无需做加减运算。
