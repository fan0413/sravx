import { readFile } from 'node:fs/promises';

const SERIAL = /^[A-Za-z0-9_-]{1,128}$/;

function parseCertificates(contents, source) {
  let certificates;
  try {
    certificates = JSON.parse(contents);
  } catch {
    throw new Error(`WeChat Pay platform certificate file is not valid JSON: ${source}`);
  }
  if (!certificates || typeof certificates !== 'object' || Array.isArray(certificates)) {
    throw new Error(`WeChat Pay platform certificate file must contain a serial-to-PEM object: ${source}`);
  }
  const valid = Object.entries(certificates).filter(([serial, pem]) => SERIAL.test(serial) && typeof pem === 'string' && (pem.includes('BEGIN CERTIFICATE') || pem.includes('BEGIN PUBLIC KEY')));
  if (!valid.length || valid.length !== Object.keys(certificates).length) {
    throw new Error(`WeChat Pay platform certificate file contains invalid certificates: ${source}`);
  }
  return Object.freeze(Object.fromEntries(valid));
}

export async function loadWechatPayPlatformCertificates(path, { read = readFile } = {}) {
  if (typeof path !== 'string' || path.trim() === '') throw new Error('WECHAT_PAY_PLATFORM_CERTIFICATES_PATH must be configured.');
  let contents;
  try {
    contents = await read(path, 'utf8');
  } catch {
    throw new Error(`WeChat Pay platform certificate file cannot be read: ${path}`);
  }
  return parseCertificates(contents, path);
}

export { parseCertificates as parseWechatPayPlatformCertificates };
