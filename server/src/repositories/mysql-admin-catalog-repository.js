function integer(value, fallback = null) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function pageWindow({ page, pageSize }) {
  const limit = Math.min(100, integer(pageSize, 50));
  return { limit, offset: (integer(page, 1) - 1) * limit };
}

function parseJson(value) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

function normalizeProduct(row) {
  return { ...row, images: parseJson(row.images), params: parseJson(row.params), detail_images: parseJson(row.detail_images) };
}

export function createMysqlAdminCatalogRepository(pool) {
  if (!pool || typeof pool.execute !== 'function') throw new Error('A MySQL pool is required.');
  return Object.freeze({
    async listCategories({ keyword, isShow, page, pageSize } = {}) {
      const { limit, offset } = pageWindow({ page, pageSize });
      const filters = ['deleted_at IS NULL'];
      const values = [];
      if (typeof keyword === 'string' && keyword.trim()) {
        filters.push('(name LIKE ? OR description LIKE ?)');
        const term = `%${keyword.trim().slice(0, 50)}%`;
        values.push(term, term);
      }
      if (isShow === 0 || isShow === 1) { filters.push('is_show = ?'); values.push(isShow); }
      const where = filters.join(' AND ');
      const [rows] = await pool.execute(`SELECT id, parent_id, name, icon, image, description, level, sort_order, is_show, is_nav, product_count, created_at, updated_at FROM categories WHERE ${where} ORDER BY sort_order ASC, id ASC LIMIT ? OFFSET ?`, [...values, limit, offset]);
      const [totals] = await pool.execute(`SELECT COUNT(*) AS total FROM categories WHERE ${where}`, values);
      return { list: rows, total: Number(totals[0]?.total || 0) };
    },
    async listBanners({ keyword, position, isActive, page, pageSize } = {}) {
      const { limit, offset } = pageWindow({ page, pageSize });
      const filters = ['deleted_at IS NULL'];
      const values = [];
      if (typeof keyword === 'string' && keyword.trim()) { filters.push('(title LIKE ? OR subtitle LIKE ?)'); const term = `%${keyword.trim().slice(0, 100)}%`; values.push(term, term); }
      if (typeof position === 'string' && position.trim()) { filters.push('position = ?'); values.push(position.trim().slice(0, 50)); }
      if (isActive === 0 || isActive === 1) { filters.push('is_active = ?'); values.push(isActive); }
      const where = filters.join(' AND ');
      const [rows] = await pool.execute(`SELECT id, title, subtitle, image, mobile_image, link_type, link_value, link_param, position, sort_order, is_active, start_time, end_time, click_count, created_at, updated_at FROM banners WHERE ${where} ORDER BY sort_order ASC, id DESC LIMIT ? OFFSET ?`, [...values, limit, offset]);
      const [totals] = await pool.execute(`SELECT COUNT(*) AS total FROM banners WHERE ${where}`, values);
      return { list: rows.map((row) => ({ ...row, link_param: parseJson(row.link_param) })), total: Number(totals[0]?.total || 0) };
    },
    async listProducts({ keyword, categoryId, status, lowStock, sku, shippingType, page, pageSize } = {}) {
      const { limit, offset } = pageWindow({ page, pageSize });
      const filters = ['p.deleted_at IS NULL'];
      const values = [];
      if (typeof keyword === 'string' && keyword.trim()) { filters.push('(p.name LIKE ? OR p.short_name LIKE ? OR p.`desc` LIKE ?)'); const term = `%${keyword.trim().slice(0, 80)}%`; values.push(term, term, term); }
      const category = integer(categoryId); if (category) { filters.push('p.category_id = ?'); values.push(category); }
      if (status === 0 || status === 1) { filters.push('p.is_on_sale = ?'); values.push(status); }
      if (integer(lowStock)) { filters.push('p.stock <= ?'); values.push(integer(lowStock)); }
      if (typeof sku === 'string' && sku.trim()) { filters.push('EXISTS (SELECT 1 FROM product_specs ps WHERE ps.product_id = p.id AND ps.sku LIKE ?)'); values.push(`%${sku.trim().slice(0, 64)}%`); }
      if (typeof shippingType === 'string' && shippingType.trim()) { filters.push('p.shipping_type = ?'); values.push(shippingType.trim().slice(0, 32)); }
      const where = filters.join(' AND ');
      const columns = 'p.id, p.name, p.short_name, p.`desc`, p.price, p.category_id, p.cover_image, p.images, p.stock, p.reserved_stock, p.sales_count, p.is_on_sale, p.is_recommend, p.shipping_type, p.ship_deadline_days, p.shipping_promise, p.shipping_delay_reason, p.shipping_note, p.sort_order, p.created_at, p.updated_at';
      const [rows] = await pool.execute(`SELECT ${columns} FROM products p WHERE ${where} ORDER BY p.sort_order ASC, p.id DESC LIMIT ? OFFSET ?`, [...values, limit, offset]);
      const [totals] = await pool.execute(`SELECT COUNT(*) AS total FROM products p WHERE ${where}`, values);
      return { list: rows.map(normalizeProduct), total: Number(totals[0]?.total || 0) };
    },
    async getProduct(id) {
      const productId = integer(id); if (!productId) return null;
      const [products] = await pool.execute('SELECT * FROM products WHERE id = ? AND deleted_at IS NULL LIMIT 1', [productId]);
      if (products.length !== 1) return null;
      const [specs] = await pool.execute('SELECT id, name, sku, shipping_type, ship_deadline_days, shipping_promise, shipping_delay_reason, shipping_note, image, card_image, price, sort_order FROM product_specs WHERE product_id = ? ORDER BY sort_order ASC, id ASC', [productId]);
      return { ...normalizeProduct(products[0]), specs };
    },
    async createCategory(input) {
      const [result] = await pool.execute(
        `INSERT INTO categories (parent_id, name, icon, image, description, level, sort_order, is_show, is_nav, product_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [input.parentId, input.name, input.icon, input.image, input.description, input.level, input.sortOrder, input.isShow, input.isNav]
      );
      return { id: Number(result.insertId) };
    },
    async updateCategory(id, input) {
      const [result] = await pool.execute(
        `UPDATE categories SET parent_id = ?, name = ?, icon = COALESCE(?, icon), image = COALESCE(?, image), description = ?, level = ?, sort_order = ?, is_show = ?, is_nav = ?
         WHERE id = ? AND deleted_at IS NULL`,
        [input.parentId, input.name, input.icon, input.image, input.description, input.level, input.sortOrder, input.isShow, input.isNav, id]
      );
      return result.affectedRows === 1;
    },
    async deleteCategory(id) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [products] = await connection.execute('SELECT 1 FROM products WHERE category_id = ? AND deleted_at IS NULL LIMIT 1', [id]);
        if (products.length) { await connection.rollback(); return 'in_use'; }
        const [result] = await connection.execute('UPDATE categories SET deleted_at = UTC_TIMESTAMP() WHERE id = ? AND deleted_at IS NULL', [id]);
        await connection.commit(); return result.affectedRows === 1 ? 'deleted' : 'missing';
      } catch (cause) { await connection.rollback(); throw cause; } finally { connection.release(); }
    },
    async createBanner(input) {
      const [result] = await pool.execute(
        `INSERT INTO banners (title, subtitle, image, mobile_image, link_type, link_value, link_param, position, sort_order, is_active, start_time, end_time, click_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [input.title, input.subtitle, input.image, input.mobileImage, input.linkType, input.linkValue, input.linkParam === null ? null : JSON.stringify(input.linkParam), input.position, input.sortOrder, input.isActive, input.startTime, input.endTime]
      );
      return { id: Number(result.insertId) };
    },
    async createProduct(input) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [result] = await connection.execute(
          `INSERT INTO products (name, short_name, \`desc\`, price, category_id, cover_image, stock, reserved_stock, sales_count, warranty_months, has_spec, is_on_sale, is_recommend, allow_coupon, shipping_type, ship_deadline_days, shipping_promise, shipping_delay_reason, shipping_note, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [input.name, input.shortName, input.description, input.price, input.categoryId, input.coverImage, input.stock, input.warrantyMonths, input.hasSpec, input.isOnSale, input.isRecommend, input.allowCoupon, input.shippingType, input.shipDeadlineDays, input.shippingPromise, input.shippingDelayReason, input.shippingNote, input.sortOrder]
        );
        const id = Number(result.insertId);
        for (const spec of input.specs) await connection.execute(
          `INSERT INTO product_specs (product_id, name, sku, shipping_type, ship_deadline_days, shipping_promise, shipping_delay_reason, shipping_note, card_image, price, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, spec.name, spec.sku, spec.shippingType, spec.shipDeadlineDays, spec.shippingPromise, spec.shippingDelayReason, spec.shippingNote, input.coverImage, spec.price, spec.sortOrder]
        );
        await connection.commit(); return { id };
      } catch (cause) { await connection.rollback(); throw cause; } finally { connection.release(); }
    }
  });
}
