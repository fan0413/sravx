export function createMysqlMediaIntentRepository(pool) {
  if (!pool || typeof pool.execute !== 'function') throw new Error('A MySQL pool is required.');
  return Object.freeze({
    async create({ adminAccountId, intent }) {
      if (!Number.isInteger(adminAccountId) || adminAccountId <= 0) throw new Error('A valid administrator id is required.');
      await pool.execute(
        `INSERT INTO media_upload_intents
          (id, admin_account_id, object_key, content_type, byte_size, content_sha256, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [intent.id, adminAccountId, intent.objectKey, intent.contentType, intent.byteSize, intent.contentSha256, intent.expiresAt]
      );
      return intent;
    },
    async getPending({ adminAccountId, id }) {
      const [rows] = await pool.execute(
        `SELECT id, object_key AS objectKey, content_type AS contentType, byte_size AS byteSize, content_sha256 AS contentSha256, expires_at AS expiresAt
         FROM media_upload_intents
         WHERE id = ? AND admin_account_id = ? AND status = 'pending' AND expires_at > UTC_TIMESTAMP()
         LIMIT 1`,
        [id, adminAccountId]
      );
      const intent = rows[0];
      return intent ? { ...intent, byteSize: Number(intent.byteSize), expiresAt: new Date(intent.expiresAt) } : null;
    },
    async confirm({ adminAccountId, id }) {
      const [result] = await pool.execute(
        `UPDATE media_upload_intents
         SET status = 'confirmed', confirmed_at = UTC_TIMESTAMP()
         WHERE id = ? AND admin_account_id = ? AND status = 'pending' AND expires_at > UTC_TIMESTAMP()`,
        [id, adminAccountId]
      );
      return result.affectedRows === 1;
    }
  });
}
