# Saven 剪刀电商小程序 - 数据库设计方案

## 一、项目概述

### 1.1 业务背景
- **产品定位**：高端剪刀/理发工具品牌电商
- **核心特色**：每把剪刀有唯一SN码，支持绑定保修
- **目标用户**：理发师、发型师、剪刀爱好者

### 1.2 功能模块
| 模块 | 功能点 |
|------|--------|
| 用户系统 | 注册、登录、用户信息管理 |
| 商品系统 | 商品展示、分类、详情、规格 |
| 购物系统 | 购物车、订单管理 |
| 地址管理 | 收货地址增删改查 |
| 剪刀绑定 | SN码绑定、保修查询 |
| 会员系统 | 积分、优惠券、会员等级 |
| 首页运营 | 轮播图、精选推荐 |

---

## 二、数据库表结构设计

### 2.1 用户相关表

#### `users` - 用户表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT UNSIGNED PK AUTO_INCREMENT | 用户ID |
| openid | VARCHAR(64) UNIQUE | 微信OpenID |
| unionid | VARCHAR(64) UNIQUE NULL | 微信UnionID |
| username | VARCHAR(50) | 用户名 |
| phone | VARCHAR(20) | 手机号 |
| avatar | VARCHAR(255) | 头像URL |
| gender | ENUM('男','女') | 性别 |
| birthday | DATE NULL | 生日 |
| occupation | VARCHAR(50) NULL | 职业 |
| member_level | INT DEFAULT 1 | 会员等级(1-5) |
| points | INT DEFAULT 0 | 积分余额 |
| created_at | DATETIME | 注册时间 |
| updated_at | DATETIME | 更新时间 |

#### `user_addresses` - 用户收货地址表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT UNSIGNED PK AUTO_INCREMENT | 地址ID |
| user_id | BIGINT UNSIGNED FK | 用户ID |
| name | VARCHAR(50) | 收货人姓名 |
| phone | VARCHAR(20) | 手机号 |
| province | VARCHAR(50) | 省份 |
| city | VARCHAR(50) | 城市 |
| district | VARCHAR(50) | 区县 |
| detail | VARCHAR(200) | 详细地址 |
| is_default | TINYINT DEFAULT 0 | 是否默认地址 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

---

### 2.2 商品相关表

#### `categories` - 商品分类表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT UNSIGNED PK AUTO_INCREMENT | 分类ID |
| name | VARCHAR(50) | 分类名称 |
| icon | VARCHAR(255) NULL | 图标URL |
| sort_order | INT DEFAULT 0 | 排序 |
| parent_id | BIGINT UNSIGNED NULL | 父分类ID |
| created_at | DATETIME | 创建时间 |

#### `products` - 商品表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT UNSIGNED PK AUTO_INCREMENT | 商品ID |
| name | VARCHAR(100) | 商品名称 |
| desc | VARCHAR(255) | 简短描述 |
| price | DECIMAL(10,2) | 售价 |
| category_id | BIGINT UNSIGNED FK | 分类ID |
| images | JSON | 图片列表 |
| specs | JSON | 规格选项 |
| params | JSON | 详细参数(材质、尺寸等) |
| stock | INT DEFAULT 0 | 库存 |
| sales_count | INT DEFAULT 0 | 销量 |
| is_on_sale | TINYINT DEFAULT 1 | 是否上架 |
| sort_order | INT DEFAULT 0 | 排序 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

#### `product_specs` - 商品规格表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT UNSIGNED PK AUTO_INCREMENT | 规格ID |
| product_id | BIGINT UNSIGNED FK | 商品ID |
| name | VARCHAR(50) | 规格名称(如"颜色"、"尺寸") |
| options | JSON | 选项列表 |
| created_at | DATETIME | 创建时间 |

---

### 2.3 订单相关表

#### `orders` - 订单表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT UNSIGNED PK AUTO_INCREMENT | 订单ID |
| order_no | VARCHAR(32) UNIQUE | 订单号 |
| user_id | BIGINT UNSIGNED FK | 用户ID |
| total_amount | DECIMAL(10,2) | 订单总额 |
| freight | DECIMAL(10,2) DEFAULT 0 | 运费 |
| discount_amount | DECIMAL(10,2) DEFAULT 0 | 优惠金额 |
| pay_amount | DECIMAL(10,2) | 实付金额 |
| status | ENUM | 订单状态 |
| pay_time | DATETIME NULL | 支付时间 |
| ship_time | DATETIME NULL | 发货时间 |
| receive_time | DATETIME NULL | 收货时间 |
| remark | VARCHAR(255) NULL | 订单备注 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

**订单状态枚举值：**
- `pending_payment` - 待付款
- `paid` - 已付款
- `shipped` - 已发货
- `received` - 已收货
- `completed` - 已完成
- `cancelled` - 已取消
- `refunding` - 退款中
- `refunded` - 已退款

#### `order_items` - 订单商品表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT UNSIGNED PK AUTO_INCREMENT | 订单项ID |
| order_id | BIGINT UNSIGNED FK | 订单ID |
| product_id | BIGINT UNSIGNED FK | 商品ID |
| product_name | VARCHAR(100) | 商品名称(快照) |
| product_image | VARCHAR(255) | 商品图片(快照) |
| spec_desc | VARCHAR(255) NULL | 规格描述 |
| price | DECIMAL(10,2) | 单价 |
| quantity | INT | 数量 |
| created_at | DATETIME | 创建时间 |

#### `order_addresses` - 订单收货地址表(快照)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT UNSIGNED PK AUTO_INCREMENT | 地址ID |
| order_id | BIGINT UNSIGNED FK | 订单ID |
| name | VARCHAR(50) | 收货人 |
| phone | VARCHAR(20) | 手机号 |
| province | VARCHAR(50) | 省份 |
| city | VARCHAR(50) | 城市 |
| district | VARCHAR(50) | 区县 |
| detail | VARCHAR(200) | 详细地址 |

---

### 2.4 剪刀绑定相关表

#### `scissors` - 剪刀产品表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT UNSIGNED PK AUTO_INCREMENT | ID |
| sn | VARCHAR(32) UNIQUE | 序列号 |
| product_id | BIGINT UNSIGNED FK | 对应商品ID |
| name | VARCHAR(100) | 剪刀名称 |
| model | VARCHAR(50) | 型号 |
| image | VARCHAR(255) | 图片URL |
| warranty_months | INT DEFAULT 24 | 保修期(月) |
| created_at | DATETIME | 创建时间 |

#### `user_scissors` - 用户绑定剪刀表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT UNSIGNED PK AUTO_INCREMENT | 绑定ID |
| user_id | BIGINT UNSIGNED FK | 用户ID |
| scissors_id | BIGINT UNSIGNED FK | 剪刀ID |
| sn | VARCHAR(32) | 序列号(快照) |
| name | VARCHAR(100) | 名称(快照) |
| model | VARCHAR(50) | 型号(快照) |
| image | VARCHAR(255) | 图片(快照) |
| activation_date | DATE | 激活日期 |
| warranty_expire | DATE | 保修到期 |
| created_at | DATETIME | 绑定时间 |
| updated_at | DATETIME | 更新时间 |

---

### 2.5 会员积分与优惠券

#### `points_logs` - 积分变动记录表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT UNSIGNED PK AUTO_INCREMENT | 记录ID |
| user_id | BIGINT UNSIGNED FK | 用户ID |
| change_type | ENUM | 变动类型 |
| points | INT | 变动积分(正负) |
| balance | INT | 变动后余额 |
| order_id | BIGINT UNSIGNED NULL | 关联订单 |
| remark | VARCHAR(100) NULL | 备注 |
| created_at | DATETIME | 变动时间 |

**变动类型枚举：**
- `order_reward` - 订单赠送
- `order_deduct` - 订单使用
- `activity_reward` - 活动奖励
- `manual_adjust` - 手动调整

#### `coupons` - 优惠券表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT UNSIGNED PK AUTO_INCREMENT | 优惠券ID |
| name | VARCHAR(50) | 优惠券名称 |
| type | ENUM('fixed','percent') | 类型:满减/折扣 |
| value | DECIMAL(10,2) | 优惠值 |
| min_amount | DECIMAL(10,2) DEFAULT 0 | 满减门槛 |
| total_count | INT | 发行总量 |
| remain_count | INT | 剩余数量 |
| start_time | DATETIME | 开始时间 |
| expire_time | DATETIME | 过期时间 |
| created_at | DATETIME | 创建时间 |

#### `user_coupons` - 用户优惠券表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT UNSIGNED PK AUTO_INCREMENT | ID |
| user_id | BIGINT UNSIGNED FK | 用户ID |
| coupon_id | BIGINT UNSIGNED FK | 优惠券ID |
| status | ENUM('unused','used','expired') | 状态 |
| used_order_id | BIGINT UNSIGNED NULL | 使用的订单 |
| received_at | DATETIME | 领取时间 |
| used_at | DATETIME NULL | 使用时间 |

---

### 2.6 运营相关表

#### `banners` - 首页轮播图表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT UNSIGNED PK AUTO_INCREMENT | Banner ID |
| title | VARCHAR(50) | 标题 |
| image | VARCHAR(255) | 图片URL |
| link_type | ENUM('product','category','web','none') | 跳转类型 |
| link_value | VARCHAR(255) NULL | 跳转值 |
| sort_order | INT DEFAULT 0 | 排序 |
| start_time | DATETIME | 显示开始 |
| end_time | DATETIME | 显示结束 |
| is_active | TINYINT DEFAULT 1 | 是否启用 |
| created_at | DATETIME | 创建时间 |

---

## 三、表关系图

```
┌─────────────────────────────────────────────────────────────────┐
│                         用户模块                                 │
│  ┌─────────┐     ┌─────────────────┐                          │
│  │  users  │────<│ user_addresses  │                          │
│  └────┬────┘     └─────────────────┘                          │
│       │                                                         │
│       ├────< user_scissors >────┐                              │
│       │                          │                               │
│       ├────< points_logs  >──────┤                               │
│       │                          │                               │
│       └────< user_coupons >───┐   │                               │
│                                │   │                               │
└────────────────────────────────┼───┼─────────────────────────────┘
                                 │   │
┌────────────────────────────────┼───┼─────────────────────────────┐
│                         订单模块          │                         │
│  ┌─────────┐     ┌─────────────────┐   │                          │
│  │ orders  │────<│  order_items    │───┘                          │
│  └────┬────┘     └─────────────────┘                              │
│       │                                                            │
│       ├────< order_addresses >────┐                                │
│       │                            │                                │
│       ├────< points_logs(order) >──┤                                │
│       │                            │                                │
│       └────< user_coupons(order) >─┘                                │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         商品模块                                 │
│  ┌───────────┐     ┌──────────┐     ┌────────────────┐        │
│  │ categories│────<│ products │────<│ product_specs   │        │
│  └───────────┘     └────┬─────┘     └────────────────┘        │
│                         │                                       │
│                         ├────< order_items >                    │
│                         │                                       │
│                         └────< scissors >────< user_scissors >  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         运营模块                                 │
│  ┌──────────┐     ┌─────────────────┐                          │
│  │ banners  │     │     coupons     │────< user_coupons >      │
│  └──────────┘     └─────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 四、索引设计

### 4.1 必建索引
```sql
-- 用户表
ALTER TABLE users ADD UNIQUE INDEX idx_openid(openid);
ALTER TABLE users ADD INDEX idx_phone(phone);

-- 地址表
ALTER TABLE user_addresses ADD INDEX idx_user_id(user_id);

-- 商品表
ALTER TABLE products ADD INDEX idx_category(category_id);
ALTER TABLE products ADD INDEX idx_is_on_sale(is_on_sale);
ALTER TABLE products ADD INDEX idx_sort_order(sort_order);

-- 订单表
ALTER TABLE orders ADD UNIQUE INDEX idx_order_no(order_no);
ALTER TABLE orders ADD INDEX idx_user_id(user_id);
ALTER TABLE orders ADD INDEX idx_status(status);
ALTER TABLE orders ADD INDEX idx_created_at(created_at);

-- 订单商品表
ALTER TABLE order_items ADD INDEX idx_order_id(order_id);
ALTER TABLE order_items ADD INDEX idx_product_id(product_id);

-- 剪刀表
ALTER TABLE scissors ADD UNIQUE INDEX idx_sn(sn);
ALTER TABLE scissors ADD INDEX idx_product_id(product_id);

-- 用户绑定剪刀表
ALTER TABLE user_scissors ADD UNIQUE INDEX idx_user_sn(user_id, sn);
ALTER TABLE user_scissors ADD INDEX idx_user_id(user_id);

-- 用户优惠券表
ALTER TABLE user_coupons ADD INDEX idx_user_id(user_id);
ALTER TABLE user_coupons ADD INDEX idx_status(status);
```

---

## 五、字段规范

### 5.1 命名规范
- 表名：`snake_case`，单数形式
- 字段名：`snake_case`
- 时间字段：`created_at`、`updated_at`、`deleted_at`

### 5.2 通用字段
每个表都应包含：
```sql
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

### 5.3 软删除（可选）
```sql
deleted_at DATETIME NULL  -- 软删除标记
```

---

## 六、SQL 建表语句（MySQL）

```sql
-- ==================== 用户模块 ====================

CREATE TABLE `users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `openid` VARCHAR(64) NOT NULL COMMENT '微信OpenID',
  `unionid` VARCHAR(64) DEFAULT NULL COMMENT '微信UnionID',
  `username` VARCHAR(50) DEFAULT NULL,
  `phone` VARCHAR(20) DEFAULT NULL,
  `avatar` VARCHAR(255) DEFAULT NULL,
  `gender` ENUM('男','女') DEFAULT NULL,
  `birthday` DATE DEFAULT NULL,
  `occupation` VARCHAR(50) DEFAULT NULL,
  `member_level` INT DEFAULT 1 COMMENT '会员等级1-5',
  `points` INT DEFAULT 0 COMMENT '积分余额',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_openid` (`openid`),
  UNIQUE KEY `uk_unionid` (`unionid`),
  KEY `idx_phone` (`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

CREATE TABLE `user_addresses` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `name` VARCHAR(50) NOT NULL,
  `phone` VARCHAR(20) NOT NULL,
  `province` VARCHAR(50) NOT NULL,
  `city` VARCHAR(50) NOT NULL,
  `district` VARCHAR(50) NOT NULL,
  `detail` VARCHAR(200) NOT NULL,
  `is_default` TINYINT DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户收货地址表';

-- ==================== 商品模块 ====================

CREATE TABLE `categories` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(50) NOT NULL,
  `icon` VARCHAR(255) DEFAULT NULL,
  `sort_order` INT DEFAULT 0,
  `parent_id` BIGINT UNSIGNED DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_parent_id` (`parent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商品分类表';

CREATE TABLE `products` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `desc` VARCHAR(255) DEFAULT NULL,
  `price` DECIMAL(10,2) NOT NULL,
  `category_id` BIGINT UNSIGNED NOT NULL,
  `images` JSON DEFAULT NULL,
  `specs` JSON DEFAULT NULL,
  `params` JSON DEFAULT NULL,
  `stock` INT DEFAULT 0,
  `sales_count` INT DEFAULT 0,
  `is_on_sale` TINYINT DEFAULT 1,
  `sort_order` INT DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_category_id` (`category_id`),
  KEY `idx_is_on_sale` (`is_on_sale`),
  KEY `idx_sort_order` (`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商品表';

CREATE TABLE `scissors` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `sn` VARCHAR(32) NOT NULL COMMENT '序列号',
  `product_id` BIGINT UNSIGNED NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `model` VARCHAR(50) DEFAULT NULL,
  `image` VARCHAR(255) DEFAULT NULL,
  `warranty_months` INT DEFAULT 24,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sn` (`sn`),
  KEY `idx_product_id` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='剪刀产品表';

-- ==================== 订单模块 ====================

CREATE TABLE `orders` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_no` VARCHAR(32) NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `total_amount` DECIMAL(10,2) NOT NULL DEFAULT 0,
  `freight` DECIMAL(10,2) NOT NULL DEFAULT 0,
  `discount_amount` DECIMAL(10,2) NOT NULL DEFAULT 0,
  `pay_amount` DECIMAL(10,2) NOT NULL DEFAULT 0,
  `status` ENUM('pending_payment','paid','shipped','received','completed','cancelled','refunding','refunded') NOT NULL DEFAULT 'pending_payment',
  `pay_time` DATETIME DEFAULT NULL,
  `ship_time` DATETIME DEFAULT NULL,
  `receive_time` DATETIME DEFAULT NULL,
  `remark` VARCHAR(255) DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_order_no` (`order_no`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_status` (`status`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单表';

CREATE TABLE `order_items` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_id` BIGINT UNSIGNED NOT NULL,
  `product_id` BIGINT UNSIGNED NOT NULL,
  `product_name` VARCHAR(100) NOT NULL,
  `product_image` VARCHAR(255) DEFAULT NULL,
  `spec_desc` VARCHAR(255) DEFAULT NULL,
  `price` DECIMAL(10,2) NOT NULL,
  `quantity` INT NOT NULL DEFAULT 1,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_order_id` (`order_id`),
  KEY `idx_product_id` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单商品表';

CREATE TABLE `order_addresses` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_id` BIGINT UNSIGNED NOT NULL,
  `name` VARCHAR(50) NOT NULL,
  `phone` VARCHAR(20) NOT NULL,
  `province` VARCHAR(50) NOT NULL,
  `city` VARCHAR(50) NOT NULL,
  `district` VARCHAR(50) NOT NULL,
  `detail` VARCHAR(200) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_order_id` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单收货地址(快照)';

-- ==================== 剪刀绑定模块 ====================

CREATE TABLE `user_scissors` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `scissors_id` BIGINT UNSIGNED NOT NULL,
  `sn` VARCHAR(32) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `model` VARCHAR(50) DEFAULT NULL,
  `image` VARCHAR(255) DEFAULT NULL,
  `activation_date` DATE NOT NULL,
  `warranty_expire` DATE NOT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_sn` (`user_id`, `sn`),
  KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户绑定剪刀表';

-- ==================== 会员积分模块 ====================

CREATE TABLE `points_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `change_type` ENUM('order_reward','order_deduct','activity_reward','manual_adjust') NOT NULL,
  `points` INT NOT NULL,
  `balance` INT NOT NULL,
  `order_id` BIGINT UNSIGNED DEFAULT NULL,
  `remark` VARCHAR(100) DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_order_id` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='积分变动记录表';

-- ==================== 优惠券模块 ====================

CREATE TABLE `coupons` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(50) NOT NULL,
  `type` ENUM('fixed','percent') NOT NULL,
  `value` DECIMAL(10,2) NOT NULL,
  `min_amount` DECIMAL(10,2) DEFAULT 0,
  `total_count` INT NOT NULL,
  `remain_count` INT NOT NULL,
  `start_time` DATETIME NOT NULL,
  `expire_time` DATETIME NOT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='优惠券表';

CREATE TABLE `user_coupons` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `coupon_id` BIGINT UNSIGNED NOT NULL,
  `status` ENUM('unused','used','expired') NOT NULL DEFAULT 'unused',
  `used_order_id` BIGINT UNSIGNED DEFAULT NULL,
  `received_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `used_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_coupon_id` (`coupon_id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户优惠券表';

-- ==================== 运营模块 ====================

CREATE TABLE `banners` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(50) NOT NULL,
  `image` VARCHAR(255) NOT NULL,
  `link_type` ENUM('product','category','web','none') NOT NULL DEFAULT 'none',
  `link_value` VARCHAR(255) DEFAULT NULL,
  `sort_order` INT DEFAULT 0,
  `start_time` DATETIME DEFAULT NULL,
  `end_time` DATETIME DEFAULT NULL,
  `is_active` TINYINT DEFAULT 1,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='首页轮播图表';
```

---

## 七、后续步骤建议

1. **创建CloudBase环境** → 在CloudBase控制台创建MySQL数据库
2. **执行建表语句** → 使用数据库工具执行上述SQL
3. **开发云函数** → 编写用户、商品、订单等业务接口
4. **配置权限规则** → 设置数据库安全规则
5. **对接前端** → 联调小程序与后端API

如需我继续帮你创建云函数或配置数据库权限规则，请告诉我！
