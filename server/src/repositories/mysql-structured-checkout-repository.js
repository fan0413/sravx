import { randomUUID } from 'node:crypto';

function positiveInteger(value, maximum = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 && number <= maximum ? number : null;
}

function text(value, maximum) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') return null;
  const result = value.trim().replace(/\r\n?/g, '\n');
  return result.length <= maximum ? result : null;
}

function failure(code) {
  const cause = new Error(code);
  cause.code = code;
  return cause;
}

function money(fen) {
  return (Number(fen) / 100).toFixed(2);
}

function quoteResult({ id, expiresAt, item, protect }) {
  const productAmountFen = Number(item.product_amount_fen);
  const protectAmountFen = Number(item.protect_amount_fen);
  return Object.freeze({
    quoteId: id,
    expiresAt,
    item: {
      skuId: Number(item.sku_id),
      quantity: Number(item.quantity),
      product: item.product_snapshot,
      productAmountFen,
      protect: protect || null,
      protectAmountFen
    },
    productAmountFen,
    protectAmountFen,
    payableAmountFen: productAmountFen + protectAmountFen
  });
}

function quoteInput(input) {
  const skuId = positiveInteger(input?.skuId);
  const quantity = positiveInteger(input?.quantity ?? 1, 99);
  const protectOfferId = input?.protectOfferId === undefined || input?.protectOfferId === null || input?.protectOfferId === '' ? null : positiveInteger(input.protectOfferId);
  if (!skuId || !quantity || (input?.protectOfferId !== undefined && input?.protectOfferId !== null && input?.protectOfferId !== '' && !protectOfferId)) throw failure('INVALID_REQUEST');
  return { skuId, quantity, protectOfferId };
}

function createOrderInput(input) {
  const quoteId = typeof input?.quoteId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.quoteId) ? input.quoteId : null;
  const addressId = positiveInteger(input?.addressId);
  const remark = text(input?.remark, 255);
  const idempotencyKey = typeof input?.idempotencyKey === 'string' && /^[A-Za-z0-9_-]{12,80}$/.test(input.idempotencyKey) ? input.idempotencyKey : null;
  if (!quoteId || !addressId || remark === null || !idempotencyKey) throw failure('INVALID_REQUEST');
  return { quoteId, addressId, remark, idempotencyKey };
}

function orderNo() {
  return `SR${Date.now()}${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

function orderOutput(order, idempotent) {
  return Object.freeze({ orderId: Number(order.id), orderNo: order.order_no, totalAmount: String(order.total_amount), payAmount: String(order.pay_amount), status: order.status, idempotent });
}

/**
 * Structured checkout is deliberately opt-in at runtime. The factory may be
 * shipped before migration 012, but no query is made unless its API is wired
 * with STRUCTURED_CHECKOUT_ENABLED=true after a reviewed schema rehearsal.
 */
export function createMysqlStructuredCheckoutRepository(pool, { now = () => new Date(), quoteTtlMs = 10 * 60 * 1000, allowProtectPurchase = false } = {}) {
  if (!pool || typeof pool.getConnection !== 'function') throw new Error('A transactional MySQL pool is required.');
  if (!Number.isSafeInteger(quoteTtlMs) || quoteTtlMs < 60_000 || quoteTtlMs > 60 * 60 * 1000) throw new Error('quoteTtlMs must be between one minute and one hour.');

  async function transaction(work) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const value = await work(connection);
      await connection.commit();
      return value;
    } catch (cause) {
      await connection.rollback();
      throw cause;
    } finally {
      connection.release();
    }
  }

  async function loadSku(connection, skuId) {
    const [rows] = await connection.execute(
      `SELECT ps.id, ps.sku_code, ps.price_fen, ps.stock_available, ps.stock_frozen, ps.is_on_sale AS sku_on_sale,
              ps.image_object_key, ps.shipping_type, ps.ship_deadline_days, ps.shipping_promise,
              p.id AS product_id, p.name AS product_name, p.cover_image, p.is_on_sale AS product_on_sale, p.deleted_at,
              pm.id AS model_id, pm.name AS model_name, pc.id AS color_id, pc.name AS color_name, pc.swatch AS color_swatch
         FROM product_skus ps
         INNER JOIN products p ON p.id = ps.product_id
         INNER JOIN product_models pm ON pm.id = ps.model_id AND pm.product_id = p.id
         INNER JOIN product_colors pc ON pc.id = ps.color_id AND pc.product_id = p.id
        WHERE ps.id = ? LIMIT 1 FOR UPDATE`,
      [skuId]
    );
    return rows[0] || null;
  }

  async function loadDisplayOnlyProtectOffer(connection, offerId, sku) {
    if (!offerId) return null;
    const [rows] = await connection.execute(
      `SELECT spo.id, spo.price_fen, spo.warranty_extension_months, spo.tradein_rule,
              sp.code AS plan_code, sp.name AS plan_name, sp.terms_version
         FROM service_plan_offers spo
         INNER JOIN service_plans sp ON sp.id = spo.plan_id
        WHERE spo.id = ? AND spo.status = 'active' AND sp.status = 'active'
          AND spo.effective_from <= NOW() AND (spo.effective_to IS NULL OR spo.effective_to > NOW())
          AND (spo.sku_id IS NULL OR spo.sku_id = ?) AND (spo.product_id IS NULL OR spo.product_id = ?)
        LIMIT 1 FOR UPDATE`,
      [offerId, sku.id, sku.product_id]
    );
    return rows[0] || null;
  }

  return Object.freeze({
    async createQuote(userId, input) {
      const customerId = positiveInteger(userId);
      const request = quoteInput(input);
      if (!customerId) throw failure('INVALID_REQUEST');
      return transaction(async (connection) => {
        const sku = await loadSku(connection, request.skuId);
        if (!sku || Number(sku.sku_on_sale) !== 1 || Number(sku.product_on_sale) !== 1 || sku.deleted_at) throw failure('SKU_NOT_AVAILABLE');
        if (Number(sku.stock_available) < request.quantity) throw failure('SKU_OUT_OF_STOCK');
        const displayOffer = await loadDisplayOnlyProtectOffer(connection, request.protectOfferId, sku);
        if (request.protectOfferId && !displayOffer) throw failure('PROTECT_OFFER_NOT_AVAILABLE');
        const id = randomUUID();
        const createdAt = now();
        const expiresAt = new Date(createdAt.getTime() + quoteTtlMs);
        const productSnapshot = {
          productId: Number(sku.product_id), name: sku.product_name, coverImage: sku.image_object_key || sku.cover_image || '',
          skuId: Number(sku.id), skuCode: sku.sku_code, model: { id: Number(sku.model_id), name: sku.model_name },
          color: { id: Number(sku.color_id), name: sku.color_name, swatch: sku.color_swatch || '' },
          shipping: { type: sku.shipping_type || 'normal', deadlineDays: Number(sku.ship_deadline_days) || 2, promise: sku.shipping_promise || '' }
        };
        const protect = displayOffer ? {
          offerId: Number(displayOffer.id), planCode: displayOffer.plan_code, planName: displayOffer.plan_name,
          termsVersion: displayOffer.terms_version, warrantyExtensionMonths: Number(displayOffer.warranty_extension_months) || 0,
          tradeinRule: displayOffer.tradein_rule || null, displayOnly: !allowProtectPurchase
        } : null;
        // Protect remains display-only until price, terms, activation and refund rules are approved.
        const protectAmountFen = displayOffer && allowProtectPurchase ? Number(displayOffer.price_fen) * request.quantity : 0;
        const productAmountFen = Number(sku.price_fen) * request.quantity;
        await connection.execute(
          `INSERT INTO checkout_quotes (id, user_id, status, expires_at, payable_amount_fen, created_at)
           VALUES (?, ?, 'active', ?, ?, ?)`,
          [id, customerId, expiresAt, productAmountFen + protectAmountFen, createdAt]
        );
        await connection.execute(
          `INSERT INTO checkout_quote_items (quote_id, sku_id, quantity, product_snapshot, product_amount_fen, protect_offer_id, protect_snapshot, protect_amount_fen)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, sku.id, request.quantity, JSON.stringify(productSnapshot), productAmountFen, allowProtectPurchase ? displayOffer?.id || null : null, protect ? JSON.stringify(protect) : null, protectAmountFen]
        );
        return quoteResult({ id, expiresAt: expiresAt.toISOString(), item: { sku_id: sku.id, quantity: request.quantity, product_snapshot: productSnapshot, product_amount_fen: productAmountFen, protect_amount_fen: protectAmountFen }, protect });
      });
    },

    async createOrder(userId, input) {
      const customerId = positiveInteger(userId);
      const request = createOrderInput(input);
      if (!customerId) throw failure('INVALID_REQUEST');
      return transaction(async (connection) => {
        const [[existing]] = await connection.execute(
          `SELECT o.id, o.order_no, o.total_amount, o.pay_amount, o.status
             FROM order_creation_requests r INNER JOIN orders o ON o.id = r.order_id
            WHERE r.user_id = ? AND r.idempotency_key = ? LIMIT 1 FOR UPDATE`,
          [customerId, request.idempotencyKey]
        );
        if (existing) return orderOutput(existing, true);
        const [[address]] = await connection.execute(
          `SELECT a.name, a.contact, a.phone, a.province, a.city, a.district, a.detail
             FROM addresses a INNER JOIN users u ON u.openid = a.openid
            WHERE a.id = ? AND u.id = ? LIMIT 1 FOR UPDATE`,
          [request.addressId, customerId]
        );
        if (!address || !address.phone || !address.detail) throw failure('ADDRESS_NOT_FOUND');
        const [[quote]] = await connection.execute(
          `SELECT id, user_id, status, expires_at, payable_amount_fen
             FROM checkout_quotes WHERE id = ? AND user_id = ? LIMIT 1 FOR UPDATE`,
          [request.quoteId, customerId]
        );
        if (!quote) throw failure('QUOTE_NOT_FOUND');
        if (quote.status !== 'active') throw failure('QUOTE_NOT_ACTIVE');
        if (new Date(quote.expires_at).getTime() <= now().getTime()) {
          await connection.execute("UPDATE checkout_quotes SET status = 'expired' WHERE id = ? AND status = 'active'", [quote.id]);
          throw failure('QUOTE_EXPIRED');
        }
        const [quoteItems] = await connection.execute(
          `SELECT id, sku_id, quantity, product_snapshot, product_amount_fen, protect_offer_id, protect_snapshot, protect_amount_fen
             FROM checkout_quote_items WHERE quote_id = ? ORDER BY id ASC FOR UPDATE`, [quote.id]
        );
        if (quoteItems.length !== 1) throw failure('QUOTE_INVALID');
        const item = quoteItems[0];
        // protect offers cannot enter a paid order until the business rules are approved.
        if (item.protect_offer_id || Number(item.protect_amount_fen) !== 0) throw failure('PROTECT_PURCHASE_NOT_ENABLED');
        const sku = await loadSku(connection, Number(item.sku_id));
        if (!sku || Number(sku.sku_on_sale) !== 1 || Number(sku.product_on_sale) !== 1 || sku.deleted_at) throw failure('SKU_NOT_AVAILABLE');
        if (Number(sku.stock_available) < Number(item.quantity)) throw failure('SKU_OUT_OF_STOCK');
        const [frozen] = await connection.execute(
          `UPDATE product_skus SET stock_available = stock_available - ?, stock_frozen = stock_frozen + ?
            WHERE id = ? AND stock_available >= ?`,
          [Number(item.quantity), Number(item.quantity), sku.id, Number(item.quantity)]
        );
        if (frozen.affectedRows !== 1) throw failure('SKU_OUT_OF_STOCK');
        const totalAmount = money(quote.payable_amount_fen);
        const [created] = await connection.execute(
          `INSERT INTO orders (order_no, user_id, _openid, total_amount, freight, discount_amount, coupon_amount, points_amount, pay_amount,
                               status, buyer_message, shipping_type, ship_deadline_days, shipping_promise, delay_shipping_reason, delay_shipping_note, created_at, updated_at)
           SELECT ?, u.id, u.openid, ?, 0.00, 0.00, 0.00, 0.00, ?, 'pending_payment', ?, ?, ?, ?, '', '', NOW(), NOW()
             FROM users u WHERE u.id = ?`,
          [orderNo(), totalAmount, totalAmount, request.remark, sku.shipping_type || 'normal', Number(sku.ship_deadline_days) || 2, sku.shipping_promise || '', customerId]
        );
        if (created.affectedRows !== 1) throw failure('USER_NOT_FOUND');
        const orderId = Number(created.insertId);
        const snapshot = typeof item.product_snapshot === 'string' ? JSON.parse(item.product_snapshot) : item.product_snapshot;
        await connection.execute(
          `INSERT INTO order_items (order_id, _openid, product_id, sku_id, sku, product_name, product_image, spec_desc, price, quantity, selected_color, model_snapshot, color_snapshot, sku_snapshot, created_at)
           SELECT ?, u.openid, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW() FROM users u WHERE u.id = ?`,
          [orderId, sku.product_id, sku.id, sku.sku_code, snapshot.name, snapshot.coverImage || null, snapshot.model?.name || '', money(Number(item.product_amount_fen) / Number(item.quantity)), Number(item.quantity), snapshot.color?.name || '', snapshot.model?.name || '', snapshot.color?.name || '', sku.sku_code, customerId]
        );
        await connection.execute(
          `INSERT INTO order_addresses (order_id, _openid, name, phone, province, city, district, detail, created_at)
           SELECT ?, u.openid, ?, ?, ?, ?, ?, ?, NOW() FROM users u WHERE u.id = ?`,
          [orderId, address.name || address.contact, address.phone, address.province || '', address.city || '', address.district || '', address.detail, customerId]
        );
        await connection.execute('INSERT INTO order_creation_requests (user_id, idempotency_key, order_id) VALUES (?, ?, ?)', [customerId, request.idempotencyKey, orderId]);
        const [used] = await connection.execute("UPDATE checkout_quotes SET status = 'used', used_at = NOW() WHERE id = ? AND status = 'active'", [quote.id]);
        if (used.affectedRows !== 1) throw failure('QUOTE_NOT_ACTIVE');
        const [[order]] = await connection.execute('SELECT id, order_no, total_amount, pay_amount, status FROM orders WHERE id = ? LIMIT 1', [orderId]);
        return orderOutput(order, false);
      });
    },

    async cancel(userId, orderId) {
      const customerId = positiveInteger(userId);
      const id = positiveInteger(orderId);
      if (!customerId || !id) throw failure('INVALID_REQUEST');
      return transaction(async (connection) => {
        const [[order]] = await connection.execute(
          'SELECT id, status FROM orders WHERE id = ? AND user_id = ? LIMIT 1 FOR UPDATE', [id, customerId]
        );
        if (!order) throw failure('ORDER_NOT_FOUND');
        const [items] = await connection.execute(
          'SELECT sku_id, quantity FROM order_items WHERE order_id = ? FOR UPDATE', [id]
        );
        // Returning null lets the legacy repository cancel historical orders.
        if (!items.some((item) => positiveInteger(item.sku_id))) return null;
        if (order.status === 'cancelled') return { id, status: 'cancelled', idempotent: true };
        if (order.status !== 'pending_payment') throw failure('ORDER_NOT_CANCELLABLE');
        for (const item of items) {
          const skuId = positiveInteger(item.sku_id);
          if (!skuId) continue;
          const quantity = Number(item.quantity);
          const [released] = await connection.execute(
            `UPDATE product_skus SET stock_available = stock_available + ?, stock_frozen = GREATEST(stock_frozen - ?, 0)
              WHERE id = ? AND stock_frozen >= ?`,
            [quantity, quantity, skuId, quantity]
          );
          if (released.affectedRows !== 1) throw failure('SKU_INVENTORY_CONFLICT');
        }
        await connection.execute("UPDATE orders SET status = 'cancelled', cancel_time = NOW(), updated_at = NOW() WHERE id = ? AND status = 'pending_payment'", [id]);
        return { id, status: 'cancelled', idempotent: false };
      });
    }
  });
}
