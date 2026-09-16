import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { EmptyCatalogRepository } from './repositories/catalog-repository.js';
import { catalogResponse } from './routes/catalog.js';
import { getBearerToken, validateSigningSecret, verifySession } from './security/session.js';
import { createUploadIntent } from './media/upload-policy.js';
import { bannerInput, categoryInput, productInput, productUpdateInput } from './media/admin-catalog-input.js';

const JSON_HEADERS = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'content-security-policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY'
});

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

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function addressInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid address.');
  const text = (field, maximum, { required = false } = {}) => {
    const raw = value[field];
    if (raw === undefined || raw === null) {
      if (required) throw new Error('Invalid address.');
      return '';
    }
    if (typeof raw !== 'string') throw new Error('Invalid address.');
    const output = raw.trim();
    if ((required && !output) || output.length > maximum) throw new Error('Invalid address.');
    return output;
  };
  const contact = text('name', 50) || text('contact', 50, { required: true });
  const phone = text('phone', 32, { required: true });
  if (!/^[0-9+() -]{6,32}$/.test(phone)) throw new Error('Invalid address.');
  const isDefault = value.is_default === true || value.is_default === 1 || value.isDefault === true || value.isDefault === 1;
  return Object.freeze({ contact, phone, province: text('province', 50), city: text('city', 50), district: text('district', 50), detail: text('detail', 200, { required: true }), tag: text('tag', 20), isDefault });
}

function inquiryInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid inquiry.');
  const text = (field, maximum, { required = false } = {}) => {
    const raw = value[field];
    if (raw === undefined || raw === null) {
      if (required) throw new Error('Invalid inquiry.');
      return '';
    }
    if (typeof raw !== 'string') throw new Error('Invalid inquiry.');
    const output = raw.trim();
    if ((required && !output) || output.length > maximum) throw new Error('Invalid inquiry.');
    return output;
  };
  const phone = text('phone', 20, { required: true });
  if (!/^[0-9+() -]{6,20}$/.test(phone)) throw new Error('Invalid inquiry.');
  return Object.freeze({
    name: text('name', 50, { required: true }),
    gender: text('gender', 10, { required: true }),
    scale: text('scale', 20, { required: true }),
    phone,
    wechat: text('wechat', 60),
    address: text('address', 200),
    intention: text('intention', 500)
  });
}

export function createServer({ sessionSecret, catalogRepository = new EmptyCatalogRepository(), loginService = null, adminLoginService = null, phoneService = null, userRepository = null, addressRepository = null, toolRepository = null, afterSaleRepository = null, orderReadRepository = null, giftCardReadRepository = null, sessionRepository = null, adminSessionRepository = null, adminRepository = null, adminCatalogRepository = null, inquiryRepository = null, mediaIntentRepository = null, mediaSigner = null, healthCheck = null, auditLogger = null }) {
  validateSigningSecret(sessionSecret);
  return http.createServer((request, response) => {
    void (async () => {
    const requestId = randomUUID();
    const startedAt = process.hrtime.bigint();
    const url = new URL(request.url || '/', 'http://localhost');
    response.setHeader('x-request-id', requestId);
    response.once('finish', () => {
      if (typeof auditLogger !== 'function') return;
      try {
        auditLogger({ requestId, method: request.method || 'UNKNOWN', pathname: url.pathname, statusCode: response.statusCode, durationMs: Number((process.hrtime.bigint() - startedAt) / 1_000_000n) });
      } catch {
        // Audit output must not interrupt the client response path.
      }
    });
    const authenticatedSession = async () => {
      const token = getBearerToken(request.headers.authorization);
      const session = verifySession(token, sessionSecret);
      if (!session) return null;
      const repository = session.role === 'admin' ? adminSessionRepository : sessionRepository;
      const sessionReference = session.role === 'admin' ? { adminAccountId: session.subject, sessionId: session.sessionId, version: session.version } : { userId: session.subject, sessionId: session.sessionId, version: session.version };
      if (repository && typeof repository.active === 'function' && !await repository.active(sessionReference)) return null;
      return session;
    };
    if (request.method === 'GET' && url.pathname === '/health') {
      return send(response, 200, { success: true, data: { status: 'ok', mode: 'local-skeleton' } });
    }
    if (request.method === 'GET' && url.pathname === '/readyz') {
      if (typeof healthCheck !== 'function') {
        const result = error('NOT_READY', '服务就绪检查尚未配置', 503);
        return send(response, result.status, result.body);
      }
      try {
        await healthCheck();
        return send(response, 200, { success: true, data: { status: 'ready' } });
      } catch {
        const result = error('NOT_READY', '服务暂不可用', 503);
        return send(response, result.status, result.body);
      }
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

    if (request.method === 'GET' && url.pathname === '/api/v1/admin/auth/session') {
      const session = await authenticatedSession();
      if (!session || session.role !== 'admin') {
        const result = error('UNAUTHENTICATED', '登录状态无效或已过期', 401);
        return send(response, result.status, result.body);
      }
      if (!adminRepository || typeof adminRepository.getRoles !== 'function') {
        const result = error('ADMIN_AUTH_NOT_READY', '后台登录服务尚未配置', 503);
        return send(response, result.status, result.body);
      }
      return send(response, 200, { success: true, data: { administrator: { id: session.subject, roles: await adminRepository.getRoles(session.subject) } } });
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

    if (request.method === 'PUT' && url.pathname === '/api/v1/me') {
      const session = await authenticatedSession();
      if (!session || session.role !== 'customer') { const result = error('UNAUTHENTICATED', '登录状态无效或已过期', 401); return send(response, result.status, result.body); }
      if (!userRepository || typeof userRepository.updateProfile !== 'function') { const result = error('USER_PROFILE_NOT_READY', '用户服务尚未配置', 503); return send(response, result.status, result.body); }
      try {
        const update = await userRepository.updateProfile(session.subject, await readJsonBody(request));
        if (!update.updated) { const result = error('PROFILE_MONTHLY_LIMIT', `本月已修改过资料，请于 ${update.nextAvailableDate || '下个月'} 后再试`, 409); return send(response, result.status, result.body); }
        return send(response, 200, { success: true, data: { message: '更新成功' } });
      } catch (cause) {
        const invalid = cause instanceof Error && ['INVALID_JSON', 'REQUEST_TOO_LARGE', 'Invalid profile input.'].includes(cause.message);
        const result = error(invalid ? 'INVALID_REQUEST' : 'USER_PROFILE_OPERATION_FAILED', invalid ? '资料信息无效' : '用户服务暂不可用', invalid ? 400 : 503);
        return send(response, result.status, result.body);
      }
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

    if (request.method === 'GET' && url.pathname === '/api/v1/me/points/logs') {
      const session = await authenticatedSession();
      if (!session || session.role !== 'customer') { const result = error('UNAUTHENTICATED', '登录状态无效或已过期', 401); return send(response, result.status, result.body); }
      if (!userRepository || typeof userRepository.getPointsLogs !== 'function') { const result = error('POINTS_NOT_READY', '积分服务尚未配置', 503); return send(response, result.status, result.body); }
      try { return send(response, 200, { success: true, data: await userRepository.getPointsLogs(session.subject, { page: url.searchParams.get('page'), pageSize: url.searchParams.get('pageSize') }) }); }
      catch { const result = error('POINTS_OPERATION_FAILED', '积分记录暂不可用', 503); return send(response, result.status, result.body); }
    }

    if (request.method === 'GET' && url.pathname === '/api/v1/me/membership') {
      const session = await authenticatedSession();
      if (!session || session.role !== 'customer') { const result = error('UNAUTHENTICATED', '登录状态无效或已过期', 401); return send(response, result.status, result.body); }
      if (!userRepository || typeof userRepository.getMemberLevel !== 'function') { const result = error('USER_NOT_READY', '用户服务尚未配置', 503); return send(response, result.status, result.body); }
      try {
        const membership = await userRepository.getMemberLevel(session.subject);
        if (!membership) { const result = error('USER_NOT_FOUND', '用户不存在', 404); return send(response, result.status, result.body); }
        return send(response, 200, { success: true, data: membership });
      } catch { const result = error('USER_OPERATION_FAILED', '会员信息暂不可用', 503); return send(response, result.status, result.body); }
    }

    if (request.method === 'POST' && url.pathname === '/api/v1/me/phone') {
      const session = await authenticatedSession();
      if (!session || session.role !== 'customer') { const result = error('UNAUTHENTICATED', '登录状态无效或已过期', 401); return send(response, result.status, result.body); }
      if (!phoneService || typeof phoneService.bind !== 'function') { const result = error('PHONE_NOT_READY', '手机号服务尚未配置', 503); return send(response, result.status, result.body); }
      try {
        const body = await readJsonBody(request);
        return send(response, 200, { success: true, data: await phoneService.bind(session.subject, body?.code) });
      } catch (cause) {
        const code = cause instanceof Error ? cause.message : '';
        const result = error(code.includes('invalid phone code') || code === 'INVALID_JSON' || code === 'REQUEST_TOO_LARGE' ? 'INVALID_REQUEST' : 'PHONE_BIND_FAILED', code.includes('invalid phone code') ? '手机号授权凭证无效' : '手机号绑定暂不可用', code.includes('invalid phone code') || code === 'INVALID_JSON' || code === 'REQUEST_TOO_LARGE' ? 400 : 503);
        return send(response, result.status, result.body);
      }
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

    if (url.pathname === '/api/v1/addresses' || /^\/api\/v1\/addresses\/\d+(?:\/default)?$/.test(url.pathname)) {
      const session = await authenticatedSession();
      if (!session || session.role !== 'customer') {
        const result = error('UNAUTHENTICATED', '登录状态无效或已过期', 401);
        return send(response, result.status, result.body);
      }
      if (!addressRepository) {
        const result = error('ADDRESS_NOT_READY', '地址服务尚未配置', 503);
        return send(response, result.status, result.body);
      }
      const match = /^\/api\/v1\/addresses\/(\d+)(\/default)?$/.exec(url.pathname);
      const addressId = match ? positiveInteger(match[1]) : null;
      try {
        if (request.method === 'POST' && url.pathname === '/api/v1/addresses' && typeof addressRepository.create === 'function') {
          return send(response, 201, { success: true, data: await addressRepository.create(session.subject, addressInput(await readJsonBody(request))) });
        }
        if (request.method === 'PUT' && match && !match[2] && typeof addressRepository.update === 'function') {
          const updated = await addressRepository.update(session.subject, addressId, addressInput(await readJsonBody(request)));
          if (!updated) { const result = error('ADDRESS_NOT_FOUND', '地址不存在', 404); return send(response, result.status, result.body); }
          return send(response, 200, { success: true, data: { id: addressId } });
        }
        if (request.method === 'DELETE' && match && !match[2] && typeof addressRepository.remove === 'function') {
          const removed = await addressRepository.remove(session.subject, addressId);
          if (!removed) { const result = error('ADDRESS_NOT_FOUND', '地址不存在', 404); return send(response, result.status, result.body); }
          return send(response, 200, { success: true, data: { id: addressId } });
        }
        if (request.method === 'PUT' && match && match[2] && typeof addressRepository.setDefault === 'function') {
          const updated = await addressRepository.setDefault(session.subject, addressId);
          if (!updated) { const result = error('ADDRESS_NOT_FOUND', '地址不存在', 404); return send(response, result.status, result.body); }
          return send(response, 200, { success: true, data: { id: addressId, is_default: 1 } });
        }
      } catch (cause) {
        const invalid = cause instanceof Error && ['INVALID_JSON', 'REQUEST_TOO_LARGE', 'Invalid address.'].includes(cause.message);
        const result = error(invalid ? 'INVALID_REQUEST' : 'ADDRESS_OPERATION_FAILED', invalid ? '收货地址信息无效' : '地址服务暂不可用', invalid ? 400 : 503);
        return send(response, result.status, result.body);
      }
      const result = error('ADDRESS_NOT_READY', '地址服务尚未配置', 503);
      return send(response, result.status, result.body);
    }

    if (url.pathname === '/api/v1/tools' || /^\/api\/v1\/tools\/\d+$/.test(url.pathname)) {
      const session = await authenticatedSession();
      if (!session || session.role !== 'customer') { const result = error('UNAUTHENTICATED', '登录状态无效或已过期', 401); return send(response, result.status, result.body); }
      if (!toolRepository) { const result = error('TOOL_NOT_READY', '工具档案服务尚未配置', 503); return send(response, result.status, result.body); }
      const match = /^\/api\/v1\/tools\/(\d+)$/.exec(url.pathname);
      const bindingId = match ? positiveInteger(match[1]) : null;
      try {
        if (request.method === 'GET' && url.pathname === '/api/v1/tools' && typeof toolRepository.list === 'function') return send(response, 200, { success: true, data: await toolRepository.list(session.subject) });
        if (request.method === 'POST' && url.pathname === '/api/v1/tools' && typeof toolRepository.bind === 'function') {
          const payload = await readJsonBody(request);
          const sn = typeof payload?.sn === 'string' ? payload.sn.trim().toUpperCase() : '';
          if (!/^[A-Z0-9-]{8,32}$/.test(sn)) throw new Error('INVALID_TOOL_SN');
          return send(response, 201, { success: true, data: await toolRepository.bind(session.subject, sn) });
        }
        if (request.method === 'GET' && bindingId && typeof toolRepository.get === 'function') {
          const tool = await toolRepository.get(session.subject, bindingId);
          if (!tool) { const result = error('TOOL_NOT_FOUND', '工具档案不存在', 404); return send(response, result.status, result.body); }
          return send(response, 200, { success: true, data: tool });
        }
        if (request.method === 'DELETE' && bindingId && typeof toolRepository.remove === 'function') {
          const removed = await toolRepository.remove(session.subject, bindingId);
          if (!removed) { const result = error('TOOL_NOT_FOUND', '工具档案不存在', 404); return send(response, result.status, result.body); }
          return send(response, 200, { success: true, data: { id: bindingId } });
        }
      } catch (cause) {
        const code = cause instanceof Error ? cause.message : '';
        if (['INVALID_JSON', 'REQUEST_TOO_LARGE', 'INVALID_TOOL_SN'].includes(code)) { const result = error('INVALID_REQUEST', 'SN 码格式无效', 400); return send(response, result.status, result.body); }
        if (code === 'TOOL_NOT_FOUND') { const result = error('TOOL_NOT_FOUND', 'SN 码不存在', 404); return send(response, result.status, result.body); }
        if (code === 'TOOL_ALREADY_BOUND') { const result = error('TOOL_ALREADY_BOUND', '该工具已被绑定', 409); return send(response, result.status, result.body); }
        const result = error('TOOL_OPERATION_FAILED', '工具档案服务暂不可用', 503); return send(response, result.status, result.body);
      }
      const result = error('TOOL_NOT_READY', '工具档案服务尚未配置', 503); return send(response, result.status, result.body);
    }

    const afterSaleMatch = /^\/api\/v1\/tools\/(\d+)\/after-sales$/.exec(url.pathname);
    const shipmentMatch = /^\/api\/v1\/after-sales\/(\d+)\/shipment$/.exec(url.pathname);
    if (afterSaleMatch || shipmentMatch) {
      const session = await authenticatedSession();
      if (!session || session.role !== 'customer') { const result = error('UNAUTHENTICATED', '登录状态无效或已过期', 401); return send(response, result.status, result.body); }
      if (!afterSaleRepository) { const result = error('AFTER_SALE_NOT_READY', '售后服务尚未配置', 503); return send(response, result.status, result.body); }
      try {
        if (afterSaleMatch && request.method === 'GET' && typeof toolRepository?.get === 'function' && typeof afterSaleRepository.list === 'function') {
          const bindingId = positiveInteger(afterSaleMatch[1]);
          const tool = await toolRepository.get(session.subject, bindingId);
          if (!tool) { const result = error('TOOL_NOT_FOUND', '工具档案不存在', 404); return send(response, result.status, result.body); }
          return send(response, 200, { success: true, data: { scissors: tool, records: await afterSaleRepository.list(session.subject, bindingId) } });
        }
        if (afterSaleMatch && request.method === 'POST' && typeof afterSaleRepository.apply === 'function') {
          const payload = await readJsonBody(request);
          return send(response, 201, { success: true, data: await afterSaleRepository.apply(session.subject, { bindingId: positiveInteger(afterSaleMatch[1]), recipientAddressId: positiveInteger(payload?.recipientAddressId), serviceType: payload?.serviceType, description: typeof payload?.description === 'string' ? payload.description.trim().replace(/\r\n?/g, '\n') : '' }) });
        }
        if (shipmentMatch && request.method === 'POST' && typeof afterSaleRepository.submitShipment === 'function') {
          const payload = await readJsonBody(request);
          return send(response, 200, { success: true, data: await afterSaleRepository.submitShipment(session.subject, positiveInteger(shipmentMatch[1]), { carrier: typeof payload?.carrier === 'string' ? payload.carrier.trim() : '', trackingNo: typeof payload?.trackingNo === 'string' ? payload.trackingNo.trim() : '', freightAmount: Number(payload?.freightAmount) }) });
        }
      } catch (cause) {
        const code = cause instanceof Error ? cause.message : '';
        const invalid = ['INVALID_JSON', 'REQUEST_TOO_LARGE', 'INVALID_REQUEST'].includes(code);
        if (invalid) { const result = error('INVALID_REQUEST', '售后信息无效', 400); return send(response, result.status, result.body); }
        if (code === 'TOOL_NOT_FOUND') { const result = error('TOOL_NOT_FOUND', '工具档案不存在', 404); return send(response, result.status, result.body); }
        if (code === 'ADDRESS_NOT_FOUND' || code === 'ADDRESS_INCOMPLETE') { const result = error('ADDRESS_INVALID', '请选择完整有效的收货地址', 400); return send(response, result.status, result.body); }
        if (code === 'AFTER_SALE_ALREADY_OPEN') { const result = error('AFTER_SALE_ALREADY_OPEN', '该工具已有处理中售后申请', 409); return send(response, result.status, result.body); }
        if (code === 'AFTER_SALE_NOT_SHIPPABLE') { const result = error('AFTER_SALE_NOT_SHIPPABLE', '当前售后单暂不可填写寄回物流', 409); return send(response, result.status, result.body); }
        const result = error('AFTER_SALE_OPERATION_FAILED', '售后服务暂不可用', 503); return send(response, result.status, result.body);
      }
      const result = error('AFTER_SALE_NOT_READY', '售后服务尚未配置', 503); return send(response, result.status, result.body);
    }

    const orderMatch = /^\/api\/v1\/orders\/(\d+)$/.exec(url.pathname);
    if ((request.method === 'GET' && url.pathname === '/api/v1/orders') || (request.method === 'GET' && orderMatch)) {
      const session = await authenticatedSession();
      if (!session || session.role !== 'customer') { const result = error('UNAUTHENTICATED', '登录状态无效或已过期', 401); return send(response, result.status, result.body); }
      if (!orderReadRepository) { const result = error('ORDER_NOT_READY', '订单服务尚未配置', 503); return send(response, result.status, result.body); }
      try {
        if (orderMatch && typeof orderReadRepository.get === 'function') {
          const order = await orderReadRepository.get(session.subject, { id: positiveInteger(orderMatch[1]) });
          if (!order) { const result = error('ORDER_NOT_FOUND', '订单不存在', 404); return send(response, result.status, result.body); }
          return send(response, 200, { success: true, data: order });
        }
        if (!orderMatch && url.searchParams.get('orderNo') && typeof orderReadRepository.get === 'function') {
          const order = await orderReadRepository.get(session.subject, { orderNo: url.searchParams.get('orderNo') });
          if (!order) { const result = error('ORDER_NOT_FOUND', '订单不存在', 404); return send(response, result.status, result.body); }
          return send(response, 200, { success: true, data: order });
        }
        if (typeof orderReadRepository.list === 'function') return send(response, 200, { success: true, data: await orderReadRepository.list(session.subject, { status: url.searchParams.get('status') || '', page: url.searchParams.get('page'), pageSize: url.searchParams.get('pageSize') }) });
      } catch {
        const result = error('ORDER_OPERATION_FAILED', '订单服务暂不可用', 503); return send(response, result.status, result.body);
      }
      const result = error('ORDER_NOT_READY', '订单服务尚未配置', 503); return send(response, result.status, result.body);
    }

    const pointsOrderMatch = /^\/api\/v1\/points-orders\/(\d+)$/.exec(url.pathname);
    if ((request.method === 'GET' && url.pathname === '/api/v1/points-orders') || (request.method === 'GET' && pointsOrderMatch)) {
      const session = await authenticatedSession();
      if (!session || session.role !== 'customer') { const result = error('UNAUTHENTICATED', '登录状态无效或已过期', 401); return send(response, result.status, result.body); }
      if (!orderReadRepository) { const result = error('ORDER_NOT_READY', '订单服务尚未配置', 503); return send(response, result.status, result.body); }
      try {
        if (pointsOrderMatch && typeof orderReadRepository.getPoints === 'function') {
          const order = await orderReadRepository.getPoints(session.subject, { id: positiveInteger(pointsOrderMatch[1]) });
          if (!order) { const result = error('ORDER_NOT_FOUND', '积分订单不存在', 404); return send(response, result.status, result.body); }
          return send(response, 200, { success: true, data: order });
        }
        if (!pointsOrderMatch && url.searchParams.get('orderNo') && typeof orderReadRepository.getPoints === 'function') {
          const order = await orderReadRepository.getPoints(session.subject, { orderNo: url.searchParams.get('orderNo') });
          if (!order) { const result = error('ORDER_NOT_FOUND', '积分订单不存在', 404); return send(response, result.status, result.body); }
          return send(response, 200, { success: true, data: order });
        }
        if (typeof orderReadRepository.listPoints === 'function') return send(response, 200, { success: true, data: await orderReadRepository.listPoints(session.subject, { status: url.searchParams.get('status') || '', page: url.searchParams.get('page'), pageSize: url.searchParams.get('pageSize') }) });
      } catch { const result = error('ORDER_OPERATION_FAILED', '订单服务暂不可用', 503); return send(response, result.status, result.body); }
      const result = error('ORDER_NOT_READY', '订单服务尚未配置', 503); return send(response, result.status, result.body);
    }

    if (request.method === 'GET' && url.pathname === '/api/v1/gift-card-redemptions') {
      const session = await authenticatedSession();
      if (!session || session.role !== 'customer') { const result = error('UNAUTHENTICATED', '登录状态无效或已过期', 401); return send(response, result.status, result.body); }
      if (!giftCardReadRepository || typeof giftCardReadRepository.list !== 'function') { const result = error('GIFT_CARD_NOT_READY', '礼品卡服务尚未配置', 503); return send(response, result.status, result.body); }
      try { return send(response, 200, { success: true, data: await giftCardReadRepository.list(session.subject, { page: url.searchParams.get('page'), pageSize: url.searchParams.get('pageSize') }) }); }
      catch { const result = error('GIFT_CARD_OPERATION_FAILED', '礼品卡记录暂不可用', 503); return send(response, result.status, result.body); }
    }

    if (request.method === 'POST' && url.pathname === '/api/v1/inquiries') {
      const session = await authenticatedSession();
      if (!session || session.role !== 'customer') { const result = error('UNAUTHENTICATED', '登录状态无效或已过期', 401); return send(response, result.status, result.body); }
      if (!inquiryRepository || typeof inquiryRepository.submit !== 'function') { const result = error('INQUIRY_NOT_READY', '咨询服务尚未配置', 503); return send(response, result.status, result.body); }
      try {
        return send(response, 201, { success: true, data: await inquiryRepository.submit(session.subject, inquiryInput(await readJsonBody(request))) });
      } catch (cause) {
        const invalid = cause instanceof Error && ['INVALID_JSON', 'REQUEST_TOO_LARGE', 'Invalid inquiry.'].includes(cause.message);
        const result = error(invalid ? 'INVALID_REQUEST' : 'INQUIRY_OPERATION_FAILED', invalid ? '咨询信息无效' : '咨询服务暂不可用', invalid ? 400 : 503);
        return send(response, result.status, result.body);
      }
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
      if (request.method === 'GET' && url.pathname === '/api/v1/admin/overview') {
        if (!adminCatalogRepository || typeof adminCatalogRepository.overview !== 'function') {
          const result = error('ADMIN_CATALOG_NOT_READY', '后台目录服务尚未配置', 503); return send(response, result.status, result.body);
        }
        if (!await requireCatalogEditor()) return;
        return send(response, 200, { success: true, data: await adminCatalogRepository.overview() });
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/admin/categories') {
        if (!adminCatalogRepository || typeof adminCatalogRepository.listCategories !== 'function') {
          const result = error('ADMIN_CATALOG_NOT_READY', '后台目录服务尚未配置', 503); return send(response, result.status, result.body);
        }
        if (!await requireCatalogEditor()) return;
        const isShow = url.searchParams.get('isShow');
        return send(response, 200, { success: true, data: await adminCatalogRepository.listCategories({ keyword: url.searchParams.get('keyword') || '', isShow: isShow === null || isShow === '' ? undefined : Number(isShow), page: url.searchParams.get('page'), pageSize: url.searchParams.get('pageSize') }) });
      }
      if (request.method === 'POST' && url.pathname === '/api/v1/admin/categories') {
        if (!adminCatalogRepository || typeof adminCatalogRepository.createCategory !== 'function' || !mediaIntentRepository || typeof mediaIntentRepository.getConfirmed !== 'function') {
          const result = error('ADMIN_CATALOG_NOT_READY', '后台目录服务尚未配置', 503); return send(response, result.status, result.body);
        }
        if (!await requireCatalogEditor()) return;
        try {
          const input = categoryInput(await readJsonBody(request));
          const resolve = async (id, prefix) => {
            if (!id) return null;
            const media = await mediaIntentRepository.getConfirmed({ adminAccountId: session.subject, id });
            if (!media || !media.objectKey.startsWith(prefix)) throw new Error('Unverified media.');
            return media.objectKey;
          };
          if (input.icon?.existingObjectKey || input.image?.existingObjectKey) throw new Error('Existing media cannot be used when creating a category.');
          const data = await adminCatalogRepository.createCategory({ ...input, icon: await resolve(input.icon?.intentId, 'catalog/categories/'), image: await resolve(input.image?.intentId, 'catalog/categories/') });
          return send(response, 201, { success: true, data });
        } catch {
          const result = error('INVALID_REQUEST', '分类内容或关联图片无效', 400); return send(response, result.status, result.body);
        }
      }
      const categoryId = /^\/api\/v1\/admin\/categories\/(\d+)$/.exec(url.pathname);
      if (categoryId && request.method === 'PUT') {
        if (!adminCatalogRepository || typeof adminCatalogRepository.updateCategory !== 'function' || !mediaIntentRepository || typeof mediaIntentRepository.getConfirmed !== 'function') { const result = error('ADMIN_CATALOG_NOT_READY', '后台目录服务尚未配置', 503); return send(response, result.status, result.body); }
        if (!await requireCatalogEditor()) return;
        try {
          const input = categoryInput(await readJsonBody(request));
          if (typeof adminCatalogRepository.getCategory !== 'function') throw new Error('Category lookup unavailable.');
          const current = await adminCatalogRepository.getCategory(Number(categoryId[1]));
          if (!current) { const result = error('NOT_FOUND', '分类不存在', 404); return send(response, result.status, result.body); }
          const allowedKeys = new Set([current.icon, current.image].filter((key) => typeof key === 'string' && key.startsWith('catalog/categories/')));
          const resolve = async (reference) => {
            if (reference === undefined) return undefined;
            if (!reference) return null;
            if (reference.existingObjectKey) {
              if (!allowedKeys.has(reference.existingObjectKey)) throw new Error('Unverified media.');
              return reference.existingObjectKey;
            }
            const media = await mediaIntentRepository.getConfirmed({ adminAccountId: session.subject, id: reference.intentId });
            if (!media || !media.objectKey.startsWith('catalog/categories/')) throw new Error('Unverified media.');
            return media.objectKey;
          };
          if (!await adminCatalogRepository.updateCategory(Number(categoryId[1]), { ...input, icon: await resolve(input.icon), image: await resolve(input.image) })) { const result = error('NOT_FOUND', '分类不存在', 404); return send(response, result.status, result.body); }
          return send(response, 200, { success: true, data: { id: Number(categoryId[1]) } });
        } catch { const result = error('INVALID_REQUEST', '分类内容或关联图片无效', 400); return send(response, result.status, result.body); }
      }
      if (categoryId && request.method === 'DELETE') {
        if (!adminCatalogRepository || typeof adminCatalogRepository.deleteCategory !== 'function') { const result = error('ADMIN_CATALOG_NOT_READY', '后台目录服务尚未配置', 503); return send(response, result.status, result.body); }
        if (!await requireCatalogEditor()) return;
        const outcome = await adminCatalogRepository.deleteCategory(Number(categoryId[1]));
        if (outcome === 'in_use') { const result = error('CATEGORY_IN_USE', '分类仍有关联商品，不能删除', 409); return send(response, result.status, result.body); }
        if (outcome === 'missing') { const result = error('NOT_FOUND', '分类不存在', 404); return send(response, result.status, result.body); }
        return send(response, 200, { success: true, data: { id: Number(categoryId[1]) } });
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/admin/banners') {
        if (!adminCatalogRepository || typeof adminCatalogRepository.listBanners !== 'function') {
          const result = error('ADMIN_CATALOG_NOT_READY', '后台目录服务尚未配置', 503); return send(response, result.status, result.body);
        }
        if (!await requireCatalogEditor()) return;
        const isActive = url.searchParams.get('isActive');
        return send(response, 200, { success: true, data: await adminCatalogRepository.listBanners({ keyword: url.searchParams.get('keyword') || '', position: url.searchParams.get('position') || '', isActive: isActive === null || isActive === '' ? undefined : Number(isActive), page: url.searchParams.get('page'), pageSize: url.searchParams.get('pageSize') }) });
      }
      if (request.method === 'POST' && url.pathname === '/api/v1/admin/banners') {
        if (!adminCatalogRepository || typeof adminCatalogRepository.createBanner !== 'function' || !mediaIntentRepository || typeof mediaIntentRepository.getConfirmed !== 'function') {
          const result = error('ADMIN_CATALOG_NOT_READY', '后台目录服务尚未配置', 503); return send(response, result.status, result.body);
        }
        if (!await requireCatalogEditor()) return;
        try {
          const input = bannerInput(await readJsonBody(request));
          const resolve = async (id) => {
            if (!id) return null;
            const media = await mediaIntentRepository.getConfirmed({ adminAccountId: session.subject, id });
            if (!media || !media.objectKey.startsWith('catalog/banners/')) throw new Error('Unverified media.');
            return media.objectKey;
          };
          const data = await adminCatalogRepository.createBanner({ ...input, image: await resolve(input.imageIntentId), mobileImage: await resolve(input.mobileImageIntentId) });
          return send(response, 201, { success: true, data });
        } catch {
          const result = error('INVALID_REQUEST', '轮播图内容或关联图片无效', 400); return send(response, result.status, result.body);
        }
      }
      const bannerId = /^\/api\/v1\/admin\/banners\/(\d+)$/.exec(url.pathname);
      if (bannerId && request.method === 'PUT') {
        if (!adminCatalogRepository || typeof adminCatalogRepository.updateBanner !== 'function' || !mediaIntentRepository || typeof mediaIntentRepository.getConfirmed !== 'function') { const result = error('ADMIN_CATALOG_NOT_READY', '后台目录服务尚未配置', 503); return send(response, result.status, result.body); }
        if (!await requireCatalogEditor()) return;
        try {
          const input = bannerInput(await readJsonBody(request), { existing: true });
          const resolve = async (id) => { if (!id) return null; const media = await mediaIntentRepository.getConfirmed({ adminAccountId: session.subject, id }); if (!media || !media.objectKey.startsWith('catalog/banners/')) throw new Error('Unverified media.'); return media.objectKey; };
          if (!await adminCatalogRepository.updateBanner(Number(bannerId[1]), { ...input, image: await resolve(input.imageIntentId), mobileImage: await resolve(input.mobileImageIntentId) })) { const result = error('NOT_FOUND', '轮播图不存在', 404); return send(response, result.status, result.body); }
          return send(response, 200, { success: true, data: { id: Number(bannerId[1]) } });
        } catch { const result = error('INVALID_REQUEST', '轮播图内容或关联图片无效', 400); return send(response, result.status, result.body); }
      }
      if (bannerId && request.method === 'DELETE') {
        if (!adminCatalogRepository || typeof adminCatalogRepository.deleteBanner !== 'function') { const result = error('ADMIN_CATALOG_NOT_READY', '后台目录服务尚未配置', 503); return send(response, result.status, result.body); }
        if (!await requireCatalogEditor()) return;
        if (!await adminCatalogRepository.deleteBanner(Number(bannerId[1]))) { const result = error('NOT_FOUND', '轮播图不存在', 404); return send(response, result.status, result.body); }
        return send(response, 200, { success: true, data: { id: Number(bannerId[1]) } });
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/admin/products') {
        if (!adminCatalogRepository || typeof adminCatalogRepository.listProducts !== 'function') {
          const result = error('ADMIN_CATALOG_NOT_READY', '后台目录服务尚未配置', 503); return send(response, result.status, result.body);
        }
        if (!await requireCatalogEditor()) return;
        const status = url.searchParams.get('status');
        return send(response, 200, { success: true, data: await adminCatalogRepository.listProducts({ keyword: url.searchParams.get('keyword') || '', categoryId: url.searchParams.get('categoryId'), status: status === null || status === '' ? undefined : Number(status), lowStock: url.searchParams.get('lowStock'), sku: url.searchParams.get('sku') || '', shippingType: url.searchParams.get('shippingType') || '', page: url.searchParams.get('page'), pageSize: url.searchParams.get('pageSize') }) });
      }
      if (request.method === 'POST' && url.pathname === '/api/v1/admin/products') {
        if (!adminCatalogRepository || typeof adminCatalogRepository.createProduct !== 'function' || !mediaIntentRepository || typeof mediaIntentRepository.getConfirmed !== 'function') { const result = error('ADMIN_CATALOG_NOT_READY', '后台目录服务尚未配置', 503); return send(response, result.status, result.body); }
        if (!await requireCatalogEditor()) return;
        try {
          const input = productInput(await readJsonBody(request));
          const resolve = async (id) => { if (!id) return null; const media = await mediaIntentRepository.getConfirmed({ adminAccountId: session.subject, id }); if (!media || !media.objectKey.startsWith('catalog/products/')) throw new Error('Unverified media.'); return media.objectKey; };
          const resolveMany = async (ids) => Promise.all(ids.map(resolve));
          return send(response, 201, { success: true, data: await adminCatalogRepository.createProduct({ ...input, coverImage: await resolve(input.coverImageIntentId), images: await resolveMany(input.imageIntentIds), detailImages: await resolveMany(input.detailImageIntentIds), scissorsCardImage: await resolve(input.scissorsCardImageIntentId), specs: await Promise.all(input.specs.map(async (spec) => ({ ...spec, image: await resolve(spec.imageIntentId), cardImage: await resolve(spec.cardImageIntentId) }))) }) });
        } catch { const result = error('INVALID_REQUEST', '商品、规格、履约信息或关联图片无效', 400); return send(response, result.status, result.body); }
      }
      const productDetail = /^\/api\/v1\/admin\/products\/(\d+)$/.exec(url.pathname);
      if (productDetail && request.method === 'PUT') {
        if (!adminCatalogRepository || typeof adminCatalogRepository.updateProduct !== 'function' || !mediaIntentRepository || typeof mediaIntentRepository.getConfirmed !== 'function') { const result = error('ADMIN_CATALOG_NOT_READY', '后台目录服务尚未配置', 503); return send(response, result.status, result.body); }
        if (!await requireCatalogEditor()) return;
        try {
          const input = productUpdateInput(await readJsonBody(request));
          if (typeof adminCatalogRepository.getProduct !== 'function') throw new Error('Product lookup unavailable.');
          const current = await adminCatalogRepository.getProduct(Number(productDetail[1]));
          if (!current) { const result = error('NOT_FOUND', '商品不存在', 404); return send(response, result.status, result.body); }
          const storedKeys = [current.cover_image, ...(Array.isArray(current.images) ? current.images : []), ...(Array.isArray(current.detail_images) ? current.detail_images : []), current.scissors_card_image, ...(Array.isArray(current.specs) ? current.specs.flatMap((spec) => [spec.image, spec.card_image]) : [])]
            .filter((key) => typeof key === 'string' && key.startsWith('catalog/products/'));
          const allowedKeys = new Set(storedKeys);
          const resolve = async (reference) => {
            if (!reference) return null;
            if (reference.existingObjectKey) {
              if (!allowedKeys.has(reference.existingObjectKey)) throw new Error('Unverified media.');
              return reference.existingObjectKey;
            }
            const media = await mediaIntentRepository.getConfirmed({ adminAccountId: session.subject, id: reference.intentId });
            if (!media || !media.objectKey.startsWith('catalog/products/')) throw new Error('Unverified media.');
            return media.objectKey;
          };
          if (!await adminCatalogRepository.updateProduct(Number(productDetail[1]), {
            ...input,
            coverImage: await resolve(input.coverImage),
            images: await Promise.all(input.images.map(resolve)),
            detailImages: await Promise.all(input.detailImages.map(resolve)),
            scissorsCardImage: await resolve(input.scissorsCardImage),
            specs: await Promise.all(input.specs.map(async (spec) => ({ ...spec, image: await resolve(spec.image), cardImage: await resolve(spec.cardImage) })))
          })) { const result = error('NOT_FOUND', '商品不存在', 404); return send(response, result.status, result.body); }
          return send(response, 200, { success: true, data: { id: Number(productDetail[1]) } });
        } catch { const result = error('INVALID_REQUEST', '商品、规格、履约信息或关联图片无效', 400); return send(response, result.status, result.body); }
      }
      if (productDetail && request.method === 'DELETE') {
        if (!adminCatalogRepository || typeof adminCatalogRepository.deleteProduct !== 'function') { const result = error('ADMIN_CATALOG_NOT_READY', '后台目录服务尚未配置', 503); return send(response, result.status, result.body); }
        if (!await requireCatalogEditor()) return;
        if (!await adminCatalogRepository.deleteProduct(Number(productDetail[1]))) { const result = error('NOT_FOUND', '商品不存在', 404); return send(response, result.status, result.body); }
        return send(response, 200, { success: true, data: { id: Number(productDetail[1]) } });
      }
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
      if (request.method === 'POST' && url.pathname === '/api/v1/admin/media/temporary-urls') {
        if (!adminRepository || typeof adminRepository.hasRole !== 'function' || !mediaSigner || typeof mediaSigner.issueGetUrl !== 'function') {
          const result = error('ADMIN_MEDIA_NOT_READY', '后台媒体服务尚未配置', 503);
          return send(response, result.status, result.body);
        }
        if (!await requireCatalogEditor()) return;
        try {
          const payload = await readJsonBody(request);
          const objectKeys = Array.isArray(payload?.objectKeys) ? payload.objectKeys : [];
          if (objectKeys.length > 50 || objectKeys.some((key) => typeof key !== 'string' || !key.startsWith('catalog/') || key.length > 500)) throw new Error('Invalid object keys.');
          const entries = await Promise.all(objectKeys.map(async (key) => [key, await mediaSigner.issueGetUrl(key)]));
          return send(response, 200, { success: true, data: { urls: Object.fromEntries(entries) } });
        } catch {
          const result = error('INVALID_REQUEST', '图片读取请求无效', 400);
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
    })().catch(() => {
      if (response.headersSent || response.writableEnded) {
        response.destroy();
        return;
      }
      const result = error('INTERNAL_ERROR', '服务暂不可用，请稍后重试', 500);
      send(response, result.status, result.body);
    });
  });
}
