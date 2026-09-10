export function createMysqlAddressRepository(pool) {
  if (!pool || typeof pool.execute !== 'function') throw new Error('A MySQL pool is required.');
  return Object.freeze({
    async list(userId) {
      if (!Number.isInteger(userId) || userId <= 0) throw new Error('A valid user id is required.');
      const [rows] = await pool.execute(
        `SELECT a.id, a.contact, a.name, a.phone, a.province, a.city, a.district, a.detail, a.is_default, a.tag
         FROM addresses a INNER JOIN users u ON u.openid = a.openid
         WHERE u.id = ? ORDER BY a.is_default DESC, a.id DESC`,
        [userId]
      );
      return rows;
    }
  });
}
