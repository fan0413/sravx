import { classificationSql, classificationFilters } from '../catalog/classification.js';

function positiveInteger(value, fallback = null) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

export function createMysqlCatalogRepository(pool, { structuredCatalog = false, normalizedCatalog = false } = {}) {
  if (!pool || typeof pool.execute !== 'function') throw new Error('A MySQL pool is required.');
  const classification = classificationSql(normalizedCatalog);
  const legacyPrice = `CASE WHEN EXISTS (SELECT 1 FROM product_specs ps WHERE ps.product_id = p.id)
    THEN (SELECT MIN(ps.price) FROM product_specs ps WHERE ps.product_id = p.id AND ps.price >= 0)
    ELSE p.price END`;
  const startingPrice = structuredCatalog ? `CASE WHEN EXISTS (SELECT 1 FROM product_skus sku WHERE sku.product_id = p.id)
    THEN (SELECT MIN(sku.price_fen) / 100 FROM product_skus sku WHERE sku.product_id = p.id AND sku.is_on_sale = 1 AND sku.price_fen >= 0)
    ELSE ${legacyPrice} END` : legacyPrice;
  const presentPrice = product => Object.hasOwn(product, 'display_price') ? { ...product, base_price: product.price, price: product.display_price } : product;

  return Object.freeze({
    async home() {
      const [products] = await pool.execute(
        `SELECT p.*${classification.select}, ${startingPrice} AS display_price FROM products p${classification.join}
         INNER JOIN categories c ON c.id = p.category_id
         WHERE p.is_on_sale = 1 AND p.is_recommend = 1
           AND p.deleted_at IS NULL AND c.deleted_at IS NULL AND c.is_show = 1
         ORDER BY p.sort_order ASC, p.id DESC`
      );
      const [categories] = await pool.execute(
        `SELECT id, parent_id, name, icon, image, description, level, sort_order, is_show, is_nav
         FROM categories WHERE deleted_at IS NULL AND is_show = 1
         ORDER BY sort_order ASC, id ASC`
      );
      if (!structuredCatalog) return { products: products.map(presentPrice), categories };
      const [serviceContents] = await pool.execute(
        `SELECT code, title, summary, effective_at, sort_order
           FROM service_contents
          WHERE status = 'active' AND (effective_at IS NULL OR effective_at <= NOW())
          ORDER BY sort_order ASC, id ASC`
      );
      return { products: products.map(presentPrice), categories, serviceContents };
    },
    async listProducts({ categoryId, keyword, page, pageSize, series, toolGroup, toolSubtype, size }) {
      const limit = Math.min(100, positiveInteger(pageSize, 20));
      const offset = (positiveInteger(page, 1) - 1) * limit;
      let sql = `SELECT p.*${classification.select}, ${startingPrice} AS display_price FROM products p${classification.join}
        INNER JOIN categories c ON c.id = p.category_id
        WHERE p.is_on_sale = 1 AND p.deleted_at IS NULL
          AND c.deleted_at IS NULL AND c.is_show = 1`;
      const values = [];
      const normalizedCategoryId = positiveInteger(categoryId);
      if (normalizedCategoryId) {
        sql += ' AND p.category_id = ?';
        values.push(normalizedCategoryId);
      }
      if (typeof keyword === 'string' && keyword.trim()) {
        sql += ' AND (p.name LIKE ? OR p.short_name LIKE ? OR p.`desc` LIKE ?)';
        const term = `%${keyword.trim().slice(0, 80)}%`;
        values.push(term, term, term);
      }
      const classificationWhere = classificationFilters(classification, { series, toolGroup }, values);
      if (classificationWhere.length) sql += ` AND ${classificationWhere.join(' AND ')}`;
      if (structuredCatalog) {
        const filters = [
          ['tool_subtype', toolSubtype, 64], ['display_size', size, 32]
        ];
        for (const [column, raw, maximum] of filters) {
          if (typeof raw !== 'string' || !raw.trim()) continue;
          sql += ` AND p.${column} = ?`;
          values.push(raw.trim().slice(0, maximum));
        }
      }
      sql += ' ORDER BY p.sort_order ASC, p.id DESC LIMIT ? OFFSET ?';
      values.push(limit, offset);
      const [products] = await pool.execute(sql, values);
      return products.map(presentPrice);
    },
    async getProduct(productId) {
      const id = positiveInteger(productId);
      if (!id) return null;
      const [products] = await pool.execute(
        `SELECT p.*${classification.select}, ${startingPrice} AS display_price FROM products p${classification.join}
         INNER JOIN categories c ON c.id = p.category_id
         WHERE p.id = ? AND p.is_on_sale = 1 AND p.deleted_at IS NULL
           AND c.deleted_at IS NULL AND c.is_show = 1 LIMIT 1`,
        [id]
      );
      if (products.length !== 1) return null;
      const product = presentPrice(products[0]);
      const [specs] = await pool.execute(
        `SELECT name, image, card_image, price, sort_order, sku,
                shipping_type, ship_deadline_days, shipping_promise,
                shipping_delay_reason, shipping_note
         FROM product_specs WHERE product_id = ? ORDER BY sort_order ASC, id ASC`,
        [id]
      );
      if (!structuredCatalog) return { ...product, specs };
      const [[models], [colors], [skus], [media], [offers]] = await Promise.all([
        pool.execute('SELECT id, name, sort_order FROM product_models WHERE product_id = ? ORDER BY sort_order ASC, id ASC', [id]),
        pool.execute('SELECT id, name, swatch, sort_order FROM product_colors WHERE product_id = ? ORDER BY sort_order ASC, id ASC', [id]),
        pool.execute(`SELECT id, model_id, color_id, sku_code, price_fen, stock_available, stock_frozen, is_on_sale, image_object_key, shipping_type, ship_deadline_days, shipping_promise, sort_order
                        FROM product_skus WHERE product_id = ? AND is_on_sale = 1 ORDER BY sort_order ASC, id ASC`, [id]),
        pool.execute('SELECT sku_id, purpose, object_key, sort_order FROM product_media WHERE product_id = ? ORDER BY purpose ASC, sort_order ASC, id ASC', [id]),
        pool.execute(`SELECT spo.id, spo.sku_id, spo.price_fen, spo.warranty_extension_months, spo.tradein_rule, sp.code AS plan_code, sp.name AS plan_name, sp.terms_version
                        FROM service_plan_offers spo INNER JOIN service_plans sp ON sp.id = spo.plan_id
                       WHERE spo.status = 'active' AND sp.status = 'active'
                         AND ((spo.product_id IS NULL AND spo.sku_id IS NULL) OR spo.product_id = ? OR spo.sku_id IN (SELECT id FROM product_skus WHERE product_id = ?))
                         AND spo.effective_from <= NOW() AND (spo.effective_to IS NULL OR spo.effective_to > NOW())
                       ORDER BY spo.id ASC`, [id, id])
      ]);
      return {
        ...product,
        specs,
        models,
        colors,
        skus: skus.map((sku) => ({ ...sku, available: Math.max(0, Number(sku.stock_available) || 0) })),
        media,
        // Offers are informational until their purchase and activation rules are approved.
        protectOffers: offers.map((offer) => ({ ...offer, displayOnly: true }))
      };
    },
    async getServiceContent(code) {
      if (!structuredCatalog || typeof code !== 'string' || !/^[a-z0-9_-]{1,64}$/i.test(code)) return null;
      const [rows] = await pool.execute(
        `SELECT code, title, summary, detail, effective_at, sort_order
           FROM service_contents WHERE code = ? AND status = 'active' AND (effective_at IS NULL OR effective_at <= NOW()) LIMIT 1`,
        [code]
      );
      return rows[0] || null;
    },
    async listCategories() {
      const [categories] = await pool.execute(
        `SELECT id, parent_id, name, icon, image, description, level, sort_order, is_show, is_nav
         FROM categories WHERE deleted_at IS NULL AND is_show = 1
         ORDER BY sort_order ASC, id ASC`
      );
      return categories;
    },
    async listBanners(position) {
      const [banners] = await pool.execute(
        'SELECT * FROM banners WHERE position = ? AND is_active = 1 AND deleted_at IS NULL ORDER BY sort_order ASC',
        [typeof position === 'string' && position.trim() ? position.trim().slice(0, 40) : 'home']
      );
      return banners;
    },
    async listPointsProducts({ categoryId }) {
      const normalizedCategoryId = positiveInteger(categoryId, 0);
      let sql = `SELECT pp.*, COALESCE(NULLIF(pp.name, ''), p.name, CONCAT('积分商品 #', pp.id)) AS display_name,
          COALESCE(pp.category_id, p.category_id) AS effective_category_id,
          COALESCE(pp.stock_available, pp.stock - pp.stock_frozen, 0) AS effective_stock_available
        FROM points_products pp
        LEFT JOIN products p ON p.id = pp.product_id AND p.deleted_at IS NULL
        LEFT JOIN categories c ON c.id = COALESCE(pp.category_id, p.category_id)
        WHERE pp.is_on_sale = 1 AND pp.deleted_at IS NULL
          AND (c.id IS NULL OR (c.deleted_at IS NULL AND c.is_show = 1))`;
      const values = [];
      if (normalizedCategoryId > 0) {
        sql += ' AND COALESCE(pp.category_id, p.category_id) = ?';
        values.push(normalizedCategoryId);
      }
      sql += ' ORDER BY pp.sort_order ASC, pp.id DESC';
      const [rows] = await pool.execute(sql, values);
      const [categories] = await pool.execute(
        'SELECT id, name FROM categories WHERE deleted_at IS NULL AND is_show = 1 ORDER BY sort_order ASC, id ASC'
      );
      const identifiers = rows.map((row) => row.id);
      const specifications = new Map();
      if (identifiers.length) {
        const placeholders = identifiers.map(() => '?').join(',');
        const [specs] = await pool.execute(
          `SELECT points_product_id, name, image, points_price, cash_price, sort_order, sku
           FROM points_product_specs WHERE points_product_id IN (${placeholders}) ORDER BY sort_order ASC, id ASC`,
          identifiers
        );
        for (const spec of specs) {
          const group = specifications.get(spec.points_product_id) || [];
          group.push(spec);
          specifications.set(spec.points_product_id, group);
        }
      }
      const products = rows.map((row) => {
        const available = Number(row.effective_stock_available) || 0;
        const minimumLevel = Number(row.min_member_level) || 1;
        return { ...row, name: row.display_name, stock_available: available, specs: specifications.get(row.id) || [], can_redeem: minimumLevel <= 1 && available > 0, current_member_level: 1 };
      });
      return { products, categories, current_member_level: 1 };
    },
    async getPointsProduct(pointsProductId) {
      const id = positiveInteger(pointsProductId);
      if (!id) return null;
      const [rows] = await pool.execute(
        `SELECT pp.*, COALESCE(NULLIF(pp.name, ''), p.name, CONCAT('积分商品 #', pp.id)) AS display_name,
            COALESCE(pp.stock_available, pp.stock - pp.stock_frozen, 0) AS effective_stock_available
         FROM points_products pp
         LEFT JOIN products p ON p.id = pp.product_id AND p.deleted_at IS NULL
         LEFT JOIN categories c ON c.id = COALESCE(pp.category_id, p.category_id)
         WHERE pp.id = ? AND pp.is_on_sale = 1 AND pp.deleted_at IS NULL
           AND (c.id IS NULL OR (c.deleted_at IS NULL AND c.is_show = 1)) LIMIT 1`, [id]
      );
      if (rows.length !== 1) return null;
      const [specs] = await pool.execute(
        `SELECT name, image, points_price, cash_price, sort_order, sku
         FROM points_product_specs WHERE points_product_id = ? ORDER BY sort_order ASC, id ASC`, [id]
      );
      const row = rows[0];
      const available = Number(row.effective_stock_available) || 0;
      const minimumLevel = Number(row.min_member_level) || 1;
      return { ...row, name: row.display_name, stock_available: available, specs, can_redeem: minimumLevel <= 1 && available > 0, current_member_level: 1 };
    }
  });
}
