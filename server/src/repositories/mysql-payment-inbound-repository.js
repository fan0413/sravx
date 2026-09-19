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
    }
  });
}
