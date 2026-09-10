import http from 'node:http';
import { EmptyCatalogRepository } from './repositories/catalog-repository.js';
import { catalogResponse } from './routes/catalog.js';
import { getBearerToken, validateSigningSecret, verifySession } from './security/session.js';

const JSON_HEADERS = Object.freeze({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });

async function readJsonBody(request, maximumBytes = 8192) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBytes) throw new Error('REQUEST_TOO_LARGE');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('INVALID_JSON');
  }
}

function send(response, status, body) {
  response.writeHead(status, JSON_HEADERS);
  response.end(JSON.stringify(body));
}

function error(code, message, status) {
  return { status, body: { success: false, error: { code, message } } };
}

export function createServer({ sessionSecret, catalogRepository = new EmptyCatalogRepository(), loginService = null, userRepository = null, addressRepository = null, sessionRepository = null }) {
  validateSigningSecret(sessionSecret);
  return http.createServer(async (request, response) => {
    const authenticatedSession = async () => {
      const token = getBearerToken(request.headers.authorization);
      const session = verifySession(token, sessionSecret);
      if (!session) return null;
      if (sessionRepository && typeof sessionRepository.active === 'function' && !await sessionRepository.active({ userId: session.subject, sessionId: session.sessionId, version: session.version })) return null;
      return session;
    };
    const url = new URL(request.url || '/', 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      return send(response, 200, { success: true, data: { status: 'ok', mode: 'local-skeleton' } });
    }

    if (request.method === 'POST' && url.pathname === '/api/v1/auth/wechat/session') {
      if (!loginService || typeof loginService.login !== 'function') {
        const result = error('AUTH_NOT_READY', '登录服务尚未配置', 503);
        return send(response, result.status, result.body);
      }
      try {
        const payload = await readJsonBody(request);
        const data = await loginService.login(payload.code);
        return send(response, 200, { success: true, data });
      } catch (cause) {
        const invalidRequest = cause instanceof Error && (cause.message === 'INVALID_JSON' || cause.message === 'REQUEST_TOO_LARGE' || cause.message === 'Invalid WeChat login code.');
        const result = error(invalidRequest ? 'INVALID_REQUEST' : 'LOGIN_FAILED', invalidRequest ? '登录请求格式无效' : '登录失败，请稍后重试', invalidRequest ? 400 : 401);
        return send(response, result.status, result.body);
      }
    }

    if (request.method === 'GET' && url.pathname === '/api/v1/me') {
      const session = await authenticatedSession();
      if (!session) {
        const result = error('UNAUTHENTICATED', '登录状态无效或已过期', 401);
        return send(response, result.status, result.body);
      }
      if (!userRepository || typeof userRepository.getUserProfile !== 'function') {
        const result = error('USER_PROFILE_NOT_READY', '用户服务尚未配置', 503);
        return send(response, result.status, result.body);
      }
      const profile = await userRepository.getUserProfile(session.subject);
      if (!profile) {
        const result = error('UNAUTHENTICATED', '登录状态无效或已过期', 401);
        return send(response, result.status, result.body);
      }
      return send(response, 200, { success: true, data: profile });
    }

    if (request.method === 'GET' && url.pathname === '/api/v1/me/points') {
      const session = await authenticatedSession();
      if (!session) {
        const result = error('UNAUTHENTICATED', '登录状态无效或已过期', 401);
        return send(response, result.status, result.body);
      }
      if (!userRepository || typeof userRepository.getPoints !== 'function') {
        const result = error('USER_POINTS_NOT_READY', '用户服务尚未配置', 503);
        return send(response, result.status, result.body);
      }
      const points = await userRepository.getPoints(session.subject);
      if (!points) {
        const result = error('UNAUTHENTICATED', '登录状态无效或已过期', 401);
        return send(response, result.status, result.body);
      }
      return send(response, 200, { success: true, data: points });
    }

    if (request.method === 'GET' && url.pathname === '/api/v1/addresses') {
      const session = await authenticatedSession();
      if (!session) {
        const result = error('UNAUTHENTICATED', '登录状态无效或已过期', 401);
        return send(response, result.status, result.body);
      }
      if (!addressRepository || typeof addressRepository.list !== 'function') {
        const result = error('ADDRESS_NOT_READY', '地址服务尚未配置', 503);
        return send(response, result.status, result.body);
      }
      return send(response, 200, { success: true, data: await addressRepository.list(session.subject) });
    }

    if (request.method === 'GET') {
      const catalog = await catalogResponse(url.pathname, url.searchParams, catalogRepository);
      if (catalog) {
        if (catalog.error) return send(response, catalog.status, { success: false, error: catalog.error });
        return send(response, catalog.status, { success: true, data: catalog.data });
      }
    }

    if (url.pathname.startsWith('/api/v1/admin/')) {
      const session = await authenticatedSession();
      if (!session) {
        const result = error('UNAUTHENTICATED', '登录状态无效或已过期', 401);
        return send(response, result.status, result.body);
      }
      if (session.role !== 'admin') {
        const result = error('FORBIDDEN', '需要管理员权限', 403);
        return send(response, result.status, result.body);
      }
      const result = error('NOT_IMPLEMENTED', '管理端接口尚未实现', 501);
      return send(response, result.status, result.body);
    }

    const result = error('NOT_FOUND', '接口不存在', 404);
    return send(response, result.status, result.body);
  });
}
