function required(environment, name) {
  const value = environment[name];
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} must be configured.`);
  return value;
}

export function paymentInboundConfiguration(environment) {
  const configuration = {
    host: required(environment, 'PAYMENT_INBOUND_MYSQL_HOST'),
    port: Number(required(environment, 'PAYMENT_INBOUND_MYSQL_PORT')),
    user: required(environment, 'PAYMENT_INBOUND_MYSQL_USER'),
    password: required(environment, 'PAYMENT_INBOUND_MYSQL_PASSWORD'),
    database: required(environment, 'PAYMENT_INBOUND_MYSQL_DATABASE')
  };
  const usesBusinessDatabase = configuration.database === required(environment, 'MYSQL_DATABASE') && configuration.host === required(environment, 'MYSQL_HOST');
  if (usesBusinessDatabase && environment.PAYMENT_INBOUND_REHEARSAL !== 'true') {
    throw new Error('PAYMENT_INBOUND_MYSQL must use a database separate from the business database. Set PAYMENT_INBOUND_REHEARSAL=true only for an approved rehearsal.');
  }
  return Object.freeze({ ...configuration, rehearsal: usesBusinessDatabase });
}
