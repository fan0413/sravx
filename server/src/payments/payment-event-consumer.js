import { decryptInboundPayload, decryptWechatPayResource } from './wechatpay-callback.js';

const nonRetryableCodes = new Set(['UNSUPPORTED_EVENT', 'INVALID_TRANSACTION', 'INVALID_REFUND', 'ORDER_NOT_FOUND', 'ORDER_SETTLEMENT_CONFLICT', 'ORDER_INVENTORY_NOT_FOUND', 'POINTS_INVENTORY_NOT_FOUND', 'POINTS_LEDGER_NOT_FOUND', 'REFUND_NOT_FOUND', 'REFUND_SETTLEMENT_CONFLICT']);

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
        if (!envelope?.resource) throw new Error('UNSUPPORTED_EVENT');
        const resource = decryptWechatPayResource(envelope.resource, apiV3Key);
        let result;
        if (event.event_type === 'TRANSACTION.SUCCESS') {
          if (resource.trade_state !== 'SUCCESS' || typeof resource.out_trade_no !== 'string' || typeof resource.transaction_id !== 'string') throw new Error('INVALID_TRANSACTION');
          result = resource.out_trade_no.startsWith('SP') && typeof settlementRepository.settlePointsTransaction === 'function'
            ? await settlementRepository.settlePointsTransaction({ outTradeNo: resource.out_trade_no, transactionId: resource.transaction_id })
            : await settlementRepository.settleTransaction({ outTradeNo: resource.out_trade_no, transactionId: resource.transaction_id });
        } else if (event.event_type === 'REFUND.SUCCESS') {
          if (resource.refund_status !== 'SUCCESS' || typeof resource.out_refund_no !== 'string' || typeof resource.refund_id !== 'string') throw new Error('INVALID_REFUND');
          if (typeof settlementRepository.settleRefund !== 'function') throw new Error('REFUND_SETTLEMENT_NOT_READY');
          result = await settlementRepository.settleRefund({ outRefundNo: resource.out_refund_no, refundId: resource.refund_id });
        } else throw new Error('UNSUPPORTED_EVENT');
        await inboundRepository.complete(event.id, consumerName);
        return Object.freeze({ consumed: true, ...result });
      } catch (cause) {
        const code = cause instanceof Error ? cause.message : 'CONSUMER_FAILED';
        if (nonRetryableCodes.has(code)) {
          await inboundRepository.block(event.id, consumerName, code);
          return Object.freeze({ consumed: true, blocked: true });
        }
        // Infrastructure failures remain claimed until the repository's stale-claim
        // timeout.  A later worker safely replays the event instead of discarding it.
        return Object.freeze({ consumed: true, deferred: true });
      }
    }
  });
}
