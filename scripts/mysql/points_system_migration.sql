-- =============================================================================
-- 积分系统迁移脚本（含积分商品、积分订单、积分支付流水）
-- 执行前请先备份数据库。
-- =============================================================================

-- 1) 积分商品表：与主商品表关联，支持库存冻结与混合支付
CREATE TABLE IF NOT EXISTS `points_products` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `product_id` BIGINT UNSIGNED NOT NULL COMMENT '关联 products.id',
  `points_price` INT NOT NULL DEFAULT 0 COMMENT '每件兑换积分',
  `cash_price` DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '每件现金价（混合支付）',
  `stock_total` INT NOT NULL DEFAULT 0 COMMENT '总库存',
  `stock_available` INT NOT NULL DEFAULT 0 COMMENT '可用库存',
  `stock_frozen` INT NOT NULL DEFAULT 0 COMMENT '冻结库存（待支付）',
  `sales_count` INT NOT NULL DEFAULT 0 COMMENT '兑换销量',
  `is_on_sale` TINYINT NOT NULL DEFAULT 1 COMMENT '1上架 0下架',
  `min_member_level` TINYINT NOT NULL DEFAULT 1 COMMENT '最低可兑会员等级',
  `support_mixed_pay` TINYINT NOT NULL DEFAULT 0 COMMENT '是否支持积分+现金',
  `ext_json` JSON NULL COMMENT '扩展字段',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_points_products_product_id` (`product_id`),
  KEY `idx_points_products_on_sale_stock` (`is_on_sale`, `stock_available`),
  KEY `idx_points_products_level` (`min_member_level`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='积分商品表';

-- 2) 积分订单表：订单生命周期与实物订单一致（pending_payment/paid/pending_send/completed/cancelled/refunding/refunded）
CREATE TABLE IF NOT EXISTS `points_orders` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_no` VARCHAR(64) NOT NULL COMMENT '订单号（与实物订单统一规则）',
  `idempotency_key` VARCHAR(80) NOT NULL COMMENT '幂等键（防重复提交）',
  `user_id` BIGINT UNSIGNED NOT NULL,
  `_openid` VARCHAR(64) NOT NULL,
  `points_product_id` BIGINT UNSIGNED NOT NULL,
  `product_id` BIGINT UNSIGNED NOT NULL,
  `product_name_snapshot` VARCHAR(120) NOT NULL DEFAULT '',
  `product_image_snapshot` VARCHAR(255) NOT NULL DEFAULT '',
  `selected_spec_snapshot` VARCHAR(100) NOT NULL DEFAULT '',
  `quantity` INT NOT NULL DEFAULT 1,
  `unit_points` INT NOT NULL DEFAULT 0,
  `total_points` INT NOT NULL DEFAULT 0,
  `unit_cash` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `total_cash` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `payable_cash` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `status` VARCHAR(32) NOT NULL DEFAULT 'pending_payment',
  `payment_status` VARCHAR(32) NOT NULL DEFAULT 'pending',
  `payment_channel` VARCHAR(32) NULL COMMENT 'wechat|balance|mixed|points_only',
  `pay_transaction_id` VARCHAR(64) NULL COMMENT '微信交易号',
  `pay_callback_payload` JSON NULL COMMENT '支付回调原文',
  `refund_transaction_id` VARCHAR(64) NULL,
  `remark` VARCHAR(255) NOT NULL DEFAULT '',
  `receiver_name` VARCHAR(50) NOT NULL DEFAULT '',
  `receiver_phone` VARCHAR(20) NOT NULL DEFAULT '',
  `address_text` VARCHAR(255) NOT NULL DEFAULT '',
  `logistics_company` VARCHAR(80) NOT NULL DEFAULT '',
  `logistics_no` VARCHAR(80) NOT NULL DEFAULT '',
  `pay_time` DATETIME NULL,
  `ship_time` DATETIME NULL,
  `completed_at` DATETIME NULL,
  `cancelled_at` DATETIME NULL,
  `cancel_reason` VARCHAR(255) NOT NULL DEFAULT '',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_points_orders_order_no` (`order_no`),
  UNIQUE KEY `uk_points_orders_idempotency` (`idempotency_key`),
  KEY `idx_points_orders_openid_status_created` (`_openid`, `status`, `created_at`),
  KEY `idx_points_orders_user_created` (`user_id`, `created_at`),
  KEY `idx_points_orders_product_created` (`points_product_id`, `created_at`),
  KEY `idx_points_orders_pay_transaction` (`pay_transaction_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='积分订单表';

-- 3) 积分支付流水表：记录积分/现金收支、余额快照、幂等与对账信息
CREATE TABLE IF NOT EXISTS `points_payment_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_id` BIGINT UNSIGNED NOT NULL,
  `order_no` VARCHAR(64) NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `_openid` VARCHAR(64) NOT NULL,
  `direction` VARCHAR(8) NOT NULL COMMENT 'in|out',
  `biz_type` VARCHAR(32) NOT NULL COMMENT 'freeze|confirm|unfreeze|refund',
  `points_change` INT NOT NULL DEFAULT 0 COMMENT '积分变化，扣减为负，返还为正',
  `cash_change` DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '现金变化，收款为正，退款为负',
  `balance_before` INT NOT NULL DEFAULT 0 COMMENT '积分变动前余额',
  `balance_after` INT NOT NULL DEFAULT 0 COMMENT '积分变动后余额',
  `idempotency_key` VARCHAR(120) NOT NULL COMMENT '流水幂等键',
  `reconcile_date` DATE NOT NULL COMMENT '对账日期',
  `reconcile_status` VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT 'pending|matched|mismatch',
  `payment_channel` VARCHAR(32) NOT NULL DEFAULT 'points_only',
  `pay_transaction_id` VARCHAR(64) NULL,
  `ext_json` JSON NULL,
  `remark` VARCHAR(255) NOT NULL DEFAULT '',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_points_payment_logs_idempotency` (`idempotency_key`),
  KEY `idx_points_payment_logs_user_date` (`user_id`, `reconcile_date`),
  KEY `idx_points_payment_logs_order` (`order_id`, `created_at`),
  KEY `idx_points_payment_logs_reconcile` (`reconcile_date`, `reconcile_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='积分支付流水表';

-- 4) 兼容补充：地址表别名（项目内存在 addresses 命名）
-- 无需额外 DDL，仅在云函数中兼容 addresses / user_addresses 读取。

