import { randomBytes } from 'node:crypto';

const SAFE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const STATUSES = new Set(['unused', 'sold', 'bound', 'expired']);

function integer(value, fallback = null) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function boundedInteger(value, { minimum, maximum, fallback }) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, number));
}

function text(value, maximum) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function pageWindow({ page, pageSize }, maximum = 100) {
  const limit = Math.min(maximum, integer(pageSize, 50));
  return { limit, offset: (integer(page, 1) - 1) * limit };
}

function prefix(value) {
  return text(value, 12).toUpperCase().replace(/[^0-9A-Z]/g, '').split('').filter((character) => SAFE_ALPHABET.includes(character)).join('').slice(0, 4);
}

function randomSuffix(length) {
  const bytes = randomBytes(length);
  let output = '';
  for (let index = 0; index < length; index += 1) output += SAFE_ALPHABET[bytes[index] % SAFE_ALPHABET.length];
  return output;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return today();
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? today() : value;
}

function batchNo(value, safePrefix) {
  const requested = text(value, 32).toUpperCase();
  if (requested && /^[0-9A-Z-]+$/.test(requested)) return requested;
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `${safePrefix || 'SN'}-${stamp}-${randomSuffix(4)}`;
}

function specProjection() {
  return `COALESCE(ps.id, s.spec_id) AS matched_spec_id,
          COALESCE(ps.name, s.spec_name) AS matched_spec_name,
          COALESCE(ps.sku, s.sku) AS matched_sku,
          COALESCE(NULLIF(s.card_image, ''), NULLIF(ps.card_image, ''), NULLIF(p.scissors_card_image, ''), NULLIF(ps.image, ''), p.cover_image) AS image`;
}

export function createMysqlAdminScissorsRepository(pool) {
  if (!pool || typeof pool.execute !== 'function' || typeof pool.getConnection !== 'function') throw new Error('A MySQL pool is required.');
  return Object.freeze({
    async listProducts() {
      const [products] = await pool.execute('SELECT id, name, cover_image, scissors_card_image FROM products WHERE deleted_at IS NULL ORDER BY sort_order ASC, id DESC LIMIT 500');
      if (!products.length) return [];
      const ids = products.map(({ id }) => id);
      const placeholders = ids.map(() => '?').join(',');
      const [specs] = await pool.execute(`SELECT id, product_id, name, sku, image, card_image FROM product_specs WHERE product_id IN (${placeholders}) ORDER BY sort_order ASC, id ASC`, ids);
      const map = new Map(ids.map((id) => [id, []]));
      for (const spec of specs) map.get(spec.product_id)?.push(spec);
      return products.map((product) => ({ ...product, specs: map.get(product.id) || [] }));
    },
    async list({ sn, batchNo: requestedBatchNo, status, productId, specId, page, pageSize } = {}) {
      const { limit, offset } = pageWindow({ page, pageSize }, 200);
      const filters = ['s.deleted_at IS NULL'];
      const values = [];
      const serial = text(sn, 64); if (serial) { filters.push('s.sn LIKE ?'); values.push(`%${serial}%`); }
      const batch = text(requestedBatchNo, 64); if (batch) { filters.push('s.batch_no = ?'); values.push(batch); }
      if (STATUSES.has(status)) { filters.push('s.status = ?'); values.push(status); }
      const product = integer(productId); if (product) { filters.push('s.product_id = ?'); values.push(product); }
      const spec = integer(specId); if (spec) { filters.push('s.spec_id = ?'); values.push(spec); }
      const where = filters.join(' AND ');
      const joins = 'LEFT JOIN products p ON p.id = s.product_id LEFT JOIN product_specs ps ON ps.id = s.spec_id AND ps.product_id = s.product_id';
      const [rows] = await pool.execute(
        `SELECT s.id, s.sn, s.batch_no, s.product_id, s.spec_id, s.sku, s.spec_name, s.model, s.produce_date, s.points_value, s.status, s.created_at, s.updated_at, p.name, ${specProjection()}
           FROM scissors s ${joins} WHERE ${where} ORDER BY s.id DESC LIMIT ? OFFSET ?`,
        [...values, limit, offset]
      );
      const [totals] = await pool.execute(`SELECT COUNT(*) AS total FROM scissors s WHERE ${where}`, values);
      return { list: rows, total: Number(totals[0]?.total || 0) };
    },
    async detail({ id, sn } = {}) {
      const identifier = integer(id); const serial = text(sn, 64);
      if (!identifier && !serial) return null;
      const joins = 'LEFT JOIN products p ON p.id = s.product_id LEFT JOIN product_specs ps ON ps.id = s.spec_id AND ps.product_id = s.product_id';
      const [rows] = await pool.execute(
        `SELECT s.id, s.sn, s.batch_no, s.product_id, s.spec_id, s.sku, s.spec_name, s.card_image, s.image AS legacy_image, s.model, s.produce_date, s.points_value, s.status, s.created_at, s.updated_at, p.name, ${specProjection()}
           FROM scissors s ${joins} WHERE s.deleted_at IS NULL AND ${identifier ? 's.id = ?' : 's.sn = ?'} LIMIT 1`,
        [identifier || serial]
      );
      return rows[0] || null;
    },
    async listBatches({ page, pageSize } = {}) {
      const { limit, offset } = pageWindow({ page, pageSize });
      const [totals] = await pool.execute('SELECT COUNT(DISTINCT batch_no) AS total FROM scissors WHERE deleted_at IS NULL AND batch_no IS NOT NULL');
      const [rows] = await pool.execute(
        `SELECT s.batch_no, MIN(s.product_id) AS product_id, MIN(p.name) AS name, MIN(s.spec_id) AS matched_spec_id, MIN(COALESCE(ps.name, s.spec_name)) AS spec_name, MIN(COALESCE(ps.sku, s.sku)) AS sku, MIN(s.points_value) AS points_value, MIN(s.produce_date) AS produce_date, COUNT(*) AS total_count, SUM(s.status = 'unused') AS unused_count, SUM(s.status = 'bound') AS bound_count, SUM(s.status = 'sold') AS sold_count, SUM(s.status = 'expired') AS expired_count, MIN(s.created_at) AS created_at
           FROM scissors s LEFT JOIN products p ON p.id = s.product_id LEFT JOIN product_specs ps ON ps.id = s.spec_id AND ps.product_id = s.product_id
          WHERE s.deleted_at IS NULL AND s.batch_no IS NOT NULL GROUP BY s.batch_no ORDER BY MIN(s.created_at) DESC, s.batch_no DESC LIMIT ? OFFSET ?`,
        [limit, offset]
      );
      return { list: rows, total: Number(totals[0]?.total || 0) };
    },
    async createBatch(input = {}) {
      const productId = integer(input.productId); if (!productId) throw new Error('Invalid product.');
      const count = boundedInteger(input.count, { minimum: 1, maximum: 500, fallback: 0 }); if (!count) throw new Error('Invalid count.');
      const pointsValue = boundedInteger(input.pointsValue ?? 0, { minimum: 0, maximum: 1000000, fallback: -1 }); if (pointsValue < 0) throw new Error('Invalid points value.');
      const requestedLength = boundedInteger(input.snLength, { minimum: 6, maximum: 16, fallback: 10 });
      const safePrefix = prefix(input.prefix);
      const length = Math.max(requestedLength, safePrefix.length + 6); if (length > 16) throw new Error('Invalid serial length.');
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [products] = await connection.execute('SELECT id, name, cover_image, scissors_card_image FROM products WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [productId]);
        if (products.length !== 1) throw new Error('PRODUCT_NOT_FOUND');
        const product = products[0];
        const selectedSpecId = integer(input.specId);
        const [specs] = await connection.execute('SELECT id, name, sku, image, card_image FROM product_specs WHERE product_id = ? ORDER BY sort_order ASC, id ASC', [productId]);
        let spec = selectedSpecId ? specs.find((row) => row.id === selectedSpecId) : (specs.length === 1 ? specs[0] : null);
        if (selectedSpecId && !spec) throw new Error('SPEC_NOT_FOUND');
        if (specs.length > 1 && !spec) throw new Error('SPEC_REQUIRED');
        const batch = batchNo(input.batchNo, safePrefix);
        const [existing] = await connection.execute('SELECT 1 FROM scissors WHERE batch_no = ? AND deleted_at IS NULL LIMIT 1 FOR UPDATE', [batch]);
        if (existing.length) throw new Error('BATCH_EXISTS');
        const serials = new Set();
        while (serials.size < count) serials.add(`${safePrefix}${randomSuffix(length - safePrefix.length)}`);
        const rows = [...serials];
        const placeholders = rows.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, \'unused\', UTC_TIMESTAMP(), UTC_TIMESTAMP())').join(',');
        const values = [];
        for (const serial of rows) values.push(serial, batch, product.id, spec?.id || null, spec?.sku || '', spec?.name || '', spec?.card_image || product.scissors_card_image || '', spec?.image || product.cover_image || '', text(input.model, 50) || null, date(input.produceDate), pointsValue);
        await connection.execute(`INSERT INTO scissors (sn, batch_no, product_id, spec_id, sku, spec_name, card_image, image, model, produce_date, points_value, status, created_at, updated_at) VALUES ${placeholders}`, values);
        await connection.commit();
        return { batchNo: batch, count: rows.length, productId: product.id, productName: product.name, specId: spec?.id || null, specName: spec?.name || '', sku: spec?.sku || '', pointsValue, produceDate: date(input.produceDate), snLength: length, sampleSns: rows.slice(0, 20) };
      } catch (cause) { await connection.rollback(); throw cause; } finally { connection.release(); }
    },
    async deleteUnused(ids) {
      const unique = [...new Set((Array.isArray(ids) ? ids : []).map(integer).filter(Boolean))].slice(0, 500);
      if (!unique.length) throw new Error('Invalid serial ids.');
      const placeholders = unique.map(() => '?').join(',');
      const [result] = await pool.execute(`UPDATE scissors SET deleted_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP() WHERE id IN (${placeholders}) AND status = 'unused' AND deleted_at IS NULL`, unique);
      return { deleted: Number(result.affectedRows || 0), requested: unique.length };
    }
  });
}
