-- Refund review state for the target API. Apply once through the controlled
-- migration procedure before deploying code that writes order_status_snapshot.
-- This does not call WeChat Pay or create a monetary refund.
ALTER TABLE `order_refund_requests`
  ADD COLUMN `order_status_snapshot` VARCHAR(32) NOT NULL DEFAULT '' AFTER `requested_amount`;

ALTER TABLE `order_refund_requests`
  ADD KEY `idx_refund_review_status` (`status`, `created_at`);
