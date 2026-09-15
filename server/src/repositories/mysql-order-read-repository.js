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
    },
    async listPoints(userId, { status = '', page = 1, pageSize = 10 } = {}) {
      if (!positiveInteger(userId)) throw new Error('A valid user id is required.');
      const limit = Math.min(100, positiveInteger(pageSize, 10));
      const offset = (positiveInteger(page, 1) - 1) * limit;
      let statusSql = '';
      const values = [userId];
      if (status === 'pending') statusSql = " AND status IN ('pending_payment', 'paid', 'pending_send', 'refunding')";
      else if (status === 'finished') statusSql = " AND status IN ('completed', 'cancelled', 'refunded')";
      else if (['pending_payment', 'paid', 'pending_send', 'shipped', 'completed', 'cancelled', 'refunding', 'refunded'].includes(status)) { statusSql = ' AND status = ?'; values.push(status); }
      else if (status) statusSql = ' AND 1 = 0';
      const [rows] = await pool.execute(
        `SELECT id, order_no, points_product_id, product_id, product_name_snapshot, product_image_snapshot, selected_spec_snapshot, quantity, unit_points, total_points, unit_cash, total_cash, payable_cash, status, payment_status, payment_channel, logistics_company, logistics_no, created_at, updated_at FROM points_orders WHERE user_id = ?${statusSql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
        [...values, limit, offset]
      );
      const [users] = await pool.execute('SELECT points FROM users WHERE id = ? LIMIT 1', [userId]);
      return { list: rows.map((row) => ({ ...row, product_image_snapshot: safeImage(row.product_image_snapshot) })), userAvailablePoints: Number(users[0]?.points) || 0 };
    },
    async getPoints(userId, { id, orderNo } = {}) {
      if (!positiveInteger(userId)) throw new Error('A valid user id is required.');
      const numericId = positiveInteger(id);
      const normalizedNo = typeof orderNo === 'string' ? orderNo.trim().slice(0, 64) : '';
      if (!numericId && !normalizedNo) throw new Error('A valid order identifier is required.');
      const [rows] = await pool.execute(
        `SELECT id, order_no, user_id, points_product_id, product_id, product_name_snapshot, product_image_snapshot, selected_spec_snapshot, quantity, unit_points, total_points, unit_cash, total_cash, payable_cash, status, payment_status, payment_channel, receiver_name, receiver_phone, address_text, logistics_company, logistics_no, ship_time, created_at, updated_at FROM points_orders WHERE ${numericId ? 'id = ?' : 'order_no = ?'} AND user_id = ? LIMIT 1`,
        [numericId || normalizedNo, userId]
      );
      if (rows.length !== 1) return null;
      const order = rows[0];
      const [[users], [logs]] = await Promise.all([
        pool.execute('SELECT points FROM users WHERE id = ? LIMIT 1', [userId]),
        pool.execute('SELECT direction, biz_type, points_change, cash_change, balance_before, balance_after, payment_channel, pay_transaction_id, created_at FROM points_payment_logs WHERE order_id = ? ORDER BY id ASC', [order.id])
      ]);
      const image = safeImage(order.product_image_snapshot);
      return { ...order, user_available_points: Number(users[0]?.points) || 0, product_image_snapshot: image, items: [{ id: order.points_product_id, product_id: order.product_id, product_name: order.product_name_snapshot, product_image: image, spec_text: order.selected_spec_snapshot, quantity: order.quantity, points_price: order.unit_points }], payment_detail: { payment_status: order.payment_status, payment_channel: order.payment_channel, payable_cash: Number(order.payable_cash) || 0 }, logistics: { logistics_company: order.logistics_company || '', logistics_no: order.logistics_no || '', ship_time: order.ship_time || null }, flow_logs: logs };
    }
  });
}
