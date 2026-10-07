import assert from 'node:assert/strict';
import test from 'node:test';
import { createMysqlPaymentSettlementRepository } from '../src/repositories/mysql-payment-settlement-repository.js';

test('payment settlement converts frozen stock into sales in the same transaction', async () => {
  const calls = []; let committed = 0;
  const connection = {
    beginTransaction: async () => {}, commit: async () => { committed += 1; }, rollback: async () => assert.fail('must not rollback'), release: () => {},
    execute: async (sql, values = []) => {
      calls.push({ sql, values });
      if (sql.startsWith('SELECT id, status')) return [[{ id: 11, status: 'pending_payment', pay_transaction_id: null }]];
      if (sql.startsWith('UPDATE orders SET')) return [{ affectedRows: 1 }];
      if (sql.startsWith('SELECT product_id')) return [[{ product_id: 3, quantity: 2 }]];
      if (sql.startsWith('UPDATE products SET reserved_stock')) return [{ affectedRows: 1 }];
      throw new Error(`unexpected SQL: ${sql}`);
    }
  };
  const repository = createMysqlPaymentSettlementRepository({ getConnection: async () => connection });
  assert.deepEqual(await repository.settleTransaction({ outTradeNo: 'SR-001', transactionId: 'WX-001' }), { settled: true, duplicate: false });
  assert.equal(committed, 1);
  const inventory = calls.find(({ sql }) => sql.startsWith('UPDATE products SET reserved_stock'));
  assert.deepEqual(inventory.values, [2, 2, 3]);
});

test('payment settlement does not change inventory for an already settled transaction', async () => {
  let executeCalls = 0;
  const connection = {
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => assert.fail('must not rollback'), release: () => {},
    execute: async () => { executeCalls += 1; return [[{ id: 11, status: 'paid', pay_transaction_id: 'WX-001' }]]; }
  };
  const repository = createMysqlPaymentSettlementRepository({ getConnection: async () => connection });
  assert.deepEqual(await repository.settleTransaction({ outTradeNo: 'SR-001', transactionId: 'WX-001' }), { settled: false, duplicate: true });
  assert.equal(executeCalls, 1);
});

test('structured checkout settlement releases only the matching SKU freeze and keeps product sales aggregate', async () => {
  const calls = [];
  const connection = {
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => assert.fail('must not rollback'), release: () => {},
    execute: async (sql, values = []) => {
      calls.push({ sql, values });
      if (sql.startsWith('SELECT id, status')) return [[{ id: 11, status: 'pending_payment', pay_transaction_id: null }]];
      if (sql.startsWith('UPDATE orders SET')) return [{ affectedRows: 1 }];
      if (sql.startsWith('SELECT product_id, sku_id')) return [[{ product_id: 3, sku_id: 12, quantity: 2 }]];
      if (sql.startsWith('UPDATE product_skus SET stock_frozen')) return [{ affectedRows: 1 }];
      if (sql.startsWith('UPDATE products SET reserved_stock')) return [{ affectedRows: 1 }];
      throw new Error(`unexpected SQL: ${sql}`);
    }
  };
  const repository = createMysqlPaymentSettlementRepository({ getConnection: async () => connection }, { structuredCheckout: true });
  assert.deepEqual(await repository.settleTransaction({ outTradeNo: 'SR-SKU-001', transactionId: 'WX-SKU-001' }), { settled: true, duplicate: false });
  assert.deepEqual(calls.find(({ sql }) => sql.startsWith('UPDATE product_skus SET stock_frozen')).values, [2, 12, 2]);
  assert.deepEqual(calls.find(({ sql }) => sql.startsWith('UPDATE products SET reserved_stock')).values, [0, 2, 3]);
});

test('mixed-points payment converts its frozen points stock and linked product sale atomically', async () => {
  const calls = []; let committed = 0;
  const connection = {
    beginTransaction: async () => {}, commit: async () => { committed += 1; }, rollback: async () => assert.fail('must not rollback'), release: () => {},
    execute: async (sql, values = []) => {
      calls.push({ sql, values });
      if (sql.startsWith('SELECT id, user_id')) return [[{ id: 21, user_id: 9, _openid: 'openid-9', points_product_id: 5, product_id: 3, quantity: 2, total_points: 40, payable_cash: '12.50', status: 'pending_payment', payment_status: 'pending', pay_transaction_id: null }]];
      if (sql.startsWith('UPDATE points_orders SET')) return [{ affectedRows: 1 }];
      if (sql.startsWith('UPDATE points_products SET')) return [{ affectedRows: 1 }];
      if (sql.startsWith('UPDATE products SET sales_count')) return [{ affectedRows: 1 }];
      if (sql.startsWith('SELECT balance_after')) return [[{ balance_after: 80 }]];
      if (sql.startsWith('INSERT INTO points_payment_logs')) return [{ affectedRows: 1 }];
      throw new Error(`unexpected SQL: ${sql}`);
    }
  };
  const repository = createMysqlPaymentSettlementRepository({ getConnection: async () => connection });
  assert.deepEqual(await repository.settlePointsTransaction({ outTradeNo: 'SP-001', transactionId: 'WX-POINTS-001' }), { settled: true, duplicate: false });
  assert.equal(committed, 1);
  assert.deepEqual(calls.find(({ sql }) => sql.startsWith('UPDATE points_products SET')).values, [2, 2, 5]);
  assert.deepEqual(calls.find(({ sql }) => sql.startsWith('UPDATE products SET sales_count')).values, [2, 3]);
  assert.deepEqual(calls.find(({ sql }) => sql.startsWith('INSERT INTO points_payment_logs')).values, [21, 'SP-001', 9, 'openid-9', 12.5, 80, 80, 'confirm:SP-001', 'WX-POINTS-001']);
});

test('refund success callback settles an approved refund once without another monetary request', async () => {
  const calls = []; let committed = 0;
  const connection = {
    beginTransaction: async () => {}, commit: async () => { committed += 1; }, rollback: async () => assert.fail('must not rollback'), release: () => {},
    execute: async (sql, values = []) => {
      calls.push({ sql, values });
      if (sql.startsWith('SELECT r.id, r.order_id')) return [[{ id: 17, order_id: 21, status: 'processing', processed_refund_no: 'SRRF-1', order_status: 'refunding' }]];
      if (sql.startsWith('UPDATE order_refund_requests SET status')) return [{ affectedRows: 1 }];
      if (sql.startsWith('UPDATE orders SET status')) return [{ affectedRows: 1 }];
      throw new Error(`unexpected SQL: ${sql}`);
    }
  };
  const repository = createMysqlPaymentSettlementRepository({ getConnection: async () => connection });
  assert.deepEqual(await repository.settleRefund({ outRefundNo: 'SRRF-1', refundId: 'wx-refund-1' }), { settled: true, duplicate: false });
  assert.equal(committed, 1);
  assert.deepEqual(calls.find(({ sql }) => sql.startsWith('UPDATE orders SET status')).values, ['wx-refund-1', 21]);
});
