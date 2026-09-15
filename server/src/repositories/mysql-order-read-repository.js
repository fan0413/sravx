function positiveInteger(value, fallback = null) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function safeImage(value) {
  return typeof value === 'string' && value && !value.startsWith('cloud://') ? value : '';
}

function orderFilters(status) {
  if (!status) return { sql: '', values: [] };
  if (status === 'pending') return { sql: " AND o.status IN ('pending_payment', 'paid', 'shipped', 'received', 'refunding')", values: [] };
  if (status === 'finished') return { sql: " AND (o.status IN ('completed', 'refunded') OR (o.status = 'cancelled' AND IFNULL(o.auto_cancel, 0) = 0))", values: [] };
  const allowed = ['pending_payment', 'paid', 'shipped', 'received', 'completed', 'cancelled', 'refunding', 'refunded'];
  return allowed.includes(status) ? { sql: ' AND o.status = ?', values: [status] } : { sql: ' AND 1 = 0', values: [] };
}

const orderColumns = `o.id, o.order_no, o.total_amount, o.freight, o.discount_amount, o.pay_amount, o.status, o.auto_cancel,
  o.logistics_company, o.logistics_no, o.pay_time, o.ship_time, o.receive_time, o.created_at, o.updated_at`;

export function createMysqlOrderReadRepository(pool) {
  if (!pool || typeof pool.execute !== 'function') throw new Error('A MySQL pool is required.');
  async function enrich(rows) {
    if (!rows.length) return [];
    const ids = rows.map(({ id }) => Number(id));
    const placeholders = ids.map(() => '?').join(',');
    const [[items], [addresses], [refunds]] = await Promise.all([
      pool.execute(`SELECT order_id, product_name, product_image, quantity FROM order_items WHERE order_id IN (${placeholders}) ORDER BY id ASC`, ids),
      pool.execute(`SELECT order_id, province, city, district, detail FROM order_addresses WHERE order_id IN (${placeholders}) ORDER BY id ASC`, ids),
      pool.execute(`SELECT r.order_id, r.status FROM order_refund_requests r INNER JOIN (SELECT order_id, MAX(id) AS id FROM order_refund_requests WHERE order_id IN (${placeholders}) GROUP BY order_id) latest ON latest.id = r.id`, ids)
    ]);
    const firstItems = new Map();
    for (const item of items) if (!firstItems.has(item.order_id)) firstItems.set(item.order_id, item);
    const firstAddresses = new Map();
    for (const address of addresses) if (!firstAddresses.has(address.order_id)) firstAddresses.set(address.order_id, `${address.province || ''}${address.city || ''}${address.district || ''}${address.detail || ''}`);
    const refundStatus = new Map(refunds.map(({ order_id, status }) => [order_id, status]));
    return rows.map((row) => {
      const item = firstItems.get(row.id);
      return { ...row, product_name: item?.product_name || '', product_image: safeImage(item?.product_image), quantity: item?.quantity || 1, full_address: firstAddresses.get(row.id) || '', latest_refund_status: refundStatus.get(row.id) || '' };
    });
  }
  return Object.freeze({
    async list(userId, { status = '', page = 1, pageSize = 10 } = {}) {
      if (!positiveInteger(userId)) throw new Error('A valid user id is required.');
      const limit = Math.min(100, positiveInteger(pageSize, 10));
      const offset = (positiveInteger(page, 1) - 1) * limit;
      const filter = orderFilters(typeof status === 'string' ? status : '');
      const [rows] = await pool.execute(`SELECT ${orderColumns} FROM orders o WHERE o.user_id = ?${filter.sql} ORDER BY o.created_at DESC, o.id DESC LIMIT ? OFFSET ?`, [userId, ...filter.values, limit, offset]);
      return enrich(rows);
    },
    async get(userId, { id, orderNo } = {}) {
      if (!positiveInteger(userId)) throw new Error('A valid user id is required.');
      const numericId = positiveInteger(id);
      const normalizedNo = typeof orderNo === 'string' ? orderNo.trim().slice(0, 64) : '';
      if (!numericId && !normalizedNo) throw new Error('A valid order identifier is required.');
      const where = numericId ? 'o.id = ?' : 'o.order_no = ?';
      const value = numericId || normalizedNo;
      const [orders] = await pool.execute(`SELECT ${orderColumns} FROM orders o WHERE ${where} AND o.user_id = ? LIMIT 1`, [value, userId]);
      if (orders.length !== 1) return null;
      const order = orders[0];
      const [[items], [addresses], [refunds]] = await Promise.all([
        pool.execute('SELECT id, order_id, product_id, product_name, product_image, spec_desc, price, quantity FROM order_items WHERE order_id = ? ORDER BY id ASC', [order.id]),
        pool.execute('SELECT name, phone, province, city, district, detail FROM order_addresses WHERE order_id = ? ORDER BY id ASC LIMIT 1', [order.id]),
        pool.execute('SELECT status FROM order_refund_requests WHERE order_id = ? ORDER BY id DESC LIMIT 1', [order.id])
      ]);
      return { ...order, items: items.map((item) => ({ ...item, product_image: safeImage(item.product_image) })), address: addresses[0] || null, latest_refund_status: refunds[0]?.status || '' };
    }
  });
}
