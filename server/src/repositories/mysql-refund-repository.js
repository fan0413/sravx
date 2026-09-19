function positive(value) { const number = Number(value); return Number.isSafeInteger(number) && number > 0 ? number : null; }
function limitedText(value, maximum) { if (value === undefined || value === null) return ''; if (typeof value !== 'string') return null; const output = value.trim().replace(/\r\n?/g, '\n'); return output.length <= maximum ? output : null; }
function failure(code) { const cause = new Error(code); cause.code = code; return cause; }

export function createMysqlRefundRepository(pool) {
  if (!pool || typeof pool.getConnection !== 'function' || typeof pool.execute !== 'function') throw new Error('A transactional MySQL pool is required.');
  async function transaction(work) { const connection = await pool.getConnection(); try { await connection.beginTransaction(); const result = await work(connection); await connection.commit(); return result; } catch (cause) { await connection.rollback(); throw cause; } finally { connection.release(); } }
  return Object.freeze({
    async request(userId, input) {
      const customerId = positive(userId); const orderId = positive(input?.orderId); const reason = limitedText(input?.reason, 255); const type = limitedText(input?.refundType || 'refund_only', 32);
      const idempotencyKey = typeof input?.idempotencyKey === 'string' && /^[A-Za-z0-9_-]{12,80}$/.test(input.idempotencyKey) ? input.idempotencyKey : null;
      if (!customerId || !orderId || reason === null || !type || !idempotencyKey || !['refund_only', 'return_and_refund'].includes(type)) throw failure('INVALID_REQUEST');
      return transaction(async (connection) => {
        const [[previous]] = await connection.execute(
          `SELECT r.id, r.order_id, r.order_no, r.status, r.requested_amount
             FROM order_refund_request_keys k INNER JOIN order_refund_requests r ON r.id = k.refund_request_id
            WHERE k.user_id = ? AND k.idempotency_key = ? LIMIT 1 FOR UPDATE`, [customerId, idempotencyKey]
        );
        if (previous) return { requestId: Number(previous.id), orderId: Number(previous.order_id), orderNo: previous.order_no, status: previous.status, requestedAmount: String(previous.requested_amount), idempotent: true };
        const [[order]] = await connection.execute('SELECT id, order_no, user_id, _openid, status, pay_amount FROM orders WHERE id = ? AND user_id = ? LIMIT 1 FOR UPDATE', [orderId, customerId]);
        if (!order) throw failure('ORDER_NOT_FOUND');
        if (!['paid', 'shipped'].includes(order.status)) throw failure('ORDER_NOT_REFUNDABLE');
        const [[open]] = await connection.execute(`SELECT id FROM order_refund_requests WHERE order_id = ? AND status IN ('pending_review', 'approved', 'processing') LIMIT 1 FOR UPDATE`, [orderId]);
        if (open) throw failure('REFUND_ALREADY_OPEN');
        const [created] = await connection.execute(
          `INSERT INTO order_refund_requests (order_id, order_no, user_id, _openid, request_type, reason, requested_amount, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_review', NOW(), NOW())`, [order.id, order.order_no, customerId, order._openid, type, reason, order.pay_amount]
        );
        await connection.execute("UPDATE orders SET status = 'refunding', updated_at = NOW() WHERE id = ? AND status IN ('paid', 'shipped')", [orderId]);
        await connection.execute('INSERT INTO order_refund_request_keys (user_id, idempotency_key, refund_request_id) VALUES (?, ?, ?)', [customerId, idempotencyKey, created.insertId]);
        return { requestId: Number(created.insertId), orderId: Number(order.id), orderNo: order.order_no, status: 'pending_review', requestedAmount: String(order.pay_amount), idempotent: false };
      });
    },
    async list(userId, orderId = null) {
      const customerId = positive(userId); const ownedOrder = orderId === null || orderId === undefined || orderId === '' ? null : positive(orderId);
      if (!customerId || (orderId !== null && orderId !== undefined && orderId !== '' && !ownedOrder)) throw failure('INVALID_REQUEST');
      const values = [customerId]; let filter = '';
      if (ownedOrder) { filter = ' AND r.order_id = ?'; values.push(ownedOrder); }
      const [rows] = await pool.execute(`SELECT r.id, r.order_id, r.order_no, r.request_type, r.reason, r.requested_amount, r.status, r.admin_note, r.created_at, r.updated_at FROM order_refund_requests r WHERE r.user_id = ?${filter} ORDER BY r.created_at DESC, r.id DESC LIMIT 50`, values);
      return rows;
    },
    async waybill(userId, orderId, orderType = 'normal') {
      const customerId = positive(userId); const id = positive(orderId);
      if (!customerId || !id || !['normal', 'points'].includes(orderType)) throw failure('INVALID_REQUEST');
      const table = orderType === 'points' ? 'points_orders' : 'orders';
      const [rows] = await pool.execute(`SELECT waybill_token, logistics_company, logistics_no, status FROM ${table} WHERE id = ? AND user_id = ? LIMIT 1`, [id, customerId]);
      if (!rows.length) throw failure('ORDER_NOT_FOUND');
      const row = rows[0];
      if (!row.waybill_token) throw failure('WAYBILL_NOT_AVAILABLE');
      return { waybillToken: row.waybill_token, expressCompany: row.logistics_company || '', expressNo: row.logistics_no || '', status: row.status, source: table };
    }
  });
}
