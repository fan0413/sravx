import { createCipheriv, createDecipheriv, createHash, randomBytes, verify } from 'node:crypto';

const SERIAL = /^[A-Za-z0-9_-]{1,128}$/;

export class PaymentCallbackError extends Error {
  constructor(code, { retryable = false } = {}) {
    super(code);
    this.code = code;
    this.retryable = retryable;
  }
}

function header(headers, name) {
  const value = headers?.[name.toLowerCase()] ?? headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

function requiredHeader(headers, name, pattern = /.+/) {
  const value = header(headers, name);
  if (typeof value !== 'string' || !pattern.test(value)) throw new PaymentCallbackError('INVALID_SIGNATURE');
  return value;
}

function parseBody(rawBody) {
  try {
    const value = JSON.parse(rawBody.toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid');
    return value;
  } catch {
    throw new PaymentCallbackError('INVALID_PAYLOAD');
  }
}

function optionalText(value, maximum = 128) {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum ? value : null;
}

export function createWechatPayCertificateProvider(certificates) {
  if (!certificates || typeof certificates !== 'object' || Array.isArray(certificates)) throw new Error('WeChat Pay platform certificates are required.');
  const entries = new Map(Object.entries(certificates).filter(([serial, publicKey]) => SERIAL.test(serial) && typeof publicKey === 'string' && (publicKey.includes('BEGIN PUBLIC KEY') || publicKey.includes('BEGIN CERTIFICATE'))));
  if (!entries.size) throw new Error('At least one valid WeChat Pay platform certificate is required.');
  return Object.freeze({ getPublicKey(serial) { return entries.get(serial) || null; } });
}

export function decryptWechatPayResource(resource, apiV3Key) {
  if (!resource || typeof resource !== 'object' || typeof resource.nonce !== 'string' || typeof resource.ciphertext !== 'string') throw new PaymentCallbackError('INVALID_PAYLOAD');
  if (typeof apiV3Key !== 'string' || Buffer.byteLength(apiV3Key, 'utf8') !== 32) throw new Error('WECHAT_PAY_API_V3_KEY must be exactly 32 bytes.');
  try {
    const encrypted = Buffer.from(resource.ciphertext, 'base64');
    if (encrypted.length <= 16) throw new Error('too short');
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(apiV3Key, 'utf8'), Buffer.from(resource.nonce, 'utf8'));
    if (typeof resource.associated_data === 'string') decipher.setAAD(Buffer.from(resource.associated_data, 'utf8'));
    decipher.setAuthTag(encrypted.subarray(encrypted.length - 16));
    const plain = Buffer.concat([decipher.update(encrypted.subarray(0, encrypted.length - 16)), decipher.final()]);
    const value = JSON.parse(plain.toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid');
    return value;
  } catch {
    throw new PaymentCallbackError('RESOURCE_DECRYPTION_FAILED');
  }
}

function validateInboundEncryptionKey(key) {
  if (typeof key !== 'string' || Buffer.byteLength(key, 'utf8') !== 32) throw new Error('PAYMENT_INBOUND_ENCRYPTION_KEY must be exactly 32 bytes.');
  return Buffer.from(key, 'utf8');
}

export function encryptInboundPayload(rawBody, encryptionKey) {
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) throw new Error('A raw callback body is required.');
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', validateInboundEncryptionKey(encryptionKey), nonce);
  const encrypted = Buffer.concat([cipher.update(rawBody), cipher.final(), cipher.getAuthTag()]);
  return Object.freeze({ nonce, ciphertext: encrypted });
}

export function decryptInboundPayload(ciphertext, nonce, encryptionKey) {
  if (!Buffer.isBuffer(ciphertext) || ciphertext.length <= 16 || !Buffer.isBuffer(nonce) || nonce.length !== 12) throw new Error('Invalid encrypted callback payload.');
  const decipher = createDecipheriv('aes-256-gcm', validateInboundEncryptionKey(encryptionKey), nonce);
  decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16));
  return Buffer.concat([decipher.update(ciphertext.subarray(0, ciphertext.length - 16)), decipher.final()]);
}

export function createWechatPayCallbackService({ certificateProvider, inboundRepository, apiV3Key, inboundEncryptionKey, now = () => Date.now(), maximumAgeSeconds = 300 }) {
  if (!certificateProvider || typeof certificateProvider.getPublicKey !== 'function') throw new Error('A WeChat Pay certificate provider is required.');
  if (!inboundRepository || typeof inboundRepository.recordVerified !== 'function') throw new Error('A payment inbound repository is required.');
  if (!Number.isInteger(maximumAgeSeconds) || maximumAgeSeconds < 30 || maximumAgeSeconds > 900) throw new Error('maximumAgeSeconds must be between 30 and 900.');

  return Object.freeze({
    async receive({ headers, rawBody, receivedAt = new Date(now()) }) {
      if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) throw new PaymentCallbackError('INVALID_PAYLOAD');
      const serial = requiredHeader(headers, 'wechatpay-serial', SERIAL);
      const signature = requiredHeader(headers, 'wechatpay-signature', /^[A-Za-z0-9+/=]+$/);
      const nonce = requiredHeader(headers, 'wechatpay-nonce', /^[A-Za-z0-9_-]{1,128}$/);
      const timestamp = requiredHeader(headers, 'wechatpay-timestamp', /^\d{10}$/);
      const timestampMs = Number(timestamp) * 1000;
      if (!Number.isSafeInteger(timestampMs) || Math.abs(now() - timestampMs) > maximumAgeSeconds * 1000) throw new PaymentCallbackError('STALE_SIGNATURE');
      const publicKey = certificateProvider.getPublicKey(serial);
      if (!publicKey) throw new PaymentCallbackError('UNKNOWN_CERTIFICATE');
      const message = `${timestamp}\n${nonce}\n${rawBody.toString('utf8')}\n`;
      let valid = false;
      try { valid = verify('RSA-SHA256', Buffer.from(message), publicKey, Buffer.from(signature, 'base64')); } catch { valid = false; }
      if (!valid) throw new PaymentCallbackError('INVALID_SIGNATURE');

      const envelope = parseBody(rawBody);
      const eventId = optionalText(envelope.id, 64);
      if (!eventId) throw new PaymentCallbackError('INVALID_PAYLOAD');
      const resource = decryptWechatPayResource(envelope.resource, apiV3Key);
      const encryptedPayload = encryptInboundPayload(rawBody, inboundEncryptionKey);
      const event = Object.freeze({
        eventId,
        eventType: optionalText(envelope.event_type, 64),
        resourceType: optionalText(envelope.resource_type, 64),
        resourceId: optionalText(envelope.resource?.id, 128),
        transactionId: optionalText(resource.transaction_id, 64),
        outTradeNo: optionalText(resource.out_trade_no, 64),
        outRefundNo: optionalText(resource.out_refund_no, 64),
        signatureSerial: serial,
        signatureTimestamp: Number(timestamp),
        payloadSha256: createHash('sha256').update(rawBody).digest(),
        payloadNonce: encryptedPayload.nonce,
        encryptedPayload: encryptedPayload.ciphertext,
        receivedAt
      });
      try {
        return await inboundRepository.recordVerified(event);
      } catch {
        throw new PaymentCallbackError('INBOUND_PERSISTENCE_FAILED', { retryable: true });
      }
    }
  });
}
