import assert from 'node:assert/strict';
import test from 'node:test';
import { loadWechatPayPlatformCertificates, parseWechatPayPlatformCertificates } from '../src/payments/wechatpay-platform-certificates.js';

const pem = '-----BEGIN PUBLIC KEY-----\nMIIB\n-----END PUBLIC KEY-----';

test('platform certificates are loaded from a restricted JSON file format', async () => {
  const certificates = await loadWechatPayPlatformCertificates('/secure/platform-certificates.json', {
    read: async () => JSON.stringify({ PLATFORM_SERIAL_1: pem })
  });
  assert.deepEqual(certificates, { PLATFORM_SERIAL_1: pem });
});

test('platform certificate loader rejects malformed or unsafe entries', () => {
  assert.throws(() => parseWechatPayPlatformCertificates('{bad', 'test'));
  assert.throws(() => parseWechatPayPlatformCertificates(JSON.stringify({ 'bad serial': pem }), 'test'));
  assert.throws(() => parseWechatPayPlatformCertificates(JSON.stringify({ SERIAL: 'not a PEM' }), 'test'));
});
