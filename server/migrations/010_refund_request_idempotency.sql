-- New refund-request idempotency ledger. It does not create a payment refund.
CREATE TABLE `order_refund_request_keys` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `idempotency_key` VARCHAR(80) NOT NULL,
  `refund_request_id` BIGINT UNSIGNED NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_refund_request_key` (`user_id`, `idempotency_key`),
  UNIQUE KEY `uk_refund_request_id` (`refund_request_id`),
  CONSTRAINT `fk_refund_request_key_request` FOREIGN KEY (`refund_request_id`) REFERENCES `order_refund_requests` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
