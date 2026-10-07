function requiredText(value, maximum, name) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum) throw new Error(`Invalid ${name}.`);
  return value;
}

function positiveSeconds(value, name) {
  if (!Number.isInteger(value) || value < 1 || value > 86400) throw new Error(`Invalid ${name}.`);
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
    // A process can stop after the claim transaction commits but before it settles
    // the order.  Reclaim only sufficiently old claims; settlement is guarded by
    // the WeChat transaction id, so replay cannot create a second business change.
    async claimNext(consumerName, { staleAfterSeconds = 300 } = {}) {
      requiredText(consumerName, 64, 'consumer name');
      const staleSeconds = positiveSeconds(staleAfterSeconds, 'stale-after seconds');
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [events] = await connection.execute(
          `SELECT id, event_id, event_type, payload_nonce, encrypted_payload
             FROM payment_inbound_events
            WHERE processing_status = 'received'
               OR (processing_status = 'processing' AND updated_at < DATE_SUB(NOW(3), INTERVAL ${staleSeconds} SECOND))
             ORDER BY received_at ASC, id ASC LIMIT 1 FOR UPDATE SKIP LOCKED`
        );
        if (events.length !== 1) { await connection.commit(); return null; }
        const event = events[0];
        const [consumption] = await connection.execute(
          `INSERT IGNORE INTO payment_event_consumptions (inbound_event_id, consumer_name, status, attempt_count)
           VALUES (?, ?, 'processing', 1)
           ON DUPLICATE KEY UPDATE status = 'processing', attempt_count = attempt_count + 1, last_error_code = NULL, processed_at = NULL`, [event.id, consumerName]
        );
        if (consumption.affectedRows < 1) throw new Error('PAYMENT_CONSUMPTION_CLAIM_FAILED');
        await connection.execute("UPDATE payment_inbound_events SET processing_status = 'processing', last_error_code = NULL WHERE id = ?", [event.id]);
        await connection.commit();
        return event;
      } catch (cause) { await connection.rollback(); throw cause; } finally { connection.release(); }
    },
    async complete(eventId, consumerName) {
      requiredText(consumerName, 64, 'consumer name');
      await pool.execute("UPDATE payment_event_consumptions SET status = 'processed', processed_at = NOW(3), last_error_code = NULL WHERE inbound_event_id = ? AND consumer_name = ?", [eventId, consumerName]);
      await pool.execute("UPDATE payment_inbound_events SET processing_status = 'processed', processed_at = NOW(3), last_error_code = NULL WHERE id = ?", [eventId]);
    },
    async block(eventId, consumerName, code) {
      requiredText(consumerName, 64, 'consumer name');
      requiredText(code, 64, 'error code');
      await pool.execute("UPDATE payment_event_consumptions SET status = 'blocked', last_error_code = ? WHERE inbound_event_id = ? AND consumer_name = ?", [code, eventId, consumerName]);
      await pool.execute("UPDATE payment_inbound_events SET processing_status = 'blocked', last_error_code = ? WHERE id = ?", [code, eventId]);
    },
    // Aggregate operational state only: callback contents and payment identities
    // stay encrypted in the ledger and are never exposed to an admin response.
    async healthSummary() {
      const [rows] = await pool.execute(
        `SELECT processing_status AS status, COUNT(*) AS total,
                MIN(CASE WHEN processing_status IN ('received', 'processing') THEN received_at ELSE NULL END) AS oldest_pending_at
           FROM payment_inbound_events
          GROUP BY processing_status`
      );
      const byStatus = Object.fromEntries(['received', 'processing', 'processed', 'blocked'].map((status) => [status, 0]));
      let oldestPendingAt = null;
      for (const row of rows) {
        if (Object.hasOwn(byStatus, row.status)) byStatus[row.status] = Number(row.total || 0);
        if (row.oldest_pending_at && (!oldestPendingAt || new Date(row.oldest_pending_at) < new Date(oldestPendingAt))) oldestPendingAt = row.oldest_pending_at;
      }
      return Object.freeze({ byStatus, oldestPendingAt });
    }
  });
}
