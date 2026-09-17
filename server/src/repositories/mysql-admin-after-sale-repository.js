function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function limitedText(value, maximum) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function pageWindow({ page, pageSize }) {
  const limit = Math.min(100, positiveInteger(pageSize) || 50);
  return { limit, offset: ((positiveInteger(page) || 1) - 1) * limit };
}

function addressInput(input = {}) {
  const value = {
    label: limitedText(input.label, 50), contact: limitedText(input.contact, 50), phone: limitedText(input.phone, 20),
    province: limitedText(input.province, 50) || null, city: limitedText(input.city, 50) || null,
    district: limitedText(input.district, 50) || null, detail: limitedText(input.detail, 200),
    isEnabled: input.is_enabled === false ? 0 : 1, sortOrder: Number.isInteger(Number(input.sort_order)) ? Math.max(0, Math.min(100000, Number(input.sort_order))) : 0
  };
  if (!value.label || !value.contact || !value.phone || !value.detail) throw new Error('INVALID_SERVICE_ADDRESS');
  return value;
}

export function createMysqlAdminAfterSaleRepository(pool) {
  if (!pool || typeof pool.execute !== 'function') throw new Error('A MySQL pool is required.');
  return Object.freeze({
    async list({ keyword, status, serviceType, page, pageSize } = {}) {
      const { limit, offset } = pageWindow({ page, pageSize });
      const filters = ['1 = 1']; const values = [];
      if (typeof keyword === 'string' && keyword.trim()) { const term = `%${keyword.trim().slice(0, 64)}%`; filters.push('(asa.request_no LIKE ? OR asa.sn LIKE ?)'); values.push(term, term); }
      if (['submitted', 'awaiting_shipment', 'shipped', 'received', 'inspecting', 'repairing', 'replacement_pending', 'awaiting_user', 'returning', 'completed', 'rejected', 'cancelled'].includes(status)) { filters.push('asa.status = ?'); values.push(status); }
      if (['repair', 'replacement'].includes(serviceType)) { filters.push('asa.service_type = ?'); values.push(serviceType); }
      const where = filters.join(' AND ');
      const columns = 'asa.id, asa.request_no, asa.sn, asa.service_type, asa.status, asa.issue_description, asa.seller_message, asa.created_at, asa.updated_at';
      const [rows] = await pool.execute(`SELECT ${columns} FROM scissors_after_sales asa WHERE ${where} ORDER BY asa.created_at DESC, asa.id DESC LIMIT ? OFFSET ?`, [...values, limit, offset]);
      const [totals] = await pool.execute(`SELECT COUNT(*) AS total FROM scissors_after_sales asa WHERE ${where}`, values);
      return { list: rows, total: Number(totals[0]?.total || 0) };
    },
    async listServiceAddresses() {
      const [rows] = await pool.execute('SELECT id, label, contact, phone, province, city, district, detail, is_enabled, sort_order FROM after_sale_service_addresses ORDER BY is_enabled DESC, sort_order ASC, id DESC');
      return rows;
    },
    async saveServiceAddress(id, input) {
      const value = addressInput(input); const addressId = positiveInteger(id);
      if (addressId) {
        const [result] = await pool.execute('UPDATE after_sale_service_addresses SET label=?, contact=?, phone=?, province=?, city=?, district=?, detail=?, is_enabled=?, sort_order=? WHERE id=?', [value.label, value.contact, value.phone, value.province, value.city, value.district, value.detail, value.isEnabled, value.sortOrder, addressId]);
        return result.affectedRows === 1 ? { id: addressId } : null;
      }
      const [result] = await pool.execute('INSERT INTO after_sale_service_addresses (label, contact, phone, province, city, district, detail, is_enabled, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [value.label, value.contact, value.phone, value.province, value.city, value.district, value.detail, value.isEnabled, value.sortOrder]);
      return { id: result.insertId };
    },
    async reply({ id, adminAccountId, content }) {
      const requestId = positiveInteger(id); const message = limitedText(content, 1000);
      if (!requestId || !message) throw new Error('INVALID_MESSAGE');
      const [existing] = await pool.execute('SELECT id FROM scissors_after_sales WHERE id = ? LIMIT 1', [requestId]);
      if (existing.length !== 1) return null;
      await pool.execute("INSERT INTO scissors_after_sale_messages (after_sale_id, sender_role, sender_id, content, visible_to_user) VALUES (?, 'seller', ?, ?, 1)", [requestId, positiveInteger(adminAccountId), message]);
      await pool.execute('UPDATE scissors_after_sales SET seller_message = ?, seller_message_at = NOW(), handled_by = ? WHERE id = ?', [message, positiveInteger(adminAccountId), requestId]);
      return { id: requestId };
    }
  });
}
