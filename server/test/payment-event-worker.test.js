import assert from 'node:assert/strict';
import test from 'node:test';
import { createPaymentEventWorker } from '../src/payments/payment-event-worker.js';

test('payment worker drains only the configured durable-event batch', async () => {
  let calls = 0;
  const worker = createPaymentEventWorker({
    consumer: { consumeOne: async () => ({ consumed: ++calls <= 3 }) },
    maximumBatchSize: 2
  });
  assert.deepEqual(await worker.drain(), { skipped: false, processed: 2 });
  assert.equal(calls, 2);
});

test('payment worker keeps running after a consumer failure without exposing the cause', async () => {
  let reported = 0;
  const worker = createPaymentEventWorker({
    consumer: { consumeOne: async () => { throw new Error('database failure'); } },
    onError: () => { reported += 1; }
  });
  assert.deepEqual(await worker.drain(), { skipped: false, processed: 0, failed: true });
  assert.equal(reported, 1);
});
