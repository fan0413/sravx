// Public catalog reads only. Browser failures must not fall back to wx.cloud.
export const CATALOG_PROXY_PREFIX = '/sravx-catalog'
export function catalogBase({ web, dev, configuredBase = '', defaultBase }) {
  return web && dev ? CATALOG_PROXY_PREFIX : (web && configuredBase.trim() ? configuredBase.trim().replace(/\/$/, '') : defaultBase)
}
export function readCatalog(web, request, fallback) {
  return web ? request() : request().catch(fallback)
}
export function allowedCatalogRequest(url, method) {
  const path = String(url).split('?')[0]
  return method === 'GET' && /^\/sravx-catalog\/api\/v1\/catalog\/(?:home|categories|banners|products(?:\/[\w-]+)?|points-products(?:\/[\w-]+)?)$/.test(path)
}
