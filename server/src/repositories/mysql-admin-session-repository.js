import { hashSessionId } from '../security/session.js';

export function createMysqlAdminSessionRepository(pool) {
  const create = async ({ adminAccountId, sessionId, version, expiresAt }) => {
    await pool.execute('INSERT INTO admin_sessions (admin_account_id, session_hash, token_version, issued_at, expires_at) VALUES (?, ?, ?, UTC_TIMESTAMP(), FROM_UNIXTIME(?))', [adminAccountId, hashSessionId(sessionId), version, expiresAt]);
  };
  const active = async ({ adminAccountId, sessionId, version }) => {
    const [rows] = await pool.execute('SELECT id FROM admin_sessions WHERE admin_account_id = ? AND session_hash = ? AND token_version = ? AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP() LIMIT 1', [adminAccountId, hashSessionId(sessionId), version]);
    return rows.length === 1;
  };
  const revoke = async ({ adminAccountId, sessionId }) => {
    const [result] = await pool.execute('UPDATE admin_sessions SET revoked_at = UTC_TIMESTAMP() WHERE admin_account_id = ? AND session_hash = ? AND revoked_at IS NULL', [adminAccountId, hashSessionId(sessionId)]);
    return result.affectedRows === 1;
  };
  return Object.freeze({ create, active, revoke });
}
