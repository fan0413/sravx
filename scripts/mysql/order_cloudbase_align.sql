-- =============================================================================
-- CloudBase MySQL：与 cloudfunctions/order 云函数对齐（增量）
--
-- 【已通过 CloudBase MCP 对线上库核查】information_schema 显示 orders / users /
-- user_coupons 等已含 _openid、coupon_amount、pay_type、pay_transaction_id、
-- buyer_message、used_coupon_id、used_points、receive_time 等字段，故未重复 ADD。
-- 【已在 MCP 执行】索引：
--   ALTER TABLE orders ADD INDEX idx_orders_openid (_openid);
--   ALTER TABLE user_coupons ADD INDEX idx_user_coupons_openid (_openid);
--
-- 待付款超时关单标记（云函数 order：auto_cancel=1 仅出现在「全部」Tab）：
--   ALTER TABLE orders ADD COLUMN auto_cancel TINYINT NOT NULL DEFAULT 0
--     COMMENT '1=超时未支付自动关单' AFTER updated_at;
--
-- 说明：若某列已存在会报 Duplicate column，跳过该行即可。
-- 请先对照当前库表结构；docs/database-design.md 中 orders 已含 freight、
-- discount_amount、pay_amount、pay_time、ship_time、receive_time、remark 等，
-- 下列多为云函数额外使用的字段。
-- =============================================================================

-- orders：按 openid 查单、支付回调、创建订单
ALTER TABLE `orders` ADD COLUMN `_openid` VARCHAR(64) NULL COMMENT '微信 openid' AFTER `user_id`;
ALTER TABLE `orders` ADD INDEX `idx_orders_openid` (`_openid`);

ALTER TABLE `orders` ADD COLUMN `coupon_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '券抵扣金额' AFTER `discount_amount`;

ALTER TABLE `orders` ADD COLUMN `pay_type` VARCHAR(32) NULL COMMENT '支付方式，如 wechat' AFTER `status`;
ALTER TABLE `orders` ADD COLUMN `pay_transaction_id` VARCHAR(64) NULL COMMENT '微信支付交易号' AFTER `pay_type`;

-- 云函数 create 写入 buyer_message；若仅有 remark 且无 buyer_message，可二选一：
-- A) 执行本行；B) 改云函数 INSERT 使用 remark
ALTER TABLE `orders` ADD COLUMN `buyer_message` VARCHAR(255) NULL COMMENT '买家留言' AFTER `remark`;

ALTER TABLE `orders` ADD COLUMN `used_coupon_id` BIGINT UNSIGNED NULL COMMENT '使用的用户券 id' AFTER `buyer_message`;
ALTER TABLE `orders` ADD COLUMN `used_points` INT NOT NULL DEFAULT 0 COMMENT '本单使用积分' AFTER `used_coupon_id`;

-- confirmReceive 会写 receive_time；设计文档已有该列则跳过
-- ALTER TABLE `orders` ADD COLUMN `receive_time` DATETIME NULL COMMENT '确认收货时间' AFTER `ship_time`;

-- status 须含：pending_payment, paid, shipped, received, completed, cancelled, refunding, refunded

-- ---------------------------------------------------------------------------
-- 历史数据对齐：旧逻辑里已提交退款申请但订单仍停留 paid，统一修正为 refunding
-- ---------------------------------------------------------------------------
UPDATE `orders` o
INNER JOIN (
  SELECT order_id, MAX(id) AS max_id
  FROM order_refund_requests
  GROUP BY order_id
) t ON t.order_id = o.id
INNER JOIN order_refund_requests r ON r.id = t.max_id
SET o.status = 'refunding',
    o.updated_at = NOW()
WHERE o.status = 'paid'
  AND r.status IN ('pending_review', 'approved', 'processing');

-- ---------------------------------------------------------------------------
-- user_coupons（与 cloudfunctions/coupon 一致）
-- ---------------------------------------------------------------------------
ALTER TABLE `user_coupons` ADD COLUMN `_openid` VARCHAR(64) NULL COMMENT '微信 openid' AFTER `coupon_id`;
ALTER TABLE `user_coupons` ADD INDEX `idx_user_coupons_openid` (`_openid`);

-- ---------------------------------------------------------------------------
-- order_addresses（云函数 INSERT 带 created_at）
-- ---------------------------------------------------------------------------
ALTER TABLE `order_addresses` ADD COLUMN `created_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP AFTER `detail`;

-- ---------------------------------------------------------------------------
-- users（login 已写 _openid；老库缺列时补）
-- ---------------------------------------------------------------------------
ALTER TABLE `users` ADD COLUMN `_openid` VARCHAR(64) NULL COMMENT '与 openid 同步' AFTER `openid`;
