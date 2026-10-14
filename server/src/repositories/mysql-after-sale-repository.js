import { randomBytes } from 'node:crypto';

const OPEN_STATUSES = Object.freeze(['submitted', 'awaiting_shipment', 'shipped', 'received', 'inspecting', 'repairing', 'replacement_pending', 'awaiting_user', 'returning']);

function positiveId(value) {
  return Number.isInteger(value) && value > 0;
}

function requestNo(now = new Date()) {
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  return `AS${date}${randomBytes(4).toString('hex').toUpperCase()}`;
}

export function createMysqlAfterSaleRepository(pool) {
  if (!pool || typeof pool.getConnection !== 'function') throw new Error('A transactional MySQL pool is required.');
  return Object.freeze({
    async list(userId, bindingId) {
      if (!positiveId(userId) || !positiveId(bindingId)) throw new Error('A valid identifier is required.');
      const [rows] = await pool.execute(
        `SELECT asa.id, asa.request_no, asa.service_type, asa.issue_description, asa.status, asa.seller_message, asa.seller_message_at,
                asa.replacement_sn, asa.created_at, asa.updated_at, asa.return_carrier, asa.return_tracking_no, asa.return_shipped_at,
                asa.outbound_carrier, asa.outbound_tracking_no, asa.outbound_shipped_at, asa.freight_coupon_status, asa.freight_coupon_note
           FROM scissors_after_sales asa
           INNER JOIN user_scissors us ON us.id = asa.user_scissors_id
          WHERE asa.user_scissors_id = ? AND us.user_id = ?
          ORDER BY asa.created_at DESC, asa.id DESC`,
        [bindingId, userId]
      );
      if (!rows.length) return [];
      const ids = rows.map(({ id }) => id);
      const placeholders = ids.map(() => '?').join(',');
      const [messages] = await pool.execute(
        `SELECT id, after_sale_id, sender_role, content, created_at
           FROM scissors_after_sale_messages
          WHERE after_sale_id IN (${placeholders}) AND visible_to_user = 1
          ORDER BY after_sale_id ASC, created_at ASC, id ASC`,
        ids
      );
      const grouped = new Map();
      for (const message of messages) {
        const group = grouped.get(message.after_sale_id) || [];
        group.push(message);
        grouped.set(message.after_sale_id, group);
      }
      return rows.map((row) => ({ ...row, messages: grouped.get(row.id) || [] }));
    },

    async apply(userId, { bindingId, recipientAddressId, serviceType, description }) {
      if (!positiveId(userId) || !positiveId(bindingId) || !positiveId(recipientAddressId)) throw new Error('INVALID_REQUEST');
      if (!['repair', 'replacement'].includes(serviceType) || typeof description !== 'string' || description.length < 5 || description.length > 500) throw new Error('INVALID_REQUEST');
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [bindings] = await connection.execute(
          'SELECT id, scissors_id, sn FROM user_scissors WHERE id = ? AND user_id = ? LIMIT 1 FOR UPDATE',
          [bindingId, userId]
        );
        if (bindings.length !== 1) throw new Error('TOOL_NOT_FOUND');
        const binding = bindings[0];
        const [addresses] = await connection.execute(
          `SELECT a.name, a.contact, a.phone, a.province, a.city, a.district, a.detail
             FROM addresses a INNER JOIN users u ON u.openid COLLATE utf8mb4_bin = a.openid COLLATE utf8mb4_bin
            WHERE a.id = ? AND u.id = ? LIMIT 1 FOR UPDATE`,
          [recipientAddressId, userId]
        );
        if (addresses.length !== 1) throw new Error('ADDRESS_NOT_FOUND');
        const address = addresses[0];
        const recipientName = String(address.name || address.contact || '').trim();
        const recipientAddress = [address.province, address.city, address.district, address.detail].filter(Boolean).join('');
        if (!recipientName || !address.phone || !recipientAddress) throw new Error('ADDRESS_INCOMPLETE');
        const placeholders = OPEN_STATUSES.map(() => '?').join(',');
        const [existing] = await connection.execute(
          `SELECT id FROM scissors_after_sales WHERE user_scissors_id = ? AND status IN (${placeholders}) LIMIT 1 FOR UPDATE`,
          [bindingId, ...OPEN_STATUSES]
        );
        if (existing.length) throw new Error('AFTER_SALE_ALREADY_OPEN');
        const [[user]] = await connection.execute('SELECT openid FROM users WHERE id = ? LIMIT 1 FOR UPDATE', [userId]);
        if (!user) throw new Error('USER_NOT_FOUND');
        const number = requestNo();
        const [insert] = await connection.execute(
          `INSERT INTO scissors_after_sales (request_no, user_id, openid, _openid, user_scissors_id, scissors_id, sn, service_type, issue_description, status, recipient_name, recipient_phone, recipient_address_text)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?, ?)`,
          [number, userId, user.openid, user.openid, bindingId, binding.scissors_id, binding.sn, serviceType, description, recipientName, address.phone, recipientAddress]
        );
        await connection.execute(
          "INSERT INTO scissors_after_sale_messages (after_sale_id, sender_role, sender_id, content, visible_to_user) VALUES (?, 'user', ?, ?, 1)",
          [insert.insertId, userId, description]
        );
        await connection.commit();
        return { id: insert.insertId, requestNo: number };
      } catch (cause) {
        await connection.rollback();
        throw cause;
      } finally {
        connection.release();
      }
    },

    async submitShipment(userId, requestId, { carrier, trackingNo, freightAmount }) {
      if (!positiveId(userId) || !positiveId(requestId) || typeof carrier !== 'string' || !carrier || carrier.length > 50 || typeof trackingNo !== 'string' || !trackingNo || trackingNo.length > 64 || !Number.isFinite(freightAmount) || freightAmount < 0 || freightAmount > 100000) throw new Error('INVALID_REQUEST');
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [result] = await connection.execute(
          `UPDATE scissors_after_sales asa INNER JOIN user_scissors us ON us.id = asa.user_scissors_id
              SET asa.return_carrier = ?, asa.return_tracking_no = ?, asa.return_shipped_at = NOW(), asa.return_freight_amount = ?, asa.status = 'shipped', asa.updated_at = NOW()
            WHERE asa.id = ? AND us.user_id = ? AND asa.status = 'awaiting_shipment'`,
          [carrier, trackingNo, freightAmount, requestId, userId]
        );
        if (result.affectedRows !== 1) throw new Error('AFTER_SALE_NOT_SHIPPABLE');
        await connection.execute(
          "INSERT INTO scissors_after_sale_messages (after_sale_id, sender_role, sender_id, content, visible_to_user) VALUES (?, 'user', ?, ?, 1)",
          [requestId, userId, `已寄回：${carrier} ${trackingNo}`]
        );
        await connection.commit();
        return { id: requestId };
      } catch (cause) {
        await connection.rollback();
        throw cause;
      } finally {
        connection.release();
      }
    }
  });
}
