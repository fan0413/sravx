-- SRAVX structured catalog, checkout quote, and service-plan foundation.
-- This file is intentionally not executed by the application. Apply only after a
-- reviewed schema rehearsal and an owner-approved production migration window.

ALTER TABLE products
  ADD COLUMN series VARCHAR(32) NULL AFTER category_id,
  ADD COLUMN tool_group VARCHAR(64) NULL AFTER series,
  ADD COLUMN tool_subtype VARCHAR(64) NULL AFTER tool_group,
  ADD COLUMN display_size VARCHAR(32) NULL AFTER tool_subtype,
  ADD COLUMN steel_material VARCHAR(128) NULL AFTER display_size;

CREATE TABLE product_models (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_product_models_product_name (product_id, name),
  KEY idx_product_models_product_sort (product_id, sort_order, id),
  CONSTRAINT fk_product_models_product FOREIGN KEY (product_id) REFERENCES products (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_colors (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  swatch VARCHAR(32) NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_product_colors_product_name (product_id, name),
  KEY idx_product_colors_product_sort (product_id, sort_order, id),
  CONSTRAINT fk_product_colors_product FOREIGN KEY (product_id) REFERENCES products (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_skus (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id BIGINT UNSIGNED NOT NULL,
  model_id BIGINT UNSIGNED NOT NULL,
  color_id BIGINT UNSIGNED NOT NULL,
  sku_code VARCHAR(64) NOT NULL,
  price_fen INT UNSIGNED NOT NULL,
  stock_available INT NOT NULL DEFAULT 0,
  stock_frozen INT NOT NULL DEFAULT 0,
  is_on_sale TINYINT NOT NULL DEFAULT 1,
  image_object_key VARCHAR(512) NULL,
  shipping_type VARCHAR(32) NOT NULL DEFAULT 'normal',
  ship_deadline_days SMALLINT UNSIGNED NOT NULL DEFAULT 2,
  shipping_promise VARCHAR(255) NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_product_skus_code (sku_code),
  UNIQUE KEY uq_product_skus_variant (product_id, model_id, color_id),
  KEY idx_product_skus_product_sale (product_id, is_on_sale, sort_order, id),
  CONSTRAINT ck_product_skus_stock_available CHECK (stock_available >= 0),
  CONSTRAINT ck_product_skus_stock_frozen CHECK (stock_frozen >= 0),
  CONSTRAINT fk_product_skus_product FOREIGN KEY (product_id) REFERENCES products (id),
  CONSTRAINT fk_product_skus_model FOREIGN KEY (model_id) REFERENCES product_models (id),
  CONSTRAINT fk_product_skus_color FOREIGN KEY (color_id) REFERENCES product_colors (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_media (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id BIGINT UNSIGNED NOT NULL,
  sku_id BIGINT UNSIGNED NULL,
  purpose ENUM('cover','gallery','detail','archive_card','sku') NOT NULL,
  object_key VARCHAR(512) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_product_media_object (product_id, sku_id, purpose, object_key),
  KEY idx_product_media_product_purpose (product_id, purpose, sort_order, id),
  CONSTRAINT fk_product_media_product FOREIGN KEY (product_id) REFERENCES products (id),
  CONSTRAINT fk_product_media_sku FOREIGN KEY (sku_id) REFERENCES product_skus (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE service_contents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL,
  title VARCHAR(120) NOT NULL,
  summary VARCHAR(500) NOT NULL DEFAULT '',
  detail MEDIUMTEXT NOT NULL,
  status ENUM('draft','active','retired') NOT NULL DEFAULT 'draft',
  effective_at DATETIME NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_service_contents_code (code),
  KEY idx_service_contents_public (status, effective_at, sort_order, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE service_plans (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(120) NOT NULL,
  status ENUM('draft','reviewing','active','retired') NOT NULL DEFAULT 'draft',
  terms_version VARCHAR(64) NOT NULL,
  terms_object_key VARCHAR(512) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_service_plans_code (code),
  KEY idx_service_plans_status (status, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE service_plan_offers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  plan_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NULL,
  sku_id BIGINT UNSIGNED NULL,
  price_fen INT UNSIGNED NOT NULL,
  warranty_extension_months SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  tradein_rule JSON NULL,
  effective_from DATETIME NOT NULL,
  effective_to DATETIME NULL,
  status ENUM('draft','active','retired') NOT NULL DEFAULT 'draft',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_service_plan_offers_match (plan_id, product_id, sku_id, status, effective_from, effective_to),
  CONSTRAINT fk_service_plan_offers_plan FOREIGN KEY (plan_id) REFERENCES service_plans (id),
  CONSTRAINT fk_service_plan_offers_product FOREIGN KEY (product_id) REFERENCES products (id),
  CONSTRAINT fk_service_plan_offers_sku FOREIGN KEY (sku_id) REFERENCES product_skus (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE checkout_quotes (
  id CHAR(36) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  status ENUM('active','used','expired','invalidated') NOT NULL DEFAULT 'active',
  expires_at DATETIME NOT NULL,
  payable_amount_fen INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  used_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_checkout_quotes_user_status_expiry (user_id, status, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE checkout_quote_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  quote_id CHAR(36) NOT NULL,
  sku_id BIGINT UNSIGNED NOT NULL,
  quantity SMALLINT UNSIGNED NOT NULL,
  product_snapshot JSON NOT NULL,
  product_amount_fen INT UNSIGNED NOT NULL,
  protect_offer_id BIGINT UNSIGNED NULL,
  protect_snapshot JSON NULL,
  protect_amount_fen INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_checkout_quote_items_quote (quote_id, id),
  CONSTRAINT fk_checkout_quote_items_quote FOREIGN KEY (quote_id) REFERENCES checkout_quotes (id),
  CONSTRAINT fk_checkout_quote_items_sku FOREIGN KEY (sku_id) REFERENCES product_skus (id),
  CONSTRAINT fk_checkout_quote_items_offer FOREIGN KEY (protect_offer_id) REFERENCES service_plan_offers (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE order_items
  ADD COLUMN sku_id BIGINT UNSIGNED NULL AFTER product_id,
  ADD COLUMN model_snapshot VARCHAR(80) NULL AFTER sku,
  ADD COLUMN color_snapshot VARCHAR(80) NULL AFTER model_snapshot,
  ADD COLUMN sku_snapshot VARCHAR(64) NULL AFTER color_snapshot;

CREATE TABLE order_service_plan_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  order_item_id BIGINT UNSIGNED NOT NULL,
  offer_id BIGINT UNSIGNED NOT NULL,
  plan_code_snapshot VARCHAR(64) NOT NULL,
  terms_version_snapshot VARCHAR(64) NOT NULL,
  price_fen INT UNSIGNED NOT NULL,
  warranty_extension_months SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  tradein_rule_snapshot JSON NULL,
  status ENUM('pending_activation','active','cancelled','expired') NOT NULL DEFAULT 'pending_activation',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_order_service_plan_item (order_item_id, offer_id),
  KEY idx_order_service_plan_items_order (order_id, id),
  CONSTRAINT fk_order_service_plan_items_order FOREIGN KEY (order_id) REFERENCES orders (id),
  CONSTRAINT fk_order_service_plan_items_order_item FOREIGN KEY (order_item_id) REFERENCES order_items (id),
  CONSTRAINT fk_order_service_plan_items_offer FOREIGN KEY (offer_id) REFERENCES service_plan_offers (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A purchased plan does not become a tool entitlement until the buyer binds a
-- physical tool/SN. Keeping the entitlement separate preserves the order
-- snapshot when a tool is later replaced or unbound.
CREATE TABLE tool_protection_entitlements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_scissors_id BIGINT UNSIGNED NOT NULL,
  order_service_plan_item_id BIGINT UNSIGNED NOT NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NULL,
  status ENUM('pending_activation','active','suspended','expired','cancelled') NOT NULL DEFAULT 'pending_activation',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tool_protection_entitlement_plan_item (order_service_plan_item_id),
  UNIQUE KEY uq_tool_protection_entitlement_tool_plan (user_scissors_id, order_service_plan_item_id),
  KEY idx_tool_protection_entitlements_tool_status (user_scissors_id, status, ends_at),
  CONSTRAINT fk_tool_protection_entitlements_tool FOREIGN KEY (user_scissors_id) REFERENCES user_scissors (id),
  CONSTRAINT fk_tool_protection_entitlements_plan_item FOREIGN KEY (order_service_plan_item_id) REFERENCES order_service_plan_items (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
