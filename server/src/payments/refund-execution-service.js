function positiveId(value) { const id = Number(value); if (!Number.isSafeInteger(id) || id < 1) throw new Error('INVALID_REFUND_REQUEST'); return id; }

// Execution is deliberately separate from review. The repository owns amounts
// and transaction IDs; this service never accepts money values from an admin UI.
export function createRefundExecutionService({ prepareRefund, createRefund }) {
  if (typeof prepareRefund !== 'function') throw new Error('A refund preparation repository is required.');
  if (!createRefund || typeof createRefund.createRefund !== 'function') throw new Error('A WeChat Pay refund client is required.');
  return Object.freeze({
    async execute(requestId) {
      const prepared = await prepareRefund(positiveId(requestId));
      return createRefund.createRefund(prepared);
    }
  });
}
