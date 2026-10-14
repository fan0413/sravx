import assert from 'node:assert/strict';
import test from 'node:test';
import { createMysqlRefundRepository } from '../src/repositories/mysql-refund-repository.js';

test('refund preparation takes the paid transaction and amounts only from the locked order rows', async () => {
  const calls = [];
  const connection = {
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => assert.fail('must not rollback'), release: () => {},
    execute: async (sql, values = []) => {
      calls.push({ sql, values });
      if (sql.startsWith('SELECT r.id, r.status, r.processed_refund_no')) return [[{ id: 7, status: 'approved', order_status: 'refunding', processed_refund_no: null, reason: '商品问题', requested_amount: '12.50', pay_amount: '12.50', pay_transaction_id: 'wx-paid-1' }]];
      if (sql.startsWith('UPDATE order_refund_requests SET status')) return [{ affectedRows: 1 }];
      throw new Error(`unexpected SQL: ${sql}`);
    }
  };
  const repository = createMysqlRefundRepository({ getConnection: async () => connection, execute: async () => assert.fail('must not use pool.execute') });
  const prepared = await repository.prepareRefund(7);
  assert.equal(prepared.transactionId, 'wx-paid-1');
  assert.equal(prepared.refundAmountFen, 1250);
  assert.equal(prepared.totalAmountFen, 1250);
  assert.equal(prepared.reason, '商品问题');
  assert.match(prepared.outRefundNo, /^SRRF/);
  assert.deepEqual(calls.find(({ sql }) => sql.startsWith('UPDATE order_refund_requests SET status')).values, [prepared.outRefundNo, 7]);
});

test('refund preparation rejects an approved request when the target order has no settled WeChat transaction', async () => {
  const connection = {
    beginTransaction: async () => {}, commit: async () => assert.fail('must not commit'), rollback: async () => {}, release: () => {},
    execute: async (sql) => {
      if (sql.startsWith('SELECT r.id, r.status, r.processed_refund_no')) return [[{ id: 8, status: 'approved', order_status: 'refunding', processed_refund_no: null, reason: '', requested_amount: '1.00', pay_amount: '1.00', pay_transaction_id: null }]];
      throw new Error(`unexpected SQL: ${sql}`);
    }
  };
  const repository = createMysqlRefundRepository({ getConnection: async () => connection, execute: async () => assert.fail('must not use pool.execute') });
  await assert.rejects(repository.prepareRefund(8), /REFUND_PAYMENT_NOT_READY/);
});

test('processing retries preserve the original refund number and amount', async () => {
  const connection = { beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {},
    execute: async sql => sql.startsWith('SELECT') ? [[{ status: 'processing', order_status: 'refunding', processed_refund_no: 'FIXTURE-RF-1', requested_amount: '0.10', pay_amount: '0.10', pay_transaction_id: 'fixture-tx' }]] : [{ affectedRows: 1 }] };
  const repository = createMysqlRefundRepository({ getConnection: async () => connection, execute: async () => [] });
  assert.equal((await repository.prepareRefund(7)).outRefundNo, 'FIXTURE-RF-1');
  assert.equal((await repository.prepareRefund(7)).outRefundNo, 'FIXTURE-RF-1');
});

test('an order no longer refunding cannot trigger any financial request', async () => {
  const connection = { beginTransaction: async () => {}, commit: async () => assert.fail('must rollback'), rollback: async () => {}, release() {}, execute: async () => [[{ status: 'approved', order_status: 'shipped' }]] };
  const repository = createMysqlRefundRepository({ getConnection: async () => connection, execute: async () => [] });
  await assert.rejects(repository.prepareRefund(7), /ORDER_REFUND_STATE_CONFLICT/);
});
