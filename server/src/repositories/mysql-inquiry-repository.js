function validUserId(value) {
  if (!Number.isInteger(value) || value <= 0) throw new Error('A valid user id is required.');
}

export function createMysqlInquiryRepository(pool) {
  if (!pool || typeof pool.execute !== 'function') throw new Error('A MySQL pool is required.');
  return Object.freeze({
    async submit(userId, input) {
      validUserId(userId);
      const [result] = await pool.execute(
        `INSERT INTO cooperation_inquiries (name, gender, scale, phone, wechat, address, intention, _openid, status, created_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, u.openid, 0, UTC_TIMESTAMP()
           FROM users u
          WHERE u.id = ? AND u.status = 'active'`,
        [input.name, input.gender, input.scale, input.phone, input.wechat, input.address, input.intention, userId]
      );
      if (result.affectedRows !== 1) throw new Error('USER_NOT_FOUND');
      return { id: Number(result.insertId) };
    }
  });
}
