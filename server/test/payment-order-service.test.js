import assert from 'node:assert/strict';
import test from 'node:test';
import { createMysqlPaymentOrderRepository } from '../src/repositories/mysql-payment-order-repository.js';
import { createPaymentOrderService } from '../src/payments/payment-order-service.js';

test('payment order service uses the server-owned order and authenticated user only', async () => {
  let input;
  const service = createPaymentOrderService({
    loadPayableOrder: async (userId, orderId) => { assert.equal(userId, 8); assert.equal(orderId, 15); return { orderNo: 'order-15', amountFen: 1099, status: 'pending_payment', openid: 'openid-8' }; },
    createTransaction: { createTransaction: async (value) => { input = value; return { package: 'prepay_id=test' }; } }, notifyUrl: 'https://api.sravxpet.com/api/v1/payments/wechat/notifications'
  });
  assert.deepEqual(await service.create(8, '15'), { package: 'prepay_id=test' });
  assert.deepEqual(input, { outTradeNo: 'order-15', description: 'SRAVX 宠物美容工具', amountFen: 1099, openid: 'openid-8', notifyUrl: 'https://api.sravxpet.com/api/v1/payments/wechat/notifications' });
});

test('payment order service refuses non-payable or missing orders before WeChat is called', async () => {
  let calls = 0;
  const service = createPaymentOrderService({ loadPayableOrder: async () => ({ orderNo: 'order', amountFen: 1, status: 'cancelled', openid: 'openid' }), createTransaction: { createTransaction: async () => { calls += 1; } }, notifyUrl: 'https://api.sravxpet.com/callback' });
  await assert.rejects(service.create(1, 1), /ORDER_NOT_PAYABLE/);
  assert.equal(calls, 0);
});

test('payment order repository binds user and order IDs and converts amount exactly to fen', async () => {
  let values;
  const repository = createMysqlPaymentOrderRepository({ execute: async (_sql, bound) => { values = bound; return [[{ order_no: 'order-1', pay_amount: '10.09', status: 'pending_payment', openid: 'openid' }]]; } });
  assert.deepEqual(await repository.loadPayableOrder(7, 9), { orderNo: 'order-1', amountFen: 1009, status: 'pending_payment', openid: 'openid' });
  assert.deepEqual(values, [9, 7]);
});

test('mixed points payment uses its own server-owned loader and rejects points-only orders', async () => {
  let input;
  const service = createPaymentOrderService({
    loadPayableOrder: async () => assert.fail('must not load a goods order'),
    loadPayablePointsOrder: async (userId, orderId) => { assert.equal(userId, 8); assert.equal(orderId, 16); return { orderNo: 'SP-16', amountFen: 99, status: 'pending_payment', openid: 'openid-8' }; },
    createTransaction: { createTransaction: async (value) => { input = value; return { package: 'prepay_id=points' }; } }, notifyUrl: 'https://api.sravxpet.com/api/v1/payments/wechat/notifications'
  });
  assert.deepEqual(await service.create(8, 16, 'points'), { package: 'prepay_id=points' });
  assert.equal(input.amountFen, 99);
  const pointsOnly = createPaymentOrderService({ loadPayableOrder: async () => null, loadPayablePointsOrder: async () => null, createTransaction: { createTransaction: async () => assert.fail('must not call WeChat') }, notifyUrl: 'https://api.sravxpet.com/callback' });
  await assert.rejects(pointsOnly.create(8, 17, 'points'), /ORDER_NOT_FOUND/);
});
