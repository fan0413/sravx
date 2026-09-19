import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createServer } from '../src/server.js';
import { createLoginService } from '../src/auth/login-service.js';
import { createWechatCodeExchange } from '../src/auth/wechat-code-exchange.js';
import { createWechatIdentityRequester } from '../src/auth/wechat-identity-requester.js';
import { createWechatPhoneRequester } from '../src/auth/wechat-phone-requester.js';
import { createPhoneService } from '../src/auth/phone-service.js';
import { createMysqlUserRepository } from '../src/repositories/mysql-user-repository.js';
import { createMysqlCatalogRepository } from '../src/repositories/mysql-catalog-repository.js';
import { createMysqlAdminCatalogRepository } from '../src/repositories/mysql-admin-catalog-repository.js';
import { createMysqlAdminOperationsRepository } from '../src/repositories/mysql-admin-operations-repository.js';
import { createMysqlInquiryRepository } from '../src/repositories/mysql-inquiry-repository.js';
import { databaseIdentifier, parseArguments as parseSchemaExportArguments } from '../scripts/schema-export.mjs';
import { orderedTables, parseArguments as parseSchemaRestoreArguments, restorePlan } from '../scripts/schema-restore-rehearsal.mjs';
import { compareSchemaEvidence } from '../scripts/compare-schema-evidence.mjs';
import { parseArguments, quoteIdentifier } from '../scripts/row-baseline.mjs';
import { canonicalizeJson, digestRows, encodeValue } from '../scripts/row-chunks.mjs';
import { collectGiftCardIntegrity } from '../scripts/check-gift-card-integrity.mjs';
import { compareRowEvidence } from '../scripts/compare-row-evidence.mjs';
import { evaluatePreflight } from '../scripts/user-import-preflight.mjs';
import { identityBindings, selectUserBaseColumns, validateSnapshot } from '../scripts/user-basic-snapshot.mjs';
import { createMysqlAddressRepository } from '../src/repositories/mysql-address-repository.js';
import { createMysqlToolRepository } from '../src/repositories/mysql-tool-repository.js';
import { createMysqlAfterSaleRepository } from '../src/repositories/mysql-after-sale-repository.js';
import { createMysqlOrderReadRepository } from '../src/repositories/mysql-order-read-repository.js';
import { createMysqlGiftCardReadRepository } from '../src/repositories/mysql-gift-card-read-repository.js';
import { issueSession } from '../src/security/session.js';
import { createUploadIntent } from '../src/media/upload-policy.js';
import { createMysqlMediaIntentRepository } from '../src/repositories/mysql-media-intent-repository.js';
import { createCosUploadSigner } from '../src/media/cos-upload-signer.js';
import { bannerInput, categoryInput, productInput } from '../src/media/admin-catalog-input.js';
import { hashPassword, verifyPassword } from '../src/security/password.js';
import { createAdminLoginService } from '../src/auth/admin-login-service.js';
import { createRequestAuditLogger } from '../src/observability/request-audit.js';
import { createMysqlCouponRepository } from '../src/repositories/mysql-coupon-repository.js';
import { createMysqlOrderWriteRepository } from '../src/repositories/mysql-order-write-repository.js';

const secret = 'test-only-session-secret-which-is-long-enough-123456';

test('coupon endpoints separate public campaigns from a customer claim and reject anonymous writes', async (t) => {
  const calls = [];
  const coupons = {
    listAvailable: async () => [{ id: 4, name: '新人券', value: 10 }],
    listMine: async (userId, status) => { calls.push({ kind: 'mine', userId, status }); return []; },
    claim: async (userId, campaignId, key) => { calls.push({ kind: 'claim', userId, campaignId, key }); return { coupon: { id: campaignId, user_coupon_id: 12 }, idempotent: false }; },
    check: async (userId, claimId, amount) => { calls.push({ kind: 'check', userId, claimId, amount }); return { id: 4, user_coupon_id: claimId }; }
  };
  const server = createServer({ sessionSecret: secret, couponRepository: coupons, sessionRepository: { active: async () => true } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${base}/api/v1/coupons`)).status, 200);
  assert.equal((await fetch(`${base}/api/v1/coupons/4/claims`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401);
  const token = issueSession({ subject: 9, role: 'customer', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const claim = await fetch(`${base}/api/v1/coupons/4/claims`, { method: 'POST', headers, body: JSON.stringify({ idempotencyKey: 'coupon-claim-key-0001' }) });
  assert.equal(claim.status, 201);
  const checked = await fetch(`${base}/api/v1/coupons/claims/12/check`, { method: 'POST', headers, body: JSON.stringify({ orderAmount: '100.00' }) });
  assert.equal(checked.status, 200);
  const mine = await fetch(`${base}/api/v1/me/coupons?status=used`, { headers });
  assert.equal(mine.status, 200);
  assert.deepEqual(calls, [
    { kind: 'claim', userId: 9, campaignId: 4, key: 'coupon-claim-key-0001' },
    { kind: 'check', userId: 9, claimId: 12, amount: '100.00' },
    { kind: 'mine', userId: 9, status: 'used' }
  ]);
});

test('coupon repository binds public and user filters without reading legacy coupon tables', async () => {
  const calls = [];
  const pool = {
    execute: async (sql, values = []) => { calls.push({ sql, values }); return [[]]; },
    getConnection: async () => ({ beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {}, execute: async () => [[]] })
  };
  const repository = createMysqlCouponRepository(pool);
  assert.deepEqual(await repository.listAvailable(), []);
  assert.deepEqual(await repository.listMine(8, 'unused'), []);
  await assert.rejects(() => repository.listMine(8, 'other'), /INVALID_REQUEST/);
  assert.match(calls[0].sql, /FROM coupon_campaigns/);
  assert.doesNotMatch(calls[0].sql, /FROM coupons\b|user_coupons/);
  assert.match(calls[1].sql, /cc\.user_id = \?/);
  assert.deepEqual(calls[1].values, [8]);
});

test('order write endpoints rely only on the signed customer and preserve idempotent creation', async (t) => {
  const calls = [];
  const writes = {
    create: async (userId, payload) => { calls.push({ kind: 'create', userId, payload }); return { orderId: 15, orderNo: 'SR1', idempotent: false }; },
    cancel: async (userId, orderId) => { calls.push({ kind: 'cancel', userId, orderId }); return { id: orderId, status: 'cancelled' }; },
    confirmReceive: async (userId, orderId) => { calls.push({ kind: 'receive', userId, orderId }); return { id: orderId, status: 'completed' }; }
  };
  const server = createServer({ sessionSecret: secret, orderWriteRepository: writes, sessionRepository: { active: async () => true } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${base}/api/v1/orders`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401);
  const token = issueSession({ subject: 6, role: 'customer', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const body = { productId: 3, addressId: 7, quantity: 1, idempotencyKey: 'order-create-key-0001' };
  assert.equal((await fetch(`${base}/api/v1/orders`, { method: 'POST', headers, body: JSON.stringify(body) })).status, 201);
  assert.equal((await fetch(`${base}/api/v1/orders/15`, { method: 'POST', headers })).status, 200);
  assert.equal((await fetch(`${base}/api/v1/orders/15/receive`, { method: 'POST', headers })).status, 200);
  assert.deepEqual(calls, [
    { kind: 'create', userId: 6, payload: body },
    { kind: 'cancel', userId: 6, orderId: 15 },
    { kind: 'receive', userId: 6, orderId: 15 }
  ]);
});

test('order write repository freezes stock and records an idempotency ledger in one transaction', async () => {
  const sql = []; let committed = 0; let rolledBack = 0;
  const connection = {
    beginTransaction: async () => {}, commit: async () => { committed += 1; }, rollback: async () => { rolledBack += 1; }, release: () => {},
    execute: async (statement, values = []) => {
      sql.push({ statement, values });
      if (statement.includes('FROM order_creation_requests')) return [[]];
      if (statement.includes('FROM addresses')) return [[{ name: '王女士', contact: '王女士', phone: '13800138000', province: '上海', city: '上海', district: '浦东', detail: '测试路 1 号' }]];
      if (statement.includes('FROM products WHERE')) return [[{ id: 3, name: '专业剪', price: '299.00', cover_image: 'catalog/a.png', stock: 2, is_on_sale: 1, deleted_at: null, shipping_type: 'normal', ship_deadline_days: 2, shipping_promise: '两天内发货', shipping_delay_reason: '', shipping_note: '' }]];
      if (statement.startsWith('UPDATE products SET stock')) return [{ affectedRows: 1 }];
      if (statement.startsWith('INSERT INTO orders')) return [{ affectedRows: 1, insertId: 15 }];
      if (statement.startsWith('INSERT INTO order_items') || statement.startsWith('INSERT INTO order_addresses') || statement.startsWith('INSERT INTO order_creation_requests')) return [{ affectedRows: 1 }];
      if (statement.startsWith('SELECT id, order_no, total_amount')) return [[{ id: 15, order_no: 'SR1', total_amount: '598.00', pay_amount: '598.00', status: 'pending_payment' }]];
      throw new Error(`unexpected statement: ${statement}`);
    }
  };
  const repository = createMysqlOrderWriteRepository({ getConnection: async () => connection });
  const result = await repository.create(8, { productId: 3, addressId: 4, quantity: 2, idempotencyKey: 'order-create-key-0001', selectedColor: '', remark: '' });
  assert.deepEqual(result, { orderId: 15, orderNo: 'SR1', totalAmount: '598.00', payAmount: '598.00', status: 'pending_payment', idempotent: false });
  assert.equal(committed, 1); assert.equal(rolledBack, 0);
  assert.equal(sql.filter(({ statement }) => statement.startsWith('UPDATE products SET stock')).length, 1);
  assert.equal(sql.filter(({ statement }) => statement.startsWith('INSERT INTO order_creation_requests')).length, 1);
  await assert.rejects(() => repository.create(8, { productId: 3, addressId: 4, quantity: 1, couponId: 9, idempotencyKey: 'order-create-key-0002' }), /COUPON_NOT_READY/);
});

test('points-order writes use the signed customer and never accept a user id from the request', async (t) => {
  const calls = [];
  const pointsWrites = {
    create: async (userId, payload) => { calls.push({ kind: 'create', userId, payload }); return { orderId: 19, orderNo: 'SP1' }; },
    cancel: async (userId, orderId, reason) => { calls.push({ kind: 'cancel', userId, orderId, reason }); return { id: orderId, status: 'cancelled' }; }
  };
  const server = createServer({ sessionSecret: secret, pointsOrderWriteRepository: pointsWrites, sessionRepository: { active: async () => true } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const token = issueSession({ subject: 6, role: 'customer', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }; const base = `http://127.0.0.1:${server.address().port}`;
  const payload = { userId: 999, pointsProductId: 3, addressId: 7, quantity: 1, idempotencyKey: 'points-create-key-0001' };
  assert.equal((await fetch(`${base}/api/v1/points-orders`, { method: 'POST', headers, body: JSON.stringify(payload) })).status, 201);
  assert.equal((await fetch(`${base}/api/v1/points-orders/19`, { method: 'POST', headers, body: JSON.stringify({ cancelReason: '不需要了' }) })).status, 200);
  assert.deepEqual(calls, [{ kind: 'create', userId: 6, payload }, { kind: 'cancel', userId: 6, orderId: 19, reason: '不需要了' }]);
});

test('refund and logistics endpoints keep requests scoped to the signed customer', async (t) => {
  const calls = [];
  const refunds = {
    request: async (userId, payload) => { calls.push({ kind: 'request', userId, payload }); return { requestId: 4, status: 'pending_review' }; },
    list: async (userId, orderId) => { calls.push({ kind: 'list', userId, orderId }); return []; },
    waybill: async (userId, orderId, type) => { calls.push({ kind: 'waybill', userId, orderId, type }); return { waybillToken: 'token' }; }
  };
  const server = createServer({ sessionSecret: secret, refundRepository: refunds, sessionRepository: { active: async () => true } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = issueSession({ subject: 12, role: 'customer', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const body = { userId: 999, orderId: 8, reason: '不需要了', refundType: 'refund_only', idempotencyKey: 'refund-request-key-0001' };
  assert.equal((await fetch(`${base}/api/v1/refund-requests`, { method: 'POST', headers, body: JSON.stringify(body) })).status, 201);
  assert.equal((await fetch(`${base}/api/v1/refund-requests?orderId=8`, { headers })).status, 200);
  assert.equal((await fetch(`${base}/api/v1/orders/8/waybill?type=points`, { headers })).status, 200);
  assert.deepEqual(calls, [
    { kind: 'request', userId: 12, payload: body },
    { kind: 'list', userId: 12, orderId: '8' },
    { kind: 'waybill', userId: 12, orderId: 8, type: 'points' }
  ]);
});

test('gift-card redemption is scoped to the signed customer and supports pending-address completion', async (t) => {
  const calls = [];
  const gifts = {
    redeem: async (userId, payload) => { calls.push({ kind: 'redeem', userId, payload }); return { recordId: 7, fulfillmentStatus: 'pending_address' }; },
    confirmProductAddress: async (userId, recordId, addressId) => { calls.push({ kind: 'address', userId, recordId, addressId }); return { recordId, fulfillmentStatus: 'fulfilled' }; }
  };
  const server = createServer({ sessionSecret: secret, giftCardRepository: gifts, sessionRepository: { active: async () => true } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const token = issueSession({ subject: 18, role: 'customer', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }; const base = `http://127.0.0.1:${server.address().port}`;
  const payload = { userId: 999, code: 'GIFT-001' };
  assert.equal((await fetch(`${base}/api/v1/gift-cards/redeem`, { method: 'POST', headers, body: JSON.stringify(payload) })).status, 200);
  assert.equal((await fetch(`${base}/api/v1/gift-card-redemptions/7/address`, { method: 'POST', headers, body: JSON.stringify({ addressId: 3 }) })).status, 200);
  assert.deepEqual(calls, [{ kind: 'redeem', userId: 18, payload }, { kind: 'address', userId: 18, recordId: 7, addressId: 3 }]);
});

test('user-import preflight limits the scope and rejects missing identity data', () => {
  const users = [{ name: 'id', type: 'bigint' }, { name: 'status', type: 'varchar(20)' }, { name: 'openid', type: 'varchar(128)' }, { name: 'username', type: 'varchar(50)' }, { name: 'points', type: 'int' }];
  const result = evaluatePreflight({
    sourceUsers: users,
    targetUsers: users,
    targetIdentities: Object.assign([{ name: 'user_id' }, { name: 'provider' }, { name: 'provider_subject' }], { indexes: [{ name: 'uk_user_identities_provider_subject', unique: true, columns: ['provider', 'provider_subject'] }] }),
    sourceSummary: { total: 2, identityEligible: 1, identityMissing: 1, identityColumns: ['openid'] }
  });
  assert.deepEqual(result.importColumns, ['id', 'status', 'openid', 'username']);
  assert.deepEqual(result.blockers, ['SOURCE_USERS_WITHOUT_IDENTITY']);
  assert.equal(result.readyForIsolatedImport, false);
});

test('user-import preflight requires the identity unique key and compatible fields', () => {
  const sourceUsers = [{ name: 'id', type: 'bigint' }, { name: 'status', type: 'varchar(20)' }, { name: 'openid', type: 'varchar(128)' }];
  const targetUsers = [{ name: 'id', type: 'bigint' }, { name: 'status', type: 'varchar(20)' }, { name: 'openid', type: 'text' }];
  const result = evaluatePreflight({ sourceUsers, targetUsers, targetIdentities: Object.assign([{ name: 'user_id' }, { name: 'provider' }, { name: 'provider_subject' }], { indexes: [] }), sourceSummary: { total: 1, identityEligible: 1, identityMissing: 0, identityColumns: ['openid'] } });
  assert.deepEqual(result.typeMismatches, ['openid']);
  assert.deepEqual(result.blockers, ['TARGET_IDENTITY_UNIQUENESS_MISSING', 'USER_FIELD_TYPE_MISMATCH']);
});

test('user-import preflight accepts either order for the identity unique key', () => {
  const users = [{ name: 'id', type: 'bigint' }, { name: 'status', type: 'varchar(20)' }, { name: 'openid', type: 'varchar(128)' }];
  const result = evaluatePreflight({ sourceUsers: users, targetUsers: users, targetIdentities: Object.assign([{ name: 'user_id' }, { name: 'provider' }, { name: 'provider_subject' }], { indexes: [{ name: 'identity_reverse', unique: true, columns: ['provider_subject', 'provider'] }] }), sourceSummary: { total: 1, identityEligible: 1, identityMissing: 0, identityColumns: ['openid'] } });
  assert.equal(result.readyForIsolatedImport, true);
});

test('schema exporter accepts only controlled database and output arguments', () => {
  assert.equal(databaseIdentifier('cloud1-8gk3bptqefbf01d6'), 'cloud1-8gk3bptqefbf01d6');
  assert.throws(() => databaseIdentifier('source; DROP DATABASE source'), /Invalid/);
  assert.deepEqual(parseSchemaExportArguments(['--database', 'source_db', '--output', '/private/schema.json', '--apply']), { database: 'source_db', output: '/private/schema.json' });
  assert.throws(() => parseSchemaExportArguments(['--database', 'source_db', '--output', '/private/schema.json']), /Usage/);
});

test('schema rehearsal restores only dedicated databases in foreign-key order', () => {
  const tables = [
    { name: 'child', statement: 'CREATE TABLE child (id INT)' },
    { name: 'parent', statement: 'CREATE TABLE parent (id INT)' }
  ];
  assert.deepEqual(orderedTables(tables, [{ tableName: 'child', referencedTableName: 'parent' }]).map(({ name }) => name), ['parent', 'child']);
  assert.deepEqual(parseSchemaRestoreArguments(['--snapshot', '/private/source.json', '--database', 'sravx_rehearsal_20260917', '--apply']), { snapshot: '/private/source.json', database: 'sravx_rehearsal_20260917' });
  assert.throws(() => parseSchemaRestoreArguments(['--snapshot', '/private/source.json', '--database', 'production', '--apply']), /dedicated/);
  const plan = restorePlan({ format: 'sravx-source-schema/v1', schemaSettings: { characterSet: 'utf8mb4', collation: 'utf8mb4_unicode_ci' }, objects: { tables, foreignKeys: [{ tableName: 'child', referencedTableName: 'parent' }], views: [], routines: [], triggers: [], events: [] } });
  assert.deepEqual(plan.tables.map(({ name }) => name), ['parent', 'child']);
});

test('schema evidence comparison reports only structural mismatches', () => {
  const snapshot = { format: 'sravx-source-schema/v1', database: 'source', schemaSettings: { characterSet: 'utf8mb4', collation: 'utf8mb4_unicode_ci' }, objects: { tables: [{ name: 'users', statement: 'CREATE TABLE `users` (id INT)' }], views: [], routines: [], triggers: [], events: [], foreignKeys: [] }, metadata: { tables: [{ name: 'users' }], columns: [{ tableName: 'users', name: 'id', columnType: 'int' }], indexes: [{ tableName: 'users', name: 'PRIMARY' }], constraints: [{ tableName: 'users', name: 'PRIMARY', type: 'PRIMARY KEY' }] } };
  assert.deepEqual(compareSchemaEvidence(snapshot, { ...snapshot, database: 'rehearsal' }), { sourceSchema: 'source', targetSchema: 'rehearsal', matches: true, differences: [], representationDifferences: [] });
  const mismatched = structuredClone(snapshot);
  mismatched.objects.tables[0].statement = 'CREATE TABLE `users` (id BIGINT)';
  assert.equal(compareSchemaEvidence(snapshot, mismatched).matches, true);
  assert.deepEqual(compareSchemaEvidence(snapshot, mismatched).representationDifferences, [{ group: 'tables', name: 'users', reason: 'statement_digest_mismatch' }]);
  mismatched.metadata.columns[0].columnType = 'bigint';
  assert.deepEqual(compareSchemaEvidence(snapshot, mismatched).differences, [{ group: 'metadata', name: 'columns', reason: 'definition_digest_mismatch' }]);
});

test('user snapshot rejects unapproved data fields and duplicate identities', () => {
  assert.deepEqual(selectUserBaseColumns(['id', 'status', 'openid', 'username', 'avatar', 'points']), ['id', 'status', 'openid', 'username']);
  assert.deepEqual(identityBindings({ openid: 'open', _openid: 'other', unionid: 'union' }), [{ provider: 'wechat_miniprogram_openid', subject: 'open' }, { provider: 'wechat_unionid', subject: 'union' }]);
  assert.throws(() => validateSnapshot({ scope: 'users-basic-data-only', columns: ['id', 'status', 'openid', 'points'], rows: [] }), /unapproved/);
  assert.throws(() => validateSnapshot({ scope: 'users-basic-data-only', columns: ['id', 'status', 'openid'], rows: [{ id: 1, status: 'active', openid: 'same' }, { id: 2, status: 'active', openid: 'same' }] }), /reuses an identity/);
});

async function start() {
  const server = createServer({ sessionSecret: secret });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

test('public catalog starts empty and preserves the mini program response shapes', async (t) => {
  const { server, baseUrl } = await start();
  t.after(() => server.close());
  const [products, home, points] = await Promise.all([
    fetch(`${baseUrl}/api/v1/catalog/products?page=2&pageSize=12`),
    fetch(`${baseUrl}/api/v1/catalog/home`),
    fetch(`${baseUrl}/api/v1/catalog/points-products`)
  ]);
  assert.deepEqual(await products.json(), { success: true, data: [] });
  assert.deepEqual(await home.json(), { success: true, data: { products: [], categories: [] } });
  assert.deepEqual(await points.json(), { success: true, data: { products: [], categories: [] } });
});

test('json responses include baseline browser security headers', async (t) => {
  const { server, baseUrl } = await start();
  t.after(() => server.close());
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('content-security-policy'), "default-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('strict-transport-security'), null);
});

test('missing catalog records return a stable business error', async (t) => {
  const { server, baseUrl } = await start();
  t.after(() => server.close());
  const response = await fetch(`${baseUrl}/api/v1/catalog/products/9`);
  assert.equal(response.status, 404);
  assert.match(response.headers.get('x-request-id') || '', /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.deepEqual(await response.json(), {
    success: false,
    error: { code: 'PRODUCT_NOT_FOUND', message: '商品不存在' }
  });
});

test('unexpected route failures return a generic response without internal details', async (t) => {
  const catalogRepository = { listProducts: async () => { throw new Error('database endpoint and credentials must not reach clients'); } };
  const server = createServer({ sessionSecret: secret, catalogRepository });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/catalog/products`);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { success: false, error: { code: 'INTERNAL_ERROR', message: '服务暂不可用，请稍后重试' } });
});

test('each response receives a server-generated request identifier', async (t) => {
  const { server, baseUrl } = await start();
  t.after(() => server.close());
  const [first, second] = await Promise.all([
    fetch(`${baseUrl}/health`, { headers: { 'x-request-id': 'client-controlled-value' } }),
    fetch(`${baseUrl}/health`)
  ]);
  const firstId = first.headers.get('x-request-id') || '';
  const secondId = second.headers.get('x-request-id') || '';
  assert.match(firstId, /^[0-9a-f-]{36}$/i);
  assert.match(secondId, /^[0-9a-f-]{36}$/i);
  assert.notEqual(firstId, 'client-controlled-value');
  assert.notEqual(firstId, secondId);
});

test('audit records contain only a route group and operational request metadata', async (t) => {
  const lines = [];
  const server = createServer({ sessionSecret: secret, auditLogger: createRequestAuditLogger({ write: (line) => lines.push(JSON.parse(line)) }) });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const { port } = server.address();
  await fetch(`http://127.0.0.1:${port}/api/v1/tools/serial-should-not-log?phone=13800138000`, { headers: { authorization: 'Bearer should-not-log' } });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].event, 'api_request');
  assert.equal(lines[0].route, '/api/v1/tools');
  assert.equal(lines[0].method, 'GET');
  assert.equal(lines[0].statusCode, 404);
  assert.match(lines[0].requestId, /^[0-9a-f-]{36}$/i);
  assert.equal(Object.values(lines[0]).some((value) => String(value).includes('13800138000') || String(value).includes('should-not-log') || String(value).includes('serial-should-not-log')), false);
});

test('admin routes reject missing and non-admin sessions', async (t) => {
  const { server, baseUrl } = await start();
  t.after(() => server.close());
  const unauthenticated = await fetch(`${baseUrl}/api/v1/admin/products`);
  assert.equal(unauthenticated.status, 401);

  const customerToken = issueSession({ subject: 1, role: 'customer', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
  const forbidden = await fetch(`${baseUrl}/api/v1/admin/products`, { headers: { authorization: `Bearer ${customerToken}` } });
  assert.equal(forbidden.status, 403);
});

test('admin routes accept only an admin session before reporting unimplemented', async (t) => {
  const { server, baseUrl } = await start();
  t.after(() => server.close());
  const adminToken = issueSession({ subject: 9, role: 'admin', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
  const response = await fetch(`${baseUrl}/api/v1/admin/unknown`, { headers: { authorization: `Bearer ${adminToken}` } });
  assert.equal(response.status, 501);
  assert.equal((await response.json()).error.code, 'NOT_IMPLEMENTED');
});

test('login endpoint accepts only the configured service and hides upstream failure details', async (t) => {
  const loginService = { login: async (code) => {
    if (code === 'accepted-login-code') return { token: 'opaque-session-token', expiresAt: 1_800_000_000, user: { id: 1, role: 'customer' } };
    throw new Error('provider detail must not reach clients');
  } };
  const server = createServer({ sessionSecret: secret, loginService });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const success = await fetch(`${baseUrl}/api/v1/auth/wechat/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: 'accepted-login-code' }) });
  assert.equal(success.status, 200);
  assert.equal((await success.json()).data.user.id, 1);

  const failed = await fetch(`${baseUrl}/api/v1/auth/wechat/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: 'bad-code' }) });
  assert.equal(failed.status, 401);
  const failedBody = await failed.json();
  assert.equal(failedBody.error.code, 'LOGIN_FAILED');
  assert.doesNotMatch(JSON.stringify(failedBody), /provider detail/);
});

test('logout revokes only the authenticated session', async (t) => {
  let revoked;
  const server = createServer({
    sessionSecret: secret,
    sessionRepository: {
      active: async () => true,
      revoke: async (session) => { revoked = session; return true; }
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const token = issueSession({ subject: 52, role: 'customer', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/auth/session`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
  assert.equal(response.status, 200);
  assert.equal(revoked.userId, 52);
  assert.match(revoked.sessionId, /^[A-Za-z0-9_-]+$/);
});

test('administrator password hashes verify without retaining plaintext', async () => {
  const hash = await hashPassword('admin-password-123', Buffer.alloc(16, 7));
  assert.equal(await verifyPassword('admin-password-123', hash), true);
  assert.equal(await verifyPassword('wrong-password-123', hash), false);
  assert.doesNotMatch(hash, /admin-password-123/);
});

test('administrator login stores an independent administrator session', async () => {
  let storedSession;
  const service = createAdminLoginService({
    authenticate: async ({ username, password }) => username === 'operator' && password === 'admin-password-123' ? { id: 7, roles: ['catalog_editor'] } : null,
    createSession: async (session) => { storedSession = session; },
    sessionSecret: secret,
    now: () => 1_700_000_000
  });
  const result = await service.login({ username: 'operator', password: 'admin-password-123' });
  assert.equal(result.administrator.id, 7);
  assert.deepEqual(result.administrator.roles, ['catalog_editor']);
  assert.equal(storedSession.adminAccountId, 7);
});

test('administrator requests use the independent session repository', async (t) => {
  const server = createServer({
    sessionSecret: secret,
    sessionRepository: { active: async () => true },
    adminSessionRepository: { active: async () => false }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const token = issueSession({ subject: 7, role: 'admin', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/admin/products`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(response.status, 401);
});

test('media upload intent requires a current catalog editor and persists only a controlled intent', async (t) => {
  let stored;
  const server = createServer({
    sessionSecret: secret,
    adminSessionRepository: { active: async () => true },
    adminRepository: { hasRole: async ({ adminAccountId, roleCode }) => adminAccountId === 7 && roleCode === 'catalog_editor' },
    mediaIntentRepository: { create: async (value) => { stored = value; } },
    mediaSigner: { issuePutUrl: async (intent) => `https://upload.example.test/${intent.objectKey}` }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const token = issueSession({ subject: 7, role: 'admin', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/admin/media/upload-intents`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ mediaType: 'product', contentType: 'image/jpeg', byteSize: 42, sha256: 'c'.repeat(64) })
  });
  assert.equal(response.status, 201);
  assert.equal(stored.adminAccountId, 7);
  assert.match(stored.intent.objectKey, /^catalog\/products\/.+\.jpg$/);
  assert.equal((await response.json()).data.contentSha256, 'c'.repeat(64));
});

test('media upload intent rejects an administrator without the catalog role', async (t) => {
  const server = createServer({
    sessionSecret: secret,
    adminSessionRepository: { active: async () => true },
    adminRepository: { hasRole: async () => false },
    mediaIntentRepository: { create: async () => { throw new Error('must not persist'); } },
    mediaSigner: { issuePutUrl: async () => { throw new Error('must not sign'); } }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const token = issueSession({ subject: 8, role: 'admin', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/admin/media/upload-intents`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ mediaType: 'product', contentType: 'image/jpeg', byteSize: 42, sha256: 'c'.repeat(64) })
  });
  assert.equal(response.status, 403);
});

test('media confirmation verifies the object before changing the intent state', async (t) => {
  let confirmed;
  const intent = { id: '5c2973d3-8344-4d56-83c6-6ee73af60d05', objectKey: 'catalog/products/test.jpg', contentType: 'image/jpeg', byteSize: 42, expiresAt: new Date(Date.now() + 60_000) };
  const server = createServer({
    sessionSecret: secret,
    adminSessionRepository: { active: async () => true },
    adminRepository: { hasRole: async () => true },
    mediaSigner: { verifyObject: async (value) => assert.equal(value, intent) },
    mediaIntentRepository: { getPending: async () => intent, confirm: async ({ id }) => { confirmed = id; return true; } }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const token = issueSession({ subject: 7, role: 'admin', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/admin/media/upload-intents/${intent.id}/confirm`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
  assert.equal(response.status, 200);
  assert.equal(confirmed, intent.id);
});

test('media confirmation leaves the intent pending when object verification fails', async (t) => {
  const intent = { id: 'ca171ea2-89c0-49d9-86a2-b7ce9c7b11dc', objectKey: 'catalog/products/test.jpg', contentType: 'image/jpeg', byteSize: 42, expiresAt: new Date(Date.now() + 60_000) };
  const server = createServer({
    sessionSecret: secret,
    adminSessionRepository: { active: async () => true },
    adminRepository: { hasRole: async () => true },
    mediaSigner: { verifyObject: async () => { throw new Error('COS mismatch'); } },
    mediaIntentRepository: { getPending: async () => intent, confirm: async () => { throw new Error('must not confirm'); } }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const token = issueSession({ subject: 7, role: 'admin', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/admin/media/upload-intents/${intent.id}/confirm`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
  assert.equal(response.status, 409);
});

test('COS signer only signs the server-generated key and content type', async () => {
  let request;
  const signer = createCosUploadSigner({
    secretId: 'test-id', secretKey: 'test-key', bucket: 'sravx-1419382340', region: 'ap-shanghai',
    createClient: () => ({ getObjectUrl: (value, callback) => { request = value; callback(null, { Url: 'https://upload.example.test/signed' }); } })
  });
  const url = await signer.issuePutUrl({ objectKey: 'catalog/products/image.jpg', contentType: 'image/jpeg', expiresAt: new Date(Date.now() + 60_000) });
  assert.equal(url, 'https://upload.example.test/signed');
  assert.equal(request.Method, 'PUT');
  assert.equal(request.Sign, true);
  assert.deepEqual(request.Headers, { 'Content-Type': 'image/jpeg' });
  const downloadUrl = await signer.issueGetUrl('catalog/products/image.jpg', 60);
  assert.equal(downloadUrl, 'https://upload.example.test/signed');
  assert.equal(request.Method, 'GET');
  assert.equal(request.Expires, 60);
  await assert.rejects(signer.issueGetUrl('outside-catalog/image.jpg'), /controlled/);
});

test('profile route uses only the signed session subject', async (t) => {
  let requestedUserId;
  const userRepository = { getUserProfile: async (userId) => {
    requestedUserId = userId;
    return { id: userId, username: 'test-user', points: 0, total_points: 0 };
  } };
  const server = createServer({ sessionSecret: secret, userRepository });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const { port } = server.address();
  const token = issueSession({ subject: 27, role: 'customer', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/me?userId=999`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(response.status, 200);
  assert.equal(requestedUserId, 27);
  assert.equal((await response.json()).data.id, 27);
});

test('profile update uses the signed user and preserves the monthly limit response', async (t) => {
  let request;
  const server = createServer({ sessionSecret: secret, userRepository: { updateProfile: async (userId, input) => { request = { userId, input }; return { updated: false, nextAvailableDate: '2026-10-01' }; } } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const token = issueSession({ subject: 28, role: 'customer', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/me?userId=forged`, { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ username: '测试用户' }) });
  assert.equal(response.status, 409);
  assert.equal(request.userId, 28);
  assert.deepEqual(request.input, { username: '测试用户' });
  assert.equal((await response.json()).error.code, 'PROFILE_MONTHLY_LIMIT');
});

test('points route uses only the signed session subject', async (t) => {
  let requestedUserId;
  const userRepository = { getPoints: async (userId) => {
    requestedUserId = userId;
    return { points: 12, total_points: 36 };
  } };
  const server = createServer({ sessionSecret: secret, userRepository });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const { port } = server.address();
  const token = issueSession({ subject: 31, role: 'customer', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/me/points?userId=999`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(response.status, 200);
  assert.equal(requestedUserId, 31);
  assert.deepEqual((await response.json()).data, { points: 12, total_points: 36 });
});

test('points logs and membership routes use only the signed session subject', async (t) => {
  const calls = [];
  const server = createServer({ sessionSecret: secret, userRepository: {
    getPointsLogs: async (userId, query) => { calls.push(['logs', userId, query]); return []; },
    getMemberLevel: async (userId) => { calls.push(['membership', userId]); return { member_level: 2, total_points: 1200, total_spent: 0, order_count: 0 }; }
  } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const token = issueSession({ subject: 32, role: 'customer', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
  const headers = { authorization: `Bearer ${token}` };
  assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/api/v1/me/points/logs?page=2&pageSize=5&userId=forged`, { headers })).status, 200);
  const membership = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/me/membership?userId=forged`, { headers });
  assert.equal(membership.status, 200);
  assert.equal((await membership.json()).data.member_level, 2);
  assert.deepEqual(calls, [['logs', 32, { page: '2', pageSize: '5' }], ['membership', 32]]);
});

test('phone binding uses only the signed session subject and does not return the phone code', async (t) => {
  let request;
  const server = createServer({ sessionSecret: secret, phoneService: { bind: async (userId, code) => { request = { userId, code }; return { phone: '13800138000' }; } } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const token = issueSession({ subject: 34, role: 'customer', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/me/phone?userId=forged`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ code: 'phone-code-1234' }) });
  assert.equal(response.status, 200);
  assert.deepEqual(request, { userId: 34, code: 'phone-code-1234' });
  assert.doesNotMatch(JSON.stringify(await response.json()), /phone-code-1234/);
});

test('inquiry submission uses only the signed customer session and validates personal fields', async (t) => {
  let received;
  const server = createServer({ sessionSecret: secret, inquiryRepository: { submit: async (userId, input) => { received = { userId, input }; return { id: 9 }; } } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const token = issueSession({ subject: 41, role: 'customer', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const payload = { name: '咨询用户', gender: '女', scale: '个人工作室', phone: '13800138000', wechat: 'sravx', address: '上海', intention: '希望了解合作方式' };
  const response = await fetch(`${baseUrl}/api/v1/inquiries`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  assert.equal(response.status, 201);
  assert.deepEqual(received, { userId: 41, input: payload });
  const invalid = await fetch(`${baseUrl}/api/v1/inquiries`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ ...payload, phone: 'invalid' }) });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error.code, 'INVALID_REQUEST');
});

test('inquiry repository writes a new inquiry only through the signed user row', async () => {
  let call;
  const repository = createMysqlInquiryRepository({ execute: async (sql, values) => { call = { sql, values }; return [{ affectedRows: 1, insertId: 12 }]; } });
  const result = await repository.submit(7, { name: 'n', gender: 'g', scale: 's', phone: '13800138000', wechat: '', address: '', intention: '' });
  assert.deepEqual(result, { id: 12 });
  assert.match(call.sql, /FROM users u/);
  assert.deepEqual(call.values, ['n', 'g', 's', '13800138000', '', '', '', 7]);
});

test('login service issues a customer session only after a trusted identity exchange', async () => {
  let receivedRequest;
  let storedSession;
  const codeExchange = createWechatCodeExchange({
    appId: 'test-app-id',
    appSecret: 'test-app-secret',
    requestIdentity: async (request) => {
      receivedRequest = request;
      return { openid: 'openid-from-trusted-provider' };
    }
  });
  const login = createLoginService({
    codeExchange,
    resolveUser: async (identity) => {
      assert.equal(identity.openid, 'openid-from-trusted-provider');
      return { id: 42, role: 'customer' };
    },
    createSession: async (session) => { storedSession = session; },
    sessionSecret: secret,
    now: () => 1_700_000_000
  });
  const result = await login.login('valid-wechat-login-code');
  assert.equal(receivedRequest.code, 'valid-wechat-login-code');
  assert.equal(result.user.id, 42);
  assert.equal(result.expiresAt, 1_700_604_800);
  assert.equal(storedSession.userId, 42);
  assert.equal(storedSession.expiresAt, result.expiresAt);
  assert.match(result.token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
});

test('login service refuses a provider response without a trusted identity', async () => {
  const codeExchange = createWechatCodeExchange({
    appId: 'test-app-id',
    appSecret: 'test-app-secret',
    requestIdentity: async () => ({ error: 'invalid code' })
  });
  await assert.rejects(() => codeExchange.exchange('valid-wechat-login-code'), /valid user identity/);
});

test('session services reject unsafe configured lifetimes', () => {
  assert.throws(() => createLoginService({ codeExchange: { exchange: async () => ({}) }, resolveUser: async () => ({ id: 1 }), createSession: async () => {}, sessionSecret: secret, sessionTtlSeconds: 31 * 24 * 60 * 60 }), /30 days/);
  assert.throws(() => createAdminLoginService({ authenticate: async () => ({ id: 1 }), createSession: async () => {}, sessionSecret: secret, sessionTtlSeconds: 24 * 60 * 60 + 1 }), /24 hours/);
});

test('identity requester uses HTTPS and does not expose provider errors', async () => {
  let requestUrl;
  const requester = createWechatIdentityRequester({
    fetchImpl: async (url) => {
      requestUrl = new URL(url);
      return { ok: true, json: async () => ({ openid: 'openid-from-provider' }) };
    }
  });
  const identity = await requester({ appId: 'test-app-id', appSecret: 'test-app-secret', code: 'valid-wechat-login-code' });
  assert.equal(identity.openid, 'openid-from-provider');
  assert.equal(requestUrl.protocol, 'https:');
  assert.equal(requestUrl.searchParams.get('grant_type'), 'authorization_code');

  const rejectedRequester = createWechatIdentityRequester({
    fetchImpl: async () => ({ ok: true, json: async () => ({ errcode: 40029, errmsg: 'invalid code' }) })
  });
  await assert.rejects(() => rejectedRequester({ appId: 'test-app-id', appSecret: 'test-app-secret', code: 'valid-wechat-login-code' }), /upstream rejected login code/);
});

test('phone requester uses HTTPS, caches the access token, and returns only the verified phone', async () => {
  const requests = [];
  const requester = createWechatPhoneRequester({ appId: 'test-app-id', appSecret: 'test-app-secret', fetchImpl: async (url, options) => {
    requests.push({ url: new URL(url), options });
    if (url.pathname.endsWith('/token')) return { ok: true, json: async () => ({ access_token: 'opaque-token', expires_in: 7200 }) };
    return { ok: true, json: async () => ({ errcode: 0, phone_info: { phoneNumber: '13800138000' } }) };
  } });
  assert.equal(await requester('phone-code-1234'), '13800138000');
  assert.equal(await requester('phone-code-5678'), '13800138000');
  assert.equal(requests.filter((request) => request.url.pathname.endsWith('/token')).length, 1);
  assert.equal(requests[1].url.protocol, 'https:');
  assert.equal(requests[1].options.method, 'POST');
  assert.doesNotMatch(requests[1].options.body, /test-app-secret/);
});

test('phone service binds a verified phone only to an active signed user', async () => {
  let bound;
  const service = createPhoneService({ requestPhone: async () => '13800138000', bindPhone: async (userId, phone) => { bound = { userId, phone }; return true; } });
  assert.deepEqual(await service.bind(35, 'phone-code-1234'), { phone: '13800138000' });
  assert.deepEqual(bound, { userId: 35, phone: '13800138000' });
  await assert.rejects(() => createPhoneService({ requestPhone: async () => 'invalid', bindPhone: async () => true }).bind(35, 'phone-code-1234'), /invalid phone/);
});

test('user repository resolves an existing active user with bound SQL parameters', async () => {
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push('begin'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release: () => calls.push('release'),
    execute: async (sql, values) => {
      calls.push({ sql, values });
      if (sql.includes('FROM user_identities')) return [[]];
      if (sql.includes('FROM users')) return [[{ id: 11, status: 'active' }]];
      return [{ affectedRows: 1 }];
    }
  };
  const repository = createMysqlUserRepository({ getConnection: async () => connection });
  const user = await repository.resolveUser({ openid: 'trusted-openid', unionid: 'trusted-unionid' });
  assert.deepEqual(user, { id: 11, role: 'customer' });
  assert.deepEqual(calls[1].values, ['wechat_unionid', 'trusted-unionid', 'wechat_miniprogram_openid', 'trusted-openid']);
  assert.match(calls[1].sql, /FROM user_identities/);
  assert.deepEqual(calls[2].values, ['trusted-openid', 'trusted-unionid']);
  assert.match(calls[2].sql, /WHERE openid = \? OR/);
  assert.deepEqual(calls[3].values, [11, 'wechat_unionid', 'trusted-unionid']);
  assert.deepEqual(calls[4].values, [11, 'wechat_miniprogram_openid', 'trusted-openid']);
  assert.deepEqual(calls[5].values, [11]);
});

test('user repository creates a new user with the mandatory identity columns', async () => {
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push('begin'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release: () => calls.push('release'),
    execute: async (sql, values) => {
      calls.push({ sql, values });
      if (sql.startsWith('SELECT')) return [[]];
      return [{ insertId: 19 }];
    }
  };
  const repository = createMysqlUserRepository({ getConnection: async () => connection });
  const user = await repository.resolveUser({ openid: 'trusted-openid' });
  assert.deepEqual(user, { id: 19, role: 'customer' });
  assert.match(calls[3].sql, /openid, unionid, _openid, status, last_login_at/);
  assert.deepEqual(calls[3].values, ['trusted-openid', null, 'trusted-openid']);
  assert.deepEqual(calls[4].values, [19, 'wechat_miniprogram_openid', 'trusted-openid']);
});

test('user read repository scopes points logs and membership by user id', async () => {
  const calls = [];
  const repository = createMysqlUserRepository({ getConnection: async () => { throw new Error('not used'); }, execute: async (sql, values) => {
    calls.push({ sql, values });
    if (sql.includes('FROM points_logs')) return [[{ id: 1, change_type: 'bind', points: 10, balance: 10, order_id: null, remark: '绑定工具', created_at: '2026-09-15' }]];
    return [[{ total_points: 1200, total_spent: 0, order_count: 1 }]];
  } });
  const logs = await repository.getPointsLogs(33, { page: 2, pageSize: 999 });
  const membership = await repository.getMemberLevel(33);
  assert.equal(logs.length, 1);
  assert.deepEqual(membership, { member_level: 2, total_points: 1200, total_spent: 0, order_count: 1 });
  assert.match(calls[0].sql, /WHERE user_id = \?/);
  assert.doesNotMatch(calls[0].sql, /openid/);
  assert.deepEqual(calls[0].values, [33, 100, 100]);
  assert.deepEqual(calls[1].values, [33]);
});

test('user repository binds a verified phone only by server user id', async () => {
  let query;
  const repository = createMysqlUserRepository({ getConnection: async () => { throw new Error('not used'); }, execute: async (sql, values) => { query = { sql, values }; return [{ affectedRows: 1 }]; } });
  assert.equal(await repository.bindPhone(36, '13800138000'), true);
  assert.match(query.sql, /WHERE id = \? AND status = 'active'/);
  assert.doesNotMatch(query.sql, /openid/);
  assert.deepEqual(query.values, ['13800138000', 36]);
});

test('catalog repository binds filters and caps pagination without writing', async () => {
  const calls = [];
  const pool = { execute: async (sql, values = []) => {
    calls.push({ sql, values });
    return [[]];
  } };
  const repository = createMysqlCatalogRepository(pool);
  const products = await repository.listProducts({ categoryId: '7', keyword: '剪刀', page: 2, pageSize: 1000 });
  assert.deepEqual(products, []);
  assert.match(calls[0].sql, /p\.category_id = \?/);
  assert.match(calls[0].sql, /p\.name LIKE \?/);
  assert.deepEqual(calls[0].values, [7, '%剪刀%', '%剪刀%', '%剪刀%', 100, 100]);
  assert.match(calls[0].sql.trim(), /^SELECT\b/i);
});

test('catalog product detail loads only its ordered specifications', async () => {
  const calls = [];
  const pool = { execute: async (sql, values = []) => {
    calls.push({ sql, values });
    if (sql.includes('FROM products p')) return [[{ id: 8, name: '测试商品' }]];
    return [[{ name: '标准规格', sort_order: 1 }]];
  } };
  const repository = createMysqlCatalogRepository(pool);
  const product = await repository.getProduct(8);
  assert.deepEqual(product, { id: 8, name: '测试商品', specs: [{ name: '标准规格', sort_order: 1 }] });
  assert.deepEqual(calls[0].values, [8]);
  assert.deepEqual(calls[1].values, [8]);
  assert.match(calls[1].sql, /FROM product_specs WHERE product_id = \?/);
});

test('baseline utility accepts only explicit safe options and identifiers', () => {
  assert.equal(quoteIdentifier('order_items'), '`order_items`');
  assert.throws(() => quoteIdentifier('users; DROP TABLE users'), /Unsafe SQL identifier/);
  assert.deepEqual(parseArguments(['--database', 'sravx_pet', '--output', 'D:/controlled/baseline.json']), {
    database: 'sravx_pet', output: 'D:/controlled/baseline.json'
  });
  assert.throws(() => parseArguments(['--database', 'sravx_pet']), /Usage/);
});

test('row digest is stable for JSON key order and distinguishes null from empty values', () => {
  assert.equal(canonicalizeJson({ b: 2, a: [true, null] }), '{"a":[true,null],"b":2}');
  assert.notDeepEqual(encodeValue(null), encodeValue(''));
  const columns = [{ name: 'id', dataType: 'bigint' }, { name: 'payload', dataType: 'json' }];
  const left = digestRows([{ id: '1', payload: '{"b":2,"a":1}' }], columns);
  const right = digestRows([{ id: '1', payload: '{"a":1,"b":2}' }], columns);
  assert.equal(left, right);
});

test('row evidence comparator reports metadata and digest differences without business rows', () => {
  const source = { schema: 'source', tables: [{ table: 'users', primaryKey: ['id'], rowCount: 2, minimumPrimaryKey: 1, maximumPrimaryKey: 2, columns: ['id', 'openid'], chunks: [{ offset: 0, rowCount: 2, digest: 'a' }] }] };
  const target = { schema: 'target', tables: [{ table: 'users', primaryKey: ['id'], rowCount: 2, minimumPrimaryKey: 1, maximumPrimaryKey: 2, columns: ['id', 'openid'], chunks: [{ offset: 0, rowCount: 2, digest: 'a' }] }] };
  assert.deepEqual(compareRowEvidence(source, target), { sourceSchema: 'source', targetSchema: 'target', tablesCompared: 1, differences: [], matches: true });
  const mismatched = compareRowEvidence(source, { ...target, tables: [{ ...target.tables[0], chunks: [{ offset: 0, rowCount: 2, digest: 'b' }] }] });
  assert.equal(mismatched.matches, false);
  assert.deepEqual(mismatched.differences, [{ table: 'users', issue: 'CHUNK_DIGEST_MISMATCH' }]);
});

test('points catalog uses bound category filters and returns an empty compatible structure', async () => {
  const calls = [];
  const pool = { execute: async (sql, values = []) => {
    calls.push({ sql, values });
    return [[]];
  } };
  const repository = createMysqlCatalogRepository(pool);
  const result = await repository.listPointsProducts({ categoryId: '3' });
  assert.deepEqual(result, { products: [], categories: [], current_member_level: 1 });
  assert.match(calls[0].sql, /COALESCE\(pp\.category_id, p\.category_id\) = \?/);
  assert.deepEqual(calls[0].values, [3]);
  assert.match(calls[0].sql.trim(), /^SELECT\b/i);
});

test('address route reads only addresses owned by the signed session subject', async (t) => {
  let requestedUserId;
  const server = createServer({ sessionSecret: secret, addressRepository: { list: async (userId) => {
    requestedUserId = userId;
    return [];
  } } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const { port } = server.address();
  const token = issueSession({ subject: 44, role: 'customer', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/addresses?openid=forged`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(response.status, 200);
  assert.equal(requestedUserId, 44);
  assert.deepEqual((await response.json()).data, []);
});

test('payment creation uses only the authenticated customer and server path order id', async (t) => {
  let request;
  const server = createServer({ sessionSecret: secret, paymentOrderService: { create: async (userId, orderId) => { request = { userId, orderId }; return { package: 'prepay_id=test' }; } } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const token = issueSession({ subject: 44, role: 'customer', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/payments/wechat/orders/18`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ amountFen: 1, openid: 'forged' }) });
  assert.equal(response.status, 200);
  assert.deepEqual(request, { userId: 44, orderId: 18 });
});

test('address writes use only the signed session subject and validate the address', async (t) => {
  let created;
  const server = createServer({ sessionSecret: secret, addressRepository: { create: async (userId, input) => { created = { userId, input }; return { id: 18 }; } } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const token = issueSession({ subject: 44, role: 'customer', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/addresses`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ openid: 'forged', name: '收件人', phone: '13800138000', province: '江苏省', city: '苏州市', district: '吴中区', detail: '示例路 1 号', is_default: true }) });
  assert.equal(response.status, 201);
  assert.equal(created.userId, 44);
  assert.equal(created.input.contact, '收件人');
  assert.equal(created.input.isDefault, true);
  const invalid = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/addresses`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ name: '收件人' }) });
  assert.equal(invalid.status, 400);
});

test('address update and default reject records not owned by the signed user', async (t) => {
  const calls = [];
  const server = createServer({ sessionSecret: secret, addressRepository: { update: async (...value) => { calls.push(value); return false; }, setDefault: async (...value) => { calls.push(value); return false; } } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const token = issueSession({ subject: 45, role: 'customer', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
  const update = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/addresses/99`, { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ name: '收件人', phone: '13800138000', detail: '示例路 1 号' }) });
  const defaultAddress = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/addresses/99/default`, { method: 'PUT', headers: { authorization: `Bearer ${token}` } });
  assert.equal(update.status, 404);
  assert.equal(defaultAddress.status, 404);
  assert.equal(calls[0][0], 45);
  assert.equal(calls[0][1], 99);
  assert.deepEqual(calls[1], [45, 99]);
});

test('address repository joins users by the server-side user id', async () => {
  let query;
  const repository = createMysqlAddressRepository({ execute: async (sql, values) => {
    query = { sql, values };
    return [[]];
  } });
  assert.deepEqual(await repository.list(5), []);
  assert.match(query.sql, /INNER JOIN users u ON u\.openid = a\.openid/);
  assert.deepEqual(query.values, [5]);
  assert.match(query.sql.trim(), /^SELECT\b/i);
});

test('tool archive routes scope every operation to the signed user', async (t) => {
  const calls = [];
  const toolRepository = {
    list: async (userId) => { calls.push(['list', userId]); return []; },
    bind: async (userId, sn) => { calls.push(['bind', userId, sn]); return { id: 8, sn }; },
    get: async (userId, id) => { calls.push(['get', userId, id]); return null; },
    remove: async (userId, id) => { calls.push(['remove', userId, id]); return false; }
  };
  const server = createServer({ sessionSecret: secret, toolRepository });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const token = issueSession({ subject: 46, role: 'customer', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/api/v1/tools`, { headers })).status, 200);
  assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/api/v1/tools`, { method: 'POST', headers, body: JSON.stringify({ sn: 'sv-test-001' }) })).status, 201);
  assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/api/v1/tools/7?userId=forged`, { headers })).status, 404);
  assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/api/v1/tools/7`, { method: 'DELETE', headers })).status, 404);
  assert.deepEqual(calls, [['list', 46], ['bind', 46, 'SV-TEST-001'], ['get', 46, 7], ['remove', 46, 7]]);
});

test('tool warranty endpoint is read-only and scoped to the signed customer', async (t) => {
  const calls = [];
  const tools = { warranty: async (userId, sn) => { calls.push({ userId, sn }); return sn === 'SRAVX1234' ? { id: 4, sn, warranty_expire: '2027-01-01' } : null; } };
  const server = createServer({ sessionSecret: secret, sessionRepository: { active: async () => true }, toolRepository: tools });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const token = issueSession({ subject: 5, role: 'customer', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/tools/warranty?sn=SRAVX1234`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [{ userId: 5, sn: 'SRAVX1234' }]);
  const missing = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/tools/warranty?sn=OTHER1234`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(missing.status, 404);
});

test('tool repository locks the SN record before binding and never resolves legacy cloud images', async () => {
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push('begin'), commit: async () => calls.push('commit'), rollback: async () => calls.push('rollback'), release: () => calls.push('release'),
    execute: async (sql, values) => { calls.push({ sql, values }); if (/FROM scissors s/.test(sql)) return [[{ id: 3, sn: 'SV-TEST-001', model: 'Pro', points_value: 0, created_at: '2026-09-01T00:00:00Z', product_name: '测试工具', warranty_months: 12, card_image: 'cloud://legacy' }]]; if (/FROM user_scissors/.test(sql)) return [[]]; if (/FROM users WHERE id/.test(sql)) return [[{ points: 0, total_points: 0 }]]; if (/INSERT INTO user_scissors/.test(sql)) return [{ insertId: 7 }]; throw new Error(`Unexpected SQL ${sql}`); }
  };
  const repository = createMysqlToolRepository({ getConnection: async () => connection }, { now: () => new Date('2026-09-15T00:00:00Z') });
  const result = await repository.bind(4, 'SV-TEST-001');
  assert.equal(result.id, 7);
  assert.equal(result.card_image, '');
  assert.match(calls.find((item) => item.sql && /FROM scissors s/.test(item.sql)).sql, /FOR UPDATE/);
  assert.deepEqual(calls.filter((value) => typeof value === 'string'), ['begin', 'commit', 'release']);
});

test('after-sale routes only expose records belonging to the signed tool owner', async (t) => {
  const calls = [];
  const server = createServer({ sessionSecret: secret, toolRepository: { get: async (userId, id) => { calls.push(['tool', userId, id]); return id === 9 ? { id, sn: 'SV-TEST-001' } : null; } }, afterSaleRepository: { list: async (userId, id) => { calls.push(['list', userId, id]); return []; }, apply: async (userId, data) => { calls.push(['apply', userId, data]); return { id: 3, requestNo: 'AS20260915TEST' }; } } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const token = issueSession({ subject: 47, role: 'customer', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/api/v1/tools/9/after-sales`, { headers })).status, 200);
  assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/api/v1/tools/9/after-sales`, { method: 'POST', headers, body: JSON.stringify({ recipientAddressId: 4, serviceType: 'repair', description: '剪刀需要检修' }) })).status, 201);
  assert.deepEqual(calls, [['tool', 47, 9], ['list', 47, 9], ['apply', 47, { bindingId: 9, recipientAddressId: 4, serviceType: 'repair', description: '剪刀需要检修' }]]);
});

test('after-sale repository never selects recipient contact details for a user record list', async () => {
  const queries = [];
  const repository = createMysqlAfterSaleRepository({ getConnection: async () => { throw new Error('not used'); }, execute: async (sql, values) => { queries.push({ sql, values }); return [[]]; } });
  assert.deepEqual(await repository.list(3, 7), []);
  assert.doesNotMatch(queries[0].sql, /recipient_phone|recipient_address_text/);
  assert.match(queries[0].sql, /us\.user_id = \?/);
  assert.deepEqual(queries[0].values, [7, 3]);
});

test('order read routes scope list and detail to the signed user', async (t) => {
  const calls = [];
  const server = createServer({ sessionSecret: secret, orderReadRepository: { list: async (userId, query) => { calls.push(['list', userId, query]); return []; }, get: async (userId, query) => { calls.push(['get', userId, query]); return null; } } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const token = issueSession({ subject: 48, role: 'customer', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
  const headers = { authorization: `Bearer ${token}` };
  assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/api/v1/orders?status=pending&page=2&pageSize=5&userId=forged`, { headers })).status, 200);
  assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/api/v1/orders/9`, { headers })).status, 404);
  assert.deepEqual(calls, [['list', 48, { status: 'pending', page: '2', pageSize: '5' }], ['get', 48, { id: 9 }]]);
});

test('order read repository binds user scope and removes legacy cloud image identifiers', async () => {
  const calls = [];
  const repository = createMysqlOrderReadRepository({ execute: async (sql, values) => { calls.push({ sql, values }); if (/FROM orders o/.test(sql)) return [[{ id: 2, order_no: 'SO1' }]]; if (/FROM order_items/.test(sql)) return [[{ order_id: 2, product_name: '测试剪刀', product_image: 'cloud://legacy', quantity: 1 }]]; if (/FROM order_addresses/.test(sql)) return [[{ order_id: 2, province: '江苏', city: '苏州', district: '', detail: '示例路' }]]; if (/order_refund_requests/.test(sql)) return [[]]; throw new Error('unexpected query'); } });
  const data = await repository.list(5, { status: 'pending', page: 1, pageSize: 10 });
  assert.equal(data[0].product_image, '');
  assert.match(calls[0].sql, /o\.user_id = \?/);
  assert.equal(calls[0].values[0], 5);
});

test('points order read route scopes records to the signed user', async (t) => {
  let request;
  const server = createServer({ sessionSecret: secret, orderReadRepository: { listPoints: async (userId, query) => { request = { userId, query }; return { list: [], userAvailablePoints: 0 }; } } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const token = issueSession({ subject: 49, role: 'customer', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/points-orders?status=pending&page=2&pageSize=4&userId=forged`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(response.status, 200);
  assert.deepEqual(request, { userId: 49, query: { status: 'pending', page: '2', pageSize: '4' } });
});

test('gift card redemption records use only the signed customer identity', async (t) => {
  let request;
  const server = createServer({ sessionSecret: secret, giftCardReadRepository: { list: async (userId, query) => { request = { userId, query }; return []; } } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const token = issueSession({ subject: 50, role: 'customer', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/gift-card-redemptions?page=2&pageSize=4&userId=forged`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(response.status, 200);
  assert.deepEqual(request, { userId: 50, query: { page: '2', pageSize: '4' } });
});

test('gift card record repository scopes rows by user id and omits redemption codes', async () => {
  let query;
  const repository = createMysqlGiftCardReadRepository({ execute: async (sql, values) => { query = { sql, values }; return [[{ id: 8, gift_type: 'points', gift_title: '', gift_snapshot: '{"points":20}', fulfillment_status: 'fulfilled', order_id: null, order_no: null, user_coupon_id: null, points_change: 20, created_at: '2026-09-15' }]]; } });
  const records = await repository.list(51, { page: 1, pageSize: 99 });
  assert.equal(records[0].valueText, '+20 积分');
  assert.equal(Object.hasOwn(records[0], 'code'), false);
  assert.match(query.sql, /WHERE r\.user_id = \?/);
  assert.doesNotMatch(query.sql, /r\.code/);
  assert.deepEqual(query.values, [51, 50, 0]);
});

test('gift card readiness check rejects incomplete ownership and card links', async () => {
  const values = [
    [[{ totalRecords: 3, recordsWithoutUser: 1, recordsWithoutCard: 0, recordsWithoutCardId: 0 }], []],
    [[{ redeemedCardsWithoutRecord: 0 }], []],
    [[{ cardsWithMultipleRecords: 0 }], []]
  ];
  const result = await collectGiftCardIntegrity({ execute: async () => values.shift() });
  assert.equal(result.totalRecords, 3);
  assert.equal(result.readyForUserScopedReads, false);
});

test('media intent policy generates only controlled catalog keys', () => {
  const intent = createUploadIntent({ mediaType: 'product', contentType: 'image/webp', byteSize: 42, sha256: 'a'.repeat(64) }, new Date('2026-09-10T00:00:00Z'), 'intent-1');
  assert.deepEqual(intent, { id: 'intent-1', objectKey: 'catalog/products/intent-1.webp', contentType: 'image/webp', byteSize: 42, contentSha256: 'a'.repeat(64), expiresAt: new Date('2026-09-10T00:10:00Z') });
  assert.throws(() => createUploadIntent({ mediaType: 'product', contentType: 'image/gif', byteSize: 42, sha256: 'a'.repeat(64) }), /Unsupported/);
  assert.throws(() => createUploadIntent({ mediaType: 'banner', contentType: 'image/png', byteSize: 0, sha256: 'a'.repeat(64) }), /size/);
});

test('media intent repository persists only a server-generated intent', async () => {
  let query;
  const repository = createMysqlMediaIntentRepository({ execute: async (sql, values) => { query = { sql, values }; return [{ affectedRows: 1 }]; } });
  const intent = createUploadIntent({ mediaType: 'banner', contentType: 'image/png', byteSize: 42, sha256: 'b'.repeat(64) }, new Date('2026-09-10T00:00:00Z'), 'intent-2');
  assert.equal(await repository.create({ adminAccountId: 8, intent }), intent);
  assert.match(query.sql, /^INSERT INTO media_upload_intents/);
  assert.deepEqual(query.values.slice(0, 2), ['intent-2', 8]);
});


test('administrator catalog list endpoints require catalog editor and return repository output', async (t) => {
  const repository = { listCategories: async (query) => ({ list: [{ id: 1, name: '剪刀' }], total: 1, query }), listBanners: async () => ({ list: [], total: 0 }), listProducts: async () => ({ list: [], total: 0 }), getProduct: async (id) => ({ id: Number(id), specs: [] }) };
  const server = createServer({ sessionSecret: secret, adminSessionRepository: { active: async () => true }, adminRepository: { hasRole: async ({ adminAccountId, roleCode }) => adminAccountId === 7 && roleCode === 'catalog_editor' }, adminCatalogRepository: repository });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const token = issueSession({ subject: 7, role: 'admin', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/admin/categories?keyword=%E5%89%AA%E5%88%80&page=2`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.total, 1);
  assert.equal(body.data.query.keyword, '剪刀');
  assert.equal(body.data.query.page, '2');
});

test('administrator product stock update requires catalog editor and uses an exact non-negative quantity', async (t) => {
  const calls = [];
  const catalog = { restockProduct: async (id, stock) => { calls.push({ id, stock }); return id === 6 ? { id, stock } : null; } };
  const server = createServer({ sessionSecret: secret, adminSessionRepository: { active: async () => true }, adminRepository: { hasRole: async ({ roleCode }) => roleCode === 'catalog_editor' }, adminCatalogRepository: catalog });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const token = issueSession({ subject: 7, role: 'admin', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/admin/products/6/stock`, { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ stock: 24 }) });
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [{ id: 6, stock: 24 }]);
  const missing = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/admin/products/9/stock`, { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ stock: 1 }) });
  assert.equal(missing.status, 404);
});

test('administrator scissors inventory endpoints are catalog-scoped and exclude binding operations', async (t) => {
  const calls = [];
  const scissors = {
    listProducts: async () => [{ id: 3, name: '新商品', specs: [] }],
    listBatches: async () => ({ list: [], total: 0 }),
    list: async (query) => ({ list: [], total: 0, query }),
    detail: async () => ({ id: 9, sn: 'SRAVX1234', status: 'unused' }),
    createBatch: async (input) => { calls.push(input); return { batchNo: 'SN-TEST', count: 2, sampleSns: ['SRAVX1234'] }; },
    deleteUnused: async () => ({ deleted: 1, requested: 1 })
  };
  const server = createServer({ sessionSecret: secret, adminSessionRepository: { active: async () => true }, adminRepository: { hasRole: async ({ adminAccountId, roleCode }) => adminAccountId === 7 && roleCode === 'catalog_editor' }, adminScissorsRepository: scissors });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const token = issueSession({ subject: 7, role: 'admin', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const created = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/admin/scissors/batches`, { method: 'POST', headers, body: JSON.stringify({ product_id: 3, count: 2, points_value: 0 }) });
  assert.equal(created.status, 201);
  assert.deepEqual(calls[0], { productId: 3, specId: undefined, count: 2, pointsValue: 0, snLength: undefined, prefix: undefined, batchNo: undefined, produceDate: undefined, model: undefined });
  const detail = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/admin/scissors/9`, { headers });
  assert.equal(detail.status, 200);
  assert.deepEqual((await detail.json()).data.binding, null);
  const deniedToken = issueSession({ subject: 8, role: 'admin', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
  const denied = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/admin/scissors`, { headers: { authorization: `Bearer ${deniedToken}` } });
  assert.equal(denied.status, 403);
});

test('administrator overview returns only target catalog metrics', async (t) => {
  const overview = { users: { total: 0, active: 0 }, products: { total: 2, onSale: 1, lowStock: 1 }, orders: { total: 0, paid: 0, pending: 0, fulfilled: 0 }, gmv: { total: 0, week: 0 }, refunds: { pending: 0 }, coupons: { active: 0 }, scissors: { total: 0, unused: 0, bound: 0 }, banners: { online: 1 } };
  const server = createServer({ sessionSecret: secret, adminSessionRepository: { active: async () => true }, adminRepository: { hasRole: async () => true }, adminCatalogRepository: { overview: async () => overview } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const token = issueSession({ subject: 7, role: 'admin', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/admin/overview`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, overview);
});

test('administrator operations endpoints require their own role and never expose identities', async (t) => {
  const operations = {
    listUsers: async (query) => ({ list: [{ id: 3, username: 'A', phone: '13800138000' }], total: 1, query }),
    getUser: async (id) => ({ user: { id, username: 'A' }, addresses: [] }),
    listInquiries: async () => ({ list: [], total: 0 }),
    updateInquiryStatus: async (id, status) => id === 6 && status === 1
  };
  const server = createServer({ sessionSecret: secret, adminSessionRepository: { active: async () => true }, adminRepository: { hasRole: async ({ roleCode }) => roleCode === 'operations_manager' }, adminOperationsRepository: operations });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const token = issueSession({ subject: 7, role: 'admin', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
  const headers = { authorization: `Bearer ${token}` };
  const list = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/admin/users?keyword=A`, { headers });
  assert.equal(list.status, 200);
  assert.equal((await list.json()).data.list[0].id, 3);
  const update = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/admin/inquiries/6`, { method: 'PUT', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ status: 1 }) });
  assert.equal(update.status, 200);
  const bad = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/admin/inquiries/6`, { method: 'PUT', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ status: 9 }) });
  assert.equal(bad.status, 400);
});

test('administrator after-sale endpoints stay separate from shipping and financial actions', async (t) => {
  const calls = [];
  const afterSales = {
    list: async (query) => ({ list: [{ id: 4, request_no: 'AS1', sn: 'SN1' }], total: 1, query }),
    listServiceAddresses: async () => [],
    saveServiceAddress: async (id, input) => { calls.push({ kind: 'address', id, input }); return { id: id || 8 }; },
    reply: async (input) => { calls.push({ kind: 'reply', input }); return { id: input.id }; }
  };
  const server = createServer({ sessionSecret: secret, adminSessionRepository: { active: async () => true }, adminRepository: { hasRole: async ({ roleCode }) => roleCode === 'operations_manager' }, adminAfterSaleRepository: afterSales });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const token = issueSession({ subject: 7, role: 'admin', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const list = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/admin/after-sales?serviceType=repair`, { headers });
  assert.equal(list.status, 200); assert.equal((await list.json()).data.list[0].request_no, 'AS1');
  const address = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/admin/after-sale-service-addresses`, { method: 'POST', headers, body: JSON.stringify({ label: '售后中心', contact: '店员', phone: '13800138000', detail: '测试地址' }) });
  assert.equal(address.status, 201);
  const reply = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/admin/after-sales/4/messages`, { method: 'POST', headers, body: JSON.stringify({ content: '请寄回检测' }) });
  assert.equal(reply.status, 201);
  assert.deepEqual(calls.map((item) => item.kind), ['address', 'reply']);
  const shipment = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/admin/after-sales/4/shipment`, { method: 'POST', headers, body: '{}' });
  assert.equal(shipment.status, 501);
});

test('administrator operations repository applies bound filters and masks identity columns', async () => {
  const calls = [];
  const repository = createMysqlAdminOperationsRepository({ execute: async (sql, values = []) => { calls.push({ sql, values }); return sql.includes('COUNT(*)') ? [[{ total: 0 }]] : [[]]; } });
  assert.deepEqual(await repository.listUsers({ keyword: 'A', status: 'active', page: 2, pageSize: 999 }), { list: [], total: 0 });
  assert.match(calls[0].sql, /username LIKE \? OR phone LIKE \?/);
  assert.doesNotMatch(calls[0].sql, /openid|unionid|_openid/);
  assert.deepEqual(calls[0].values.slice(-2), [100, 100]);
  await assert.rejects(async () => repository.updateInquiryStatus(1, 3), /Invalid inquiry status/);
});

test('administrator catalog repository uses bound filters and keeps deleted rows out', async () => {
  const calls = [];
  const repository = createMysqlAdminCatalogRepository({ execute: async (sql, values = []) => { calls.push({ sql, values }); return sql.includes('COUNT(*)') ? [[{ total: 0 }]] : [[]]; } });
  assert.deepEqual(await repository.listProducts({ keyword: '剪刀', categoryId: '3', status: 1, sku: 'SKU', page: 2, pageSize: 999 }), { list: [], total: 0 });
  assert.match(calls[0].sql, /p\.deleted_at IS NULL/);
  assert.match(calls[0].sql, /p\.category_id = \?/);
  assert.match(calls[0].sql, /ps\.sku LIKE \?/);
  assert.deepEqual(calls[0].values.slice(-2), [100, 100]);
});


test('catalog write inputs require actual content and constrain banner link types', () => {
  assert.equal(categoryInput({ name: '剪刀', isShow: 1 }).name, '剪刀');
  assert.throws(() => categoryInput({ name: '' }), /name/);
  assert.equal(bannerInput({ title: '首页图', imageIntentId: '12345678-1234-1234-1234-123456789012', linkType: 'none' }).position, 'home');
  assert.throws(() => bannerInput({ title: 'x', imageIntentId: '12345678-1234-1234-1234-123456789012', linkType: 'unsafe' }), /linkType/);
});

test('administrator overview reports only target users, catalog and target serial counts', async () => {
  const calls = [];
  const results = [
    [[{ total: 52, active: 52 }]],
    [[{ total: 1, onSale: 1, lowStock: 0 }]],
    [[{ online: 1 }]],
    [[{ total: 2, unused: 2, bound: 0 }]]
  ];
  const repository = createMysqlAdminCatalogRepository({ execute: async (sql) => { calls.push(sql); return results.shift(); } });
  const overview = await repository.overview();
  assert.deepEqual(overview.users, { total: 52, active: 52 });
  assert.deepEqual(overview.scissors, { total: 2, unused: 2, bound: 0 });
  assert.deepEqual(overview.orders, { total: 0, paid: 0, pending: 0, fulfilled: 0 });
  assert.match(calls[0], /FROM users WHERE status <> 'deleted'/);
  assert.match(calls[3], /FROM scissors WHERE deleted_at IS NULL/);
});

test('category creation stores only a current admin confirmed category image key', async (t) => {
  let stored;
  const server = createServer({ sessionSecret: secret, adminSessionRepository: { active: async () => true }, adminRepository: { hasRole: async () => true }, mediaIntentRepository: { getConfirmed: async ({ id }) => id === '12345678-1234-1234-1234-123456789012' ? { objectKey: 'catalog/categories/a.png' } : null }, adminCatalogRepository: { createCategory: async (value) => { stored = value; return { id: 1 }; } } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const token = issueSession({ subject: 7, role: 'admin', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/admin/categories`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ name: '剪刀', image: { intentId: '12345678-1234-1234-1234-123456789012' } }) });
  assert.equal(response.status, 201); assert.equal(stored.image, 'catalog/categories/a.png');
  const reused = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/admin/categories`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ name: '无效分类', image: { existingObjectKey: 'catalog/categories/a.png' } }) });
  assert.equal(reused.status, 400);
});

test('category updates retain only their own confirmed media keys', async (t) => {
  let stored;
  const existing = { icon: 'catalog/categories/1/icon.png', image: 'catalog/categories/1/image.png' };
  const server = createServer({
    sessionSecret: secret,
    adminSessionRepository: { active: async () => true },
    adminRepository: { hasRole: async () => true },
    mediaIntentRepository: { getConfirmed: async ({ id }) => id === '12345678-1234-1234-1234-123456789012' ? { objectKey: 'catalog/categories/1/replacement.png' } : null },
    adminCatalogRepository: { getCategory: async () => existing, updateCategory: async (_id, value) => { stored = value; return true; } }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const token = issueSession({ subject: 7, role: 'admin', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
  const body = { name: '剪刀', icon: { existingObjectKey: existing.icon }, image: { intentId: '12345678-1234-1234-1234-123456789012' } };
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/admin/categories/1`, { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(response.status, 200);
  assert.equal(stored.icon, existing.icon);
  assert.equal(stored.image, 'catalog/categories/1/replacement.png');
  const forbidden = { ...body, icon: { existingObjectKey: 'catalog/categories/2/not-owned.png' } };
  const forbiddenResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/admin/categories/1`, { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(forbidden) });
  assert.equal(forbiddenResponse.status, 400);

  const clear = { name: '剪刀', icon: null };
  const clearResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/admin/categories/1`, { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(clear) });
  assert.equal(clearResponse.status, 200);
  assert.equal(stored.icon, null);
  assert.equal(stored.image, undefined);
});

test('product creation stores only confirmed product media keys for every image field', async (t) => {
  let stored;
  const ids = ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444'];
  const server = createServer({
    sessionSecret: secret,
    adminSessionRepository: { active: async () => true },
    adminRepository: { hasRole: async () => true },
    mediaIntentRepository: { getConfirmed: async ({ id }) => ids.includes(id) ? { objectKey: `catalog/products/${id}.png` } : null },
    adminCatalogRepository: { createProduct: async (value) => { stored = value; return { id: 1 }; } }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const token = issueSession({ subject: 7, role: 'admin', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
  const payload = {
    name: '宠物剪刀', price: 99, categoryId: 1, coverImageIntentId: ids[0], imageIntentIds: [ids[1]], detailImageIntentIds: [ids[2]], params: { '尺寸': '7 寸' }, stock: 3, warrantyMonths: 12, hasSpec: 1, isOnSale: 1, isRecommend: 0, allowCoupon: 1,
    shippingType: 'normal', shipDeadlineDays: 2, shippingPromise: '付款后 2 天内发货', shippingDelayReason: '现货', shippingNote: '工作日发货',
    specs: [{ name: '标准款', sku: 'S-1', imageIntentId: ids[3], price: 99, sortOrder: 1, shippingType: 'normal', shipDeadlineDays: 2, shippingPromise: '付款后 2 天内发货', shippingDelayReason: '现货', shippingNote: '工作日发货' }]
  };
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/admin/products`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  assert.equal(response.status, 201);
  assert.equal(stored.coverImage, `catalog/products/${ids[0]}.png`);
  assert.deepEqual(stored.images, [`catalog/products/${ids[1]}.png`]);
  assert.deepEqual(stored.detailImages, [`catalog/products/${ids[2]}.png`]);
  assert.equal(stored.specs[0].image, `catalog/products/${ids[3]}.png`);
});

test('product update retains only its own existing object keys and accepts confirmed replacements', async (t) => {
  let stored;
  const existing = {
    cover_image: 'catalog/products/1/cover.png',
    images: ['catalog/products/1/gallery.png'],
    detail_images: ['catalog/products/1/detail.png'],
    scissors_card_image: null,
    specs: [{ image: 'catalog/products/1/spec.png', card_image: null }]
  };
  const server = createServer({
    sessionSecret: secret,
    adminSessionRepository: { active: async () => true },
    adminRepository: { hasRole: async () => true },
    mediaIntentRepository: { getConfirmed: async ({ id }) => id === '55555555-5555-5555-5555-555555555555' ? { objectKey: 'catalog/products/1/replacement.png' } : null },
    adminCatalogRepository: {
      getProduct: async () => existing,
      updateProduct: async (_id, value) => { stored = value; return true; }
    }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const token = issueSession({ subject: 7, role: 'admin', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
  const base = {
    name: '宠物剪刀', price: 99, categoryId: 1, coverImage: { existingObjectKey: existing.cover_image }, images: [{ existingObjectKey: existing.images[0] }], detailImages: [{ intentId: '55555555-5555-5555-5555-555555555555' }], params: {}, stock: 3, warrantyMonths: 12, hasSpec: 1, isOnSale: 1, isRecommend: 0, allowCoupon: 1,
    shippingType: 'normal', shipDeadlineDays: 2, shippingPromise: '付款后 2 天内发货', shippingDelayReason: '现货', shippingNote: '工作日发货',
    specs: [{ name: '标准款', sku: 'S-1', image: { existingObjectKey: existing.specs[0].image }, cardImage: null, price: 99, sortOrder: 1, shippingType: 'normal', shipDeadlineDays: 2, shippingPromise: '付款后 2 天内发货', shippingDelayReason: '现货', shippingNote: '工作日发货' }]
  };
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/admin/products/1`, { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(base) });
  assert.equal(response.status, 200);
  assert.equal(stored.coverImage, existing.cover_image);
  assert.deepEqual(stored.images, existing.images);
  assert.deepEqual(stored.detailImages, ['catalog/products/1/replacement.png']);

  const forbidden = { ...base, images: [{ existingObjectKey: 'catalog/products/2/not-owned.png' }] };
  const forbiddenResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/admin/products/1`, { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(forbidden) });
  assert.equal(forbiddenResponse.status, 400);
});
test('readiness distinguishes an unavailable dependency from process liveness', async (t) => {
  const ready = createServer({ sessionSecret: secret, healthCheck: async () => {} });
  ready.listen(0, '127.0.0.1'); await once(ready, 'listening'); t.after(() => ready.close());
  const readyResponse = await fetch(`http://127.0.0.1:${ready.address().port}/readyz`);
  assert.equal(readyResponse.status, 200);
  assert.equal((await readyResponse.json()).data.status, 'ready');
  const unavailable = createServer({ sessionSecret: secret, healthCheck: async () => { throw new Error('database unavailable'); } });
  unavailable.listen(0, '127.0.0.1'); await once(unavailable, 'listening'); t.after(() => unavailable.close());
  const unavailableResponse = await fetch(`http://127.0.0.1:${unavailable.address().port}/readyz`);
  assert.equal(unavailableResponse.status, 503);
  assert.equal((await unavailableResponse.json()).error.code, 'NOT_READY');
});

test('administrator session introspection returns only the signed session identity and roles', async (t) => {
  const server = createServer({ sessionSecret: secret, adminSessionRepository: { active: async () => true }, adminRepository: { getRoles: async (id) => id === 7 ? ['catalog_editor'] : [] } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const token = issueSession({ subject: 7, role: 'admin', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/admin/auth/session`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data.administrator, { id: 7, roles: ['catalog_editor'] });
});

