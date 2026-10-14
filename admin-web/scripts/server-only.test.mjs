import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/lib/target-admin-auth.ts', import.meta.url), 'utf8');
function fixture(env = {}) {
  const calls = [], store = new Map();
  const compiled = stripTypeScriptTypes(source.replaceAll('import.meta.env', JSON.stringify(env))).replaceAll('export ', '');
  const context = vm.createContext({ Headers, sessionStorage: { getItem: k => store.get(k), setItem: (k,v) => store.set(k,v), removeItem: k => store.delete(k) }, fetch: async (url, init) => {
    calls.push({ url, init });
    return { ok: true, json: async () => ({ success: true, data: { token: 'synthetic-admin-session' } }) };
  } });
  vm.runInContext(compiled, context);
  return { context, calls, store };
}
test('unconfigured admin build always selects server catalog and operations', () => {
  const { context } = fixture();
  assert.equal(vm.runInContext('targetAdminModeEnabled()', context), true);
  assert.equal(vm.runInContext('targetAdminCatalogModeEnabled()', context), true);
  assert.equal(vm.runInContext('targetAdminOperationsModeEnabled()', context), true);
  assert.doesNotMatch(source, /VITE_ADMIN_(CATALOG|OPERATIONS)_MODE/);
});
test('admin login, session and logout use server API only', async () => {
  const { context, calls, store } = fixture();
  await vm.runInContext("targetAdminLogin('synthetic-user', 'synthetic-password')", context);
  assert.equal(await vm.runInContext('targetAdminLoggedIn()', context), true);
  await vm.runInContext('targetAdminLogout()', context);
  assert.deepEqual(calls.map(c => c.url), [
    '/api/v1/admin/auth/session',
    '/api/v1/admin/auth/session',
    '/api/v1/auth/session'
  ]);
  assert.equal(calls[1].init.headers.get('authorization'), 'Bearer synthetic-admin-session');
  assert.equal(store.size, 0);
});
test('shared business requests use same origin and retain authorization and payload', async () => {
  const { context, calls } = fixture();
  await vm.runInContext("targetAdminLogin('synthetic-user', 'synthetic-password')", context);
  await vm.runInContext("targetAdminRequest('/api/v1/admin/orders?status=refunding')", context);
  await vm.runInContext("targetAdminRequest('/api/v1/admin/products/7', {method:'PUT', headers:{'content-type':'application/json'}, body:JSON.stringify({name:'synthetic'})})", context);
  assert.equal(calls[1].url, '/api/v1/admin/orders?status=refunding');
  assert.equal(calls[2].url, '/api/v1/admin/products/7');
  assert.equal(calls[2].init.headers.get('authorization'), 'Bearer synthetic-admin-session');
  assert.equal(calls[2].init.headers.get('content-type'), 'application/json');
  assert.deepEqual(JSON.parse(calls[2].init.body), {name:'synthetic'});
});
test('explicit API override remains available to separately configured environments', async () => {
  const { context, calls } = fixture({ VITE_API_BASE_URL: 'https://fixture.invalid/' });
  await vm.runInContext("targetAdminRequest('/api/v1/admin/orders')", context);
  assert.equal(calls[0].url, 'https://fixture.invalid/api/v1/admin/orders');
});
test('retired adapter fails closed without importing or initializing old SDK', async () => {
  const retired = readFileSync(new URL('../src/lib/cloudbase.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(retired, /@cloudbase|tcb\.init|cloud1-|app\.callFunction|fetch\(/);
  const context = vm.createContext({});
  vm.runInContext(stripTypeScriptTypes(retired).replaceAll('export ', ''), context);
  await assert.rejects(vm.runInContext("callCloudFunction('giftCard', {action:'save'})", context), /本次操作未执行/);
});
