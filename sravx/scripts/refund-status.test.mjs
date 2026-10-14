import assert from 'node:assert/strict';
import test from 'node:test';
import { refundSubmissionMessage } from '../common/refund-status.mjs';
test('refund submission distinguishes review, acceptance, completion and execution uncertainty', () => {
  assert.match(refundSubmissionMessage({ status: 'pending_review' }), /人工审核/);
  assert.match(refundSubmissionMessage({ status: 'processing' }), /退款处理中/);
  assert.equal(refundSubmissionMessage({ status: 'refunded' }), '已退款');
  assert.match(refundSubmissionMessage({ status: 'processing', executionStatus: 'needs_retry' }), /待核对/);
});
