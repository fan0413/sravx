import { createLoginService } from './auth/login-service.js';
import { createWechatCodeExchange } from './auth/wechat-code-exchange.js';
import { createWechatIdentityRequester } from './auth/wechat-identity-requester.js';
import { createMysqlUserRepository } from './repositories/mysql-user-repository.js';
import { createMysqlCatalogRepository } from './repositories/mysql-catalog-repository.js';
import { createMysqlAddressRepository } from './repositories/mysql-address-repository.js';
import { createMysqlSessionRepository } from './repositories/mysql-session-repository.js';
import { createMysqlAdminRepository } from './repositories/mysql-admin-repository.js';
import { createMysqlAdminSessionRepository } from './repositories/mysql-admin-session-repository.js';
import { createMysqlMediaIntentRepository } from './repositories/mysql-media-intent-repository.js';
import { createMysqlAdminCatalogRepository } from './repositories/mysql-admin-catalog-repository.js';
import { createAdminLoginService } from './auth/admin-login-service.js';
import { createCosUploadSigner } from './media/cos-upload-signer.js';
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
  const catalogRepository = createMysqlCatalogRepository(pool);
  const addressRepository = createMysqlAddressRepository(pool);
  const sessionRepository = createMysqlSessionRepository(pool);
  const adminRepository = createMysqlAdminRepository(pool);
  const adminSessionRepository = createMysqlAdminSessionRepository(pool);
  const mediaIntentRepository = createMysqlMediaIntentRepository(pool);
  const adminCatalogRepository = createMysqlAdminCatalogRepository(pool);
  const mediaSigner = await createOptionalCosSigner(environment);
  const loginService = createLoginService({
    codeExchange,
    resolveUser: userRepository.resolveUser,
    createSession: sessionRepository.create,
    sessionSecret: required(environment, 'SESSION_SIGNING_SECRET')
  });
  const adminLoginService = createAdminLoginService({
    authenticate: adminRepository.authenticate,
    createSession: adminSessionRepository.create,
    sessionSecret: required(environment, 'SESSION_SIGNING_SECRET')
  });
  return createServer({ sessionSecret: required(environment, 'SESSION_SIGNING_SECRET'), loginService, adminLoginService, userRepository, catalogRepository, addressRepository, sessionRepository, adminSessionRepository, adminRepository, adminCatalogRepository, mediaIntentRepository, mediaSigner });
}
