import http from 'node:http';
import { EmptyCatalogRepository } from './repositories/catalog-repository.js';
import { catalogResponse } from './routes/catalog.js';
import { getBearerToken, validateSigningSecret, verifySession } from './security/session.js';
import { createUploadIntent } from './media/upload-policy.js';

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

export function createServer({ sessionSecret, catalogRepository = new EmptyCatalogRepository(), loginService = null, adminLoginService = null, userRepository = null, addressRepository = null, sessionRepository = null, adminSessionRepository = null, adminRepository = null, adminCatalogRepository = null, mediaIntentRepository = null, mediaSigner = null }) {
  validateSigningSecret(sessionSecret);
  return http.createServer(async (request, response) => {
    const authenticatedSession = async () => {
      const token = getBearerToken(request.headers.authorization);
      const session = verifySession(token, sessionSecret);
      if (!session) return null;
      const repository = session.role === 'admin' ? adminSessionRepository : sessionRepository;
      const sessionReference = session.role === 'admin' ? { adminAccountId: session.subject, sessionId: session.sessionId, version: session.version } : { userId: session.subject, sessionId: session.sessionId, version: session.version };
      if (repository && typeof repository.active === 'function' && !await repository.active(sessionReference)) return null;
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

    if (request.method === 'DELETE' && url.pathname === '/api/v1/auth/session') {
      const session = await authenticatedSession();
      if (!session) {
        const result = error('UNAUTHENTICATED', '登录状态无效或已过期', 401);
        return send(response, result.status, result.body);
      }
      const repository = session.role === 'admin' ? adminSessionRepository : sessionRepository;
      const sessionReference = session.role === 'admin' ? { adminAccountId: session.subject, sessionId: session.sessionId } : { userId: session.subject, sessionId: session.sessionId };
      if (!repository || typeof repository.revoke !== 'function') {
        const result = error('AUTH_NOT_READY', '登录服务尚未配置', 503);
        return send(response, result.status, result.body);
      }
      await repository.revoke(sessionReference);
      return send(response, 200, { success: true, data: { revoked: true } });
    }

    if (request.method === 'POST' && url.pathname === '/api/v1/admin/auth/session') {
      if (!adminLoginService || typeof adminLoginService.login !== 'function') {
        const result = error('ADMIN_AUTH_NOT_READY', '后台登录服务尚未配置', 503);
        return send(response, result.status, result.body);
      }
      try {
        const payload = await readJsonBody(request);
        const data = await adminLoginService.login(payload);
        return send(response, 200, { success: true, data });
      } catch {
        const result = error('ADMIN_LOGIN_FAILED', '后台登录失败，请检查账号或密码', 401);
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
      const requireCatalogEditor = async () => {
        if (!adminRepository || typeof adminRepository.hasRole !== 'function' || !await adminRepository.hasRole({ adminAccountId: session.subject, roleCode: 'catalog_editor' })) {
          const result = error('FORBIDDEN', '需要目录编辑权限', 403);
          send(response, result.status, result.body);
          return false;
        }
        return true;
      };
      if (request.method === 'GET' && url.pathname === '/api/v1/admin/categories') {
        if (!adminCatalogRepository || typeof adminCatalogRepository.listCategories !== 'function') {
          const result = error('ADMIN_CATALOG_NOT_READY', '后台目录服务尚未配置', 503); return send(response, result.status, result.body);
        }
        if (!await requireCatalogEditor()) return;
        const isShow = url.searchParams.get('isShow');
        return send(response, 200, { success: true, data: await adminCatalogRepository.listCategories({ keyword: url.searchParams.get('keyword') || '', isShow: isShow === null || isShow === '' ? undefined : Number(isShow), page: url.searchParams.get('page'), pageSize: url.searchParams.get('pageSize') }) });
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/admin/banners') {
        if (!adminCatalogRepository || typeof adminCatalogRepository.listBanners !== 'function') {
          const result = error('ADMIN_CATALOG_NOT_READY', '后台目录服务尚未配置', 503); return send(response, result.status, result.body);
        }
        if (!await requireCatalogEditor()) return;
        const isActive = url.searchParams.get('isActive');
        return send(response, 200, { success: true, data: await adminCatalogRepository.listBanners({ keyword: url.searchParams.get('keyword') || '', position: url.searchParams.get('position') || '', isActive: isActive === null || isActive === '' ? undefined : Number(isActive), page: url.searchParams.get('page'), pageSize: url.searchParams.get('pageSize') }) });
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/admin/products') {
        if (!adminCatalogRepository || typeof adminCatalogRepository.listProducts !== 'function') {
          const result = error('ADMIN_CATALOG_NOT_READY', '后台目录服务尚未配置', 503); return send(response, result.status, result.body);
        }
        if (!await requireCatalogEditor()) return;
        const status = url.searchParams.get('status');
        return send(response, 200, { success: true, data: await adminCatalogRepository.listProducts({ keyword: url.searchParams.get('keyword') || '', categoryId: url.searchParams.get('categoryId'), status: status === null || status === '' ? undefined : Number(status), lowStock: url.searchParams.get('lowStock'), sku: url.searchParams.get('sku') || '', shippingType: url.searchParams.get('shippingType') || '', page: url.searchParams.get('page'), pageSize: url.searchParams.get('pageSize') }) });
      }
      const productDetail = /^\/api\/v1\/admin\/products\/(\d+)$/.exec(url.pathname);
      if (request.method === 'GET' && productDetail) {
        if (!adminCatalogRepository || typeof adminCatalogRepository.getProduct !== 'function') {
          const result = error('ADMIN_CATALOG_NOT_READY', '后台目录服务尚未配置', 503); return send(response, result.status, result.body);
        }
        if (!await requireCatalogEditor()) return;
        const product = await adminCatalogRepository.getProduct(productDetail[1]);
        if (!product) { const result = error('NOT_FOUND', '商品不存在', 404); return send(response, result.status, result.body); }
        return send(response, 200, { success: true, data: product });
      }
      if (request.method === 'POST' && url.pathname === '/api/v1/admin/media/upload-intents') {
        if (!adminRepository || typeof adminRepository.hasRole !== 'function' || !mediaIntentRepository || typeof mediaIntentRepository.create !== 'function' || !mediaSigner || typeof mediaSigner.issuePutUrl !== 'function') {
          const result = error('ADMIN_MEDIA_NOT_READY', '后台媒体服务尚未配置', 503);
          return send(response, result.status, result.body);
        }
        if (!await requireCatalogEditor()) return;
        try {
          const intent = createUploadIntent(await readJsonBody(request));
          const uploadUrl = await mediaSigner.issuePutUrl(intent);
          await mediaIntentRepository.create({ adminAccountId: session.subject, intent });
          return send(response, 201, { success: true, data: { ...intent, expiresAt: intent.expiresAt.toISOString(), uploadUrl } });
        } catch (cause) {
          const invalidRequest = cause instanceof Error && ['INVALID_JSON', 'REQUEST_TOO_LARGE'].includes(cause.message) || cause instanceof Error && /Unsupported|size|checksum|time/.test(cause.message);
          const result = error(invalidRequest ? 'INVALID_REQUEST' : 'MEDIA_INTENT_FAILED', invalidRequest ? '图片上传请求格式无效' : '图片上传准备失败，请稍后重试', invalidRequest ? 400 : 503);
          return send(response, result.status, result.body);
        }
      }
      const confirmation = /^\/api\/v1\/admin\/media\/upload-intents\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/confirm$/i.exec(url.pathname);
      if (request.method === 'POST' && confirmation) {
        if (!adminRepository || typeof adminRepository.hasRole !== 'function' || !mediaIntentRepository || typeof mediaIntentRepository.getPending !== 'function' || typeof mediaIntentRepository.confirm !== 'function' || !mediaSigner || typeof mediaSigner.verifyObject !== 'function') {
          const result = error('ADMIN_MEDIA_NOT_READY', '后台媒体服务尚未配置', 503);
          return send(response, result.status, result.body);
        }
        if (!await requireCatalogEditor()) return;
        const intent = await mediaIntentRepository.getPending({ adminAccountId: session.subject, id: confirmation[1] });
        if (!intent) {
          const result = error('MEDIA_INTENT_NOT_FOUND', '上传意图不存在、已过期或已确认', 404);
          return send(response, result.status, result.body);
        }
        try {
          await mediaSigner.verifyObject(intent);
          if (!await mediaIntentRepository.confirm({ adminAccountId: session.subject, id: intent.id })) throw new Error('Upload intent was no longer pending.');
          return send(response, 200, { success: true, data: { id: intent.id, status: 'confirmed' } });
        } catch {
          const result = error('MEDIA_OBJECT_NOT_VERIFIED', '图片对象未通过服务端核验', 409);
          return send(response, result.status, result.body);
        }
      }
      const result = error('NOT_IMPLEMENTED', '管理端接口尚未实现', 501);
      return send(response, result.status, result.body);
    }

    const result = error('NOT_FOUND', '接口不存在', 404);
    return send(response, result.status, result.body);
  });
}
