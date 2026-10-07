function positive(value) { const number = Number(value); return Number.isSafeInteger(number) && number > 0 ? number : null; }
function pageWindow({ page = 1, pageSize = 50 } = {}) { const limit = Math.min(100, positive(pageSize) || 50); return { limit, offset: ((positive(page) || 1) - 1) * limit }; }
function orderType(value) { return value === 'points' ? 'points' : 'goods'; }
function orderStatus(value) { return typeof value === 'string' && /^[a-z_]{1,30}$/.test(value) ? value : ''; }

export function createMysqlAdminOrderRepository(pool) {
  if (!pool || typeof pool.execute !== 'function' || typeof pool.getConnection !== 'function') throw new Error('A transactional MySQL pool is required.');
  async function listGoods({ keyword = '', status = '', page, pageSize } = {}) {
    const { limit, offset } = pageWindow({ page, pageSize }); const filters = ['1 = 1']; const values = [];
    if (keyword) { filters.push('(o.order_no LIKE ? OR u.username LIKE ? OR u.phone LIKE ?)'); const term = `%${String(keyword).trim().slice(0, 80)}%`; values.push(term, term, term); }
    if (status) { filters.push('o.status = ?'); values.push(status); }
    const where = filters.join(' AND ');
    const [rows] = await pool.execute(`SELECT o.id, o.order_no, o.user_id, o.total_amount, o.pay_amount, o.status, o.pay_type, o.pay_time, o.logistics_company, o.logistics_no, o.ship_time, o.created_at, o.updated_at, u.username AS customer_name, u.phone AS customer_phone FROM orders o LEFT JOIN users u ON u.id=o.user_id WHERE ${where} ORDER BY o.created_at DESC, o.id DESC LIMIT ? OFFSET ?`, [...values, limit, offset]);
    const [totals] = await pool.execute(`SELECT COUNT(*) AS total FROM orders o LEFT JOIN users u ON u.id=o.user_id WHERE ${where}`, values);
    return { list: rows, total: Number(totals[0]?.total || 0), type: 'goods' };
  }
  async function listPoints({ keyword = '', status = '', page, pageSize } = {}) {
    const { limit, offset } = pageWindow({ page, pageSize }); const filters = ['1 = 1']; const values = [];
    if (keyword) { filters.push('(o.order_no LIKE ? OR u.username LIKE ? OR u.phone LIKE ?)'); const term = `%${String(keyword).trim().slice(0, 80)}%`; values.push(term, term, term); }
    if (status) { filters.push('o.status = ?'); values.push(status); }
    const where = filters.join(' AND ');
    const [rows] = await pool.execute(`SELECT o.id, o.order_no, o.user_id, o.total_points, o.payable_cash, o.status, o.payment_status, o.payment_channel, o.logistics_company, o.logistics_no, o.ship_time, o.created_at, o.updated_at, u.username AS customer_name, u.phone AS customer_phone FROM points_orders o LEFT JOIN users u ON u.id=o.user_id WHERE ${where} ORDER BY o.created_at DESC, o.id DESC LIMIT ? OFFSET ?`, [...values, limit, offset]);
    const [totals] = await pool.execute(`SELECT COUNT(*) AS total FROM points_orders o LEFT JOIN users u ON u.id=o.user_id WHERE ${where}`, values);
    return { list: rows, total: Number(totals[0]?.total || 0), type: 'points' };
  }
  return Object.freeze({
    async list(query = {}) { const type = orderType(query.type); return type === 'points' ? listPoints({ ...query, status: orderStatus(query.status) }) : listGoods({ ...query, status: orderStatus(query.status) }); },
    async get(id, { type } = {}) {
      const orderId = positive(id); if (!orderId) return null;
      if (orderType(type) === 'points') {
        const [orders] = await pool.execute(`SELECT o.*, u.username AS customer_name, u.phone AS customer_phone FROM points_orders o LEFT JOIN users u ON u.id=o.user_id WHERE o.id=? LIMIT 1`, [orderId]); if (!orders.length) return null;
        const [items] = await pool.execute('SELECT id, points_product_id, product_name, product_image, points_price, quantity, spec_text FROM points_order_items WHERE points_order_id=? ORDER BY id ASC', [orderId]); return { type: 'points', ...orders[0], items };
      }
      const [orders] = await pool.execute(`SELECT o.*, u.username AS customer_name, u.phone AS customer_phone FROM orders o LEFT JOIN users u ON u.id=o.user_id WHERE o.id=? LIMIT 1`, [orderId]); if (!orders.length) return null;
      const [[items], [addresses]] = await Promise.all([pool.execute('SELECT id, product_id, sku, product_name, product_image, spec_desc, price, quantity FROM order_items WHERE order_id=? ORDER BY id ASC', [orderId]), pool.execute('SELECT name, phone, province, city, district, detail FROM order_addresses WHERE order_id=? ORDER BY id ASC LIMIT 1', [orderId])]); return { type: 'goods', ...orders[0], items, address: addresses[0] || null };
    },
    async markShipped(id, { type, logisticsCompany, logisticsNo } = {}) {
      const orderId = positive(id); if (!orderId || typeof logisticsCompany !== 'string' || !logisticsCompany.trim() || logisticsCompany.trim().length > 50 || typeof logisticsNo !== 'string' || !logisticsNo.trim() || logisticsNo.trim().length > 100) throw new Error('INVALID_REQUEST');
      const table = orderType(type) === 'points' ? 'points_orders' : 'orders';
      const [updated] = await pool.execute(`UPDATE ${table} SET status='shipped', logistics_company=?, logistics_no=?, ship_time=UTC_TIMESTAMP(), updated_at=UTC_TIMESTAMP() WHERE id=? AND status IN ('paid','pending_send')`, [logisticsCompany.trim(), logisticsNo.trim(), orderId]);
      if (updated.affectedRows === 1) return { id: orderId, status: 'shipped', type: orderType(type) };
      const [rows] = await pool.execute(`SELECT status FROM ${table} WHERE id=? LIMIT 1`, [orderId]); if (!rows.length) throw new Error('ORDER_NOT_FOUND'); if (rows[0].status === 'shipped') return { id: orderId, status: 'shipped', type: orderType(type), idempotent: true }; throw new Error('ORDER_NOT_SHIPPABLE');
    }
  });
}
