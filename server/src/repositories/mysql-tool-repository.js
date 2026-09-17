function positiveId(value) {
  return Number.isInteger(value) && value > 0;
}

function dateOnly(value) {
  return value.toISOString().slice(0, 10);
}

function addMonths(date, months) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

function activationDate(createdAt, now) {
  const created = new Date(createdAt || now());
  const latestStart = addMonths(created, 1);
  return now() > latestStart ? latestStart : now();
}

function safeImage(value) {
  return typeof value === 'string' && value.trim() && !value.startsWith('cloud://') ? value : '';
}

export function createMysqlToolRepository(pool, { now = () => new Date() } = {}) {
  if (!pool || typeof pool.getConnection !== 'function') throw new Error('A transactional MySQL pool is required.');
  return Object.freeze({
    async list(userId) {
      if (!positiveId(userId)) throw new Error('A valid user id is required.');
      const [rows] = await pool.execute(
        `SELECT us.id, us.sn, us.name, us.model, us.image, us.activation_date, us.warranty_months, us.warranty_expire, us.status, us.source,
                COALESCE(ps.card_image, ps.image, p.cover_image, us.image) AS card_image
           FROM user_scissors us
           LEFT JOIN scissors s ON s.id = us.scissors_id AND s.deleted_at IS NULL
           LEFT JOIN products p ON p.id = s.product_id AND p.deleted_at IS NULL
           LEFT JOIN product_specs ps ON ps.id = s.spec_id
          WHERE us.user_id = ?
          ORDER BY us.created_at DESC, us.id DESC`,
        [userId]
      );
      return rows.map((row) => ({ ...row, image: safeImage(row.image), card_image: safeImage(row.card_image) }));
    },

    async bind(userId, sn) {
      if (!positiveId(userId)) throw new Error('A valid user id is required.');
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [tools] = await connection.execute(
          `SELECT s.id, s.sn, s.model, s.points_value, s.created_at, s.spec_id,
                  p.name AS product_name, p.cover_image AS product_cover_image, p.warranty_months,
                  ps.name AS spec_name, ps.sku, COALESCE(ps.card_image, ps.image, p.cover_image) AS card_image
             FROM scissors s
             LEFT JOIN products p ON p.id = s.product_id AND p.deleted_at IS NULL
             LEFT JOIN product_specs ps ON ps.id = s.spec_id
            WHERE s.sn = ? AND s.deleted_at IS NULL
            LIMIT 1 FOR UPDATE`,
          [sn]
        );
        if (tools.length !== 1) throw new Error('TOOL_NOT_FOUND');
        const tool = tools[0];
        const [existing] = await connection.execute('SELECT id FROM user_scissors WHERE scissors_id = ? LIMIT 1 FOR UPDATE', [tool.id]);
        if (existing.length) throw new Error('TOOL_ALREADY_BOUND');
        const [users] = await connection.execute('SELECT points, total_points FROM users WHERE id = ? AND status = \'active\' LIMIT 1 FOR UPDATE', [userId]);
        if (users.length !== 1) throw new Error('USER_NOT_FOUND');
        const warrantyMonths = Math.max(0, Number.parseInt(tool.warranty_months, 10) || 0);
        const activatedAt = activationDate(tool.created_at, now);
        const warrantyExpire = warrantyMonths ? dateOnly(addMonths(activatedAt, warrantyMonths)) : '2099-12-31';
        const name = String(tool.product_name || '').trim() || 'SRAVX 专业工具';
        const cardImage = safeImage(tool.card_image);
        const [insert] = await connection.execute(
          `INSERT INTO user_scissors (user_id, _openid, scissors_id, sn, name, model, image, activation_date, warranty_months, warranty_expire, status, source)
           SELECT ?, u.openid, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'bind' FROM users u WHERE u.id = ?`,
          [userId, tool.id, tool.sn, name, tool.model || '', cardImage, dateOnly(activatedAt), warrantyMonths, warrantyExpire, userId]
        );
        const awarded = Math.max(0, Number.parseInt(tool.points_value, 10) || 0);
        if (awarded) {
          const balance = (Number(users[0].points) || 0) + awarded;
          await connection.execute('UPDATE users SET points = points + ?, total_points = total_points + ?, updated_at = NOW() WHERE id = ?', [awarded, awarded, userId]);
          await connection.execute(
            `UPDATE users SET member_level = CASE WHEN total_points >= 60000 THEN 6 WHEN total_points >= 30000 THEN 5 WHEN total_points >= 10000 THEN 4 WHEN total_points >= 3000 THEN 3 WHEN total_points >= 1000 THEN 2 ELSE 1 END WHERE id = ?`,
            [userId]
          );
          await connection.execute(
            `INSERT INTO points_logs (user_id, change_type, points, balance, order_id, reason, remark, created_at)
             VALUES (?, 'activity_reward', ?, ?, NULL, 'bind_scissors', ?, NOW())`,
            [userId, awarded, balance, `绑定剪刀奖励：${tool.sn}`]
          );
        }
        await connection.commit();
        return { id: insert.insertId, sn: tool.sn, name, points_awarded: awarded, spec_name: tool.spec_name || '', sku: tool.sku || '', card_image: cardImage };
      } catch (cause) {
        await connection.rollback();
        throw cause;
      } finally {
        connection.release();
      }
    },

    async get(userId, bindingId) {
      if (!positiveId(userId) || !positiveId(bindingId)) throw new Error('A valid identifier is required.');
      const [rows] = await pool.execute(
        `SELECT us.id, us.scissors_id, us.sn, us.name, us.model, us.image, us.activation_date, us.warranty_months, us.warranty_expire, us.status,
                COALESCE(ps.name, s.spec_name, us.model) AS spec_name,
                COALESCE(ps.sku, s.sku, '') AS sku,
                COALESCE(ps.card_image, ps.image, p.cover_image, us.image) AS card_image
           FROM user_scissors us
           LEFT JOIN scissors s ON s.id = us.scissors_id AND s.deleted_at IS NULL
           LEFT JOIN products p ON p.id = s.product_id AND p.deleted_at IS NULL
           LEFT JOIN product_specs ps ON ps.id = s.spec_id
          WHERE us.id = ? AND us.user_id = ? LIMIT 1`,
        [bindingId, userId]
      );
      if (rows.length !== 1) return null;
      return { ...rows[0], image: safeImage(rows[0].image), card_image: safeImage(rows[0].card_image) };
    },

    async warranty(userId, serial) {
      if (!positiveId(userId)) throw new Error('A valid user id is required.');
      const sn = typeof serial === 'string' ? serial.trim().toUpperCase() : '';
      if (!/^[A-Z0-9-]{8,32}$/.test(sn)) throw new Error('INVALID_TOOL_SN');
      const [rows] = await pool.execute(
        `SELECT us.id, us.scissors_id, us.sn, us.name, us.model, us.image, us.activation_date, us.warranty_months, us.warranty_expire, us.status,
                COALESCE(ps.name, s.spec_name, us.model) AS spec_name,
                COALESCE(ps.sku, s.sku, '') AS sku,
                COALESCE(ps.card_image, ps.image, p.cover_image, us.image) AS card_image
           FROM user_scissors us
           LEFT JOIN scissors s ON s.id = us.scissors_id AND s.deleted_at IS NULL
           LEFT JOIN products p ON p.id = s.product_id AND p.deleted_at IS NULL
           LEFT JOIN product_specs ps ON ps.id = s.spec_id
          WHERE us.user_id = ? AND us.sn = ? LIMIT 1`,
        [userId, sn]
      );
      if (rows.length !== 1) return null;
      return { ...rows[0], image: safeImage(rows[0].image), card_image: safeImage(rows[0].card_image) };
    },

    async remove(userId, bindingId) {
      if (!positiveId(userId) || !positiveId(bindingId)) throw new Error('A valid identifier is required.');
      const [result] = await pool.execute('DELETE FROM user_scissors WHERE id = ? AND user_id = ?', [bindingId, userId]);
      return result.affectedRows === 1;
    }
  });
}
