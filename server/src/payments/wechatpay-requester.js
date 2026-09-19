const endpoint = 'https://api.mch.weixin.qq.com';

export function createWechatPayRequester({ fetcher = fetch, timeoutMs = 10_000 } = {}) {
  if (typeof fetcher !== 'function') throw new Error('A fetch implementation is required.');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 30_000) throw new Error('timeoutMs must be between one and 30 seconds.');
  return async function request({ method, path, body, headers }) {
    if (method !== 'POST' || path !== '/v3/pay/transactions/jsapi' || typeof body !== 'string' || !headers?.authorization) throw new Error('Invalid WeChat Pay request.');
    const response = await fetcher(`${endpoint}${path}`, { method, headers, body, signal: AbortSignal.timeout(timeoutMs) });
    let data = null;
    try { data = await response.json(); } catch { /* response stays opaque */ }
    return Object.freeze({ status: response.status, data });
  };
}
