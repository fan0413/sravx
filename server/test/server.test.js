import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createServer } from '../src/server.js';
import { createLoginService } from '../src/auth/login-service.js';
import { createWechatCodeExchange } from '../src/auth/wechat-code-exchange.js';
import { createWechatIdentityRequester } from '../src/auth/wechat-identity-requester.js';
import { createMysqlUserRepository } from '../src/repositories/mysql-user-repository.js';
import { createMysqlCatalogRepository } from '../src/repositories/mysql-catalog-repository.js';
import { createMysqlAdminCatalogRepository } from '../src/repositories/mysql-admin-catalog-repository.js';
import { parseArguments, quoteIdentifier } from '../scripts/row-baseline.mjs';
import { canonicalizeJson, digestRows, encodeValue } from '../scripts/row-chunks.mjs';
import { createMysqlAddressRepository } from '../src/repositories/mysql-address-repository.js';
import { createMysqlToolRepository } from '../src/repositories/mysql-tool-repository.js';
import { issueSession } from '../src/security/session.js';
import { createUploadIntent } from '../src/media/upload-policy.js';
import { createMysqlMediaIntentRepository } from '../src/repositories/mysql-media-intent-repository.js';
import { createCosUploadSigner } from '../src/media/cos-upload-signer.js';
import { bannerInput, categoryInput, productInput } from '../src/media/admin-catalog-input.js';
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

test('administrator overview returns only target catalog metrics', async (t) => {
  const overview = { users: { total: 0, active: 0 }, products: { total: 2, onSale: 1, lowStock: 1 }, orders: { total: 0, paid: 0, pending: 0, fulfilled: 0 }, gmv: { total: 0, week: 0 }, refunds: { pending: 0 }, coupons: { active: 0 }, scissors: { total: 0, unused: 0, bound: 0 }, banners: { online: 1 } };
  const server = createServer({ sessionSecret: secret, adminSessionRepository: { active: async () => true }, adminRepository: { hasRole: async () => true }, adminCatalogRepository: { overview: async () => overview } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const token = issueSession({ subject: 7, role: 'admin', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/admin/overview`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, overview);
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

test('category creation stores only a current admin confirmed category image key', async (t) => {
  let stored;
  const server = createServer({ sessionSecret: secret, adminSessionRepository: { active: async () => true }, adminRepository: { hasRole: async () => true }, mediaIntentRepository: { getConfirmed: async ({ id }) => id === '12345678-1234-1234-1234-123456789012' ? { objectKey: 'catalog/categories/a.png' } : null }, adminCatalogRepository: { createCategory: async (value) => { stored = value; return { id: 1 }; } } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const token = issueSession({ subject: 7, role: 'admin', expiresAt: Math.floor(Date.now() / 1000) + 60 }, secret);
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/admin/categories`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ name: '剪刀', imageIntentId: '12345678-1234-1234-1234-123456789012' }) });
  assert.equal(response.status, 201); assert.equal(stored.image, 'catalog/categories/a.png');
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

