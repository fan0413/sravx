import { issueSession, verifySession } from '../security/session.js';

const MAX_CUSTOMER_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export function createLoginService({ codeExchange, resolveUser, createSession, sessionSecret, now = () => Math.floor(Date.now() / 1000), sessionTtlSeconds = 7 * 24 * 60 * 60 }) {
  if (!codeExchange || typeof codeExchange.exchange !== 'function') throw new Error('codeExchange.exchange is required.');
  if (typeof resolveUser !== 'function') throw new Error('resolveUser must be a function.');
  if (typeof createSession !== 'function') throw new Error('createSession must be a function.');
  if (!Number.isInteger(sessionTtlSeconds) || sessionTtlSeconds < 300 || sessionTtlSeconds > MAX_CUSTOMER_SESSION_TTL_SECONDS) throw new Error('sessionTtlSeconds must be between five minutes and 30 days.');

  return Object.freeze({
    async login(code) {
      const identity = await codeExchange.exchange(code);
      const user = await resolveUser(identity);
      if (!user || !Number.isInteger(user.id) || user.id <= 0) throw new Error('User resolution failed.');
      const expiresAt = now() + sessionTtlSeconds;
      const token = issueSession({ subject: user.id, role: user.role || 'customer', expiresAt }, sessionSecret, now());
      const session = verifySession(token, sessionSecret, now());
      await createSession({ userId: user.id, sessionId: session.sessionId, version: session.version, expiresAt });
      return Object.freeze({ token, expiresAt, user: { id: user.id, role: user.role || 'customer' } });
    }
  });
}
