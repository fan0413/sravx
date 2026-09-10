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
    }
  });
}
