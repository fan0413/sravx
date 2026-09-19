-- New order-creation idempotency ledger. It does not import or alter historical orders.
CREATE TABLE `order_creation_requests` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `idempotency_key` VARCHAR(80) NOT NULL,
  `order_id` BIGINT UNSIGNED NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_order_creation_request` (`user_id`, `idempotency_key`),
  UNIQUE KEY `uk_order_creation_order` (`order_id`),
  CONSTRAINT `fk_order_creation_request_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
