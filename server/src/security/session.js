import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const MIN_SECRET_LENGTH = 32;

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function decode(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

function signature(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function validateSigningSecret(secret) {
  if (typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH) {
    throw new Error('SESSION_SIGNING_SECRET must be at least 32 characters.');
  }
}

export function newSessionId() {
  return randomBytes(32).toString('base64url');
}

export function hashSessionId(sessionId) {
  if (typeof sessionId !== 'string' || !/^[A-Za-z0-9_-]{40,}$/.test(sessionId)) throw new Error('Invalid session identifier.');
  return createHash('sha256').update(sessionId).digest();
}

export function issueSession({ subject, role = 'customer', expiresAt, sessionId = newSessionId(), version = 1 }, secret, now = Math.floor(Date.now() / 1000)) {
  validateSigningSecret(secret);
  if (!Number.isInteger(subject) || subject <= 0) throw new Error('Session subject must be a positive integer.');
  if (!['customer', 'operator', 'admin'].includes(role)) throw new Error('Unsupported session role.');
  if (!Number.isInteger(expiresAt) || expiresAt <= now) throw new Error('Session expiry must be in the future.');

  if (!Number.isInteger(version) || version < 1) throw new Error('Invalid session version.');
  hashSessionId(sessionId);
  const payload = encode({ sub: subject, role, exp: expiresAt, sid: sessionId, ver: version });
  return `${payload}.${signature(payload, secret)}`;
}

export function verifySession(token, secret, now = Math.floor(Date.now() / 1000)) {
  validateSigningSecret(secret);
  if (typeof token !== 'string') return null;
  const [payload, suppliedSignature, ...extra] = token.split('.');
  if (!payload || !suppliedSignature || extra.length) return null;

  const expectedSignature = signature(payload, secret);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;

  try {
    const claims = decode(payload);
    if (!Number.isInteger(claims.sub) || claims.sub <= 0) return null;
    if (!['customer', 'operator', 'admin'].includes(claims.role)) return null;
    if (!Number.isInteger(claims.exp) || claims.exp <= now || !Number.isInteger(claims.ver) || claims.ver < 1) return null;
    hashSessionId(claims.sid);
    return Object.freeze({ subject: claims.sub, role: claims.role, expiresAt: claims.exp, sessionId: claims.sid, version: claims.ver });
  } catch {
    return null;
  }
}

export function getBearerToken(authorization) {
  if (typeof authorization !== 'string') return null;
  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(authorization);
  return match ? match[1] : null;
}
