const TOKEN_ENDPOINT = 'https://api.weixin.qq.com/cgi-bin/token';
const PHONE_ENDPOINT = 'https://api.weixin.qq.com/wxa/business/getuserphonenumber';

function failure(message) {
  return new Error(`WeChat phone exchange failed: ${message}`);
}

function required(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required.`);
  return value.trim();
}

export function createWechatPhoneRequester({ appId, appSecret, fetchImpl = globalThis.fetch, now = () => Date.now(), tokenEndpoint = TOKEN_ENDPOINT, phoneEndpoint = PHONE_ENDPOINT } = {}) {
  const configuredAppId = required(appId, 'WECHAT_MINIPROGRAM_APP_ID');
  const configuredAppSecret = required(appSecret, 'WECHAT_MINIPROGRAM_APP_SECRET');
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation is required.');
  if (new URL(tokenEndpoint).protocol !== 'https:' || new URL(phoneEndpoint).protocol !== 'https:') throw new Error('WeChat phone endpoints must use HTTPS.');
  let cached = null;
  let pending = null;

  async function accessToken() {
    if (cached && cached.expiresAt > now() + 60_000) return cached.value;
    if (pending) return pending;
    pending = (async () => {
      const url = new URL(tokenEndpoint);
      url.search = new URLSearchParams({ grant_type: 'client_credential', appid: configuredAppId, secret: configuredAppSecret }).toString();
      let response;
      try { response = await fetchImpl(url, { method: 'GET', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(5000) }); } catch { throw failure('token network unavailable'); }
      if (!response.ok) throw failure('token upstream HTTP error');
      let body;
      try { body = await response.json(); } catch { throw failure('token upstream response invalid'); }
      if (!body || typeof body.access_token !== 'string' || !body.access_token) throw failure('token unavailable');
      cached = { value: body.access_token, expiresAt: now() + Math.max(60, Number(body.expires_in) || 0) * 1000 };
      return cached.value;
    })();
    try { return await pending; } finally { pending = null; }
  }

  return async function requestPhone(code) {
    if (typeof code !== 'string' || code.trim().length < 8 || code.trim().length > 512) throw failure('invalid phone code');
    const url = new URL(phoneEndpoint);
    url.searchParams.set('access_token', await accessToken());
    let response;
    try { response = await fetchImpl(url, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify({ code: code.trim() }), signal: AbortSignal.timeout(5000) }); } catch { throw failure('phone network unavailable'); }
    if (!response.ok) throw failure('phone upstream HTTP error');
    let body;
    try { body = await response.json(); } catch { throw failure('phone upstream response invalid'); }
    const phone = body?.phone_info?.phoneNumber || body?.phone_info?.purePhoneNumber;
    if (body?.errcode || typeof phone !== 'string' || !phone.trim()) throw failure('phone unavailable');
    return phone.trim();
  };
}
