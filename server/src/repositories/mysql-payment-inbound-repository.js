function requiredText(value, maximum, name) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum) throw new Error(`Invalid ${name}.`);
  return value;
}

export function createMysqlPaymentInboundRepository(pool) {
  if (!pool || typeof pool.execute !== 'function') throw new Error('A MySQL pool is required.');
  return Object.freeze({
    async recordVerified(event) {
      requiredText(event.eventId, 64, 'event id');
      if (!Buffer.isBuffer(event.encryptedPayload) || event.encryptedPayload.length <= 16 || !Buffer.isBuffer(event.payloadNonce) || event.payloadNonce.length !== 12) throw new Error('An encrypted callback body is required.');
      if (!Buffer.isBuffer(event.payloadSha256) || event.payloadSha256.length !== 32) throw new Error('A callback digest is required.');
      const [result] = await pool.execute(
        `INSERT INTO payment_inbound_events
          (event_id, event_type, resource_type, resource_id, transaction_id, out_trade_no, out_refund_no, signature_serial, signature_timestamp, payload_sha256, payload_nonce, encrypted_payload, payload_key_version, received_at, processing_status, duplicate_count, last_received_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'v1', ?, 'received', 0, ?)
         ON DUPLICATE KEY UPDATE duplicate_count = duplicate_count + 1, last_received_at = VALUES(last_received_at), id = LAST_INSERT_ID(id)`,
        [event.eventId, event.eventType, event.resourceType, event.resourceId, event.transactionId, event.outTradeNo, event.outRefundNo, event.signatureSerial, event.signatureTimestamp, event.payloadSha256, event.payloadNonce, event.encryptedPayload, event.receivedAt, event.receivedAt]
      );
      return Object.freeze({ id: Number(result.insertId), duplicate: result.affectedRows === 2 });
    },
    async claimNext(consumerName) {
      requiredText(consumerName, 64, 'consumer name');
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [events] = await connection.execute(
          `SELECT id, event_id, event_type, payload_nonce, encrypted_payload
             FROM payment_inbound_events WHERE processing_status = 'received'
             ORDER BY received_at ASC, id ASC LIMIT 1 FOR UPDATE SKIP LOCKED`
        );
        if (events.length !== 1) { await connection.commit(); return null; }
        const event = events[0];
        const [consumption] = await connection.execute(
          `INSERT IGNORE INTO payment_event_consumptions (inbound_event_id, consumer_name, status, attempt_count)
           VALUES (?, ?, 'processing', 1)`, [event.id, consumerName]
        );
        if (consumption.affectedRows !== 1) { await connection.commit(); return null; }
        await connection.execute("UPDATE payment_inbound_events SET processing_status = 'processing' WHERE id = ?", [event.id]);
        await connection.commit();
        return event;
      } catch (cause) { await connection.rollback(); throw cause; } finally { connection.release(); }
    },
    async complete(eventId) {
      await pool.execute("UPDATE payment_inbound_events SET processing_status = 'processed', processed_at = NOW(3), last_error_code = NULL WHERE id = ?", [eventId]);
    },
    async block(eventId, code) {
      requiredText(code, 64, 'error code');
      await pool.execute("UPDATE payment_inbound_events SET processing_status = 'blocked', last_error_code = ? WHERE id = ?", [code, eventId]);
    }
  });
}
