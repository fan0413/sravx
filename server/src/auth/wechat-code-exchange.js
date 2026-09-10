function requireValue(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is required.`);
  return value.trim();
}

export function validateLoginCode(code) {
  if (typeof code !== 'string' || code.length < 8 || code.length > 512) {
    throw new Error('Invalid WeChat login code.');
  }
  return code;
}

export function createWechatCodeExchange({ appId, appSecret, requestIdentity }) {
  const configuredAppId = requireValue(appId, 'WECHAT_MINIPROGRAM_APP_ID');
  const configuredAppSecret = requireValue(appSecret, 'WECHAT_MINIPROGRAM_APP_SECRET');
  if (typeof requestIdentity !== 'function') throw new Error('requestIdentity must be a function.');

  return Object.freeze({
    async exchange(code) {
      const loginCode = validateLoginCode(code);
      const result = await requestIdentity({ appId: configuredAppId, appSecret: configuredAppSecret, code: loginCode });
      if (!result || typeof result !== 'object' || typeof result.openid !== 'string' || result.openid.trim() === '') {
        throw new Error('WeChat identity exchange did not return a valid user identity.');
      }
      return Object.freeze({ openid: result.openid.trim(), unionid: typeof result.unionid === 'string' ? result.unionid.trim() : null });
    }
  });
}
