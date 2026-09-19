-- Draft only. This migration is intentionally not applied to production by the API.
-- Apply only after the approved isolated restore rehearsal and callback replay test.
-- Raw callback payloads are encrypted operational evidence: never expose them via API or logs.
CREATE TABLE `payment_inbound_events` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `event_id` VARCHAR(64) NOT NULL,
  `event_type` VARCHAR(64) NULL,
  `resource_type` VARCHAR(64) NULL,
  `resource_id` VARCHAR(128) NULL,
  `transaction_id` VARCHAR(64) NULL,
  `out_trade_no` VARCHAR(64) NULL,
  `out_refund_no` VARCHAR(64) NULL,
  `signature_serial` VARCHAR(128) NOT NULL,
  `signature_timestamp` BIGINT UNSIGNED NOT NULL,
  `payload_sha256` BINARY(32) NOT NULL,
  `payload_nonce` VARBINARY(12) NOT NULL,
  `encrypted_payload` LONGBLOB NOT NULL,
  `payload_key_version` VARCHAR(32) NOT NULL,
  `received_at` DATETIME(3) NOT NULL,
  `processing_status` ENUM('received','processing','processed','blocked') NOT NULL DEFAULT 'received',
  `duplicate_count` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `last_received_at` DATETIME(3) NOT NULL,
  `processed_at` DATETIME(3) NULL,
  `last_error_code` VARCHAR(64) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_payment_inbound_events_event_id` (`event_id`),
  KEY `idx_payment_inbound_events_status_received` (`processing_status`, `received_at`),
  KEY `idx_payment_inbound_events_trade_no` (`out_trade_no`),
  KEY `idx_payment_inbound_events_refund_no` (`out_refund_no`),
  KEY `idx_payment_inbound_events_transaction_id` (`transaction_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `payment_event_consumptions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `inbound_event_id` BIGINT UNSIGNED NOT NULL,
  `consumer_name` VARCHAR(64) NOT NULL,
  `status` ENUM('pending','processing','processed','blocked') NOT NULL DEFAULT 'pending',
  `attempt_count` INT UNSIGNED NOT NULL DEFAULT 0,
  `last_error_code` VARCHAR(64) NULL,
  `processed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_payment_event_consumptions_consumer_event` (`consumer_name`, `inbound_event_id`),
  KEY `idx_payment_event_consumptions_status` (`status`, `created_at`),
  CONSTRAINT `fk_payment_event_consumptions_inbound_event` FOREIGN KEY (`inbound_event_id`) REFERENCES `payment_inbound_events` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
