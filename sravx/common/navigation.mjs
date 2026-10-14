const HOME = '/pages/index/index'
const USER = '/pages/user-center/index'
const ORDERS = '/pages/order-list/index'
const SHOP = '/pages/shop/index'
export const parentRoutes = {
  'pages/shop/index': HOME, 'pages/cart/index': HOME,
  'pages/user-center/index': HOME, 'pages/order-list/index': HOME,
  'pages/search/index': HOME, 'pages/purchase/index': SHOP,
  'pages/product-detail/index': SHOP, 'pages/confirm-order/index': '/pages/cart/index',
  'pages/order-detail/index': ORDERS, 'pages/points-order-detail/index': ORDERS,
  'pages/order-logistics/index': ORDERS, 'pages/order-after-sale/index': ORDERS,
  'pages/points-mall/index': USER, 'pages/points-product-detail/index': '/pages/points-mall/index',
  'pages/profile-edit/index': USER, 'pages/gift-card-redeem/index': USER,
  'pages/membership/index': USER, 'pages/address-manage/index': USER,
  'pages/my-scissors/index': USER, 'pages/scissors-after-sale/index': '/pages/my-scissors/index',
  'pages/cooperation/index': USER, 'pages/coupon-manage/index': USER,
  'pages/register/index': HOME
}
export function pageStack() { return typeof getCurrentPages === 'function' ? getCurrentPages() : [] }
export function parentUrl(route, options = {}) {
  route = String(route || '').replace(/^\//, '')
  let parent = parentRoutes[route] || HOME
  if (route === 'pages/confirm-order/index' && options.isPointsOrder === 'true') parent = '/pages/points-mall/index'
  if (['pages/order-logistics/index', 'pages/order-after-sale/index'].includes(route)) {
    const id = options.orderId || options.id
    if (/^\d+$/.test(String(id || ''))) parent = `/pages/order-detail/index?id=${encodeURIComponent(id)}&backend=${options.backend === 'cloud' ? 'cloud' : 'target'}`
  }
  if (parent === SHOP && ['basic', 'pro', 'master', 'accessories'].includes(options.series)) parent += '?series=' + options.series
  return parent
}
// Never rely on browser history.length: it can point outside this application.
export function goBackOrParent(fallback) {
  const stack = pageStack(), current = stack[stack.length - 1] || {}
  const url = fallback || parentUrl(current.route || current.$page?.route, current.options || current.$page?.options)
  const goParent = () => uni.reLaunch({ url })
  if (stack.length > 1) uni.navigateBack({ delta: 1, fail: goParent })
  else goParent()
}
