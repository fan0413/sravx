import test from 'node:test';
import assert from 'node:assert/strict';
import { productInput, productUpdateInput } from '../src/media/admin-catalog-input.js';
import { createMysqlAdminCatalogRepository } from '../src/repositories/mysql-admin-catalog-repository.js';
const payload = { name: '本地测试商品', price: 1, shippingType: 'normal', shipDeadlineDays: 2, shippingPromise: '测试', shippingDelayReason: '测试', shippingNote: '测试', params: { 目录系列: 'basic', 目录分类: 'straight', 自定义说明: '保留' } };
test('ordinary create/update inputs persist classification independently of structured SKU', () => {
  assert.deepEqual(productInput(payload, { existing: true }).params, payload.params);
  assert.deepEqual(productUpdateInput({ ...payload, images: [], detailImages: [] }).params, payload.params);
  for (const params of [{ 目录系列: 'unknown', 目录分类: 'straight' }, { 目录系列: 'basic', 目录分类: 'accessories' }]) assert.throws(() => productInput({ ...payload, params }, { existing: true }), /classification/);
});
test('parent validation rejects self, missing parents and nested children without writes', async () => {
  const writes = [];
  const repository = createMysqlAdminCatalogRepository({ async execute(sql) { if (!sql.startsWith('SELECT')) writes.push(sql); return [sql.includes('parent_id FROM') ? [{ id: 2, parent_id: 1 }] : []]; } });
  await assert.rejects(repository.updateCategory(1, { parentId: 1 }), /itself/);
  await assert.rejects(repository.createCategory({ parentId: 2 }), /existing root/);
  assert.deepEqual(writes, []);
});
test('create/update repository serializes metadata into the existing params column', async () => {
  const statements = [];
  const connection = { async beginTransaction() {}, async commit() {}, async rollback() {}, release() {}, async execute(sql, values) { statements.push({ sql, values }); return [{ insertId: 1, affectedRows: 1 }]; } };
  const repository = createMysqlAdminCatalogRepository({ async execute() { return [[]]; }, async getConnection() { return connection; } });
  const input = { ...productInput(payload, { existing: true }), specs: [], images: [], detailImages: [] };
  await repository.createProduct(input); await repository.updateProduct(1, input);
  for (const statement of statements.filter(item => item.sql.includes('products ') && !item.sql.includes('product_specs'))) assert.deepEqual(JSON.parse(statement.values[8]), payload.params);
});
test('root category with children is not deleted', async () => {
  const connection = { async beginTransaction() {}, async rollback() {}, release() {}, async execute(sql) { assert.ok(sql.startsWith('SELECT')); return [sql.includes('FROM categories') ? [{ id: 11 }] : []]; } };
  const repository = createMysqlAdminCatalogRepository({ async execute() { return [[]]; }, async getConnection() { return connection; } });
  assert.equal(await repository.deleteCategory(1), 'has_children');
});
test('normal stock does not require a fabricated delay reason or note', () => {
  const input = productInput({ ...payload, shippingDelayReason: '', shippingNote: '' }, { existing: true });
  assert.equal(input.shippingDelayReason, null); assert.equal(input.shippingNote, null);
  assert.throws(() => productInput({ ...payload, shippingType: 'delayed', shippingDelayReason: '' }, { existing: true }), /shippingDelayReason/);
});
