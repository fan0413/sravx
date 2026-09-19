import assert from 'node:assert/strict';
import test from 'node:test';
import { isPaymentInboundRehearsal } from '../src/payments/payment-inbound-mode.js';

test('business database reuse is limited to an explicitly enabled callback rehearsal', () => {
  assert.equal(isPaymentInboundRehearsal({ PAYMENT_CALLBACK_ENABLED: 'false', PAYMENT_INBOUND_REHEARSAL: 'true' }), false);
  assert.equal(isPaymentInboundRehearsal({ PAYMENT_CALLBACK_ENABLED: 'true', PAYMENT_INBOUND_REHEARSAL: 'false' }), false);
  assert.equal(isPaymentInboundRehearsal({ PAYMENT_CALLBACK_ENABLED: 'true', PAYMENT_INBOUND_REHEARSAL: 'true' }), true);
});
