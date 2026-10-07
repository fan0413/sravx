import { randomBytes, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';

function text(value, name, maximum) {
  if (typeof value !== 'string' || value.trim() === '' || value.trim().length > maximum) throw new Error(`Invalid ${name}.`);
  return value.trim();
}

function positive(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid ${name}.`);
  return value;
}

function authorization({ mchId, merchantSerialNo, privateKey, path, body, timestamp, nonceStr }) {
  const message = `POST\n${path}\n${timestamp}\n${nonceStr}\n${body}\n`;
  const signature = sign('RSA-SHA256', Buffer.from(message), privateKey).toString('base64');
  return `WECHATPAY2-SHA256-RSA2048 mchid="${mchId}",nonce_str="${nonceStr}",timestamp="${timestamp}",serial_no="${merchantSerialNo}",signature="${signature}"`;
}

// This adapter signs a server-prepared full refund. It deliberately accepts no
// client amount, openid, or order state and is not enabled by default.
export function createWechatPayRefundClient({ mchId, merchantSerialNo, merchantPrivateKeyPath, notifyUrl, request, readPrivateKey = readFileSync, now = () => Math.floor(Date.now() / 1000) }) {
  const configuration = Object.freeze({ mchId: text(mchId, 'mchId', 32), merchantSerialNo: text(merchantSerialNo, 'merchantSerialNo', 128), merchantPrivateKeyPath: text(merchantPrivateKeyPath, 'merchantPrivateKeyPath', 512), notifyUrl: text(notifyUrl, 'notifyUrl', 256) });
  if (!configuration.notifyUrl.startsWith('https://')) throw new Error('Refund notify URL must be HTTPS.');
  if (typeof request !== 'function') throw new Error('A WeChat Pay request function is required.');
  const privateKey = readPrivateKey(configuration.merchantPrivateKeyPath, 'utf8');
  if (typeof privateKey !== 'string' || !privateKey.includes('BEGIN') || !privateKey.includes('PRIVATE KEY')) throw new Error('Merchant API private key is invalid.');
  return Object.freeze({
    async createRefund({ outRefundNo, transactionId, refundAmountFen, totalAmountFen, reason }) {
      const refund = positive(refundAmountFen, 'refundAmountFen'); const total = positive(totalAmountFen, 'totalAmountFen');
      if (refund > total) throw new Error('Refund amount cannot exceed order amount.');
      const path = '/v3/refund/domestic/refunds';
      const payload = Object.freeze({ out_refund_no: text(outRefundNo, 'outRefundNo', 64), transaction_id: text(transactionId, 'transactionId', 64), reason: text(reason || '订单退款', 'reason', 80), notify_url: configuration.notifyUrl, amount: Object.freeze({ refund, total, currency: 'CNY' }) });
      const body = JSON.stringify(payload); const timestamp = now(); const nonceStr = randomBytes(16).toString('hex');
      const headers = Object.freeze({ authorization: authorization({ ...configuration, privateKey, path, body, timestamp, nonceStr }), 'content-type': 'application/json', accept: 'application/json' });
      const result = await request(Object.freeze({ method: 'POST', path, body, headers }));
      if (!result || result.status < 200 || result.status >= 300 || typeof result.data?.refund_id !== 'string') throw new Error('WECHAT_PAY_REFUND_NOT_CREATED');
      return Object.freeze({ refundId: result.data.refund_id, status: typeof result.data.status === 'string' ? result.data.status : 'PROCESSING', outRefundNo: payload.out_refund_no });
    }
  });
}
