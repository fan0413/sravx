-- Link physical scissors SN records to product specs for exact card display.
-- Safe to run repeatedly on MySQL-compatible databases.

SET @ddl := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `scissors` ADD COLUMN `spec_id` BIGINT UNSIGNED NULL COMMENT ''Linked product_specs.id'' AFTER `product_id`',
    'SELECT 1'
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'scissors'
    AND COLUMN_NAME = 'spec_id'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `scissors` ADD COLUMN `sku` VARCHAR(64) NULL COMMENT ''Linked product_specs.sku'' AFTER `spec_id`',
    'SELECT 1'
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'scissors'
    AND COLUMN_NAME = 'sku'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `scissors` ADD COLUMN `spec_name` VARCHAR(100) NULL COMMENT ''Linked product_specs.name fallback'' AFTER `sku`',
    'SELECT 1'
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'scissors'
    AND COLUMN_NAME = 'spec_name'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `scissors` ADD COLUMN `card_image` VARCHAR(500) NULL COMMENT ''Exact SN card image override'' AFTER `image`',
    'SELECT 1'
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'scissors'
    AND COLUMN_NAME = 'card_image'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl := (
  SELECT IF(
    COUNT(*) = 0,
    'CREATE INDEX `idx_scissors_spec_id` ON `scissors` (`spec_id`)',
    'SELECT 1'
  )
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'scissors'
    AND INDEX_NAME = 'idx_scissors_spec_id'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl := (
  SELECT IF(
    COUNT(*) = 0,
    'CREATE INDEX `idx_scissors_sku` ON `scissors` (`sku`)',
    'SELECT 1'
  )
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'scissors'
    AND INDEX_NAME = 'idx_scissors_sku'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Recommended data fill strategy:
-- 1. When importing SN batches, set one of spec_id, sku, or spec_name.
-- 2. Prefer spec_id, then sku, then spec_name. card_image is only for SN-level overrides.
-- 3. Example:
-- UPDATE scissors s
-- JOIN product_specs ps ON ps.product_id = s.product_id AND ps.sku = 'P0048-02'
-- SET s.spec_id = ps.id, s.sku = ps.sku, s.spec_name = ps.name
-- WHERE s.sn IN ('SN001', 'SN002');
