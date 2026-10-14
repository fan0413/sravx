function validText(value, maximum) { return typeof value === 'string' && value.length > 0 && value.length <= maximum; }

export function createMysqlPaymentSettlementRepository(pool, { structuredCheckout = false } = {}) {
  if (!pool || typeof pool.getConnection !== 'function') throw new Error('A MySQL pool is required.');
  return Object.freeze({
    async settleTransaction({ outTradeNo, transactionId }) {
      if (!validText(outTradeNo, 32) || !validText(transactionId, 64)) throw new Error('INVALID_SETTLEMENT');
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.execute('SELECT id, status, pay_transaction_id, used_coupon_id FROM orders WHERE order_no = ? LIMIT 1 FOR UPDATE', [outTradeNo]);
        if (rows.length !== 1) throw new Error('ORDER_NOT_FOUND');
        const order = rows[0];
        if (order.status === 'paid' && order.pay_transaction_id === transactionId) { await connection.commit(); return Object.freeze({ settled: false, duplicate: true }); }
        if (order.status !== 'pending_payment' || (order.pay_transaction_id && order.pay_transaction_id !== transactionId)) throw new Error('ORDER_SETTLEMENT_CONFLICT');
        const [result] = await connection.execute("UPDATE orders SET status = 'paid', pay_type = 'wechat', pay_time = NOW(), pay_transaction_id = ? WHERE id = ? AND status = 'pending_payment'", [transactionId, order.id]);
        if (result.affectedRows !== 1) throw new Error('ORDER_SETTLEMENT_CONFLICT');
        if (order.used_coupon_id) {
          const [coupon] = await connection.execute(`UPDATE coupon_claims SET status = 'used', used_order_id = ?, used_at = NOW() WHERE id = ? AND status = 'reserved' AND reserved_order_id = ?`, [order.id, order.used_coupon_id, order.id]);
          if (coupon.affectedRows !== 1) throw new Error('ORDER_COUPON_CONFLICT');
        }
        const [items] = await connection.execute(
          structuredCheckout
            ? 'SELECT product_id, sku_id, quantity FROM order_items WHERE order_id = ? FOR UPDATE'
            : 'SELECT product_id, quantity FROM order_items WHERE order_id = ? FOR UPDATE',
          [order.id]
        );
        for (const item of items) {
          if (structuredCheckout && Number.isSafeInteger(Number(item.sku_id)) && Number(item.sku_id) > 0) {
            const [sku] = await connection.execute(
              'UPDATE product_skus SET stock_frozen = GREATEST(stock_frozen - ?, 0) WHERE id = ? AND stock_frozen >= ?',
              [Number(item.quantity), Number(item.sku_id), Number(item.quantity)]
            );
            if (sku.affectedRows !== 1) throw new Error('SKU_INVENTORY_NOT_FOUND');
          }
          const [inventory] = await connection.execute(
            'UPDATE products SET reserved_stock = GREATEST(reserved_stock - ?, 0), sales_count = IFNULL(sales_count, 0) + ? WHERE id = ?',
            [structuredCheckout && Number(item.sku_id) > 0 ? 0 : Number(item.quantity), Number(item.quantity), item.product_id]
          );
          if (inventory.affectedRows !== 1) throw new Error('ORDER_INVENTORY_NOT_FOUND');
        }
        await connection.commit();
        return Object.freeze({ settled: true, duplicate: false });
      } catch (cause) { await connection.rollback(); throw cause; } finally { connection.release(); }
    },
    async settlePointsTransaction({ outTradeNo, transactionId }) {
      if (!validText(outTradeNo, 32) || !validText(transactionId, 64)) throw new Error('INVALID_SETTLEMENT');
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.execute('SELECT id, user_id, _openid, points_product_id, product_id, quantity, total_points, payable_cash, status, payment_status, pay_transaction_id FROM points_orders WHERE order_no = ? LIMIT 1 FOR UPDATE', [outTradeNo]);
        if (rows.length !== 1) throw new Error('ORDER_NOT_FOUND');
        const order = rows[0];
        if (order.status === 'pending_send' && order.pay_transaction_id === transactionId) { await connection.commit(); return Object.freeze({ settled: false, duplicate: true }); }
        if (order.status !== 'pending_payment' || order.payment_status !== 'pending' || (order.pay_transaction_id && order.pay_transaction_id !== transactionId)) throw new Error('ORDER_SETTLEMENT_CONFLICT');
        const [changed] = await connection.execute("UPDATE points_orders SET status = 'pending_send', payment_status = 'paid', pay_transaction_id = ?, pay_time = NOW(), updated_at = NOW() WHERE id = ? AND status = 'pending_payment'", [transactionId, order.id]);
        if (changed.affectedRows !== 1) throw new Error('ORDER_SETTLEMENT_CONFLICT');
        const [stock] = await connection.execute('UPDATE points_products SET stock_frozen = GREATEST(stock_frozen - ?, 0), sales_count = IFNULL(sales_count, 0) + ? WHERE id = ?', [Number(order.quantity), Number(order.quantity), order.points_product_id]);
        if (stock.affectedRows !== 1) throw new Error('POINTS_INVENTORY_NOT_FOUND');
        if (Number(order.product_id) > 0) {
          const [product] = await connection.execute('UPDATE products SET sales_count = IFNULL(sales_count, 0) + ? WHERE id = ?', [Number(order.quantity), Number(order.product_id)]);
          if (product.affectedRows !== 1) throw new Error('ORDER_INVENTORY_NOT_FOUND');
        }
        const [frozenLogs] = await connection.execute("SELECT balance_after FROM points_payment_logs WHERE order_id = ? AND biz_type = 'freeze' LIMIT 1 FOR UPDATE", [order.id]);
        if (frozenLogs.length !== 1) throw new Error('POINTS_LEDGER_NOT_FOUND');
        const balanceAfter = Number(frozenLogs[0].balance_after);
        await connection.execute(`INSERT INTO points_payment_logs (order_id, order_no, user_id, _openid, direction, biz_type, points_change, cash_change, balance_before, balance_after, idempotency_key, reconcile_date, reconcile_status, payment_channel, pay_transaction_id, remark, created_at)
          VALUES (?, ?, ?, ?, 'out', 'confirm', 0, ?, ?, ?, ?, CURDATE(), 'settled', 'mixed', ?, '积分混合支付确认', NOW())`, [order.id, outTradeNo, order.user_id, order._openid, Number(order.payable_cash), balanceAfter, balanceAfter, `confirm:${outTradeNo}`, transactionId]);
        await connection.commit(); return Object.freeze({ settled: true, duplicate: false });
      } catch (cause) { await connection.rollback(); throw cause; } finally { connection.release(); }
    },
    async settleRefund({ outRefundNo, refundId }) {
      if (!validText(outRefundNo, 64) || !validText(refundId, 64)) throw new Error('INVALID_REFUND');
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.execute(`SELECT r.id, r.order_id, r.status, r.processed_refund_no, r.order_status_snapshot, o.status AS order_status, o.ship_time, o.logistics_no, o.logistics_company
          FROM order_refund_requests r INNER JOIN orders o ON o.id = r.order_id
          WHERE r.processed_refund_no = ? LIMIT 1 FOR UPDATE`, [outRefundNo]);
        if (rows.length !== 1) throw new Error('REFUND_NOT_FOUND');
        const refund = rows[0];
        if (refund.status === 'refunded' && refund.processed_refund_no === outRefundNo && refund.order_status === 'refunded') { await connection.commit(); return Object.freeze({ settled: false, duplicate: true }); }
        if (!['approved', 'processing'].includes(refund.status) || refund.order_status !== 'refunding') throw new Error('REFUND_SETTLEMENT_CONFLICT');
        // Only an unshipped full refund returns saleable stock. Shipped goods
        // require a separate return/inspection workflow; never restock them here.
        if (refund.order_status_snapshot === 'paid' && !refund.ship_time && !refund.logistics_no && !refund.logistics_company) {
          const [items] = await connection.execute(structuredCheckout
            ? 'SELECT product_id, sku_id, quantity FROM order_items WHERE order_id = ? FOR UPDATE'
            : 'SELECT product_id, quantity FROM order_items WHERE order_id = ? FOR UPDATE', [refund.order_id]);
          for (const item of items) {
            const quantity = Number(item.quantity);
            if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('ORDER_INVENTORY_NOT_FOUND');
            const sku = structuredCheckout && Number(item.sku_id) > 0;
            if (sku) {
              const [restored] = await connection.execute('UPDATE product_skus SET stock_available = stock_available + ? WHERE id = ?', [quantity, item.sku_id]);
              if (restored.affectedRows !== 1) throw new Error('ORDER_INVENTORY_NOT_FOUND');
            }
            const [restored] = await connection.execute('UPDATE products SET stock = stock + ?, sales_count = GREATEST(IFNULL(sales_count, 0) - ?, 0) WHERE id = ?', [sku ? 0 : quantity, quantity, item.product_id]);
            if (restored.affectedRows !== 1) throw new Error('ORDER_INVENTORY_NOT_FOUND');
          }
        }
        await connection.execute("UPDATE order_refund_requests SET status = 'refunded', approved_at = IFNULL(approved_at, NOW()), updated_at = NOW() WHERE id = ?", [refund.id]);
        const [order] = await connection.execute("UPDATE orders SET status = 'refunded', refund_transaction_id = ?, updated_at = NOW() WHERE id = ? AND status = 'refunding'", [refundId, refund.order_id]);
        if (order.affectedRows !== 1) throw new Error('REFUND_SETTLEMENT_CONFLICT');
        await connection.commit(); return Object.freeze({ settled: true, duplicate: false });
      } catch (cause) { await connection.rollback(); throw cause; } finally { connection.release(); }
    }
  });
}
