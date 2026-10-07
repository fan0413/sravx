export function usesBusinessDatabaseForPaymentInbound(environment) {
  return environment.PAYMENT_CALLBACK_ENABLED === 'true' && (environment.PAYMENT_INBOUND_USE_BUSINESS_DATABASE === 'true' || environment.PAYMENT_INBOUND_REHEARSAL === 'true');
}
