function amountToFen(value) {
  const normalized = String(value ?? '').trim();
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) return null;
  const fen = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
  return Number.isSafeInteger(fen) && fen > 0 ? fen : null;
}

export function createMysqlPaymentOrderRepository(pool) {
  if (!pool || typeof pool.execute !== 'function') throw new Error('A MySQL pool is required.');
  return Object.freeze({
    async loadPayableOrder(userId, orderId) {
      if (!Number.isSafeInteger(userId) || userId < 1 || !Number.isSafeInteger(orderId) || orderId < 1) throw new Error('A valid user and order id are required.');
      const [rows] = await pool.execute(
        `SELECT o.order_no, o.pay_amount, o.status, i.provider_subject AS openid
           FROM orders o
           INNER JOIN user_identities i ON i.user_id = o.user_id AND i.provider = 'wechat_miniprogram_openid'
          WHERE o.id = ? AND o.user_id = ?
          LIMIT 1`,
        [orderId, userId]
      );
      if (rows.length !== 1) return null;
      const order = rows[0];
      const amountFen = amountToFen(order.pay_amount);
      if (!amountFen || typeof order.order_no !== 'string' || !order.order_no || typeof order.openid !== 'string' || !order.openid) return null;
      return Object.freeze({ orderNo: order.order_no, amountFen, status: order.status, openid: order.openid });
    },
    async loadPayablePointsOrder(userId, orderId) {
      if (!Number.isSafeInteger(userId) || userId < 1 || !Number.isSafeInteger(orderId) || orderId < 1) throw new Error('A valid user and order id are required.');
      const [rows] = await pool.execute(`SELECT o.order_no, o.payable_cash AS pay_amount, o.status, i.provider_subject AS openid
        FROM points_orders o INNER JOIN user_identities i ON i.user_id = o.user_id AND i.provider = 'wechat_miniprogram_openid'
        WHERE o.id = ? AND o.user_id = ? AND o.payment_channel = 'mixed' LIMIT 1`, [orderId, userId]);
      const order = rows[0]; const amountFen = order && amountToFen(order.pay_amount);
      return order && amountFen && order.openid ? Object.freeze({ orderNo: order.order_no, amountFen, status: order.status, openid: order.openid, orderType: 'points' }) : null;
    }
  });
}
