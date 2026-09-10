const DEFAULT_ENDPOINT = 'https://api.weixin.qq.com/sns/jscode2session';

function requestFailure(message) {
  return new Error(`WeChat identity exchange failed: ${message}`);
}

export function createWechatIdentityRequester({ fetchImpl = globalThis.fetch, endpoint = DEFAULT_ENDPOINT } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation is required.');
  const endpointUrl = new URL(endpoint);
  if (endpointUrl.protocol !== 'https:') throw new Error('WeChat identity endpoint must use HTTPS.');

  return async function requestIdentity({ appId, appSecret, code }) {
    const url = new URL(endpointUrl);
    url.search = new URLSearchParams({
      appid: appId,
      secret: appSecret,
      js_code: code,
      grant_type: 'authorization_code'
    }).toString();

    let response;
    try {
      response = await fetchImpl(url, { method: 'GET', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
    } catch {
      throw requestFailure('network unavailable');
    }
    if (!response.ok) throw requestFailure('upstream HTTP error');

    let body;
    try {
      body = await response.json();
    } catch {
      throw requestFailure('invalid upstream response');
    }
    if (body && Number.isInteger(body.errcode) && body.errcode !== 0) throw requestFailure('upstream rejected login code');
    return body;
  };
}
