import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createServer } from '../src/server.js';
import { createLoginService } from '../src/auth/login-service.js';
import { createWechatCodeExchange } from '../src/auth/wechat-code-exchange.js';
import { createWechatIdentityRequester } from '../src/auth/wechat-identity-requester.js';
import { createMysqlUserRepository } from '../src/repositories/mysql-user-repository.js';
import { createMysqlCatalogRepository } from '../src/repositories/mysql-catalog-repository.js';
import { parseArguments, quoteIdentifier } from '../scripts/row-baseline.mjs';
import { canonicalizeJson, digestRows, encodeValue } from '../scripts/row-chunks.mjs';
import { createMysqlAddressRepository } from '../src/repositories/mysql-address-repository.js';
import { issueSession } from '../src/security/session.js';
import { createUploadIntent } from '../src/media/upload-policy.js';
import { createMysqlMediaIntentRepository } from '../src/repositories/mysql-media-intent-repository.js';
import { createCosUploadSigner } from '../src/media/cos-upload-signer.js';
import { hashPassword, verifyPassword } from '../src/security/password.js';
import { createAdminLoginService } from '../src/auth/admin-login-service.js';

const secret = 'test-only-session-secret-which-is-long-enough-123456';

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

test('missing catalog records return a stable business error', async (t) => {
  const { server, baseUrl } = await start();
  t.after(() => server.close());
  const response = await fetch(`${baseUrl}/api/v1/catalog/products/9`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    success: false,
    error: { code: 'PRODUCT_NOT_FOUND', message: '商品不存在' }
  });
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
  const response = await fetch(`${baseUrl}/api/v1/admin/products`, { headers: { authorization: `Bearer ${adminToken}` } });
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
