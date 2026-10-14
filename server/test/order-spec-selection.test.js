import test from 'node:test';
import assert from 'node:assert/strict';
import { createMysqlOrderWriteRepository } from '../src/repositories/mysql-order-write-repository.js';

test('ordinary checkout looks up the selected model, not the display color', async () => {
  const expectedName = '支付测试规格';
  let checked = false;
  let rolledBack = false;
  const stop = new Error('READ_ONLY_FIXTURE_STOP');
  const connection = {
    beginTransaction: async () => {}, commit: async () => assert.fail('must not commit'),
    rollback: async () => { rolledBack = true; }, release() {},
    execute: async (sql, values) => {
      if (sql.includes('FROM order_creation_requests')) return [[]];
      if (sql.includes('FROM addresses')) return [[{ phone: 'synthetic', detail: 'synthetic' }]];
      if (sql.includes('FROM products WHERE')) return [[{ id: 1, has_spec: 1, is_on_sale: 1, price: '0.10' }]];
      if (sql.includes('FROM product_specs')) {
        assert.deepEqual(values, [1, expectedName]);
        checked = true;
        throw stop;
      }
      assert.fail('must not reach inventory or order writes');
    }
  };
  const repository = createMysqlOrderWriteRepository({ getConnection: async () => connection });
  await assert.rejects(repository.create(1, {
    productId: 1, addressId: 1, quantity: 1,
    selectedSpecName: expectedName, selectedColor: '默认颜色',
    idempotencyKey: 'synthetic-spec-selection'
  }), error => error === stop);
  assert.equal(checked, true);
  assert.equal(rolledBack, true);
});

test('a color-only legacy request cannot purchase a specification product', async () => {
  let rollback = false;
  const connection = {
    beginTransaction: async () => {}, rollback: async () => { rollback = true; }, release() {},
    execute: async sql => {
      if (sql.includes('FROM order_creation_requests')) return [[]];
      if (sql.includes('FROM addresses')) return [[{ phone: 'synthetic', detail: 'synthetic' }]];
      if (sql.includes('FROM products WHERE')) return [[{ has_spec: 1, is_on_sale: 1, price: '0.10' }]];
      assert.fail('must not query a color as specification or write an order');
    }
  };
  await assert.rejects(createMysqlOrderWriteRepository({ getConnection: async () => connection }).create(1, {
    productId: 1, addressId: 1, selectedColor: '默认颜色', idempotencyKey: 'synthetic-color-only'
  }), error => error.code === 'PRODUCT_SPEC_NOT_FOUND');
  assert.equal(rollback, true);
});
