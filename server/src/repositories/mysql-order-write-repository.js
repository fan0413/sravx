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
      const specName = normalizedText(input?.selectedSpecName ?? input?.selectedModel ?? '', 50);
      const remark = normalizedText(input?.remark ?? '', 255);
      const idempotencyKey = typeof input?.idempotencyKey === 'string' && /^[A-Za-z0-9_-]{12,80}$/.test(input.idempotencyKey) ? input.idempotencyKey : null;
      const couponCampaignId = input?.couponId === undefined || input?.couponId === null || input?.couponId === '' ? null : positiveInteger(input.couponId);
      if (!customerId || !productId || !addressId || !quantity || specName === null || remark === null || !idempotencyKey || (input?.couponId !== undefined && input?.couponId !== null && input?.couponId !== '' && !couponCampaignId)) throw problem('INVALID_REQUEST');
      return transaction(async (connection) => {
        const [[existing]] = await connection.execute(
          `SELECT o.id, o.order_no, o.total_amount, o.pay_amount, o.status
             FROM order_creation_requests r INNER JOIN orders o ON o.id = r.order_id
            WHERE r.user_id = ? AND r.idempotency_key = ? LIMIT 1 FOR UPDATE`, [customerId, idempotencyKey]
        );
        if (existing) return { ...output(existing), idempotent: true };

        const [[address]] = await connection.execute(
          `SELECT a.name, a.contact, a.phone, a.province, a.city, a.district, a.detail
             FROM addresses a INNER JOIN users u ON u.openid COLLATE utf8mb4_bin = a.openid COLLATE utf8mb4_bin
            WHERE a.id = ? AND u.id = ? LIMIT 1 FOR UPDATE`, [addressId, customerId]
        );
        if (!address || !address.phone || !address.detail) throw problem('ADDRESS_NOT_FOUND');

        const [[product]] = await connection.execute(
          `SELECT id, name, price, has_spec, cover_image, stock, allow_coupon, is_on_sale, deleted_at,
                  shipping_type, ship_deadline_days, shipping_promise, shipping_delay_reason, shipping_note
             FROM products WHERE id = ? LIMIT 1 FOR UPDATE`, [productId]
        );
        if (!product || Number(product.is_on_sale) !== 1 || product.deleted_at) throw problem('PRODUCT_NOT_AVAILABLE');
        let price = Number(product.price);
        let spec = null;
        if (Number(product.has_spec) === 1 && !specName) throw problem('PRODUCT_SPEC_NOT_FOUND');
        if (Number(product.has_spec) === 1 && specName) {
          const [[candidate]] = await connection.execute(
            `SELECT name, sku, price, shipping_type, ship_deadline_days, shipping_promise, shipping_delay_reason, shipping_note
               FROM product_specs WHERE product_id = ? AND name = ? LIMIT 1 FOR UPDATE`, [productId, specName]
          );
          if (!candidate) throw problem('PRODUCT_SPEC_NOT_FOUND');
          spec = candidate;
          price = Number(candidate.price);
        }
        if (!Number.isFinite(price) || price <= 0) throw problem('PRODUCT_PRICE_INVALID');
        const totalAmount = (price * quantity).toFixed(2);
        let discountAmount = '0.00'; let couponClaimId = null;
        if (couponCampaignId) {
          if (Number(product.allow_coupon) !== 1) throw problem('COUPON_NOT_ALLOWED');
          const [[campaign]] = await connection.execute(
            `SELECT id, kind, value_fen, minimum_fen, total_limit, claimed_count, starts_at, ends_at
               FROM coupon_campaigns WHERE id = ? AND status = 'active' AND starts_at <= NOW() AND ends_at > NOW() LIMIT 1 FOR UPDATE`, [couponCampaignId]
          );
          if (!campaign || campaign.kind !== 'fixed' || Number(campaign.claimed_count) >= Number(campaign.total_limit)) throw problem('COUPON_UNAVAILABLE');
          if (Math.round(Number(totalAmount) * 100) < Number(campaign.minimum_fen)) throw problem('COUPON_MINIMUM_NOT_MET');
          const [[claim]] = await connection.execute('SELECT id, status FROM coupon_claims WHERE user_id = ? AND campaign_id = ? LIMIT 1 FOR UPDATE', [customerId, couponCampaignId]);
          if (claim && claim.status !== 'unused') throw problem('COUPON_UNAVAILABLE');
          if (claim) couponClaimId = Number(claim.id);
          else {
            const [createdClaim] = await connection.execute(`INSERT INTO coupon_claims (campaign_id, user_id, idempotency_key, status, claimed_at) VALUES (?, ?, ?, 'unused', NOW())`, [couponCampaignId, customerId, `order-${idempotencyKey}`]);
            couponClaimId = Number(createdClaim.insertId);
            const [count] = await connection.execute('UPDATE coupon_campaigns SET claimed_count = claimed_count + 1 WHERE id = ? AND claimed_count < total_limit', [couponCampaignId]);
            if (count.affectedRows !== 1) throw problem('COUPON_UNAVAILABLE');
          }
          discountAmount = Math.min(Number(totalAmount), Number(campaign.value_fen) / 100).toFixed(2);
        }
        const payAmount = Math.max(0, Number(totalAmount) - Number(discountAmount)).toFixed(2);
        const [frozen] = await connection.execute(
          `UPDATE products SET stock = stock - ?, reserved_stock = reserved_stock + ?
            WHERE id = ? AND stock >= ?`, [quantity, quantity, productId, quantity]
        );
        if (frozen.affectedRows !== 1) throw problem('PRODUCT_OUT_OF_STOCK');

        const shipping = spec || product;
        const [created] = await connection.execute(
          `INSERT INTO orders (order_no, user_id, _openid, total_amount, freight, discount_amount, coupon_amount, points_amount, pay_amount,
                               status, buyer_message, shipping_type, ship_deadline_days, shipping_promise, delay_shipping_reason, delay_shipping_note, used_coupon_id, created_at, updated_at)
           SELECT ?, u.id, u.openid, ?, 0.00, ?, ?, 0.00, ?, 'pending_payment', ?, ?, ?, ?, ?, ?, ?, NOW(), NOW()
             FROM users u WHERE u.id = ?`,
          [orderNo(), totalAmount, discountAmount, discountAmount, payAmount, remark, shipping.shipping_type || 'normal', Number(shipping.ship_deadline_days) || 2, shipping.shipping_promise || '', shipping.shipping_delay_reason || '', shipping.shipping_note || '', couponClaimId, customerId]
        );
        if (created.affectedRows !== 1) throw problem('USER_NOT_FOUND');
        const createdOrderId = created.insertId;
        if (couponClaimId) {
          const [reserved] = await connection.execute(`UPDATE coupon_claims SET status = 'reserved', reserved_order_id = ?, reserved_at = NOW() WHERE id = ? AND user_id = ? AND status = 'unused'`, [createdOrderId, couponClaimId, customerId]);
          if (reserved.affectedRows !== 1) throw problem('COUPON_UNAVAILABLE');
        }
        await connection.execute(
          `INSERT INTO order_items (order_id, _openid, product_id, sku, product_name, product_image, spec_desc, price, quantity, selected_color, created_at)
           SELECT ?, u.openid, ?, ?, ?, ?, ?, ?, ?, ?, NOW() FROM users u WHERE u.id = ?`,
          [createdOrderId, productId, spec?.sku || null, product.name, product.cover_image || null, spec?.name || null, price.toFixed(2), quantity, null, customerId]
        );
        await connection.execute(
          `INSERT INTO order_addresses (order_id, _openid, name, phone, province, city, district, detail, created_at)
           SELECT ?, u.openid, ?, ?, ?, ?, ?, ?, NOW() FROM users u WHERE u.id = ?`,
          [createdOrderId, address.name || address.contact, address.phone, address.province || '', address.city || '', address.district || '', address.detail, customerId]
        );
        await connection.execute('INSERT INTO order_creation_requests (user_id, idempotency_key, order_id) VALUES (?, ?, ?)', [customerId, idempotencyKey, createdOrderId]);
        if (Number(payAmount) === 0) {
          const [settled] = await connection.execute(`UPDATE orders SET status = 'paid', pay_type = 'other', pay_time = NOW(), updated_at = NOW() WHERE id = ? AND status = 'pending_payment'`, [createdOrderId]);
          if (settled.affectedRows !== 1) throw problem('ORDER_SETTLEMENT_CONFLICT');
          const [inventory] = await connection.execute('UPDATE products SET reserved_stock = GREATEST(reserved_stock - ?, 0), sales_count = IFNULL(sales_count, 0) + ? WHERE id = ?', [quantity, quantity, productId]);
          if (inventory.affectedRows !== 1) throw problem('ORDER_INVENTORY_NOT_FOUND');
          if (couponClaimId) {
            const [used] = await connection.execute(`UPDATE coupon_claims SET status = 'used', used_order_id = ?, used_at = NOW() WHERE id = ? AND status = 'reserved' AND reserved_order_id = ?`, [createdOrderId, couponClaimId, createdOrderId]);
            if (used.affectedRows !== 1) throw problem('ORDER_COUPON_CONFLICT');
          }
        }
        const [[row]] = await connection.execute('SELECT id, order_no, total_amount, pay_amount, status FROM orders WHERE id = ? LIMIT 1', [createdOrderId]);
        return { ...output(row), idempotent: false };
      });
    },

    async cancel(userId, orderId) {
      const customerId = positiveInteger(userId); const id = positiveInteger(orderId);
      if (!customerId || !id) throw problem('INVALID_REQUEST');
      return transaction(async (connection) => {
        const [[order]] = await connection.execute('SELECT id, status, used_coupon_id FROM orders WHERE id = ? AND user_id = ? LIMIT 1 FOR UPDATE', [id, customerId]);
        if (!order) throw problem('ORDER_NOT_FOUND');
        if (order.status === 'cancelled') return { id, status: 'cancelled', idempotent: true };
        if (order.status !== 'pending_payment') throw problem('ORDER_NOT_CANCELLABLE');
        const [items] = await connection.execute('SELECT product_id, quantity FROM order_items WHERE order_id = ? FOR UPDATE', [id]);
        for (const item of items) await connection.execute('UPDATE products SET stock = stock + ?, reserved_stock = GREATEST(reserved_stock - ?, 0) WHERE id = ?', [Number(item.quantity), Number(item.quantity), item.product_id]);
        if (order.used_coupon_id) await connection.execute(`UPDATE coupon_claims SET status = 'unused', reserved_order_id = NULL, reserved_at = NULL WHERE id = ? AND status = 'reserved' AND reserved_order_id = ?`, [order.used_coupon_id, id]);
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
