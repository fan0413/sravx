export function refundSubmissionMessage(result) {
  if (result && result.executionStatus === 'needs_retry') return '申请已保存，退款执行待核对';
  if (result && result.status === 'refunded') return '已退款';
  if (result && result.status === 'processing') return '退款处理中，以到账结果为准';
  if (result && result.status === 'approved') return '申请已通过，等待退款执行';
  return '申请已提交，等待人工审核';
}
