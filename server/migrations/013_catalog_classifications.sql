-- Apply only to an explicitly approved database after rehearsal.
-- Independent of migration012 and structured checkout. No automatic backfill.
-- products.id must be BIGINT UNSIGNED/InnoDB: verify before applying.
CREATE TABLE product_classifications (
  product_id BIGINT UNSIGNED NOT NULL,
  series ENUM('basic','pro','master','accessories') NOT NULL,
  tool_group ENUM('straight','curved','thinning','fishbone','texturizing','accessories') NOT NULL,
  PRIMARY KEY (product_id),
  KEY idx_catalog_series_tool_product (series, tool_group, product_id),
  KEY idx_catalog_tool_product (tool_group, product_id),
  CONSTRAINT fk_catalog_classification_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT chk_catalog_classification_pair CHECK (
    (series = 'accessories' AND tool_group = 'accessories') OR
    (series <> 'accessories' AND tool_group <> 'accessories')
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
