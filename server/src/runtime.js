import { createLoginService } from './auth/login-service.js';
import { createWechatCodeExchange } from './auth/wechat-code-exchange.js';
import { createWechatIdentityRequester } from './auth/wechat-identity-requester.js';
import { createMysqlUserRepository } from './repositories/mysql-user-repository.js';
import { createMysqlCatalogRepository } from './repositories/mysql-catalog-repository.js';
import { createMysqlAddressRepository } from './repositories/mysql-address-repository.js';
import { createMysqlSessionRepository } from './repositories/mysql-session-repository.js';
import { createServer } from './server.js';

function required(environment, name) {
  const value = environment[name];
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} must be configured.`);
  return value;
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
  const loginService = createLoginService({
    codeExchange,
    resolveUser: userRepository.resolveUser,
    createSession: sessionRepository.create,
    sessionSecret: required(environment, 'SESSION_SIGNING_SECRET')
  });
  return createServer({ sessionSecret: required(environment, 'SESSION_SIGNING_SECRET'), loginService, userRepository, catalogRepository, addressRepository, sessionRepository });
}
