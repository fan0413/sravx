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
