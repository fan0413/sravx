import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const PARAMETERS = Object.freeze({ N: 16384, r: 8, p: 1, length: 32 });

export async function hashPassword(password, salt = randomBytes(16)) {
  if (typeof password !== 'string' || password.length < 12) throw new Error('Password must contain at least 12 characters.');
  const derived = await scrypt(password, salt, PARAMETERS.length, PARAMETERS);
  return `scrypt$${PARAMETERS.N}$${PARAMETERS.r}$${PARAMETERS.p}$${salt.toString('base64url')}$${Buffer.from(derived).toString('base64url')}`;
}

export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const [algorithm, N, r, p, salt, expected, ...extra] = stored.split('$');
  if (algorithm !== 'scrypt' || extra.length || !/^[0-9]+$/.test(N) || !/^[0-9]+$/.test(r) || !/^[0-9]+$/.test(p)) return false;
  try {
    const expectedBuffer = Buffer.from(expected, 'base64url');
    const actual = Buffer.from(await scrypt(password, Buffer.from(salt, 'base64url'), expectedBuffer.length, { N: Number(N), r: Number(r), p: Number(p) }));
    return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
  } catch {
    return false;
  }
}
