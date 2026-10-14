import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { createServer } from '../src/server.js';
import { issueSession } from '../src/security/session.js';
import { createMysqlRefundRepository } from '../src/repositories/mysql-refund-repository.js';

function fixture(overrides = {}) {
  const order = { id: 8, user_id: 12, order_no: 'SYNTHETIC', _openid: 'fixture', status: 'paid', pay_amount: '0.10', pay_transaction_id: 'fixture-tx', ship_time: null, logistics_company: null, logistics_no: null, ...overrides };
  const calls = [];
  const connection = {
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {},
    async execute(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('FROM order_refund_request_keys')) return [[]];
      if (sql.includes('FROM orders WHERE')) return [[order]];
      if (sql.startsWith('SELECT id FROM order_refund_requests')) return [[]];
      if (sql.startsWith('INSERT INTO order_refund_requests ')) return [{ insertId: 7 }];
      return [{ affectedRows: 1 }];
    }
  };
  return { calls, repository: createMysqlRefundRepository({ getConnection: async () => connection, execute: async () => [] }) };
}
const input = { orderId: 8, reason: 'fixture', refundType: 'refund_only', idempotencyKey: 'fixture-refund-key-0001' };

test('unshipped settled payment auto-approves only with server-owned policy and locked ownership', async () => {
  const { repository, calls } = fixture();
  const result = await repository.request(12, { ...input, requestedAmount: '999.99' }, { autoApproveUnshipped: true });
  assert.equal(result.status, 'approved'); assert.equal(result.requestedAmount, '0.10');
  assert.deepEqual(calls.find(c => c.sql.includes('FROM orders WHERE')).values, [8, 12]);
  assert.match(calls.find(c => c.sql.includes('FROM orders WHERE')).sql, /FOR UPDATE/);
  assert.equal(calls.find(c => c.sql.startsWith('INSERT INTO order_refund_requests ')).values[8], 'approved');
});

for (const [name, overrides, type] of [
  ['shipped', { status: 'shipped' }], ['shipping timestamp', { ship_time: 'fixture' }],
  ['waybill', { logistics_no: 'fixture' }], ['carrier', { logistics_company: 'fixture' }],
  ['unsettled payment', { pay_transaction_id: null }], ['zero payment', { pay_amount: '0.00' }],
  ['return and refund', {}, 'return_and_refund']
]) test(`${name} remains subject to review`, async () => {
  const { repository } = fixture(overrides);
  assert.equal((await repository.request(12, { ...input, refundType: type || 'refund_only' }, { autoApproveUnshipped: true })).status, 'pending_review');
});
test('client cannot activate automatic approval through payload', async () => {
  assert.equal((await fixture().repository.request(12, { ...input, autoApproveUnshipped: true })).status, 'pending_review');
});

for (const [status, fails, expected] of [['approved', false, 'submitted'], ['processing', false, 'submitted'], ['approved', true, 'needs_retry'], ['pending_review', false, undefined], ['refunded', false, undefined]]) {
  test(`HTTP refund ${status}, execution failure ${fails}, preserves durable outcome`, async t => {
    const secret = 'fixture-refund-secret-long-enough-0000'; let called = 0;
    const server = createServer({ sessionSecret: secret, sessionRepository: { active: async () => true },
      refundRepository: { request: async (id, _body, policy) => { assert.equal(id, 12); assert.equal(policy.autoApproveUnshipped, true); return { requestId: 7, status }; } },
      refundExecutionService: { execute: async id => { assert.equal(id, 7); called++; if (fails) throw new Error('fixture timeout'); return { status: 'PROCESSING' }; } }
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
    const token = issueSession({ subject: 12, role: 'customer', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/refund-requests`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(input) });
    assert.equal(response.status, 201); const result = (await response.json()).data;
    assert.equal(result.executionStatus, expected); assert.equal(called, ['approved', 'processing'].includes(status) ? 1 : 0);
    if (expected === 'submitted') assert.equal(result.status, 'processing');
  });
}
