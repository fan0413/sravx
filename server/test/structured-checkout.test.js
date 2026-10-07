import assert from 'node:assert/strict';
import test from 'node:test';
import { createMysqlStructuredCheckoutRepository } from '../src/repositories/mysql-structured-checkout-repository.js';
import { createMysqlCatalogRepository } from '../src/repositories/mysql-catalog-repository.js';

function sku() {
  return {
    id: 12, sku_code: 'PRO-7-BLACK', price_fen: 59800, stock_available: 3, stock_frozen: 0, sku_on_sale: 1,
    image_object_key: 'catalog/products/pro-7.jpg', shipping_type: 'normal', ship_deadline_days: 2, shipping_promise: '48 小时内发货',
    product_id: 7, product_name: 'Pro 7.0 英寸直剪', cover_image: 'catalog/products/cover.jpg', product_on_sale: 1, deleted_at: null,
    model_id: 4, model_name: '7.0 英寸', color_id: 5, color_name: '深空黑', color_swatch: '#111111'
  };
}

function connectionForQuote() {
  const calls = [];
  const connection = {
    async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
    async execute(statement, values) {
      calls.push({ statement, values });
      if (statement.includes('FROM product_skus ps')) return [[sku()]];
      if (statement.startsWith('INSERT INTO checkout_quotes') || statement.startsWith('INSERT INTO checkout_quote_items')) return [{ affectedRows: 1 }];
      throw new Error(`unexpected statement: ${statement}`);
    }
  };
  return { calls, pool: { getConnection: async () => connection } };
}

test('structured quote uses server-owned SKU price and records a selection snapshot', async () => {
  const { calls, pool } = connectionForQuote();
  const repository = createMysqlStructuredCheckoutRepository(pool, { now: () => new Date('2026-09-22T00:00:00.000Z') });
  const result = await repository.createQuote(8, { skuId: 12, quantity: 2 });
  assert.match(result.quoteId, /^[0-9a-f-]{36}$/);
  assert.equal(result.productAmountFen, 119600);
  assert.equal(result.payableAmountFen, 119600);
  assert.equal(result.item.product.model.name, '7.0 英寸');
  assert.equal(result.item.product.color.name, '深空黑');
  const quoteItem = calls.find(({ statement }) => statement.startsWith('INSERT INTO checkout_quote_items'));
  assert.equal(quoteItem.values[1], 12);
  assert.equal(quoteItem.values[2], 2);
  assert.deepEqual(JSON.parse(quoteItem.values[3]).color, { id: 5, name: '深空黑', swatch: '#111111' });
});

test('structured quote never accepts a client-supplied price and rejects invalid SKU input', async () => {
  const { pool } = connectionForQuote();
  const repository = createMysqlStructuredCheckoutRepository(pool);
  await assert.rejects(repository.createQuote(8, { skuId: 0, quantity: 1, priceFen: 1 }), /INVALID_REQUEST/);
  const result = await repository.createQuote(8, { skuId: 12, quantity: 1, priceFen: 1 });
  assert.equal(result.payableAmountFen, 59800);
});

test('structured checkout expires a quote before it can create an order', async () => {
  let rolledBack = 0;
  const connection = {
    async beginTransaction() {}, async commit() { assert.fail('expired quote must not commit'); }, async rollback() { rolledBack += 1; }, release() {},
    async execute(statement) {
      if (statement.includes('order_creation_requests')) return [[]];
      if (statement.includes('FROM addresses')) return [[{ name: '测试用户', phone: '13800138000', detail: '测试地址' }]];
      if (statement.includes('FROM checkout_quotes')) return [[{ id: '993d4f87-0ac6-4cae-bf55-7199168e87e9', user_id: 8, status: 'active', expires_at: '2026-09-22T00:00:00.000Z', payable_amount_fen: 59800 }]];
      if (statement.startsWith("UPDATE checkout_quotes SET status = 'expired'")) return [{ affectedRows: 1 }];
      throw new Error(`unexpected statement: ${statement}`);
    }
  };
  const repository = createMysqlStructuredCheckoutRepository({ getConnection: async () => connection }, { now: () => new Date('2026-09-22T00:01:00.000Z') });
  await assert.rejects(repository.createOrder(8, { quoteId: '993d4f87-0ac6-4cae-bf55-7199168e87e9', addressId: 2, idempotencyKey: 'structured-order-create-1' }), /QUOTE_EXPIRED/);
  assert.equal(rolledBack, 1);
});

test('structured catalog returns only SKU-based selections and product-scoped Protect offers', async () => {
  const calls = [];
  const pool = {
    async execute(statement, values = []) {
      calls.push({ statement, values });
      if (statement.includes('FROM products p') && statement.includes('WHERE p.id =')) return [[{ id: 7, name: 'Pro 7.0', is_on_sale: 1 }]];
      if (statement.includes('FROM product_specs')) return [[]];
      if (statement.includes('FROM product_models')) return [[{ id: 4, name: '7.0 英寸', sort_order: 1 }]];
      if (statement.includes('FROM product_colors')) return [[{ id: 5, name: '深空黑', swatch: '#111111', sort_order: 1 }]];
      if (statement.includes('FROM product_skus WHERE')) return [[{ id: 12, model_id: 4, color_id: 5, sku_code: 'PRO-7-BLACK', price_fen: 59800, stock_available: 3, stock_frozen: 1, is_on_sale: 1 }]];
      if (statement.includes('FROM product_media')) return [[{ purpose: 'cover', object_key: 'catalog/products/pro-7.jpg', sort_order: 1 }]];
      if (statement.includes('FROM service_plan_offers')) return [[{ id: 20, sku_id: 12, plan_code: 'protect', plan_name: 'Protect', price_fen: 0, warranty_extension_months: 0, terms_version: 'draft' }]];
      throw new Error(`unexpected statement: ${statement}`);
    }
  };
  const repository = createMysqlCatalogRepository(pool, { structuredCatalog: true });
  const product = await repository.getProduct(7);
  assert.equal(product.models[0].name, '7.0 英寸');
  assert.equal(product.colors[0].name, '深空黑');
  assert.equal(product.skus[0].available, 3);
  assert.equal(product.protectOffers[0].displayOnly, true);
  assert.deepEqual(calls.find(({ statement }) => statement.includes('FROM service_plan_offers')).values, [7, 7]);
});
