import { hashSessionId } from '../security/session.js';

export function createMysqlSessionRepository(pool) {
  const create = async ({ userId, sessionId, version, expiresAt }) => {
    await pool.execute(
      'INSERT INTO user_sessions (user_id, session_hash, token_version, issued_at, expires_at) VALUES (?, ?, ?, UTC_TIMESTAMP(), FROM_UNIXTIME(?))',
      [userId, hashSessionId(sessionId), version, expiresAt]
    );
  };
  const active = async ({ userId, sessionId, version }) => {
    const [rows] = await pool.execute(
      'SELECT id FROM user_sessions WHERE user_id = ? AND session_hash = ? AND token_version = ? AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP() LIMIT 1',
      [userId, hashSessionId(sessionId), version]
    );
    return rows.length === 1;
  };
  const revoke = async ({ userId, sessionId }) => {
    const [result] = await pool.execute(
      'UPDATE user_sessions SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND session_hash = ? AND revoked_at IS NULL',
      [userId, hashSessionId(sessionId)]
    );
    return result.affectedRows === 1;
  };
  return Object.freeze({ create, active, revoke });
}
