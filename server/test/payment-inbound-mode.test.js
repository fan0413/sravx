import assert from 'node:assert/strict';
import test from 'node:test';
import { usesBusinessDatabaseForPaymentInbound } from '../src/payments/payment-inbound-mode.js';

test('business database reuse is limited to an explicitly enabled owner configuration', () => {
  assert.equal(usesBusinessDatabaseForPaymentInbound({ PAYMENT_CALLBACK_ENABLED: 'false', PAYMENT_INBOUND_USE_BUSINESS_DATABASE: 'true' }), false);
  assert.equal(usesBusinessDatabaseForPaymentInbound({ PAYMENT_CALLBACK_ENABLED: 'true', PAYMENT_INBOUND_USE_BUSINESS_DATABASE: 'false' }), false);
  assert.equal(usesBusinessDatabaseForPaymentInbound({ PAYMENT_CALLBACK_ENABLED: 'true', PAYMENT_INBOUND_USE_BUSINESS_DATABASE: 'true' }), true);
  assert.equal(usesBusinessDatabaseForPaymentInbound({ PAYMENT_CALLBACK_ENABLED: 'true', PAYMENT_INBOUND_REHEARSAL: 'true' }), true);
});
