function validText(value, maximum) { return typeof value === 'string' && value.length > 0 && value.length <= maximum; }

export function createMysqlPaymentSettlementRepository(pool) {
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
        const [items] = await connection.execute('SELECT product_id, quantity FROM order_items WHERE order_id = ? FOR UPDATE', [order.id]);
        for (const item of items) {
          const [inventory] = await connection.execute(
            'UPDATE products SET reserved_stock = GREATEST(reserved_stock - ?, 0), sales_count = IFNULL(sales_count, 0) + ? WHERE id = ?',
            [Number(item.quantity), Number(item.quantity), item.product_id]
          );
          if (inventory.affectedRows !== 1) throw new Error('ORDER_INVENTORY_NOT_FOUND');
        }
        await connection.commit();
        return Object.freeze({ settled: true, duplicate: false });
      } catch (cause) { await connection.rollback(); throw cause; } finally { connection.release(); }
    }
  });
}
