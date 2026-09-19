-- New coupon program only. It deliberately does not read or convert legacy coupons.
CREATE TABLE `coupon_campaigns` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `kind` ENUM('fixed','percent') NOT NULL,
  `value_fen` INT UNSIGNED NOT NULL,
  `minimum_fen` INT UNSIGNED NOT NULL DEFAULT 0,
  `total_limit` INT UNSIGNED NOT NULL,
  `claimed_count` INT UNSIGNED NOT NULL DEFAULT 0,
  `per_user_limit` INT UNSIGNED NOT NULL DEFAULT 1,
  `starts_at` DATETIME NOT NULL,
  `ends_at` DATETIME NOT NULL,
  `status` ENUM('draft','active','disabled') NOT NULL DEFAULT 'draft',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_coupon_campaigns_available` (`status`, `starts_at`, `ends_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `coupon_claims` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `campaign_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `status` ENUM('unused','reserved','used','expired','released') NOT NULL DEFAULT 'unused',
  `idempotency_key` VARCHAR(64) NOT NULL,
  `reserved_order_id` BIGINT UNSIGNED NULL,
  `used_order_id` BIGINT UNSIGNED NULL,
  `claimed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reserved_at` DATETIME NULL,
  `used_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_coupon_claim_user_campaign` (`user_id`, `campaign_id`),
  UNIQUE KEY `uk_coupon_claim_idempotency` (`user_id`, `idempotency_key`),
  UNIQUE KEY `uk_coupon_claim_used_order` (`used_order_id`),
  KEY `idx_coupon_claims_user_status` (`user_id`, `status`, `claimed_at`),
  CONSTRAINT `fk_coupon_claim_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `coupon_campaigns` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
