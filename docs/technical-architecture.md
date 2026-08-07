# 剪刀品牌小程序 - 技术架构文档

## 一、系统概述

本系统是一个**剪刀品牌微信小程序**的后端服务，基于腾讯云 CloudBase 构建，包含：

- **9 个云函数** - 处理业务逻辑
- **14 张 MySQL 数据表** - 存储业务数据
- **微信登录体系** - 通过 openid 识别用户

---

## 二、云函数详解

### 2.1 login - 微信登录

**文件位置**：`cloudfunctions/login/index.js`

**功能说明**：处理用户的微信登录/注册流程

**核心逻辑**：
```
用户打开小程序 → 调用 login 云函数 → 获取 openid → 检查/创建用户记录 → 返回 token
```

**关键操作**：
| 操作 | 说明 |
|------|------|
| 微信登录 | 通过 `wx.cloud.callFunction` 获取 openid |
| 自动注册 | 新用户自动创建 `users` 记录 |
| 积分奖励 | 新用户注册赠送 100 积分 |
| 登录记录 | 更新 `last_login_at` 时间 |

**返回值**：
```json
{
  "success": true,
  "data": {
    "openid": "oXXXXX",
    "userId": 1,
    "token": "xxx",
    "isNewUser": true
  }
}
```

---

### 2.2 user - 用户管理

**文件位置**：`cloudfunctions/user/index.js`

**功能说明**：用户个人信息和会员管理

**支持操作**：

| action | 说明 | 权限 |
|--------|------|------|
| `getProfile` | 获取个人资料 | 仅本人 |
| `updateProfile` | 更新个人资料 | 仅本人 |
| `getPoints` | 获取积分余额 | 仅本人 |
| `getPointsLogs` | 获取积分变动记录 | 仅本人 |
| `getMemberLevel` | 获取会员等级 | 仅本人 |

**数据存储**：`users` 表

**会员等级规则**：
| 等级 | 累计消费 | 折扣 |
|------|---------|------|
| Lv1 | 0元 | 无 |
| Lv2 | 500元 | 99折 |
| Lv3 | 2000元 | 98折 |
| Lv4 | 5000元 | 95折 |
| Lv5 | 10000元 | 92折 |

---

### 2.3 category - 商品分类

**文件位置**：`cloudfunctions/category/index.js`

**功能说明**：管理商品分类结构（支持两级分类）

**支持操作**：

| action | 说明 | 权限 |
|--------|------|------|
| `getList` | 获取分类列表 | 公开 |
| `getTree` | 获取分类树形结构 | 公开 |
| `getWithProducts` | 获取分类及热门商品 | 公开 |

**数据存储**：`categories` 表

**分类示例**：
```
- 家用剪刀
  - 厨房剪刀
  - 办公剪刀
- 专业剪刀
  - 美发剪刀
  - 医用剪刀
```

---

### 2.4 product - 商品管理

**文件位置**：`cloudfunctions/product/index.js`

**功能说明**：商品信息查询和规格管理

**支持操作**：

| action | 说明 | 权限 |
|--------|------|------|
| `getHomeProducts` | 首页商品（轮播+推荐+新品+热卖） | 公开 |
| `getByCategory` | 按分类获取商品列表 | 公开 |
| `getDetail` | 获取商品详情 | 公开 |
| `getSpecs` | 获取商品规格选项 | 公开 |

**数据存储**：`products` 表 + `product_specs` 表

**商品属性**：
| 属性 | 说明 |
|------|------|
| 基础信息 | 名称、价格、封面图、详情 |
| 库存管理 | stock（库存）、reserved_stock（预留）、sales_count（已售） |
| 标签系统 | is_recommend（推荐）、is_new（新品）、is_hot（热卖） |
| 规格支持 | has_spec + product_specs 多规格 |

---

### 2.5 address - 收货地址

**文件位置**：`cloudfunctions/address/index.js`

**功能说明**：用户收货地址管理

**支持操作**：

| action | 说明 | 权限 |
|--------|------|------|
| `getList` | 获取地址列表 | 仅本人 |
| `add` | 新增地址 | 仅本人 |
| `update` | 更新地址 | 仅本人 |
| `delete` | 删除地址 | 仅本人 |
| `setDefault` | 设为默认地址 | 仅本人 |

**数据存储**：`user_addresses` 表

**特殊逻辑**：
- 用户删除地址时，如果删除的是默认地址，系统自动将第一个地址设为默认
- 用户新增地址时，如果这是第一个地址，自动设为默认

---

### 2.6 order - 订单管理

**文件位置**：`cloudfunctions/order/index.js`

**功能说明**：完整的订单流程管理

**支持操作**：

| action | 说明 | 权限 |
|--------|------|------|
| `create` | 创建订单 | 仅本人 |
| `getList` | 获取订单列表 | 仅本人 |
| `getDetail` | 获取订单详情 | 仅本人 |
| `cancel` | 取消订单 | 仅本人 |
| `confirmReceive` | 确认收货 | 仅本人 |

**数据存储**：`orders` 表 + `order_items` 表 + `order_addresses` 表

**订单状态流转**：
```
pending_payment（待付款）
    ↓ [支付]
paid（已付款）
    ↓ [发货]
shipped（已发货）
    ↓ [收货]
received（已收货）
    ↓ [完成]
completed（已完成）
```

**下单流程**：
1. 校验商品库存和价格
2. 计算优惠（优惠券、积分抵扣）
3. 创建订单记录
4. 冻结库存
5. 扣除积分（如使用）
6. 返回订单信息等待支付

---

### 2.7 scissors - 剪刀绑定

**文件位置**：`cloudfunctions/scissors/index.js`

**功能说明**：用户绑定剪刀产品，激活保修服务

**支持操作**：

| action | 说明 | 权限 |
|--------|------|------|
| `bind` | 绑定剪刀（扫码） | 仅本人 |
| `unbind` | 解绑剪刀 | 仅本人 |
| `getMyScissors` | 获取我的剪刀列表 | 仅本人 |
| `getDetail` | 获取剪刀详情（保修状态） | 仅本人 |
| `activate` | 激活剪刀保修 | 仅本人 |

**数据存储**：`scissors` 表 + `user_scissors` 表

**剪刀状态**：
| 状态 | 说明 |
|------|------|
| unused | 未售出 |
| sold | 已售出（待激活） |
| bound | 已激活（保修中） |
| expired | 保修过期 |

**绑定流程**：
1. 用户扫码 → 输入序列号 SN
2. 系统校验 SN 是否有效
3. 检查是否已被其他用户绑定
4. 创建 `user_scissors` 记录
5. 更新 `scissors` 状态为 bound
6. 设置保修到期日期

---

### 2.8 coupon - 优惠券管理

**文件位置**：`cloudfunctions/coupon/index.js`

**功能说明**：优惠券领取和使用

**支持操作**：

| action | 说明 | 权限 |
|--------|------|------|
| `getAvailable` | 获取可用优惠券列表 | 仅本人 |
| `receive` | 领取优惠券 | 仅本人 |
| `myCoupons` | 我的优惠券 | 仅本人 |
| `check` | 检查优惠券是否可用 | 仅本人 |

**数据存储**：`coupons` 表 + `user_coupons` 表

**优惠券类型**：
| 类型 | 说明 | 示例 |
|------|------|------|
| fixed | 固定金额 | 满100减10元 |
| percent | 百分比 | 满200打8折 |

**使用规则**：
- `min_amount` - 最低消费门槛
- `max_discount` - 最高优惠上限（百分比类型）
- `scope_type` - 使用范围（全场/分类/指定商品）

---

### 2.9 banner - 轮播图管理

**文件位置**：`cloudfunctions/banner/index.js`

**功能说明**：首页轮播图和广告位

**支持操作**：

| action | 说明 | 权限 |
|--------|------|------|
| `getHomeBanners` | 获取首页轮播图 | 公开 |
| `getList` | 获取所有广告位 | 公开 |

**数据存储**：`banners` 表

**跳转类型**：
| link_type | 说明 | link_value 示例 |
|------------|------|------------------|
| product | 商品详情 | 123（商品ID） |
| category | 分类页 | 5（分类ID） |
| web | 网页链接 | https://xxx |
| miniprogram | 小程序页面 | /pages/index |
| none | 不跳转 | - |

---

## 三、数据库表详解

### 3.1 用户相关表

#### users - 用户表

**存储内容**：微信小程序用户基本信息

| 字段 | 类型 | 说明 |
|------|------|------|
| id | bigint | 主键 |
| openid | varchar(64) | 微信 openid（唯一） |
| unionid | varchar(64) | 微信 unionid |
| username | varchar(50) | 用户昵称 |
| phone | varchar(20) | 手机号 |
| avatar | varchar(255) | 头像URL |
| gender | enum | 性别（男/女/未知） |
| birthday | date | 生日 |
| occupation | varchar(50) | 职业 |
| member_level | int | 会员等级（1-5） |
| points | int | 当前积分余额 |
| total_points | int | 累计积分 |
| order_count | int | 累计订单数 |
| total_spent | decimal | 累计消费金额 |
| status | enum | 状态（active/frozen/deleted） |
| last_login_at | datetime | 最后登录时间 |

---

#### user_addresses - 收货地址表

**存储内容**：用户收货地址

| 字段 | 类型 | 说明 |
|------|------|------|
| id | bigint | 主键 |
| user_id | bigint | 用户ID |
| _openid | varchar(64) | 云开发 openid |
| name | varchar(50) | 收货人姓名 |
| phone | varchar(20) | 手机号 |
| province | varchar(50) | 省份 |
| city | varchar(50) | 城市 |
| district | varchar(50) | 区县 |
| detail | varchar(200) | 详细地址 |
| postal_code | varchar(10) | 邮编 |
| tag | varchar(20) | 标签（家/公司/学校） |
| is_default | tinyint | 是否默认（0/1） |

---

### 3.2 商品相关表

#### categories - 商品分类表

**存储内容**：商品分类层级结构

| 字段 | 类型 | 说明 |
|------|------|------|
| id | bigint | 主键 |
| parent_id | bigint | 父分类ID（null为顶级） |
| name | varchar(50) | 分类名称 |
| icon | varchar(255) | 图标URL |
| image | varchar(255) | 分类图片 |
| description | varchar(255) | 分类描述 |
| level | tinyint | 层级深度（1/2） |
| sort_order | int | 排序 |
| is_show | tinyint | 是否显示 |
| is_nav | tinyint | 是否显示在导航 |
| product_count | int | 商品数量 |

---

#### products - 商品表

**存储内容**：商品主数据

| 字段 | 类型 | 说明 |
|------|------|------|
| id | bigint | 主键 |
| name | varchar(200) | 商品名称 |
| short_name | varchar(50) | 简称 |
| desc | varchar(500) | 简介 |
| price | decimal | 售价 |
| cost_price | decimal | 成本价 |
| category_id | bigint | 分类ID |
| brand_id | bigint | 品牌ID |
| cover_image | varchar(255) | 封面图 |
| images | json | 图片列表 |
| specs | json | 规格选项 |
| params | json | 详细参数 |
| detail | longtext | 商品详情（富文本） |
| stock | int | 库存 |
| reserved_stock | int | 预留库存 |
| sales_count | int | 销量 |
| weight | decimal | 重量(kg) |
| has_spec | tinyint | 是否有规格 |
| is_on_sale | tinyint | 是否上架 |
| is_recommend | tinyint | 是否推荐 |
| is_new | tinyint | 是否新品 |
| is_hot | tinyint | 是否热卖 |
| keywords | varchar(255) | 搜索关键词 |

---

#### product_specs - 商品规格表

**存储内容**：商品的多规格定义（如颜色、尺寸）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | bigint | 主键 |
| product_id | bigint | 商品ID |
| name | varchar(50) | 规格名称（颜色/尺寸） |
| options | json | 选项列表（红/蓝/白） |
| default_option | varchar(100) | 默认选中项 |
| price_adjustments | json | 价格调整 |
| sort_order | int | 排序 |

---

### 3.3 剪刀相关表

#### scissors - 剪刀产品表

**存储内容**：每把剪刀的唯一信息（序列号管理）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | bigint | 主键 |
| sn | varchar(32) | 序列号（唯一） |
| batch_no | varchar(32) | 批次号 |
| product_id | bigint | 对应商品ID |
| name | varchar(100) | 剪刀名称 |
| model | varchar(50) | 型号 |
| image | varchar(255) | 产品图片 |
| produce_date | date | 生产日期 |
| warranty_months | int | 保修期（月） |
| status | enum | 状态（unused/sold/bound/expired） |

**序列号 SN 格式**：`SC + 年份(4位) + 批次(3位) + 流水号(5位)`
示例：`SC202600100001`

---

#### user_scissors - 用户绑定剪刀表

**存储内容**：用户绑定的剪刀及保修信息

| 字段 | 类型 | 说明 |
|------|------|------|
| id | bigint | 主键 |
| user_id | bigint | 用户ID |
| _openid | varchar(64) | 云开发 openid |
| scissors_id | bigint | 剪刀ID |
| sn | varchar(32) | 序列号快照 |
| name | varchar(100) | 名称快照 |
| model | varchar(50) | 型号快照 |
| image | varchar(255) | 图片快照 |
| activation_date | date | 激活日期 |
| warranty_months | int | 保修期（月） |
| warranty_expire | date | 保修到期日 |
| status | enum | 状态（active/expired/transferred） |
| source | enum | 来源（bind/gift/transfer） |

---

### 3.4 订单相关表

#### orders - 订单表

**存储内容**：订单主信息

| 字段 | 类型 | 说明 |
|------|------|------|
| id | bigint | 主键 |
| order_no | varchar(32) | 订单号（唯一） |
| user_id | bigint | 用户ID |
| _openid | varchar(64) | 云开发 openid |
| total_amount | decimal | 商品总价 |
| freight | decimal | 运费 |
| discount_amount | decimal | 优惠金额 |
| coupon_amount | decimal | 优惠券抵扣 |
| points_amount | decimal | 积分抵扣 |
| pay_amount | decimal | 实付金额 |
| status | enum | 订单状态 |
| pay_type | enum | 支付方式 |
| pay_time | datetime | 支付时间 |
| pay_transaction_id | varchar(64) | 支付流水号 |
| ship_time | datetime | 发货时间 |
| express_company | varchar(50) | 快递公司 |
| express_no | varchar(50) | 快递单号 |
| receive_time | datetime | 收货时间 |
| buyer_message | varchar(255) | 买家留言 |
| used_coupon_id | bigint | 使用的优惠券ID |
| used_points | int | 使用的积分 |
| need_invoice | tinyint | 是否需要发票 |
| invoice_title | varchar(100) | 发票抬头 |

**订单号生成规则**：`ORD + 时间戳(14位) + 随机数(4位)`

---

#### order_items - 订单商品表

**存储内容**：订单中的商品明细

| 字段 | 类型 | 说明 |
|------|------|------|
| id | bigint | 主键 |
| order_id | bigint | 订单ID |
| _openid | varchar(64) | 云开发 openid |
| product_id | bigint | 商品ID |
| scissors_id | bigint | 剪刀ID（如果有） |
| product_name | varchar(200) | 商品名称快照 |
| product_image | varchar(255) | 商品图片快照 |
| spec_desc | varchar(500) | 规格描述快照 |
| spec_data | json | 规格详情快照 |
| price | decimal | 购买单价 |
| quantity | int | 购买数量 |
| discount_price | decimal | 优惠金额 |
| scissors_sn | varchar(32) | 剪刀序列号（如果有） |

---

#### order_addresses - 订单收货地址快照表

**存储内容**：下单时的收货地址快照

| 字段 | 类型 | 说明 |
|------|------|------|
| id | bigint | 主键 |
| order_id | bigint | 订单ID |
| _openid | varchar(64) | 云开发 openid |
| name | varchar(50) | 收货人 |
| phone | varchar(20) | 手机号 |
| province | varchar(50) | 省份 |
| city | varchar(50) | 城市 |
| district | varchar(50) | 区县 |
| detail | varchar(200) | 详细地址 |
| postal_code | varchar(10) | 邮编 |

> **说明**：订单地址使用快照，修改用户地址不影响已下单的订单

---

### 3.5 营销相关表

#### coupons - 优惠券表

**存储内容**：优惠券模板/活动

| 字段 | 类型 | 说明 |
|------|------|------|
| id | bigint | 主键 |
| name | varchar(100) | 名称 |
| desc | varchar(255) | 描述 |
| type | enum | 类型（fixed/percent） |
| value | decimal | 优惠值 |
| min_amount | decimal | 最低消费门槛 |
| max_discount | decimal | 最高优惠（百分比类型） |
| total_count | int | 发行总量 |
| remain_count | int | 剩余数量 |
| per_user_limit | int | 每人限领数量 |
| receive_type | enum | 领取方式（free/paid/conditional） |
| scope_type | enum | 使用范围（all/category/product） |
| scope_value | varchar | 范围值 |
| start_time | datetime | 开始时间 |
| expire_time | datetime | 过期时间 |
| valid_days | int | 领取后有效天数 |
| status | enum | 状态（pending/active/paused/expired） |

---

#### user_coupons - 用户优惠券表

**存储内容**：用户已领取的优惠券

| 字段 | 类型 | 说明 |
|------|------|------|
| id | bigint | 主键 |
| user_id | bigint | 用户ID |
| _openid | varchar(64) | 云开发 openid |
| coupon_id | bigint | 优惠券ID |
| coupon_name | varchar(100) | 名称快照 |
| coupon_type | enum | 类型快照 |
| coupon_value | decimal | 值快照 |
| min_amount | decimal | 门槛快照 |
| status | enum | 状态（unused/used/expired） |
| used_order_id | bigint | 使用的订单ID |
| used_at | datetime | 使用时间 |
| received_at | datetime | 领取时间 |
| effective_time | datetime | 生效时间 |
| expire_time | datetime | 过期时间 |

---

#### points_logs - 积分变动记录表

**存储内容**：用户积分变动明细

| 字段 | 类型 | 说明 |
|------|------|------|
| id | bigint | 主键 |
| user_id | bigint | 用户ID |
| _openid | varchar(64) | 云开发 openid |
| order_id | bigint | 关联订单ID |
| change_type | enum | 变动类型 |
| points | int | 变动积分（正负） |
| balance | int | 变动后余额 |
| reason | varchar(100) | 原因 |
| remark | varchar(255) | 备注 |

**变动类型**：
| 类型 | 说明 | 积分变化 |
|------|------|---------|
| order_reward | 订单奖励 | 正数 |
| order_deduct | 订单抵扣 | 负数 |
| activity_reward | 活动奖励 | 正数 |
| manual_add | 手动增加 | 正数 |
| manual_deduct | 手动扣除 | 负数 |

**积分规则**：
- 购物奖励：每消费 1 元 = 1 积分
- 积分抵扣：100 积分 = 1 元

---

#### banners - 轮播图表

**存储内容**：首页轮播图和广告位

| 字段 | 类型 | 说明 |
|------|------|------|
| id | bigint | 主键 |
| title | varchar(100) | 标题 |
| subtitle | varchar(200) | 副标题 |
| image | varchar(255) | PC端图片 |
| mobile_image | varchar(255) | 移动端图片 |
| link_type | enum | 跳转类型 |
| link_value | varchar(255) | 跳转值 |
| link_param | json | 额外参数 |
| position | varchar(50) | 位置标识 |
| sort_order | int | 排序 |
| is_active | tinyint | 是否启用 |
| start_time | datetime | 显示开始 |
| end_time | datetime | 显示结束 |
| click_count | int | 点击次数 |

---

## 四、数据关系图

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   users    │────<│  user_addresses  │     │    banners      │
│  (用户)     │     │    (地址)         │     │   (轮播图)       │
└─────────────┘     └──────────────────┘     └─────────────────┘
       │
       │ 1:N
       ▼
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ user_scissors│───>│    scissors      │<────│   products      │
│  (绑定剪刀) │     │   (剪刀产品)      │     │    (商品)        │
└─────────────┘     └──────────────────┘     └────────┬────────┘
       │                                           │
       │                                           │ 1:N
       ▼                                           ▼
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ points_logs │     │  product_specs   │     │  categories     │
│  (积分记录) │     │   (规格)          │     │   (分类)         │
└─────────────┘     └──────────────────┘     └─────────────────┘
       │
       │ 1:N
       ▼
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ user_coupons│───>│     coupons      │     │     orders      │
│ (用户优惠券) │     │   (优惠券)        │     │    (订单)        │
└─────────────┘     └──────────────────┘     └────────┬────────┘
                                                   │
                    ┌──────────────────┬────────────┘
                    ▼                  ▼
         ┌──────────────────┐  ┌─────────────────┐
         │   order_items   │  │ order_addresses │
         │  (订单商品)      │  │  (订单地址)      │
         └────────┬────────┘  └─────────────────┘
                  │
                  ▼
         ┌──────────────────┐
         │    scissors      │
         │   (剪刀产品)      │
         └──────────────────┘
```

---

## 五、安全机制

### 5.1 用户身份识别

微信小程序通过 `wx.cloud.callFunction` 调用云函数时，微信会自动注入用户身份信息：

```javascript
// 云函数中获取用户 openid
const wxContext = cloud.getWXContext();
const openid = wxContext.OPENID;  // 微信用户唯一标识
```

### 5.2 数据隔离

每个用户只能访问自己的数据：

```sql
-- 查询用户订单时，自动带上 openid 条件
SELECT * FROM orders WHERE _openid = ? AND user_id = ?
```

### 5.3 权限控制

| 数据类型 | 访问规则 |
|---------|---------|
| 用户私有数据 | 必须匹配 openid |
| 商品/分类 | 公开可读 |
| 轮播图 | 公开可读 |
| 订单/地址/优惠券 | 仅本人 |

---

## 六、接口调用示例

### 6.1 登录

```javascript
// 小程序端
wx.cloud.callFunction({
  name: 'login',
  data: {}
}).then(res => {
  console.log(res.result); // { success: true, data: { openid, userId, isNewUser } }
});
```

### 6.2 获取商品列表

```javascript
wx.cloud.callFunction({
  name: 'product',
  data: {
    action: 'getByCategory',
    categoryId: 1,
    page: 1,
    pageSize: 10
  }
});
```

### 6.3 创建订单

```javascript
wx.cloud.callFunction({
  name: 'order',
  data: {
    action: 'create',
    addressId: 1,
    items: [
      { productId: 1, quantity: 1, specs: { color: '红色' } }
    ],
    couponId: null,
    usePoints: 0,
    message: '尽快发货'
  }
});
```

---

## 七、文档更新记录

| 日期 | 版本 | 更新内容 |
|------|------|---------|
| 2026-04-20 | v1.0 | 初始版本 |

---

*本文档由 CodeBuddy 自动生成*
