-- Required by the existing verified refund settlement writer.
-- Additive only: do not change orders, amounts or existing payment identities.
ALTER TABLE `orders`
  ADD COLUMN `refund_transaction_id` VARCHAR(64) NULL DEFAULT NULL COMMENT '微信退款单号';
