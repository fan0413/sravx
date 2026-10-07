function validConsumer(consumer) {
  if (!consumer || typeof consumer.consumeOne !== 'function') throw new Error('A payment event consumer is required.');
  return consumer;
}

function validPositiveInteger(value, fallback, name) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

// The callback receiver only records verified events.  This worker consumes the
// durable ledger afterwards, so a slow settlement can never make WeChat retry a
// callback that was already stored successfully.
export function createPaymentEventWorker({ consumer, intervalMs = 1000, maximumBatchSize = 20, onError = () => {} } = {}) {
  validConsumer(consumer);
  const delay = validPositiveInteger(intervalMs, 1000, 'intervalMs');
  const batchSize = validPositiveInteger(maximumBatchSize, 20, 'maximumBatchSize');
  if (typeof onError !== 'function') throw new Error('onError must be a function.');
  let running = false;
  let timer = null;

  async function drain() {
    if (running) return Object.freeze({ skipped: true, processed: 0 });
    running = true;
    let processed = 0;
    try {
      while (processed < batchSize) {
        const result = await consumer.consumeOne();
        if (!result?.consumed) break;
        processed += 1;
      }
      return Object.freeze({ skipped: false, processed });
    } catch (cause) {
      onError(cause);
      return Object.freeze({ skipped: false, processed, failed: true });
    } finally {
      running = false;
    }
  }

  return Object.freeze({
    drain,
    start() {
      if (timer) return;
      timer = setInterval(() => { void drain(); }, delay);
      timer.unref?.();
      void drain();
    },
    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    }
  });
}
