-- =============================================================================
-- 礼品卡兑换系统迁移脚本
-- 支持单项礼品：商品(product)、积分(points)、优惠券(coupon)。
-- 支持组合礼品：gift_type='combo'，gift_payload.gifts 数组内放 2-3 项权益。
-- 执行前请先备份数据库；若索引或字段已存在，可跳过对应报错行。
-- =============================================================================

CREATE TABLE IF NOT EXISTS `gift_cards` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(64) NOT NULL COMMENT '兑换码，建议管理端生成后统一转大写',
  `title` VARCHAR(120) NOT NULL DEFAULT '' COMMENT '礼品卡标题',
  `gift_type` VARCHAR(20) NOT NULL COMMENT 'product|points|coupon|combo',
  `gift_payload` JSON NULL COMMENT '礼品配置；combo 时为 {gifts:[{type:"points",...},{type:"coupon",...},{type:"product",...}]}',
  `status` VARCHAR(20) NOT NULL DEFAULT 'unused' COMMENT 'unused|redeemed|expired|disabled',
  `batch_no` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '批次号，便于管理端活动归档',
  `redeemed_by` VARCHAR(128) NULL COMMENT '兑换用户 openid',
  `redeemed_record_id` BIGINT UNSIGNED NULL COMMENT '对应 gift_redeem_records.id',
  `redeemed_at` DATETIME NULL,
  `expire_time` DATETIME NULL,
  `admin_note` VARCHAR(255) NOT NULL DEFAULT '',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_gift_cards_code` (`code`),
  KEY `idx_gift_cards_status_expire` (`status`, `expire_time`),
  KEY `idx_gift_cards_batch` (`batch_no`),
  KEY `idx_gift_cards_redeemed_by` (`redeemed_by`, `redeemed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='礼品卡兑换码';

CREATE TABLE IF NOT EXISTS `gift_redeem_records` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `gift_card_id` BIGINT UNSIGNED NOT NULL,
  `code` VARCHAR(64) NOT NULL,
  `user_id` BIGINT UNSIGNED NULL,
  `_openid` VARCHAR(128) NOT NULL,
  `gift_type` VARCHAR(20) NOT NULL COMMENT 'product|points|coupon|combo',
  `gift_title` VARCHAR(120) NOT NULL DEFAULT '',
  `gift_snapshot` JSON NULL COMMENT '兑换时的礼品快照',
  `redeem_status` VARCHAR(20) NOT NULL DEFAULT 'success' COMMENT 'success|failed',
  `fulfillment_status` VARCHAR(32) NOT NULL DEFAULT 'fulfilled' COMMENT 'fulfilled|pending_address|failed',
  `order_id` BIGINT UNSIGNED NULL COMMENT '商品礼品生成的普通订单 id',
  `order_no` VARCHAR(64) NULL,
  `user_coupon_id` BIGINT UNSIGNED NULL COMMENT '优惠券礼品发放后的 user_coupons.id',
  `points_change` INT NOT NULL DEFAULT 0 COMMENT '积分礼品发放数量',
  `fail_reason` VARCHAR(255) NOT NULL DEFAULT '',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_gift_records_card` (`gift_card_id`),
  KEY `idx_gift_records_openid_created` (`_openid`, `created_at`),
  KEY `idx_gift_records_fulfillment` (`fulfillment_status`, `created_at`),
  KEY `idx_gift_records_order` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='礼品卡兑换记录';

-- 可选：确保积分明细可按 openid 查询。若已存在会报 Duplicate column/index，跳过即可。
ALTER TABLE `points_logs` ADD COLUMN `openid` VARCHAR(128) NULL COMMENT '微信 openid' AFTER `user_id`;
ALTER TABLE `points_logs` ADD INDEX `idx_points_logs_openid_created` (`openid`, `created_at`);
