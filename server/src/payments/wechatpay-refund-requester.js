const endpoint = 'https://api.mch.weixin.qq.com';

export function createWechatPayRefundRequester({ fetcher = fetch, timeoutMs = 10_000 } = {}) {
  if (typeof fetcher !== 'function') throw new Error('A fetch implementation is required.');
  return async function request({ method, path, body, headers }) {
    if (method !== 'POST' || path !== '/v3/refund/domestic/refunds' || typeof body !== 'string' || !headers?.authorization) throw new Error('Invalid WeChat Pay refund request.');
    const response = await fetcher(`${endpoint}${path}`, { method, headers, body, signal: AbortSignal.timeout(timeoutMs) });
    let data = null;
    try { data = await response.json(); } catch { /* opaque response */ }
    return Object.freeze({ status: response.status, data });
  };
}
