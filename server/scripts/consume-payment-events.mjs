import fs from 'node:fs';
import mysql from 'mysql2/promise';
import { createMysqlPaymentInboundRepository } from '../src/repositories/mysql-payment-inbound-repository.js';
import { createMysqlPaymentSettlementRepository } from '../src/repositories/mysql-payment-settlement-repository.js';
import { createPaymentEventConsumer } from '../src/payments/payment-event-consumer.js';

function load(path) {
  return Object.fromEntries(fs.readFileSync(path, 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => {
    const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1)];
  }));
}

const mysqlSettings = load('/home/deploy/.config/sravx/mysql.env');
const paymentSettings = load('/home/deploy/.config/sravx/payment.env');
if (paymentSettings.PAYMENT_CONSUMER_ENABLED !== 'true') throw new Error('PAYMENT_CONSUMER_ENABLED must be true.');
if (paymentSettings.PAYMENT_INBOUND_USE_BUSINESS_DATABASE !== 'true' && paymentSettings.PAYMENT_INBOUND_REHEARSAL !== 'true') throw new Error('This controlled runner requires explicit approval to use the business database for payment inbound events.');
const pool = mysql.createPool({ host: mysqlSettings.MYSQL_HOST, port: Number(mysqlSettings.MYSQL_PORT), user: mysqlSettings.MYSQL_APP_USER, password: mysqlSettings.MYSQL_APP_PASSWORD, database: mysqlSettings.MYSQL_DATABASE, connectionLimit: 2 });
try {
  const consumer = createPaymentEventConsumer({ inboundRepository: createMysqlPaymentInboundRepository(pool), settlementRepository: createMysqlPaymentSettlementRepository(pool), apiV3Key: paymentSettings.WECHAT_PAY_API_V3_KEY, inboundEncryptionKey: paymentSettings.PAYMENT_INBOUND_ENCRYPTION_KEY });
  const result = await consumer.consumeOne();
  console.log(JSON.stringify(result));
} finally { await pool.end(); }
