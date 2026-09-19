import { randomBytes, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';

function requiredText(value, name, maximum = 256) {
  if (typeof value !== 'string' || value.trim() === '' || value.length > maximum) throw new Error(`${name} must be configured.`);
  return value.trim();
}

function requiredPositiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer.`);
  return value;
}

function nonce() { return randomBytes(16).toString('hex'); }

function authorization({ mchId, merchantSerialNo, privateKey, method, path, body, timestamp = Math.floor(Date.now() / 1000), nonceStr = nonce() }) {
  const message = `${method}\n${path}\n${timestamp}\n${nonceStr}\n${body}\n`;
  const signature = sign('RSA-SHA256', Buffer.from(message), privateKey).toString('base64');
  return `WECHATPAY2-SHA256-RSA2048 mchid="${mchId}",nonce_str="${nonceStr}",timestamp="${timestamp}",serial_no="${merchantSerialNo}",signature="${signature}"`;
}

export function createWechatPayJsapiClient({ appId, mchId, merchantSerialNo, merchantPrivateKeyPath, request, readPrivateKey = readFileSync, now = () => Math.floor(Date.now() / 1000) }) {
  const configuration = Object.freeze({
    appId: requiredText(appId, 'WECHAT_MINIPROGRAM_APP_ID', 64),
    mchId: requiredText(mchId, 'WECHAT_PAY_MCH_ID', 32),
    merchantSerialNo: requiredText(merchantSerialNo, 'WECHAT_PAY_MERCHANT_SERIAL_NO', 128),
    merchantPrivateKeyPath: requiredText(merchantPrivateKeyPath, 'WECHAT_PAY_MERCHANT_PRIVATE_KEY_PATH', 512)
  });
  if (typeof request !== 'function') throw new Error('A WeChat Pay request function is required.');
  const privateKey = readPrivateKey(configuration.merchantPrivateKeyPath, 'utf8');
  if (typeof privateKey !== 'string' || !privateKey.includes('BEGIN') || !privateKey.includes('PRIVATE KEY')) throw new Error('Merchant API private key is invalid.');

  async function post(path, bodyObject) {
    const body = JSON.stringify(bodyObject);
    const timestamp = now();
    const headers = Object.freeze({
      authorization: authorization({ ...configuration, privateKey, method: 'POST', path, body, timestamp }),
      'content-type': 'application/json', accept: 'application/json'
    });
    return request(Object.freeze({ method: 'POST', path, body, headers }));
  }

  return Object.freeze({
    async createTransaction({ outTradeNo, description, amountFen, openid, notifyUrl }) {
      const payload = Object.freeze({
        appid: configuration.appId,
        mchid: configuration.mchId,
        description: requiredText(description, 'description', 127),
        out_trade_no: requiredText(outTradeNo, 'outTradeNo', 32),
        notify_url: requiredText(notifyUrl, 'notifyUrl', 256),
        amount: Object.freeze({ total: requiredPositiveInteger(amountFen, 'amountFen'), currency: 'CNY' }),
        payer: Object.freeze({ openid: requiredText(openid, 'openid', 128) })
      });
      const result = await post('/v3/pay/transactions/jsapi', payload);
      const prepayId = result?.status >= 200 && result?.status < 300 && typeof result?.data?.prepay_id === 'string' ? result.data.prepay_id : null;
      if (!prepayId) throw new Error('WECHAT_PAY_TRANSACTION_NOT_CREATED');
      const timeStamp = String(now());
      const nonceStr = nonce();
      const packageValue = `prepay_id=${prepayId}`;
      const paySign = sign('RSA-SHA256', Buffer.from(`${configuration.appId}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`), privateKey).toString('base64');
      return Object.freeze({ appId: configuration.appId, timeStamp, nonceStr, package: packageValue, signType: 'RSA', paySign });
    }
  });
}
