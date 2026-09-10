function validIdentity(identity) {
  if (!identity || typeof identity.openid !== 'string' || identity.openid.trim() === '') {
    throw new Error('A trusted WeChat identity is required.');
  }
  return { openid: identity.openid.trim(), unionid: typeof identity.unionid === 'string' && identity.unionid.trim() ? identity.unionid.trim() : null };
}

export function createMysqlUserRepository(pool) {
  if (!pool || typeof pool.getConnection !== 'function') throw new Error('A MySQL pool is required.');

  return Object.freeze({
    async getUserProfile(userId) {
      if (!Number.isInteger(userId) || userId <= 0) throw new Error('A valid user id is required.');
      const [rows] = await pool.execute(
        'SELECT id, username, phone, avatar, gender, birthday, occupation, member_level, points, total_points FROM users WHERE id = ? LIMIT 1',
        [userId]
      );
      return rows.length === 1 ? rows[0] : null;
    },
    async getPoints(userId) {
      if (!Number.isInteger(userId) || userId <= 0) throw new Error('A valid user id is required.');
      const [rows] = await pool.execute(
        'SELECT points, total_points FROM users WHERE id = ? LIMIT 1',
        [userId]
      );
      return rows.length === 1 ? rows[0] : null;
    },
    async resolveUser(identity) {
      const { openid, unionid } = validIdentity(identity);
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.execute(
          'SELECT id, status FROM users WHERE openid = ? LIMIT 1 FOR UPDATE',
          [openid]
        );

        if (rows.length > 0) {
          const user = rows[0];
          if (user.status !== 'active') throw new Error('User account is unavailable.');
          await connection.execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
          await connection.commit();
          return Object.freeze({ id: Number(user.id), role: 'customer' });
        }

        const [insert] = await connection.execute(
          "INSERT INTO users (openid, unionid, _openid, status, last_login_at) VALUES (?, ?, ?, 'active', NOW())",
          [openid, unionid, openid]
        );
        await connection.commit();
        return Object.freeze({ id: Number(insert.insertId), role: 'customer' });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    }
  });
}
