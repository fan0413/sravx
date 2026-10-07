import assert from 'node:assert/strict';
import test from 'node:test';
import { paymentInboundConfiguration } from '../src/payments/payment-inbound-configuration.js';

const environment = Object.freeze({
  MYSQL_HOST: 'business-db', MYSQL_DATABASE: 'business',
  PAYMENT_INBOUND_MYSQL_HOST: 'business-db', PAYMENT_INBOUND_MYSQL_PORT: '3306', PAYMENT_INBOUND_MYSQL_USER: 'ingress', PAYMENT_INBOUND_MYSQL_PASSWORD: 'test-only', PAYMENT_INBOUND_MYSQL_DATABASE: 'business'
});

test('business database inbound storage requires an explicit owner choice', () => {
  assert.throws(() => paymentInboundConfiguration(environment), /PAYMENT_INBOUND_USE_BUSINESS_DATABASE=true/);
  assert.deepEqual(paymentInboundConfiguration({ ...environment, PAYMENT_INBOUND_USE_BUSINESS_DATABASE: 'true' }), {
    host: 'business-db', port: 3306, user: 'ingress', password: 'test-only', database: 'business', usesBusinessDatabase: true
  });
  assert.equal(paymentInboundConfiguration({ ...environment, PAYMENT_INBOUND_REHEARSAL: 'true' }).usesBusinessDatabase, true);
});

test('a dedicated inbound database is allowed without rehearsal mode', () => {
  const configuration = paymentInboundConfiguration({ ...environment, PAYMENT_INBOUND_MYSQL_DATABASE: 'payment_inbound' });
  assert.equal(configuration.usesBusinessDatabase, false);
});
