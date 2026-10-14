import { catalogBase, readCatalog } from './catalog-transport.mjs'
import { catalogProduct, catalogResult, collectProducts } from './product-classification.mjs'
const API_BASE_URL = 'https://api.sravxpet.com'
let webCatalog = false
// #ifdef H5
webCatalog = true
// #endif
const CATALOG_BASE_URL = catalogBase({ web: webCatalog, dev: import.meta.env.DEV, configuredBase: import.meta.env.VITE_SRAVX_CATALOG_BASE_URL || '', defaultBase: API_BASE_URL })

// Server-only: HBuilderX and CLI builds must never select the expired environment.
const TARGET_SESSION_KEY = 'sravx_target_session'
const targetToken = () => uni.getStorageSync(TARGET_SESSION_KEY) || ''
const saveTargetSession = token => { if (typeof token === 'string' && token) uni.setStorageSync(TARGET_SESSION_KEY, token); return token }
const clearTargetSession = () => uni.removeStorageSync(TARGET_SESSION_KEY)
const key = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
const query = params => Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '').map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`).join('&')
const paged = (path, params) => query(params) ? `${path}?${query(params)}` : path

function http(path, method = 'GET', data, token = targetToken(), base = API_BASE_URL) { return new Promise((resolve, reject) => uni.request({ url: `${base}${path}`, method, data, header: { Accept: 'application/json', ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, success(res) { const body = res.data; res.statusCode >= 200 && res.statusCode < 300 && body && body.success ? resolve(body.data) : reject(Object.assign(new Error((body && body.error && body.error.message) || '服务暂不可用'), { statusCode: res.statusCode })) }, fail() { reject(new Error('网络连接失败，请检查商品接口连接或跨域配置')) } })) }
const catalog = path => readCatalog(webCatalog, () => http(path, 'GET', undefined, '', CATALOG_BASE_URL))
const asList = value => Array.isArray(value) ? value : (value && (value.products || value.list || value.data)) || []
const productName = item => item && (item.short_name || item.name) || '未命名商品'
function productImage(item = {}) { if (item.image || item.cover_image) return item.image || item.cover_image; if (Array.isArray(item.images)) return item.images[0] || ''; if (typeof item.images === 'string') { try { return JSON.parse(item.images)[0] || '' } catch { return item.images } } return '' }
const targetOrder = (backend, action) => backend === 'cloud' ? Promise.reject(new Error('旧环境已停用，请重新进入服务器订单列表')) : action()
const withOrderBackend = (value, backend) => ({ ...(value || {}), __sravxOrderBackend: backend })
function wechatLogin() { return new Promise((resolve, reject) => uni.login({ success: result => result && result.code ? resolve(result.code) : reject(new Error('微信登录凭证获取失败')), fail: () => reject(new Error('微信登录凭证获取失败')) })) }
async function targetLogin(phoneData = {}) { const session = await http('/api/v1/auth/wechat/session', 'POST', { code: await wechatLogin() }, ''); if (!session || !session.token) throw new Error('登录会话创建失败'); saveTargetSession(session.token); if (phoneData && phoneData.code) await http('/api/v1/me/phone', 'POST', { code: phoneData.code }); return http('/api/v1/me') }
const pointsOrderView = result => { const payableCash = Number(result && (result.payable_cash ?? result.payableCash) || 0); return { ...result, orderId: result.orderId ?? result.id, orderNo: result.orderNo ?? result.order_no, payableCash, needCashPayment: payableCash > 0 } }

const api = {
  asList, productName, productImage, request: path => http(path), targetToken, clearTargetSession,
  login(data = {}) { return targetLogin(data) },
  getHomeProducts() { return catalog('/api/v1/catalog/home').then(catalogResult) },
  getProductList(params = {}) { return catalog(paged('/api/v1/catalog/products', params)).then(catalogResult) },
  getAllProducts(params = {}) { return collectProducts(page => api.getProductList({ ...params, ...page })) },
  getProductDetail(id) { return catalog(`/api/v1/catalog/products/${encodeURIComponent(id)}`).then(catalogProduct) },
  getPointsProducts(categoryId = 0) { return catalog(`/api/v1/catalog/points-products?categoryId=${encodeURIComponent(categoryId)}`) },
  getPointsProductDetail(id) { return catalog(`/api/v1/catalog/points-products/${encodeURIComponent(id)}`) },
  getCategoryList() { return catalog('/api/v1/catalog/categories') }, async getCategoryTree() { const rows = asList(await api.getCategoryList()); return rows.filter(row => !row.parent_id).map(row => ({ ...row, children: rows.filter(child => Number(child.parent_id) === Number(row.id)) })) }, getBanners(position = 'home') { return catalog(`/api/v1/catalog/banners?position=${encodeURIComponent(position)}`) },
  getUserInfo() { return http('/api/v1/me', 'GET', undefined) }, updateUserInfo(data) { return http('/api/v1/me', 'PUT', data) }, getUserPoints() { return http('/api/v1/me/points', 'GET', undefined) }, getPointsLogs(page = 1, pageSize = 20) { return http(paged('/api/v1/me/points/logs', { page, pageSize }), 'GET', undefined) }, getMemberLevel() { return http('/api/v1/me/membership', 'GET', undefined) },
  getAddressList() { return http('/api/v1/addresses', 'GET', undefined) }, addAddress(data) { return http('/api/v1/addresses', 'POST', data) }, updateAddress(data) { return http(`/api/v1/addresses/${data.id}`, 'PUT', data) }, deleteAddress(id) { return http(`/api/v1/addresses/${id}`, 'DELETE', undefined) }, setDefaultAddress(id) { return http(`/api/v1/addresses/${id}/default`, 'PUT', undefined) },
  getAvailableCoupons() { return http('/api/v1/coupons', 'GET', undefined) }, getMyCoupons(status = 'unused') { return http(`/api/v1/me/coupons?status=${encodeURIComponent(status)}`, 'GET', undefined) }, receiveCoupon(couponId) { return http(`/api/v1/coupons/${couponId}/claims`, 'POST', { idempotencyKey: key('coupon') }) }, checkCoupon(couponId, orderAmount) { return http(`/api/v1/coupons/claims/${couponId}/check`, 'POST', { orderAmount }) },
  getMyScissors() { return http('/api/v1/tools', 'GET', undefined) }, bindScissors(sn) { return http('/api/v1/tools', 'POST', { sn }) }, unbindScissors(id) { return http(`/api/v1/tools/${id}`, 'DELETE', undefined) }, getWarrantyInfo(sn) { return http(`/api/v1/tools/warranty?sn=${encodeURIComponent(sn)}`, 'GET', undefined) }, getScissorsAfterSale(bindingId) { return http(`/api/v1/tools/${bindingId}/after-sales`, 'GET', undefined) }, applyScissorsAfterSale(data) { return http(`/api/v1/tools/${data.bindingId}/after-sales`, 'POST', data) }, submitScissorsAfterSaleShipping(data) { return http(`/api/v1/after-sales/${data.requestId}/shipment`, 'POST', data) },
  async getOrderList(status, page = 1, pageSize = 10) {
    const value = await http(paged('/api/v1/orders', { status, page, pageSize }))
    return { ...(Array.isArray(value) ? {} : value), list: asList(value).map(item => withOrderBackend(item, 'target')) }
  },
  getOrderDetail(orderId, backend = 'target') { return targetOrder(backend, () => http(`/api/v1/orders/${orderId}`)) },
  structuredCheckoutEnabled() { return true },
  createCheckoutQuote(data) { return http('/api/v1/checkout/quotes', 'POST', data) },
  createOrder(data) { const payload = { ...data, idempotencyKey: data.idempotencyKey || key('order') }; return http('/api/v1/orders', 'POST', payload) },
  cancelOrder(orderId, backend = 'target') { return targetOrder(backend, () => http(`/api/v1/orders/${orderId}`, 'POST', {})) },
  confirmReceive(orderId, backend = 'target') { return targetOrder(backend, () => http(`/api/v1/orders/${orderId}/receive`, 'POST', {})) },
  getWaybillToken(orderId, backend = 'target') { return targetOrder(backend, () => http(`/api/v1/orders/${orderId}/waybill`)) },
  applyRefundRequest(data) { const payload = { ...data, idempotencyKey: data.idempotencyKey || key('refund') }; return targetOrder(payload.backend, () => http('/api/v1/refund-requests', 'POST', payload)) },
  getRefundRequestList(orderId, backend = 'target') { return targetOrder(backend, () => http(paged('/api/v1/refund-requests', { orderId }))) },
  createPointsOrder(data) { const payload = { ...data, idempotencyKey: data.idempotencyKey || key('points') }; return http('/api/v1/points-orders', 'POST', payload).then(pointsOrderView) }, getPointsOrderList(status, page = 1, pageSize = 10) { return http(paged('/api/v1/points-orders', { status, page, pageSize }), 'GET', undefined) }, getPointsOrderDetail(orderId) { return http(`/api/v1/points-orders/${orderId}`, 'GET', undefined) }, cancelPointsOrder(orderId, cancelReason = '用户取消') { return http(`/api/v1/points-orders/${orderId}`, 'POST', { cancelReason }) }, applyPointsRefundRequest(data) { return Promise.reject(new Error('积分订单退款申请尚未接入服务器，请联系客服处理')) },
  getGiftCardRedeemRecords(page = 1, pageSize = 10) { return http(paged('/api/v1/gift-card-redemptions', { page, pageSize }), 'GET', undefined) }, redeemGiftCard(data) { const value = typeof data === 'object' ? data : { code: data }; const payload = { ...value, idempotencyKey: value.idempotencyKey || key('giftCard') }; return http('/api/v1/gift-cards/redeem', 'POST', payload) }, confirmGiftCardProductAddress(data) { return http(`/api/v1/gift-card-redemptions/${data.recordId}/address`, 'POST', data) },
  submitCooperation(data) { return http('/api/v1/inquiries', 'POST', data) },
  // Amount and payment state are determined exclusively by the server.
  createPaymentOrder(data) { return targetOrder(data?.backend, () => http(`/api/v1/payments/wechat/orders/${encodeURIComponent(data.orderId)}`, 'POST', { orderType: data?.orderType === 'points' ? 'points' : 'goods' })) },
  refundOrder() { return Promise.reject(new Error('退款由管理端审核执行，请提交退款申请')) }

}

// Keep an explicit source marker for order links; never reinterpret cached legacy IDs.
for (const method of ['createOrder', 'createPointsOrder']) {
  const create = api[method].bind(api)
  api[method] = data => create(data).then(result => withOrderBackend(result, 'target'))
}

export default api
