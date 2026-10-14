// Public catalog reads only. Browser failures must not fall back to wx.cloud.
export const CATALOG_PROXY_PREFIX = '/sravx-catalog'
export function catalogBase({ web, dev, configuredBase = '', defaultBase }) {
  if (!web) return defaultBase
  if (dev) return CATALOG_PROXY_PREFIX
  return configuredBase.trim().replace(/\/$/, '')
}
export function readCatalog(_web, request) {
  // Both clients read the same fact source. Failure is not permission to switch
  // to the legacy cloud catalog (which may contain different products/prices).
  return request()
}
export function allowedCatalogRequest(url, method) {
  const path = String(url).split('?')[0]
  return method === 'GET' && /^\/sravx-catalog\/api\/v1\/catalog\/(?:home|categories|banners|products(?:\/[\w-]+)?|points-products(?:\/[\w-]+)?)$/.test(path)
}
