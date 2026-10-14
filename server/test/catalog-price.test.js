import test from 'node:test';
import assert from 'node:assert/strict';
import { productInput } from '../src/media/admin-catalog-input.js';
import { createMysqlCatalogRepository } from '../src/repositories/mysql-catalog-repository.js';
import { createMysqlOrderWriteRepository } from '../src/repositories/mysql-order-write-repository.js';

const base = { name: '本地测试工具', price: 99, shippingType: 'normal', shipDeadlineDays: 2, shippingPromise: '测试' };
const spec = price => ({ name: '本地规格', price, shippingType: 'normal', shipDeadlineDays: 2, shippingPromise: '测试' });
test('saved product starting price is derived from specs regardless of supplied base price', () => {
  const result = productInput({ ...base, price: undefined, hasSpec: 1, specs: [spec('2.50'), spec('1.25')] }, { existing: true });
  assert.equal(result.price, 1.25); assert.deepEqual(result.specs.map(item => item.price), [2.5, 1.25]);
  assert.equal(productInput({ ...base, specs: [spec(2)] }, { existing: true }).price, 2);
  assert.equal(productInput({ ...base, hasSpec: 0, specs: [spec(2)] }, { existing: true }).hasSpec, 1);
});
test('every spec price is explicitly required and no-spec products require a positive base price', () => {
  for (const price of [undefined, null, '', ' ', 0, -1, 'broken', '1.234', true, Infinity]) {
    assert.throws(() => productInput({ ...base, specs: [spec(price)] }, { existing: true }), /spec.price/);
    assert.throws(() => productInput({ ...base, price }, { existing: true }), /price/);
  }
  assert.equal(productInput({ ...base, price: '0.01' }, { existing: true }).price, 0.01);
});
test('home, list and detail select minimum spec price while preserving base price and publication filters', async () => {
  const queries = [];
  const pool = { async execute(sql) {
    queries.push(sql);
    if (sql.startsWith('SELECT p.*')) return [[{ id: 1, price: '99.00', display_price: '1.25' }]];
    if (sql.includes('SELECT name, image')) return [[{ name: '本地规格', price: 1.25 }]];
    return [[]];
  } };
  const repository = createMysqlCatalogRepository(pool);
  const home = await repository.home(), list = await repository.listProducts({}), detail = await repository.getProduct(1);
  for (const item of [home.products[0], list[0], detail]) { assert.equal(item.price, '1.25'); assert.equal(item.base_price, '99.00'); }
  for (const sql of queries.filter(item => item.startsWith('SELECT p.*'))) {
    assert.match(sql, /MIN\(ps.price\)/); assert.match(sql, /p.is_on_sale = 1/); assert.match(sql, /c.is_show = 1/);
    assert.doesNotMatch(sql, /product_skus/);
  }
});
test('structured catalog list minimum uses only on-sale SKUs, without requiring stock to advertise price', async () => {
  let query;
  await createMysqlCatalogRepository({ async execute(sql) { query = sql; return [[]]; } }, { structuredCatalog: true }).listProducts({});
  assert.match(query, /MIN\(sku.price_fen\) \/ 100/); assert.match(query, /sku.is_on_sale = 1/);
  assert.doesNotMatch(query, /stock_available > 0/);
});
test('order requires a specification and uses its server price rather than color, client price or base price', async () => {
  let specPrice = 2.5; const writes = [];
  const connection = { async beginTransaction() {}, async commit() {}, async rollback() {}, release() {}, async execute(sql, values) {
    if (sql.includes('FROM order_creation_requests')) return [[]];
    if (sql.includes('FROM addresses')) return [[{ phone: 'LOCAL-ONLY', detail: 'LOCAL-ONLY' }]];
    if (sql.includes('FROM products WHERE')) return [[{ id: 1, price: 1, has_spec: 1, stock: 2, is_on_sale: 1 }]];
    if (sql.includes('FROM product_specs')) { assert.equal(values[1], '第二型号'); return [[{ name: '第二型号', price: specPrice }]]; }
    if (sql.startsWith('UPDATE products')) return [{ affectedRows: 1 }];
    if (sql.startsWith('INSERT INTO orders')) { writes.push(values); return [{ insertId: 1, affectedRows: 1 }]; }
    if (sql.startsWith('INSERT')) return [{ affectedRows: 1 }];
    if (sql.startsWith('SELECT id, order_no')) return [[{ id: 1, total_amount: '5.00', pay_amount: '5.00' }]];
    throw new Error('Unexpected test query');
  } };
  const repository = createMysqlOrderWriteRepository({ async getConnection() { return connection; } });
  const input = { productId: 1, addressId: 1, quantity: 2, idempotencyKey: 'local-price-test-0001', price: 0.01 };
  await assert.rejects(repository.create(1, input), /PRODUCT_SPEC_NOT_FOUND/);
  await repository.create(1, { ...input, selectedSpecName: '第二型号', selectedColor: '银色' });
  assert.ok(writes[0].includes('5.00'));
  specPrice = null;
  await assert.rejects(repository.create(1, { ...input, selectedSpecName: '第二型号' }), /PRODUCT_PRICE_INVALID/);
});
