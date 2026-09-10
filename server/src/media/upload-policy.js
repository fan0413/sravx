import { randomUUID } from 'node:crypto';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MEDIA_PREFIXES = Object.freeze({
  product: 'catalog/products/',
  pointsProduct: 'catalog/points-products/',
  category: 'catalog/categories/',
  banner: 'catalog/banners/'
});
const CONTENT_TYPES = Object.freeze({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' });

export function createUploadIntent({ mediaType, contentType, byteSize, sha256 }, now = new Date(), id = randomUUID()) {
  const prefix = MEDIA_PREFIXES[mediaType];
  const extension = CONTENT_TYPES[contentType];
  if (!prefix || !extension) throw new Error('Unsupported media type or content type.');
  if (!Number.isInteger(byteSize) || byteSize < 1 || byteSize > MAX_IMAGE_BYTES) throw new Error('Image size is invalid.');
  if (typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(sha256)) throw new Error('Image checksum is invalid.');
  if (!(now instanceof Date) || Number.isNaN(now.valueOf())) throw new Error('Upload time is invalid.');
  const expiresAt = new Date(now.valueOf() + 10 * 60 * 1000);
  return Object.freeze({ id, objectKey: `${prefix}${id}.${extension}`, contentType, byteSize, contentSha256: sha256.toLowerCase(), expiresAt });
}
