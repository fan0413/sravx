import { randomUUID } from 'node:crypto';

function positive(value, maximum = Number.MAX_SAFE_INTEGER) { const parsed = Number(value); return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : null; }
function text(value, maximum) { if (value === undefined || value === null) return ''; if (typeof value !== 'string') return null; const result = value.trim().replace(/\r\n?/g, '\n'); return result.length <= maximum ? result : null; }
function fail(code) { const cause = new Error(code); cause.code = code; return cause; }
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : NaN; }
function nextNo() { return `SP${Date.now()}${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`; }
function response(row, idempotent = false) { return { orderId: Number(row.id), orderNo: row.order_no, status: row.status, totalPoints: Number(row.total_points), payableCash: Number(row.payable_cash), needCashPayment: Number(row.payable_cash) > 0, idempotent }; }

export function createMysqlPointsOrderWriteRepository(pool) {
  if (!pool || typeof pool.getConnection !== 'function') throw new Error('A transactional MySQL pool is required.');
  async function transaction(work) { const connection = await pool.getConnection(); try { await connection.beginTransaction(); const result = await work(connection); await connection.commit(); return result; } catch (cause) { await connection.rollback(); throw cause; } finally { connection.release(); } }
  return Object.freeze({
    async create(userId, input) {
      const customerId = positive(userId); const productId = positive(input?.pointsProductId); const addressId = positive(input?.addressId); const quantity = positive(input?.quantity ?? 1, 99);
      const idempotencyKey = typeof input?.idempotencyKey === 'string' && /^[A-Za-z0-9_-]{12,80}$/.test(input.idempotencyKey) ? input.idempotencyKey : null;
      const selectedSpec = text(input?.selectedSpecName ?? '', 100); const remark = text(input?.remark ?? '', 255);
      if (!customerId || !productId || !addressId || !quantity || !idempotencyKey || selectedSpec === null || remark === null) throw fail('INVALID_REQUEST');
      return transaction(async (connection) => {
        const [[existing]] = await connection.execute('SELECT id, order_no, status, total_points, payable_cash FROM points_orders WHERE user_id = ? AND idempotency_key = ? LIMIT 1 FOR UPDATE', [customerId, idempotencyKey]);
        if (existing) return response(existing, true);
        const [[user]] = await connection.execute('SELECT id, openid, points, member_level FROM users WHERE id = ? LIMIT 1 FOR UPDATE', [customerId]);
        if (!user) throw fail('USER_NOT_FOUND');
        const [[address]] = await connection.execute(`SELECT a.name, a.contact, a.phone, a.province, a.city, a.district, a.detail FROM addresses a WHERE a.id = ? AND a.openid = ? LIMIT 1 FOR UPDATE`, [addressId, user.openid]);
        if (!address || !address.phone || !address.detail) throw fail('ADDRESS_NOT_FOUND');
        const [[product]] = await connection.execute(`SELECT id, product_id, name, cover_image, points_price, cash_price, stock_available, stock_frozen, is_on_sale, deleted_at, min_member_level, support_mixed_pay FROM points_products WHERE id = ? LIMIT 1 FOR UPDATE`, [productId]);
        if (!product || Number(product.is_on_sale) !== 1 || product.deleted_at) throw fail('POINTS_PRODUCT_NOT_AVAILABLE');
        if (Number(user.member_level) < Number(product.min_member_level)) throw fail('MEMBERSHIP_LEVEL_TOO_LOW');
        const unitPoints = positive(product.points_price, 100000000); const unitCash = number(product.cash_price);
        if (!unitPoints || !Number.isFinite(unitCash) || unitCash < 0) throw fail('POINTS_PRODUCT_INVALID');
        const totalPoints = unitPoints * quantity; const payableCash = Number(product.support_mixed_pay) === 1 ? Number((unitCash * quantity).toFixed(2)) : 0;
        if (Number(user.points) < totalPoints) throw fail('INSUFFICIENT_POINTS');
        const [stock] = await connection.execute('UPDATE points_products SET stock_available = stock_available - ?, stock_frozen = stock_frozen + ? WHERE id = ? AND stock_available >= ?', [quantity, quantity, productId, quantity]);
        if (stock.affectedRows !== 1) throw fail('POINTS_PRODUCT_OUT_OF_STOCK');
        const [points] = await connection.execute('UPDATE users SET points = points - ? WHERE id = ? AND points >= ?', [totalPoints, customerId, totalPoints]);
        if (points.affectedRows !== 1) throw fail('INSUFFICIENT_POINTS');
        const status = payableCash > 0 ? 'pending_payment' : 'pending_send'; const paymentStatus = payableCash > 0 ? 'pending' : 'paid'; const channel = payableCash > 0 ? 'mixed' : 'points_only'; const no = nextNo();
        const addressText = `${address.province || ''}${address.city || ''}${address.district || ''}${address.detail}`;
        const [created] = await connection.execute(`INSERT INTO points_orders (order_no, idempotency_key, user_id, _openid, points_product_id, product_id, product_name_snapshot, product_image_snapshot, selected_spec_snapshot, quantity, unit_points, total_points, unit_cash, total_cash, payable_cash, status, payment_status, payment_channel, remark, receiver_name, receiver_phone, address_text, pay_time, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${payableCash > 0 ? 'NULL' : 'NOW()'}, NOW(), NOW())`, [no, idempotencyKey, customerId, user.openid, productId, Number(product.product_id) || 0, product.name, product.cover_image || '', selectedSpec, quantity, unitPoints, totalPoints, unitCash.toFixed(2), (unitCash * quantity).toFixed(2), payableCash.toFixed(2), status, paymentStatus, channel, remark, address.name || address.contact, address.phone, addressText]);
        const id = created.insertId;
        await connection.execute('INSERT INTO points_order_items (points_order_id, points_product_id, product_name, product_image, points_price, quantity, spec_text) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, productId, product.name, product.cover_image || null, unitPoints, quantity, selectedSpec || null]);
        const balanceAfter = Number(user.points) - totalPoints;
        await connection.execute(`INSERT INTO points_payment_logs (order_id, order_no, user_id, _openid, direction, biz_type, points_change, cash_change, balance_before, balance_after, idempotency_key, reconcile_date, reconcile_status, payment_channel, remark, created_at) VALUES (?, ?, ?, ?, 'out', 'freeze', ?, 0.00, ?, ?, ?, CURDATE(), 'pending', ?, '创建积分订单预扣积分', NOW())`, [id, no, customerId, user.openid, -totalPoints, Number(user.points), balanceAfter, `freeze:${no}`, channel]);
        if (payableCash === 0) {
          const [settled] = await connection.execute('UPDATE points_products SET stock_frozen = stock_frozen - ?, sales_count = sales_count + ? WHERE id = ? AND stock_frozen >= ?', [quantity, quantity, productId, quantity]);
          if (settled.affectedRows !== 1) throw fail('POINTS_INVENTORY_CONFLICT');
          if (Number(product.product_id) > 0) await connection.execute('UPDATE products SET sales_count = IFNULL(sales_count, 0) + ? WHERE id = ?', [quantity, Number(product.product_id)]);
          await connection.execute(`INSERT INTO points_payment_logs (order_id, order_no, user_id, _openid, direction, biz_type, points_change, cash_change, balance_before, balance_after, idempotency_key, reconcile_date, reconcile_status, payment_channel, remark, created_at) VALUES (?, ?, ?, ?, 'out', 'confirm', 0, 0.00, ?, ?, ?, CURDATE(), 'settled', 'points_only', '积分订单确认', NOW())`, [id, no, customerId, user.openid, balanceAfter, balanceAfter, `confirm:${no}`]);
        }
        return response({ id, order_no: no, status, total_points: totalPoints, payable_cash: payableCash });
      });
    },
    async cancel(userId, orderId, reason = '用户取消') {
      const customerId = positive(userId); const id = positive(orderId); const cancelReason = text(reason, 255);
      if (!customerId || !id || cancelReason === null) throw fail('INVALID_REQUEST');
      return transaction(async (connection) => {
        const [[order]] = await connection.execute('SELECT * FROM points_orders WHERE id = ? AND user_id = ? LIMIT 1 FOR UPDATE', [id, customerId]);
        if (!order) throw fail('POINTS_ORDER_NOT_FOUND');
        if (order.status === 'cancelled') return { id, status: 'cancelled', idempotent: true };
        if (order.status !== 'pending_payment') throw fail('POINTS_ORDER_NOT_CANCELLABLE');
        const [[user]] = await connection.execute('SELECT points FROM users WHERE id = ? LIMIT 1 FOR UPDATE', [customerId]);
        if (!user) throw fail('USER_NOT_FOUND');
        const [released] = await connection.execute('UPDATE points_products SET stock_available = stock_available + ?, stock_frozen = stock_frozen - ? WHERE id = ? AND stock_frozen >= ?', [Number(order.quantity), Number(order.quantity), order.points_product_id, Number(order.quantity)]);
        if (released.affectedRows !== 1) throw fail('POINTS_INVENTORY_CONFLICT');
        await connection.execute('UPDATE users SET points = points + ? WHERE id = ?', [Number(order.total_points), customerId]);
        await connection.execute("UPDATE points_orders SET status = 'cancelled', payment_status = 'cancelled', cancelled_at = NOW(), cancel_reason = ?, updated_at = NOW() WHERE id = ?", [cancelReason, id]);
        await connection.execute(`INSERT INTO points_payment_logs (order_id, order_no, user_id, _openid, direction, biz_type, points_change, cash_change, balance_before, balance_after, idempotency_key, reconcile_date, reconcile_status, payment_channel, remark, created_at) VALUES (?, ?, ?, ?, 'in', 'unfreeze', ?, 0.00, ?, ?, ?, CURDATE(), 'settled', ?, ?, NOW())`, [id, order.order_no, customerId, order._openid, Number(order.total_points), Number(user.points), Number(user.points) + Number(order.total_points), `unfreeze:${order.order_no}`, order.payment_channel || 'points_only', cancelReason]);
        return { id, status: 'cancelled', idempotent: false };
      });
    }
  });
}
