import { verifyPassword } from '../security/password.js';

export function createMysqlAdminRepository(pool) {
  if (!pool || typeof pool.execute !== 'function') throw new Error('A MySQL pool is required.');
  return Object.freeze({
    async authenticate({ username, password }) {
      if (typeof username !== 'string' || typeof password !== 'string') return null;
      const [accounts] = await pool.execute('SELECT id, password_hash, status FROM admin_accounts WHERE username = ? LIMIT 1', [username.trim()]);
      const account = accounts[0];
      if (!account || account.status !== 'active' || !await verifyPassword(password, account.password_hash)) return null;
      const [roles] = await pool.execute(
        `SELECT r.code FROM admin_account_roles ar
         INNER JOIN admin_roles r ON r.id = ar.admin_role_id
         WHERE ar.admin_account_id = ? ORDER BY r.code ASC`,
        [account.id]
      );
      await pool.execute('UPDATE admin_accounts SET last_login_at = UTC_TIMESTAMP() WHERE id = ?', [account.id]);
      return Object.freeze({ id: Number(account.id), roles: roles.map(({ code }) => code) });
    }
  });
}
