import { randomUUID } from 'node:crypto';

function positiveInteger(value, maximum = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 && number <= maximum ? number : null;
}

function normalizedText(value, maximum) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') return null;
  const result = value.trim().replace(/\r\n?/g, '\n');
  return result.length <= maximum ? result : null;
}

function orderNo() {
  return `SR${Date.now()}${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

function problem(code) { const cause = new Error(code); cause.code = code; return cause; }

function output(order) {
  return Object.freeze({ orderId: Number(order.id), orderNo: order.order_no, totalAmount: String(order.total_amount), payAmount: String(order.pay_amount), status: order.status });
}

export function createMysqlOrderWriteRepository(pool) {
  if (!pool || typeof pool.getConnection !== 'function') throw new Error('A transactional MySQL pool is required.');
  async function transaction(work) {
    const connection = await pool.getConnection();
    try { await connection.beginTransaction(); const value = await work(connection); await connection.commit(); return value; }
    catch (cause) { await connection.rollback(); throw cause; }
    finally { connection.release(); }
  }

  return Object.freeze({
    async create(userId, input) {
      const customerId = positiveInteger(userId);
      const productId = positiveInteger(input?.productId);
      const addressId = positiveInteger(input?.addressId);
      const quantity = positiveInteger(input?.quantity ?? 1, 99);
      const specName = normalizedText(input?.selectedColor ?? input?.selectedSpecName ?? '', 50);
      const remark = normalizedText(input?.remark ?? '', 255);
      const idempotencyKey = typeof input?.idempotencyKey === 'string' && /^[A-Za-z0-9_-]{12,80}$/.test(input.idempotencyKey) ? input.idempotencyKey : null;
      if (!customerId || !productId || !addressId || !quantity || specName === null || remark === null || !idempotencyKey) throw problem('INVALID_REQUEST');
      if (input?.couponId !== undefined && input?.couponId !== null && input?.couponId !== '') throw problem('COUPON_NOT_READY');
      return transaction(async (connection) => {
        const [[existing]] = await connection.execute(
          `SELECT o.id, o.order_no, o.total_amount, o.pay_amount, o.status
             FROM order_creation_requests r INNER JOIN orders o ON o.id = r.order_id
            WHERE r.user_id = ? AND r.idempotency_key = ? LIMIT 1 FOR UPDATE`, [customerId, idempotencyKey]
        );
        if (existing) return { ...output(existing), idempotent: true };

        const [[address]] = await connection.execute(
          `SELECT a.name, a.contact, a.phone, a.province, a.city, a.district, a.detail
             FROM addresses a INNER JOIN users u ON u.openid = a.openid
            WHERE a.id = ? AND u.id = ? LIMIT 1 FOR UPDATE`, [addressId, customerId]
        );
        if (!address || !address.phone || !address.detail) throw problem('ADDRESS_NOT_FOUND');

        const [[product]] = await connection.execute(
          `SELECT id, name, price, cover_image, stock, is_on_sale, deleted_at,
                  shipping_type, ship_deadline_days, shipping_promise, shipping_delay_reason, shipping_note
             FROM products WHERE id = ? LIMIT 1 FOR UPDATE`, [productId]
        );
        if (!product || Number(product.is_on_sale) !== 1 || product.deleted_at) throw problem('PRODUCT_NOT_AVAILABLE');
        let price = Number(product.price);
        let spec = null;
        if (specName) {
          const [[candidate]] = await connection.execute(
            `SELECT name, sku, price, shipping_type, ship_deadline_days, shipping_promise, shipping_delay_reason, shipping_note
               FROM product_specs WHERE product_id = ? AND name = ? LIMIT 1 FOR UPDATE`, [productId, specName]
          );
          if (!candidate) throw problem('PRODUCT_SPEC_NOT_FOUND');
          spec = candidate;
          if (candidate.price !== null && candidate.price !== undefined) price = Number(candidate.price);
        }
        if (!Number.isFinite(price) || price <= 0) throw problem('PRODUCT_PRICE_INVALID');
        const [frozen] = await connection.execute(
          `UPDATE products SET stock = stock - ?, reserved_stock = reserved_stock + ?
            WHERE id = ? AND stock >= ?`, [quantity, quantity, productId, quantity]
        );
        if (frozen.affectedRows !== 1) throw problem('PRODUCT_OUT_OF_STOCK');

        const totalAmount = (price * quantity).toFixed(2);
        const shipping = spec || product;
        const [created] = await connection.execute(
          `INSERT INTO orders (order_no, user_id, _openid, total_amount, freight, discount_amount, coupon_amount, points_amount, pay_amount,
                               status, buyer_message, shipping_type, ship_deadline_days, shipping_promise, delay_shipping_reason, delay_shipping_note, created_at, updated_at)
           SELECT ?, u.id, u.openid, ?, 0.00, 0.00, 0.00, 0.00, ?, 'pending_payment', ?, ?, ?, ?, ?, ?, NOW(), NOW()
             FROM users u WHERE u.id = ?`,
          [orderNo(), totalAmount, totalAmount, remark, shipping.shipping_type || 'normal', Number(shipping.ship_deadline_days) || 2, shipping.shipping_promise || '', shipping.shipping_delay_reason || '', shipping.shipping_note || '', customerId]
        );
        if (created.affectedRows !== 1) throw problem('USER_NOT_FOUND');
        const createdOrderId = created.insertId;
        await connection.execute(
          `INSERT INTO order_items (order_id, _openid, product_id, sku, product_name, product_image, spec_desc, price, quantity, selected_color, created_at)
           SELECT ?, u.openid, ?, ?, ?, ?, ?, ?, ?, ?, NOW() FROM users u WHERE u.id = ?`,
          [createdOrderId, productId, spec?.sku || null, product.name, product.cover_image || null, specName || null, price.toFixed(2), quantity, specName || null, customerId]
        );
        await connection.execute(
          `INSERT INTO order_addresses (order_id, _openid, name, phone, province, city, district, detail, created_at)
           SELECT ?, u.openid, ?, ?, ?, ?, ?, ?, NOW() FROM users u WHERE u.id = ?`,
          [createdOrderId, address.name || address.contact, address.phone, address.province || '', address.city || '', address.district || '', address.detail, customerId]
        );
        await connection.execute('INSERT INTO order_creation_requests (user_id, idempotency_key, order_id) VALUES (?, ?, ?)', [customerId, idempotencyKey, createdOrderId]);
        const [[row]] = await connection.execute('SELECT id, order_no, total_amount, pay_amount, status FROM orders WHERE id = ? LIMIT 1', [createdOrderId]);
        return { ...output(row), idempotent: false };
      });
    },

    async cancel(userId, orderId) {
      const customerId = positiveInteger(userId); const id = positiveInteger(orderId);
      if (!customerId || !id) throw problem('INVALID_REQUEST');
      return transaction(async (connection) => {
        const [[order]] = await connection.execute('SELECT id, status FROM orders WHERE id = ? AND user_id = ? LIMIT 1 FOR UPDATE', [id, customerId]);
        if (!order) throw problem('ORDER_NOT_FOUND');
        if (order.status === 'cancelled') return { id, status: 'cancelled', idempotent: true };
        if (order.status !== 'pending_payment') throw problem('ORDER_NOT_CANCELLABLE');
        const [items] = await connection.execute('SELECT product_id, quantity FROM order_items WHERE order_id = ? FOR UPDATE', [id]);
        for (const item of items) await connection.execute('UPDATE products SET stock = stock + ?, reserved_stock = GREATEST(reserved_stock - ?, 0) WHERE id = ?', [Number(item.quantity), Number(item.quantity), item.product_id]);
        await connection.execute("UPDATE orders SET status = 'cancelled', cancel_time = NOW(), updated_at = NOW() WHERE id = ?", [id]);
        return { id, status: 'cancelled', idempotent: false };
      });
    },

    async confirmReceive(userId, orderId) {
      const customerId = positiveInteger(userId); const id = positiveInteger(orderId);
      if (!customerId || !id) throw problem('INVALID_REQUEST');
      const [result] = await pool.execute("UPDATE orders SET status = 'completed', receive_time = NOW(), complete_time = NOW(), updated_at = NOW() WHERE id = ? AND user_id = ? AND status = 'shipped'", [id, customerId]);
      if (result.affectedRows === 1) return { id, status: 'completed' };
      const [rows] = await pool.execute('SELECT status FROM orders WHERE id = ? AND user_id = ? LIMIT 1', [id, customerId]);
      if (!rows.length) throw problem('ORDER_NOT_FOUND');
      if (rows[0].status === 'completed') return { id, status: 'completed', idempotent: true };
      throw problem('ORDER_NOT_RECEIVABLE');
    }
  });
}
