// Presentation-only: resolve media after the repository has applied publication
// filters. Never accept an object key from an anonymous request to this layer.
function list(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; }
  catch { return value ? [value] : []; }
}
/** 包装已过滤可见商品的仓储：把图片引用换成临时URL，不修改数据库里的对象键。 */
export function createPublicCatalogRepository(repository, { mediaSigner, clock = () => Date.now() } = {}) {
  const present = async (value) => {
    // 同一次响应的相同图片只签名一次；15分钟到期后前端要重新读取。
    const signed = new Map();
    const image = async (reference) => {
      if (!reference || typeof reference !== 'string') return '';
      if (/^https:\/\//i.test(reference) || /^\/static\//.test(reference)) return reference;
      if (!/^catalog\/(products|categories|banners|points-products)\//.test(reference) || reference.length > 512 || /[\x00-\x1f]/.test(reference)) return '';
      if (!mediaSigner?.issueGetUrl) throw new Error('Public catalog media signing is unavailable.');
      if (!signed.has(reference)) signed.set(reference, mediaSigner.issueGetUrl(reference, 900));
      const url = await signed.get(reference);
      if (typeof url !== 'string' || !/^https:\/\//i.test(url)) throw new Error('Invalid public catalog media URL.');
      return url;
    };
    const row = async (item) => {
      if (!item || typeof item !== 'object') return item;
      const next = { ...item };
      for (const field of ['cover_image', 'image', 'icon', 'mobile_image', 'scissors_card_image', 'card_image', 'image_object_key', 'object_key']) {
        if (Object.hasOwn(next, field)) next[field] = await image(next[field]);
      }
      for (const field of ['images', 'detail_images']) {
        if (Object.hasOwn(next, field)) next[field] = (await Promise.all(list(next[field]).map(image))).filter(Boolean);
      }
      for (const field of ['products', 'categories', 'banners', 'list', 'specs', 'skus', 'media']) {
        if (Array.isArray(next[field])) next[field] = await Promise.all(next[field].map(row));
      }
      return next;
    };
    const result = Array.isArray(value) ? await Promise.all(value.map(row)) : await row(value);
    if (signed.size) {
      const expires = new Date(clock() + 900000).toISOString();
      if (Array.isArray(result)) for (const item of result) item.media_expires_at = expires;
      else if (result) result.media_expires_at = expires;
    }
    return result;
  };
  const next = { ...repository };
  for (const name of ['home', 'listProducts', 'getProduct', 'listCategories', 'listBanners', 'listPointsProducts', 'getPointsProduct']) {
    if (typeof repository[name] === 'function') next[name] = async (...args) => present(await repository[name](...args));
  }
  return Object.freeze(next);
}
