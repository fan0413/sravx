import { decryptInboundPayload, decryptWechatPayResource } from './wechatpay-callback.js';

export function createPaymentEventConsumer({ inboundRepository, settlementRepository, apiV3Key, inboundEncryptionKey, consumerName = 'wechat-transaction-settlement' }) {
  if (!inboundRepository || typeof inboundRepository.claimNext !== 'function' || typeof inboundRepository.complete !== 'function' || typeof inboundRepository.block !== 'function') throw new Error('A payment inbound repository is required.');
  if (!settlementRepository || typeof settlementRepository.settleTransaction !== 'function') throw new Error('A payment settlement repository is required.');
  return Object.freeze({
    async consumeOne() {
      const event = await inboundRepository.claimNext(consumerName);
      if (!event) return Object.freeze({ consumed: false });
      try {
        const raw = decryptInboundPayload(event.encrypted_payload, event.payload_nonce, inboundEncryptionKey);
        const envelope = JSON.parse(raw.toString('utf8'));
        if (event.event_type !== 'TRANSACTION.SUCCESS' || !envelope?.resource) throw new Error('UNSUPPORTED_EVENT');
        const resource = decryptWechatPayResource(envelope.resource, apiV3Key);
        if (resource.trade_state !== 'SUCCESS' || typeof resource.out_trade_no !== 'string' || typeof resource.transaction_id !== 'string') throw new Error('INVALID_TRANSACTION');
        const result = await settlementRepository.settleTransaction({ outTradeNo: resource.out_trade_no, transactionId: resource.transaction_id });
        await inboundRepository.complete(event.id);
        return Object.freeze({ consumed: true, ...result });
      } catch (cause) {
        const code = cause instanceof Error ? cause.message : 'CONSUMER_FAILED';
        await inboundRepository.block(event.id, /^[A-Z_]{1,64}$/.test(code) ? code : 'CONSUMER_FAILED');
        return Object.freeze({ consumed: true, blocked: true });
      }
    }
  });
}
