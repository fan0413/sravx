function orderIdentifier(value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error('INVALID_ORDER');
  return parsed;
}

export function createPaymentOrderService({ loadPayableOrder, loadPayablePointsOrder = null, createTransaction, notifyUrl }) {
  if (typeof loadPayableOrder !== 'function') throw new Error('A payable order reader is required.');
  if (!createTransaction || typeof createTransaction.createTransaction !== 'function') throw new Error('A WeChat Pay transaction client is required.');
  if (typeof notifyUrl !== 'string' || !notifyUrl.startsWith('https://')) throw new Error('WECHAT_PAY_NOTIFY_URL must be an HTTPS URL.');

  return Object.freeze({
    async create(userId, orderId, orderType = 'goods') {
      const loader = orderType === 'points' ? loadPayablePointsOrder : loadPayableOrder;
      if (typeof loader !== 'function') throw new Error('ORDER_TYPE_NOT_PAYABLE');
      const order = await loader(userId, orderIdentifier(orderId));
      if (!order) throw new Error('ORDER_NOT_FOUND');
      if (order.status === 'paid') return Object.freeze({ paid: true });
      if (order.status !== 'pending_payment') throw new Error('ORDER_NOT_PAYABLE');
      return createTransaction.createTransaction({
        outTradeNo: order.orderNo,
        description: 'SRAVX 宠物美容工具',
        amountFen: order.amountFen,
        openid: order.openid,
        notifyUrl
      });
    }
  });
}
