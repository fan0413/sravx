import { createLoginService } from './auth/login-service.js';
import { createWechatCodeExchange } from './auth/wechat-code-exchange.js';
import { createWechatIdentityRequester } from './auth/wechat-identity-requester.js';
import { createWechatPhoneRequester } from './auth/wechat-phone-requester.js';
import { createPhoneService } from './auth/phone-service.js';
import { createMysqlUserRepository } from './repositories/mysql-user-repository.js';
import { createMysqlCatalogRepository } from './repositories/mysql-catalog-repository.js';
import { createPublicCatalogRepository } from './media/public-catalog.js';
import { createMysqlAddressRepository } from './repositories/mysql-address-repository.js';
import { createMysqlToolRepository } from './repositories/mysql-tool-repository.js';
import { createMysqlAfterSaleRepository } from './repositories/mysql-after-sale-repository.js';
import { createMysqlOrderReadRepository } from './repositories/mysql-order-read-repository.js';
import { createMysqlGiftCardReadRepository } from './repositories/mysql-gift-card-read-repository.js';
import { createMysqlSessionRepository } from './repositories/mysql-session-repository.js';
import { createMysqlAdminRepository } from './repositories/mysql-admin-repository.js';
import { createMysqlAdminSessionRepository } from './repositories/mysql-admin-session-repository.js';
import { createMysqlMediaIntentRepository } from './repositories/mysql-media-intent-repository.js';
import { createMysqlAdminCatalogRepository } from './repositories/mysql-admin-catalog-repository.js';
import { createMysqlAdminPointsProductRepository } from './repositories/mysql-admin-points-product-repository.js';
import { createMysqlAdminOperationsRepository } from './repositories/mysql-admin-operations-repository.js';
import { createMysqlAdminOrderRepository } from './repositories/mysql-admin-order-repository.js';
import { createMysqlAdminScissorsRepository } from './repositories/mysql-admin-scissors-repository.js';
import { createMysqlAdminAfterSaleRepository } from './repositories/mysql-admin-after-sale-repository.js';
import { createMysqlInquiryRepository } from './repositories/mysql-inquiry-repository.js';
import { createMysqlCouponRepository } from './repositories/mysql-coupon-repository.js';
import { createMysqlPaymentInboundRepository } from './repositories/mysql-payment-inbound-repository.js';
import { createMysqlPaymentSettlementRepository } from './repositories/mysql-payment-settlement-repository.js';
import { createWechatPayCallbackService, createWechatPayCertificateProvider } from './payments/wechatpay-callback.js';
import { loadWechatPayPlatformCertificates } from './payments/wechatpay-platform-certificates.js';
import { paymentInboundConfiguration } from './payments/payment-inbound-configuration.js';
import { usesBusinessDatabaseForPaymentInbound } from './payments/payment-inbound-mode.js';
import { createWechatPayJsapiClient } from './payments/wechatpay-jsapi-client.js';
import { createWechatPayRequester } from './payments/wechatpay-requester.js';
import { createWechatPayRefundClient } from './payments/wechatpay-refund-client.js';
import { createWechatPayRefundRequester } from './payments/wechatpay-refund-requester.js';
import { createRefundExecutionService } from './payments/refund-execution-service.js';
import { createPaymentOrderService } from './payments/payment-order-service.js';
import { createPaymentEventConsumer } from './payments/payment-event-consumer.js';
import { createPaymentEventWorker } from './payments/payment-event-worker.js';
import { createMysqlPaymentOrderRepository } from './repositories/mysql-payment-order-repository.js';
import { createMysqlOrderWriteRepository } from './repositories/mysql-order-write-repository.js';
import { createMysqlStructuredCheckoutRepository } from './repositories/mysql-structured-checkout-repository.js';
import { createMysqlPointsOrderWriteRepository } from './repositories/mysql-points-order-write-repository.js';
import { createMysqlRefundRepository } from './repositories/mysql-refund-repository.js';
import { createMysqlGiftCardRepository } from './repositories/mysql-gift-card-repository.js';
import { createAdminLoginService } from './auth/admin-login-service.js';
import { createCosUploadSigner } from './media/cos-upload-signer.js';
import { createRequestAuditLogger } from './observability/request-audit.js';
import { createServer } from './server.js';

function required(environment, name) {
  const value = environment[name];
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} must be configured.`);
  return value;
}

async function createOptionalCosSigner(environment) {
  const names = ['COS_SECRET_ID', 'COS_SECRET_KEY', 'COS_BUCKET', 'COS_REGION'];
  const values = names.map((name) => environment[name]);
  if (values.every((value) => typeof value !== 'string' || value.trim() === '')) return null;
  for (const name of names) required(environment, name);
  const { default: COS } = await import('cos-nodejs-sdk-v5');
  return createCosUploadSigner({
    secretId: environment.COS_SECRET_ID,
    secretKey: environment.COS_SECRET_KEY,
    bucket: environment.COS_BUCKET,
    region: environment.COS_REGION,
    createClient: (options) => new COS(options)
  });
}

async function createOptionalPaymentCallbackService(environment, inboundRepository) {
  if (environment.PAYMENT_CALLBACK_ENABLED !== 'true') return null;
  const certificates = await loadWechatPayPlatformCertificates(required(environment, 'WECHAT_PAY_PLATFORM_CERTIFICATES_PATH'));
  return createWechatPayCallbackService({
    certificateProvider: createWechatPayCertificateProvider(certificates),
    inboundRepository,
    apiV3Key: required(environment, 'WECHAT_PAY_API_V3_KEY'),
    inboundEncryptionKey: required(environment, 'PAYMENT_INBOUND_ENCRYPTION_KEY')
  });
}

function createOptionalPaymentOrderService(environment, pool) {
  if (environment.PAYMENT_ORDERS_ENABLED !== 'true') return null;
  const client = createWechatPayJsapiClient({
    appId: required(environment, 'WECHAT_MINIPROGRAM_APP_ID'), mchId: required(environment, 'WECHAT_PAY_MCH_ID'),
    merchantSerialNo: required(environment, 'WECHAT_PAY_MERCHANT_SERIAL_NO'), merchantPrivateKeyPath: required(environment, 'WECHAT_PAY_MERCHANT_PRIVATE_KEY_PATH'),
    request: createWechatPayRequester()
  });
  const orderRepository = createMysqlPaymentOrderRepository(pool);
  return createPaymentOrderService({
    loadPayableOrder: orderRepository.loadPayableOrder,
    loadPayablePointsOrder: orderRepository.loadPayablePointsOrder,
    createTransaction: client,
    notifyUrl: required(environment, 'WECHAT_PAY_NOTIFY_URL')
  });
}

function createOptionalPaymentEventWorker(environment, inboundRepository, businessPool) {
  if (environment.PAYMENT_CALLBACK_ENABLED !== 'true' || environment.PAYMENT_CONSUMER_ENABLED !== 'true') return null;
  if (!inboundRepository) throw new Error('PAYMENT_CONSUMER_ENABLED requires payment inbound storage.');
  const consumer = createPaymentEventConsumer({
    inboundRepository,
    settlementRepository: createMysqlPaymentSettlementRepository(businessPool, { structuredCheckout: environment.STRUCTURED_CHECKOUT_ENABLED === 'true' }),
    apiV3Key: required(environment, 'WECHAT_PAY_API_V3_KEY'),
    inboundEncryptionKey: required(environment, 'PAYMENT_INBOUND_ENCRYPTION_KEY')
  });
  return createPaymentEventWorker({
    consumer,
    onError: () => console.error('payment event consumer failed')
  });
}

function createOptionalRefundExecutionService(environment, refundRepository) {
  if (environment.PAYMENT_REFUNDS_ENABLED !== 'true') return null;
  const client = createWechatPayRefundClient({ mchId: required(environment, 'WECHAT_PAY_MCH_ID'), merchantSerialNo: required(environment, 'WECHAT_PAY_MERCHANT_SERIAL_NO'), merchantPrivateKeyPath: required(environment, 'WECHAT_PAY_MERCHANT_PRIVATE_KEY_PATH'), notifyUrl: required(environment, 'WECHAT_PAY_NOTIFY_URL'), request: createWechatPayRefundRequester() });
  return createRefundExecutionService({ prepareRefund: refundRepository.prepareRefund, createRefund: client });
}

export async function createRuntimeServer(environment = process.env) {
  const mysql = await import('mysql2/promise');
  const pool = mysql.createPool({
    host: required(environment, 'MYSQL_HOST'),
    port: Number(required(environment, 'MYSQL_PORT')),
    user: required(environment, 'MYSQL_APP_USER'),
    password: required(environment, 'MYSQL_APP_PASSWORD'),
    database: required(environment, 'MYSQL_DATABASE'),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true
  });
  const codeExchange = createWechatCodeExchange({
    appId: required(environment, 'WECHAT_MINIPROGRAM_APP_ID'),
    appSecret: required(environment, 'WECHAT_MINIPROGRAM_APP_SECRET'),
    requestIdentity: createWechatIdentityRequester()
  });
  const userRepository = createMysqlUserRepository(pool);
  const structuredCheckoutEnabled = environment.STRUCTURED_CHECKOUT_ENABLED === 'true';
  const normalizedCatalog = environment.CATALOG_CLASSIFICATION_ENABLED === 'true';
  if (normalizedCatalog) await pool.execute('SELECT product_id, series, tool_group FROM product_classifications LIMIT 0');
  const storedCatalogRepository = createMysqlCatalogRepository(pool, { structuredCatalog: structuredCheckoutEnabled, normalizedCatalog });
  const addressRepository = createMysqlAddressRepository(pool);
  const toolRepository = createMysqlToolRepository(pool);
  const afterSaleRepository = createMysqlAfterSaleRepository(pool);
  const orderReadRepository = createMysqlOrderReadRepository(pool);
  const orderWriteRepository = createMysqlOrderWriteRepository(pool);
  // Kept opt-in until migration 012 has passed a rehearsal and is applied.
  const structuredCheckoutRepository = structuredCheckoutEnabled ? createMysqlStructuredCheckoutRepository(pool) : null;
  const pointsOrderWriteRepository = createMysqlPointsOrderWriteRepository(pool);
  const refundRepository = createMysqlRefundRepository(pool);
  const refundExecutionService = createOptionalRefundExecutionService(environment, refundRepository);
  const giftCardRepository = createMysqlGiftCardRepository(pool);
  const giftCardReadRepository = createMysqlGiftCardReadRepository(pool);
  const sessionRepository = createMysqlSessionRepository(pool);
  const adminRepository = createMysqlAdminRepository(pool);
  const adminSessionRepository = createMysqlAdminSessionRepository(pool);
  const mediaIntentRepository = createMysqlMediaIntentRepository(pool);
  const adminCatalogRepository = createMysqlAdminCatalogRepository(pool, { normalizedCatalog });
  const adminPointsProductRepository = createMysqlAdminPointsProductRepository(pool);
  const adminOperationsRepository = createMysqlAdminOperationsRepository(pool);
  const adminOrderRepository = createMysqlAdminOrderRepository(pool);
  const adminScissorsRepository = createMysqlAdminScissorsRepository(pool);
  const adminAfterSaleRepository = createMysqlAdminAfterSaleRepository(pool);
  const inquiryRepository = createMysqlInquiryRepository(pool);
  const couponRepository = createMysqlCouponRepository(pool);
  const callbackEnabled = environment.PAYMENT_CALLBACK_ENABLED === 'true';
  const inboundUsesBusinessDatabase = usesBusinessDatabaseForPaymentInbound(environment);
  const inboundConfiguration = callbackEnabled && !inboundUsesBusinessDatabase ? paymentInboundConfiguration(environment) : null;
  const { usesBusinessDatabase: _usesBusinessDatabase, ...inboundMysqlConfiguration } = inboundConfiguration || {};
  const inboundPool = inboundUsesBusinessDatabase ? pool : (inboundConfiguration ? mysql.createPool({ ...inboundMysqlConfiguration, waitForConnections: true, connectionLimit: 4, queueLimit: 0, enableKeepAlive: true }) : null);
  const paymentInboundRepository = inboundPool ? createMysqlPaymentInboundRepository(inboundPool) : null;
  const mediaSigner = await createOptionalCosSigner(environment);
  const catalogRepository = createPublicCatalogRepository(storedCatalogRepository, { mediaSigner });
  const paymentCallbackService = await createOptionalPaymentCallbackService(environment, paymentInboundRepository);
  const paymentOrderService = createOptionalPaymentOrderService(environment, pool);
  const paymentEventWorker = createOptionalPaymentEventWorker(environment, paymentInboundRepository, pool);
  const loginService = createLoginService({
    codeExchange,
    resolveUser: userRepository.resolveUser,
    createSession: sessionRepository.create,
    sessionSecret: required(environment, 'SESSION_SIGNING_SECRET')
  });
  const phoneService = createPhoneService({ requestPhone: createWechatPhoneRequester({ appId: required(environment, 'WECHAT_MINIPROGRAM_APP_ID'), appSecret: required(environment, 'WECHAT_MINIPROGRAM_APP_SECRET') }), bindPhone: userRepository.bindPhone });
  const adminLoginService = createAdminLoginService({
    authenticate: adminRepository.authenticate,
    createSession: adminSessionRepository.create,
    sessionSecret: required(environment, 'SESSION_SIGNING_SECRET')
  });
  const server = createServer({ sessionSecret: required(environment, 'SESSION_SIGNING_SECRET'), loginService, adminLoginService, phoneService, userRepository, catalogRepository, addressRepository, toolRepository, afterSaleRepository, orderReadRepository, orderWriteRepository, structuredCheckoutRepository, structuredCheckoutEnabled, pointsOrderWriteRepository, refundRepository, refundExecutionService, giftCardReadRepository, giftCardRepository, couponRepository, sessionRepository, adminSessionRepository, adminRepository, adminCatalogRepository, adminPointsProductRepository, adminOperationsRepository, adminOrderRepository, adminScissorsRepository, adminAfterSaleRepository, inquiryRepository, mediaIntentRepository, mediaSigner, paymentCallbackService, paymentOrderService, paymentInboundRepository, healthCheck: async () => { await pool.query('SELECT 1'); }, auditLogger: createRequestAuditLogger() });
  paymentEventWorker?.start();
  return server;
}
