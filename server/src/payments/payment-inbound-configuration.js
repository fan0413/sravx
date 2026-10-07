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
  // A separate inbound database remains the preferred deployment. The business
  // database is allowed only when its owner has explicitly chosen that topology.
  // The legacy rehearsal flag is accepted temporarily so an existing deployment
  // remains bootable until its environment file is updated.
  const businessDatabaseApproved = environment.PAYMENT_INBOUND_USE_BUSINESS_DATABASE === 'true' || environment.PAYMENT_INBOUND_REHEARSAL === 'true';
  if (usesBusinessDatabase && !businessDatabaseApproved) {
    throw new Error('PAYMENT_INBOUND_MYSQL must use a separate database unless PAYMENT_INBOUND_USE_BUSINESS_DATABASE=true is explicitly configured.');
  }
  return Object.freeze({ ...configuration, usesBusinessDatabase });
}
