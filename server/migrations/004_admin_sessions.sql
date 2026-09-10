-- Draft only. Do not run against the target database without owner approval
-- and an isolated restore rehearsal.
CREATE TABLE `admin_sessions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `admin_account_id` BIGINT UNSIGNED NOT NULL,
  `session_hash` BINARY(32) NOT NULL,
  `token_version` INT UNSIGNED NOT NULL DEFAULT 1,
  `issued_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` DATETIME NOT NULL,
  `revoked_at` DATETIME NULL,
  `last_seen_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_admin_sessions_hash` (`session_hash`),
  KEY `idx_admin_sessions_active` (`admin_account_id`, `revoked_at`, `expires_at`),
  CONSTRAINT `fk_admin_sessions_account` FOREIGN KEY (`admin_account_id`) REFERENCES `admin_accounts` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
