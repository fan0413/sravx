export function createMysqlAddressRepository(pool) {
  if (!pool || typeof pool.execute !== 'function') throw new Error('A MySQL pool is required.');
  function validUserId(userId) {
    if (!Number.isInteger(userId) || userId <= 0) throw new Error('A valid user id is required.');
  }
  async function withTransaction(work) {
    if (typeof pool.getConnection !== 'function') throw new Error('Address writes require a transactional MySQL pool.');
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await work(connection);
      await connection.commit();
      return result;
    } catch (cause) {
      await connection.rollback();
      throw cause;
    } finally {
      connection.release();
    }
  }
  return Object.freeze({
    async list(userId) {
      validUserId(userId);
      const [rows] = await pool.execute(
        `SELECT a.id, a.contact, a.name, a.phone, a.province, a.city, a.district, a.detail, a.is_default, a.tag
         FROM addresses a INNER JOIN users u ON u.openid COLLATE utf8mb4_bin = a.openid COLLATE utf8mb4_bin
         WHERE u.id = ? ORDER BY a.is_default DESC, a.id DESC`,
        [userId]
      );
      return rows;
    },
    async create(userId, input) {
      validUserId(userId);
      return withTransaction(async (connection) => {
        const [[user]] = await connection.execute('SELECT openid FROM users WHERE id = ? FOR UPDATE', [userId]);
        if (!user) throw new Error('User not found.');
        if (input.isDefault) await connection.execute('UPDATE addresses SET is_default = 0 WHERE openid = ?', [user.openid]);
        const [result] = await connection.execute(
          `INSERT INTO addresses (openid, _openid, contact, name, phone, province, city, district, detail, is_default, tag, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [user.openid, user.openid, input.contact, input.contact, input.phone, input.province, input.city, input.district, input.detail, input.isDefault ? 1 : 0, input.tag]
        );
        return { id: result.insertId };
      });
    },
    async update(userId, addressId, input) {
      validUserId(userId);
      return withTransaction(async (connection) => {
        const [[user]] = await connection.execute('SELECT openid FROM users WHERE id = ? FOR UPDATE', [userId]);
        if (!user) return false;
        const [[address]] = await connection.execute('SELECT id FROM addresses WHERE id = ? AND openid = ? FOR UPDATE', [addressId, user.openid]);
        if (!address) return false;
        if (input.isDefault) await connection.execute('UPDATE addresses SET is_default = 0 WHERE openid = ?', [user.openid]);
        await connection.execute(
          `UPDATE addresses SET contact = ?, name = ?, phone = ?, province = ?, city = ?, district = ?, detail = ?, is_default = ?, tag = ?, updated_at = NOW()
           WHERE id = ? AND openid = ?`,
          [input.contact, input.contact, input.phone, input.province, input.city, input.district, input.detail, input.isDefault ? 1 : 0, input.tag, addressId, user.openid]
        );
        return true;
      });
    },
    async remove(userId, addressId) {
      validUserId(userId);
      const [result] = await pool.execute(
        `DELETE a FROM addresses a INNER JOIN users u ON u.openid COLLATE utf8mb4_bin = a.openid COLLATE utf8mb4_bin
         WHERE a.id = ? AND u.id = ?`,
        [addressId, userId]
      );
      return result.affectedRows === 1;
    },
    async setDefault(userId, addressId) {
      validUserId(userId);
      return withTransaction(async (connection) => {
        const [[user]] = await connection.execute('SELECT openid FROM users WHERE id = ? FOR UPDATE', [userId]);
        if (!user) return false;
        const [[address]] = await connection.execute('SELECT id FROM addresses WHERE id = ? AND openid = ? FOR UPDATE', [addressId, user.openid]);
        if (!address) return false;
        await connection.execute('UPDATE addresses SET is_default = 0 WHERE openid = ?', [user.openid]);
        await connection.execute('UPDATE addresses SET is_default = 1, updated_at = NOW() WHERE id = ? AND openid = ?', [addressId, user.openid]);
        return true;
      });
    }
  });
}
