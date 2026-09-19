-- Existing point orders are not imported. This key protects new requests from duplicate submission.
ALTER TABLE `points_orders`
  ADD UNIQUE KEY `uk_points_orders_user_idempotency` (`user_id`, `idempotency_key`);
