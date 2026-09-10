import { issueSession, verifySession } from '../security/session.js';

export function createAdminLoginService({ authenticate, createSession, sessionSecret, now = () => Math.floor(Date.now() / 1000), sessionTtlSeconds = 8 * 60 * 60 }) {
  if (typeof authenticate !== 'function' || typeof createSession !== 'function') throw new Error('Administrator authentication and session creation are required.');
  return Object.freeze({
    async login({ username, password }) {
      const account = await authenticate({ username, password });
      if (!account || !Number.isInteger(account.id)) throw new Error('Administrator authentication failed.');
      const expiresAt = now() + sessionTtlSeconds;
      const token = issueSession({ subject: account.id, role: 'admin', expiresAt }, sessionSecret, now());
      const session = verifySession(token, sessionSecret, now());
      await createSession({ adminAccountId: account.id, sessionId: session.sessionId, version: session.version, expiresAt });
      return Object.freeze({ token, expiresAt, administrator: { id: account.id, roles: account.roles || [] } });
    }
  });
}
