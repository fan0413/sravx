function validIdentity(identity) {
  if (!identity || typeof identity.openid !== 'string' || identity.openid.trim() === '') {
    throw new Error('A trusted WeChat identity is required.');
  }
  return { openid: identity.openid.trim(), unionid: typeof identity.unionid === 'string' && identity.unionid.trim() ? identity.unionid.trim() : null };
}

function identityBindings({ openid, unionid }) {
  const bindings = [{ provider: 'wechat_miniprogram_openid', subject: openid }];
  if (unionid) bindings.unshift({ provider: 'wechat_unionid', subject: unionid });
  return bindings;
}

async function bindIdentities(connection, userId, bindings) {
  for (const binding of bindings) {
    await connection.execute(
      'INSERT INTO user_identities (user_id, provider, provider_subject) VALUES (?, ?, ?)',
      [userId, binding.provider, binding.subject]
    );
  }
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
      const bindings = identityBindings({ openid, unionid });
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const identityWhere = bindings.map(() => '(provider = ? AND provider_subject = ?)').join(' OR ');
        const identityValues = bindings.flatMap(({ provider, subject }) => [provider, subject]);
        const [boundRows] = await connection.execute(
          `SELECT user_id FROM user_identities WHERE ${identityWhere} FOR UPDATE`,
          identityValues
        );

        const boundUserIds = [...new Set(boundRows.map(({ user_id: userId }) => Number(userId)))];
        if (boundUserIds.length > 1) throw new Error('Identity bindings require manual resolution.');

        let rows;
        if (boundUserIds.length === 1) {
          [rows] = await connection.execute('SELECT id, status FROM users WHERE id = ? LIMIT 1 FOR UPDATE', [boundUserIds[0]]);
        } else {
          [rows] = await connection.execute(
            'SELECT id, status FROM users WHERE openid = ? OR (unionid IS NOT NULL AND unionid = ?) FOR UPDATE',
            [openid, unionid || '']
          );
        }

        if (rows.length > 0) {
          if (rows.length > 1) throw new Error('Legacy identities require manual resolution.');
          const user = rows[0];
          if (user.status !== 'active') throw new Error('User account is unavailable.');
          if (boundUserIds.length === 0) await bindIdentities(connection, user.id, bindings);
          await connection.execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
          await connection.commit();
          return Object.freeze({ id: Number(user.id), role: 'customer' });
        }

        const [insert] = await connection.execute(
          "INSERT INTO users (openid, unionid, _openid, status, last_login_at) VALUES (?, ?, ?, 'active', NOW())",
          [openid, unionid, openid]
        );
        await bindIdentities(connection, insert.insertId, bindings);
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
