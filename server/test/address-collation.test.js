import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('every cross-table address identity join uses the same explicit binary collation', () => {
  for(const name of ['mysql-address-repository','mysql-order-write-repository','mysql-admin-operations-repository','mysql-after-sale-repository','mysql-gift-card-repository','mysql-structured-checkout-repository']) {
    const source = readFileSync(new URL('../src/repositories/'+name+'.js',import.meta.url),'utf8');
    assert.doesNotMatch(source, /u\.openid\s*=\s*a\.openid/, name);
    assert.match(source, /u\.openid COLLATE utf8mb4_bin = a\.openid COLLATE utf8mb4_bin/, name);
    assert.match(source, /u\.id\s*=\s*\?/, name+' must retain server user ownership');
  }
});
