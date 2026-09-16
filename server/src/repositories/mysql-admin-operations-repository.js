function positiveInteger(value, fallback = null) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function pageWindow({ page, pageSize }) {
  const limit = Math.min(100, positiveInteger(pageSize, 50));
  return { limit, offset: (positiveInteger(page, 1) - 1) * limit };
}

function inquiryStatus(value) {
  const status = Number(value);
  if (![0, 1, 2].includes(status)) throw new Error('Invalid inquiry status.');
  return status;
}

export function createMysqlAdminOperationsRepository(pool) {
  if (!pool || typeof pool.execute !== 'function') throw new Error('A MySQL pool is required.');
  return Object.freeze({
    async listUsers({ keyword, status, page, pageSize } = {}) {
      const { limit, offset } = pageWindow({ page, pageSize });
      const filters = ['1 = 1'];
      const values = [];
      if (typeof keyword === 'string' && keyword.trim()) {
        const term = `%${keyword.trim().slice(0, 50)}%`;
        filters.push('(username LIKE ? OR phone LIKE ?)');
        values.push(term, term);
      }
      if (['active', 'frozen', 'deleted'].includes(status)) { filters.push('status = ?'); values.push(status); }
      const where = filters.join(' AND ');
      const columns = 'id, username, phone, gender, birthday, occupation, member_level, points, total_spent, status, last_login_at, created_at, updated_at';
      const [rows] = await pool.execute(`SELECT ${columns} FROM users WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`, [...values, limit, offset]);
      const [totals] = await pool.execute(`SELECT COUNT(*) AS total FROM users WHERE ${where}`, values);
      return { list: rows, total: Number(totals[0]?.total || 0) };
    },
    async getUser(id) {
      const userId = positiveInteger(id); if (!userId) return null;
      const [users] = await pool.execute('SELECT id, username, phone, gender, birthday, occupation, member_level, points, total_points, total_spent, order_count, status, last_login_at, created_at, updated_at FROM users WHERE id = ? LIMIT 1', [userId]);
      if (users.length !== 1) return null;
      const [addresses] = await pool.execute(
        `SELECT a.id, a.contact, a.name, a.phone, a.province, a.city, a.district, a.detail, a.is_default, a.tag, a.created_at, a.updated_at
           FROM addresses a INNER JOIN users u ON u.openid = a.openid
          WHERE u.id = ? ORDER BY a.is_default DESC, a.id DESC`,
        [userId]
      );
      return { user: users[0], addresses };
    },
    async listInquiries({ keyword, status, page, pageSize } = {}) {
      const { limit, offset } = pageWindow({ page, pageSize });
      const filters = ['1 = 1'];
      const values = [];
      if (typeof keyword === 'string' && keyword.trim()) {
        const term = `%${keyword.trim().slice(0, 100)}%`;
        filters.push('(name LIKE ? OR phone LIKE ? OR wechat LIKE ? OR address LIKE ?)');
        values.push(term, term, term, term);
      }
      if ([0, 1, 2].includes(Number(status))) { filters.push('status = ?'); values.push(Number(status)); }
      const where = filters.join(' AND ');
      const [rows] = await pool.execute(`SELECT id, name, gender, scale, phone, wechat, address, intention, status, created_at FROM cooperation_inquiries WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`, [...values, limit, offset]);
      const [totals] = await pool.execute(`SELECT COUNT(*) AS total FROM cooperation_inquiries WHERE ${where}`, values);
      return { list: rows, total: Number(totals[0]?.total || 0) };
    },
    async updateInquiryStatus(id, status) {
      const inquiryId = positiveInteger(id); if (!inquiryId) return false;
      const [result] = await pool.execute('UPDATE cooperation_inquiries SET status = ? WHERE id = ?', [inquiryStatus(status), inquiryId]);
      return result.affectedRows === 1;
    }
  });
}
