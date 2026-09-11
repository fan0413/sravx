function requiredString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} is required.`);
  return value;
}

export function createCosUploadSigner({ secretId, secretKey, bucket, region, createClient }) {
  if (typeof createClient !== 'function') throw new Error('A COS client factory is required.');
  const client = createClient({ SecretId: requiredString(secretId, 'COS_SECRET_ID'), SecretKey: requiredString(secretKey, 'COS_SECRET_KEY') });
  const Bucket = requiredString(bucket, 'COS_BUCKET');
  const Region = requiredString(region, 'COS_REGION');
  return Object.freeze({
    async issuePutUrl(intent) {
      if (!intent?.objectKey || !intent?.contentType || !(intent.expiresAt instanceof Date)) throw new Error('A valid upload intent is required.');
      const Expires = Math.max(1, Math.floor((intent.expiresAt.valueOf() - Date.now()) / 1000));
      return new Promise((resolve, reject) => {
        client.getObjectUrl({ Bucket, Region, Key: intent.objectKey, Method: 'PUT', Sign: true, Expires, Headers: { 'Content-Type': intent.contentType } }, (cause, data) => {
          if (cause || !data?.Url) return reject(cause || new Error('COS did not return an upload URL.'));
          resolve(data.Url);
        });
      });
    },
    async verifyObject(intent) {
      if (!intent?.objectKey || !intent?.contentType || !Number.isInteger(intent.byteSize)) throw new Error('A valid upload intent is required.');
      const data = await new Promise((resolve, reject) => {
        client.headObject({ Bucket, Region, Key: intent.objectKey }, (cause, result) => cause ? reject(cause) : resolve(result));
      });
      const headers = data?.headers || {};
      const byteSize = Number(headers['content-length']);
      const contentType = String(headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase();
      if (byteSize !== intent.byteSize || contentType !== intent.contentType) throw new Error('Uploaded object metadata did not match its intent.');
      return true;
    },
    async issueGetUrl(objectKey, expires = 300) {
      if (typeof objectKey !== 'string' || !objectKey.startsWith('catalog/')) throw new Error('A controlled object key is required.');
      const Expires = Math.max(1, Math.min(900, Math.floor(Number(expires) || 300)));
      return new Promise((resolve, reject) => {
        client.getObjectUrl({ Bucket, Region, Key: objectKey, Method: 'GET', Sign: true, Expires }, (cause, data) => {
          if (cause || !data?.Url) return reject(cause || new Error('COS did not return a download URL.'));
          resolve(data.Url);
        });
      });
    }
  });
}
