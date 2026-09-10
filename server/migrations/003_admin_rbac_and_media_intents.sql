-- Draft only. Do not run against the target database without owner approval
-- and an isolated restore rehearsal.
CREATE TABLE `admin_accounts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(64) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `status` ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  `last_login_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_admin_accounts_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `admin_roles` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(64) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_admin_roles_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `admin_account_roles` (
  `admin_account_id` BIGINT UNSIGNED NOT NULL,
  `admin_role_id` BIGINT UNSIGNED NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`admin_account_id`, `admin_role_id`),
  CONSTRAINT `fk_admin_account_roles_account` FOREIGN KEY (`admin_account_id`) REFERENCES `admin_accounts` (`id`),
  CONSTRAINT `fk_admin_account_roles_role` FOREIGN KEY (`admin_role_id`) REFERENCES `admin_roles` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `admin_audit_events` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `admin_account_id` BIGINT UNSIGNED NOT NULL,
  `request_id` CHAR(36) NOT NULL,
  `action` VARCHAR(96) NOT NULL,
  `resource_type` VARCHAR(64) NOT NULL,
  `resource_id` VARCHAR(96) NULL,
  `before_summary` JSON NULL,
  `after_summary` JSON NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_admin_audit_events_request_action` (`request_id`, `action`),
  KEY `idx_admin_audit_events_account_created` (`admin_account_id`, `created_at`),
  CONSTRAINT `fk_admin_audit_events_account` FOREIGN KEY (`admin_account_id`) REFERENCES `admin_accounts` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `media_upload_intents` (
  `id` CHAR(36) NOT NULL,
  `admin_account_id` BIGINT UNSIGNED NOT NULL,
  `object_key` VARCHAR(512) NOT NULL,
  `content_type` VARCHAR(96) NOT NULL,
  `byte_size` BIGINT UNSIGNED NOT NULL,
  `content_sha256` CHAR(64) NOT NULL,
  `status` ENUM('pending', 'confirmed', 'expired', 'rejected') NOT NULL DEFAULT 'pending',
  `expires_at` DATETIME NOT NULL,
  `confirmed_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_media_upload_intents_object_key` (`object_key`),
  KEY `idx_media_upload_intents_account_status` (`admin_account_id`, `status`, `expires_at`),
  CONSTRAINT `fk_media_upload_intents_account` FOREIGN KEY (`admin_account_id`) REFERENCES `admin_accounts` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
