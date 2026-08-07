-- =============================================================================
-- 积分系统回滚脚本（与 points_system_migration.sql 配套）
-- 风险提示：会删除积分订单与流水数据，请谨慎执行。
-- =============================================================================

DROP TABLE IF EXISTS `points_payment_logs`;
DROP TABLE IF EXISTS `points_orders`;
DROP TABLE IF EXISTS `points_products`;

