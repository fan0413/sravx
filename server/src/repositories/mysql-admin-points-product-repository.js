function positive(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function pageWindow({ page = 1, pageSize = 50 } = {}) {
  const limit = Math.min(100, positive(pageSize) || 50);
  return { limit, offset: ((positive(page) || 1) - 1) * limit };
}

function parseJson(value) { if (typeof value !== 'string') return value; try { return JSON.parse(value); } catch { return []; } }
function normalize(row) { return { ...row, images: parseJson(row.images), detail_images: parseJson(row.detail_images) }; }

export function createMysqlAdminPointsProductRepository(pool) {
  if (!pool || typeof pool.execute !== 'function' || typeof pool.getConnection !== 'function') throw new Error('A transactional MySQL pool is required.');
  async function specs(connection, identifiers) {
    if (!identifiers.length) return new Map();
    const placeholders = identifiers.map(() => '?').join(',');
    const [rows] = await connection.execute(`SELECT points_product_id, name, image, points_price, cash_price, sort_order, sku FROM points_product_specs WHERE points_product_id IN (${placeholders}) ORDER BY sort_order ASC, id ASC`, identifiers);
    return rows.reduce((all, row) => { const group = all.get(row.points_product_id) || []; group.push(row); all.set(row.points_product_id, group); return all; }, new Map());
  }
  async function replaceSpecs(connection, pointsProductId, items) {
    await connection.execute('DELETE FROM points_product_specs WHERE points_product_id = ?', [pointsProductId]);
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      await connection.execute(`INSERT INTO points_product_specs (points_product_id, name, image, points_price, cash_price, sort_order, sku) VALUES (?, ?, ?, ?, ?, ?, ?)`, [pointsProductId, item.name, item.image, item.pointsPrice, item.cashPrice, item.sortOrder, `PP${String(pointsProductId).padStart(6, '0')}-${String(index + 1).padStart(2, '0')}`]);
    }
  }
  return Object.freeze({
    async list({ keyword = '', status, page, pageSize } = {}) {
      const { limit, offset } = pageWindow({ page, pageSize }); const filters = ['pp.deleted_at IS NULL']; const values = [];
      if (typeof keyword === 'string' && keyword.trim()) { filters.push('(pp.name LIKE ? OR pp.short_name LIKE ?)'); values.push(`%${keyword.trim().slice(0, 80)}%`, `%${keyword.trim().slice(0, 80)}%`); }
      if (status === 0 || status === 1) { filters.push('pp.is_on_sale = ?'); values.push(status); }
      const where = filters.join(' AND ');
      const [rows] = await pool.execute(`SELECT pp.id, pp.product_id, pp.name, pp.short_name, pp.\`desc\`, pp.cover_image, pp.images, pp.detail_images, pp.category_id, pp.points_price, pp.cash_price, pp.stock, pp.stock_total, pp.stock_available, pp.stock_frozen, pp.sales_count, pp.is_on_sale, pp.min_member_level, pp.support_mixed_pay, pp.sort_order, pp.created_at, pp.updated_at FROM points_products pp WHERE ${where} ORDER BY pp.sort_order ASC, pp.id DESC LIMIT ? OFFSET ?`, [...values, limit, offset]);
      const [totals] = await pool.execute(`SELECT COUNT(*) AS total FROM points_products pp WHERE ${where}`, values);
      const grouped = await specs(pool, rows.map((row) => row.id));
      return { list: rows.map((row) => ({ ...normalize(row), specs: grouped.get(row.id) || [] })), total: Number(totals[0]?.total || 0) };
    },
    async get(id) {
      const productId = positive(id); if (!productId) return null;
      const [rows] = await pool.execute('SELECT * FROM points_products WHERE id = ? AND deleted_at IS NULL LIMIT 1', [productId]);
      if (rows.length !== 1) return null;
      const grouped = await specs(pool, [productId]); return { ...normalize(rows[0]), specs: grouped.get(productId) || [] };
    },
    async create(input) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [created] = await connection.execute(`INSERT INTO points_products (product_id, name, short_name, \`desc\`, cover_image, images, detail_images, category_id, points_price, cash_price, stock, stock_total, stock_available, stock_frozen, sales_count, is_on_sale, min_member_level, support_mixed_pay, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)`, [input.productId, input.name, input.shortName, input.description, input.coverImage, JSON.stringify(input.images), JSON.stringify(input.detailImages), input.categoryId, input.pointsPrice, input.cashPrice, input.stock, input.stock, input.stock, input.isOnSale, input.minMemberLevel, input.supportMixedPay, input.sortOrder]);
        await replaceSpecs(connection, Number(created.insertId), input.specs); await connection.commit(); return { id: Number(created.insertId) };
      } catch (cause) { await connection.rollback(); throw cause; } finally { connection.release(); }
    },
    async update(id, input) {
      const productId = positive(id); if (!productId) return false;
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [updated] = await connection.execute(`UPDATE points_products SET product_id=?, name=?, short_name=?, \`desc\`=?, cover_image=?, images=?, detail_images=?, category_id=?, points_price=?, cash_price=?, is_on_sale=?, min_member_level=?, support_mixed_pay=?, sort_order=?, stock=stock + ?, stock_total=stock_total + ?, stock_available=stock_available + ?, updated_at=UTC_TIMESTAMP() WHERE id=? AND deleted_at IS NULL AND stock_available + ? >= 0`, [input.productId, input.name, input.shortName, input.description, input.coverImage, JSON.stringify(input.images), JSON.stringify(input.detailImages), input.categoryId, input.pointsPrice, input.cashPrice, input.isOnSale, input.minMemberLevel, input.supportMixedPay, input.sortOrder, input.stockAdjustment, input.stockAdjustment, input.stockAdjustment, productId, input.stockAdjustment]);
        if (updated.affectedRows !== 1) { await connection.rollback(); return false; }
        await replaceSpecs(connection, productId, input.specs); await connection.commit(); return true;
      } catch (cause) { await connection.rollback(); throw cause; } finally { connection.release(); }
    },
    async setOnSale(id, isOnSale) { const productId = positive(id); if (!productId) return false; const [result] = await pool.execute('UPDATE points_products SET is_on_sale = ?, updated_at = UTC_TIMESTAMP() WHERE id = ? AND deleted_at IS NULL', [isOnSale, productId]); return result.affectedRows === 1; }
  });
}
