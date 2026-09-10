-- 剪刀售后：用户申请、卖家留言、管理端处理预留
CREATE TABLE IF NOT EXISTS `scissors_after_sales` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `request_no` VARCHAR(32) NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `openid` VARCHAR(128) DEFAULT NULL,
  `_openid` VARCHAR(64) NOT NULL,
  `user_scissors_id` BIGINT UNSIGNED NOT NULL,
  `scissors_id` BIGINT UNSIGNED NOT NULL,
  `sn` VARCHAR(32) NOT NULL,
  `service_type` ENUM('repair','replacement') NOT NULL,
  `issue_description` VARCHAR(500) NOT NULL,
  `status` ENUM('submitted','accepted','repairing','replacement_pending','awaiting_user','completed','rejected','cancelled') NOT NULL DEFAULT 'submitted',
  `seller_message` VARCHAR(1000) DEFAULT NULL,
  `seller_message_at` DATETIME DEFAULT NULL,
  `handled_by` BIGINT UNSIGNED DEFAULT NULL,
  `handled_by_name` VARCHAR(50) DEFAULT NULL,
  `replacement_scissors_id` BIGINT UNSIGNED DEFAULT NULL,
  `replacement_sn` VARCHAR(32) DEFAULT NULL,
  `internal_note` VARCHAR(1000) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_request_no` (`request_no`),
  KEY `idx_user_scissors` (`user_scissors_id`),
  KEY `idx_user_status` (`user_id`, `status`),
  KEY `idx_status_created` (`status`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='剪刀售后申请';

CREATE TABLE IF NOT EXISTS `scissors_after_sale_messages` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `after_sale_id` BIGINT UNSIGNED NOT NULL,
  `sender_role` ENUM('user','seller','system') NOT NULL,
  `sender_id` BIGINT UNSIGNED DEFAULT NULL,
  `content` VARCHAR(1000) NOT NULL,
  `visible_to_user` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_after_sale_created` (`after_sale_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='剪刀售后沟通记录';
