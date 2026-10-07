function positive(value) { const number = Number(value); return Number.isSafeInteger(number) && number > 0 ? number : null; }
function limitedText(value, maximum) { if (value === undefined || value === null) return ''; if (typeof value !== 'string') return null; const output = value.trim().replace(/\r\n?/g, '\n'); return output.length <= maximum ? output : null; }
function failure(code) { const cause = new Error(code); cause.code = code; return cause; }
function fen(value) { const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(String(value ?? '').trim()); if (!match) return null; const amount = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0')); return Number.isSafeInteger(amount) && amount > 0 ? amount : null; }
function refundNo(id) { return `SRRF${Date.now()}${String(id).padStart(8, '0')}`.slice(0, 64); }

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
          `INSERT INTO order_refund_requests (order_id, order_no, user_id, _openid, request_type, reason, requested_amount, order_status_snapshot, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', NOW(), NOW())`, [order.id, order.order_no, customerId, order._openid, type, reason, order.pay_amount, order.status]
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
    async listForReview({ status = '', keyword = '', page = 1, pageSize = 50 } = {}) {
      const allowed = ['pending_review', 'approved', 'rejected', 'processing', 'refunded'];
      const limit = Math.min(100, positive(pageSize) || 50); const offset = ((positive(page) || 1) - 1) * limit;
      const values = []; let where = '1 = 1';
      if (status) { if (!allowed.includes(status)) throw failure('INVALID_REQUEST'); where += ' AND r.status = ?'; values.push(status); }
      const orderKeyword = limitedText(keyword, 64);
      if (orderKeyword === null) throw failure('INVALID_REQUEST');
      if (orderKeyword) { where += ' AND r.order_no LIKE ?'; values.push(`%${orderKeyword}%`); }
      const [rows] = await pool.execute(
        `SELECT r.id, r.order_id, r.order_no, r.request_type, r.reason, r.requested_amount, r.status, r.admin_note, r.created_at, r.updated_at
           FROM order_refund_requests r WHERE ${where} ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?`, [...values, limit, offset]
      );
      const [totals] = await pool.execute(`SELECT COUNT(*) AS total FROM order_refund_requests r WHERE ${where}`, values);
      return { list: rows, total: Number(totals[0]?.total || 0) };
    },
    async getForReview(requestId) {
      const id = positive(requestId); if (!id) throw failure('INVALID_REQUEST');
      const [requests] = await pool.execute(
        `SELECT r.id, r.order_id, r.order_no, r.user_id, r.request_type, r.reason, r.requested_amount, r.order_status_snapshot, r.status, r.admin_note, r.processed_refund_no, r.created_at, r.updated_at,
                o.status AS order_status, o.total_amount, o.pay_amount, o.pay_type, o.pay_time, o.logistics_company, o.logistics_no, o.created_at AS order_created_at, o.updated_at AS order_updated_at,
                u.username, u.phone, u.status AS user_status, u.member_level
           FROM order_refund_requests r
           INNER JOIN orders o ON o.id = r.order_id
           LEFT JOIN users u ON u.id = r.user_id
          WHERE r.id = ? LIMIT 1`, [id]
      );
      const request = requests[0]; if (!request) return null;
      const [[addresses], [items]] = await Promise.all([
        pool.execute('SELECT name, phone, province, city, district, detail FROM order_addresses WHERE order_id = ? ORDER BY id ASC LIMIT 1', [request.order_id]),
        pool.execute('SELECT id, product_id, product_name, product_image, spec_desc, price, quantity FROM order_items WHERE order_id = ? ORDER BY id ASC', [request.order_id])
      ]);
      return {
        refund: { id: request.id, order_id: request.order_id, order_no: request.order_no, user_id: request.user_id, request_type: request.request_type, reason: request.reason, requested_amount: request.requested_amount, order_status_snapshot: request.order_status_snapshot, status: request.status, admin_note: request.admin_note, processed_refund_no: request.processed_refund_no, created_at: request.created_at, updated_at: request.updated_at },
        order: { id: request.order_id, order_no: request.order_no, status: request.order_status, total_amount: request.total_amount, pay_amount: request.pay_amount, pay_type: request.pay_type, pay_time: request.pay_time, logistics_company: request.logistics_company, logistics_no: request.logistics_no, created_at: request.order_created_at, updated_at: request.order_updated_at },
        user: request.username || request.phone ? { id: request.user_id, username: request.username, phone: request.phone, status: request.user_status, member_level: request.member_level } : null,
        address: addresses[0] || null,
        items
      };
    },
    async review({ requestId, decision, adminNote = '' }) {
      const id = positive(requestId); const note = limitedText(adminNote, 255);
      if (!id || !['approve', 'reject'].includes(decision) || note === null) throw failure('INVALID_REQUEST');
      return transaction(async (connection) => {
        const [[request]] = await connection.execute(
          `SELECT id, order_id, status, order_status_snapshot FROM order_refund_requests WHERE id = ? LIMIT 1 FOR UPDATE`, [id]
        );
        if (!request) throw failure('REFUND_NOT_FOUND');
        if (request.status !== 'pending_review') throw failure('REFUND_NOT_REVIEWABLE');
        if (decision === 'approve') {
          await connection.execute("UPDATE order_refund_requests SET status = 'approved', admin_note = ?, approved_at = NOW(), updated_at = NOW() WHERE id = ?", [note, id]);
          return { requestId: id, status: 'approved' };
        }
        const restored = ['paid', 'shipped'].includes(request.order_status_snapshot) ? request.order_status_snapshot : 'paid';
        const [order] = await connection.execute("UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ? AND status = 'refunding'", [restored, request.order_id]);
        if (order.affectedRows !== 1) throw failure('ORDER_REFUND_STATE_CONFLICT');
        await connection.execute("UPDATE order_refund_requests SET status = 'rejected', admin_note = ?, rejected_at = NOW(), updated_at = NOW() WHERE id = ?", [note, id]);
        return { requestId: id, status: 'rejected', restoredOrderStatus: restored };
      });
    },
    async prepareRefund(requestId) {
      const id = positive(requestId); if (!id) throw failure('INVALID_REQUEST');
      return transaction(async (connection) => {
        const [[row]] = await connection.execute(`SELECT r.id, r.status, r.processed_refund_no, r.reason, r.requested_amount,
          o.pay_amount, o.pay_transaction_id FROM order_refund_requests r INNER JOIN orders o ON o.id = r.order_id
          WHERE r.id = ? LIMIT 1 FOR UPDATE`, [id]);
        if (!row) throw failure('REFUND_NOT_FOUND');
        if (!['approved', 'processing'].includes(row.status)) throw failure('REFUND_NOT_EXECUTABLE');
        const totalAmountFen = fen(row.pay_amount); const refundAmountFen = fen(row.requested_amount);
        if (!totalAmountFen || !refundAmountFen || refundAmountFen > totalAmountFen || !row.pay_transaction_id) throw failure('REFUND_PAYMENT_NOT_READY');
        const outRefundNo = row.processed_refund_no || refundNo(id);
        await connection.execute("UPDATE order_refund_requests SET status = 'processing', processed_refund_no = ?, updated_at = NOW() WHERE id = ?", [outRefundNo, id]);
        return { outRefundNo, transactionId: row.pay_transaction_id, refundAmountFen, totalAmountFen, reason: row.reason || '订单退款' };
      });
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
