export function isPaymentInboundRehearsal(environment) {
  return environment.PAYMENT_CALLBACK_ENABLED === 'true' && environment.PAYMENT_INBOUND_REHEARSAL === 'true';
}
