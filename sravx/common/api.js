const API_BASE_URL = 'https://api.sravxpet.com'

// 每项业务独立放行；未放行功能继续走 CloudBase，避免提前切换写入。
const enabled = String(import.meta.env.VITE_SRAVX_API_MIGRATION || '').toLowerCase() === 'true'
const API_MIGRATION = { enabled, features: {
  profile: enabled && String(import.meta.env.VITE_SRAVX_API_PROFILE || '').toLowerCase() === 'true',
  userRead: enabled && String(import.meta.env.VITE_SRAVX_API_USER_READ || '').toLowerCase() === 'true',
  addresses: enabled && String(import.meta.env.VITE_SRAVX_API_ADDRESSES || '').toLowerCase() === 'true',
  inquiries: enabled && String(import.meta.env.VITE_SRAVX_API_INQUIRIES || '').toLowerCase() === 'true',
  toolsRead: enabled && String(import.meta.env.VITE_SRAVX_API_TOOLS_READ || '').toLowerCase() === 'true',
  toolsWrite: enabled && String(import.meta.env.VITE_SRAVX_API_TOOLS_WRITE || '').toLowerCase() === 'true',
  afterSales: enabled && String(import.meta.env.VITE_SRAVX_API_AFTER_SALES || '').toLowerCase() === 'true',
  coupons: enabled && String(import.meta.env.VITE_SRAVX_API_COUPONS || '').toLowerCase() === 'true',
  orders: enabled && String(import.meta.env.VITE_SRAVX_API_ORDERS || '').toLowerCase() === 'true',
  structuredCheckout: enabled && String(import.meta.env.VITE_SRAVX_API_STRUCTURED_CHECKOUT || '').toLowerCase() === 'true',
  payments: enabled && String(import.meta.env.VITE_SRAVX_API_PAYMENTS || '').toLowerCase() === 'true',
  pointsOrders: enabled && String(import.meta.env.VITE_SRAVX_API_POINTS_ORDERS || '').toLowerCase() === 'true',
  giftCards: enabled && String(import.meta.env.VITE_SRAVX_API_GIFT_CARDS || '').toLowerCase() === 'true'
} }
const TARGET_SESSION_KEY = 'sravx_target_session'
const targetToken = () => uni.getStorageSync(TARGET_SESSION_KEY) || ''
const saveTargetSession = token => { if (typeof token === 'string' && token) uni.setStorageSync(TARGET_SESSION_KEY, token); return token }
const clearTargetSession = () => uni.removeStorageSync(TARGET_SESSION_KEY)
const key = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
const query = params => Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '').map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`).join('&')
const paged = (path, params) => query(params) ? `${path}?${query(params)}` : path

function cloudCall(name, data = {}) { return new Promise((resolve, reject) => { if (!wx.cloud) return reject(new Error('云能力未初始化')); wx.cloud.callFunction({ name, data, success(res) { res.result && res.result.success ? resolve(res.result.data) : reject(new Error((res.result && res.result.error) || '服务暂不可用')) }, fail(err) { reject(new Error(err.errMsg || '网络连接失败')) } }) }) }
function http(path, method = 'GET', data, token = targetToken()) { return new Promise((resolve, reject) => uni.request({ url: `${API_BASE_URL}${path}`, method, data, header: { Accept: 'application/json', ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, success(res) { const body = res.data; res.statusCode >= 200 && res.statusCode < 300 && body && body.success ? resolve(body.data) : reject(Object.assign(new Error((body && body.error && body.error.message) || '服务暂不可用'), { statusCode: res.statusCode })) }, fail() { reject(new Error('网络连接失败')) } })) }
const asList = value => Array.isArray(value) ? value : (value && (value.products || value.list || value.data)) || []
const productName = item => item && (item.short_name || item.name) || '未命名商品'
function productImage(item = {}) { if (item.image || item.cover_image) return item.image || item.cover_image; if (Array.isArray(item.images)) return item.images[0] || ''; if (typeof item.images === 'string') { try { return JSON.parse(item.images)[0] || '' } catch { return item.images } } return '' }
const feature = name => API_MIGRATION.enabled && API_MIGRATION.features[name] === true
const requestOrCloud = (name, path, method, data, cloudName, cloudData = data) => feature(name) ? http(path, method, data) : cloudCall(cloudName, cloudData)
const cloudOrder = (action, data = {}) => cloudCall('order', { action, ...data })
const orderBackend = value => value === 'target' ? 'target' : 'cloud'
const withOrderBackend = (value, backend) => ({ ...(value || {}), __sravxOrderBackend: backend })
const mergedOrders = (target, cloud) => {
  const records = [...asList(target).map(item => withOrderBackend(item, 'target')), ...asList(cloud).map(item => withOrderBackend(item, 'cloud'))]
  return { list: records.sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || ''))) }
}
function wechatLogin() { return new Promise((resolve, reject) => uni.login({ success: result => result && result.code ? resolve(result.code) : reject(new Error('微信登录凭证获取失败')), fail: () => reject(new Error('微信登录凭证获取失败')) })) }
async function targetLogin(phoneData = {}) { const session = await http('/api/v1/auth/wechat/session', 'POST', { code: await wechatLogin() }, ''); if (!session || !session.token) throw new Error('登录会话创建失败'); saveTargetSession(session.token); if (phoneData && phoneData.code) await http('/api/v1/me/phone', 'POST', { code: phoneData.code }); return http('/api/v1/me') }
const pointsOrderView = result => { const payableCash = Number(result && (result.payable_cash ?? result.payableCash) || 0); return { ...result, orderId: result.orderId ?? result.id, orderNo: result.orderNo ?? result.order_no, payableCash, needCashPayment: payableCash > 0 } }

const api = {
  asList, productName, productImage, cloudCall, request: path => http(path), targetToken, clearTargetSession,
  login(data = {}) { return API_MIGRATION.enabled ? targetLogin(data) : cloudCall('login', data) },
  getHomeProducts() { return http('/api/v1/catalog/home').catch(() => cloudCall('product', { action: 'home' })) },
  getProductList(params = {}) { return http(paged('/api/v1/catalog/products', params)).catch(() => cloudCall('product', { action: 'list', ...params })) },
  getProductDetail(id) { return http(`/api/v1/catalog/products/${encodeURIComponent(id)}`).catch(() => cloudCall('product', { action: 'detail', id })) },
  getPointsProducts(categoryId = 0) { return http(`/api/v1/catalog/points-products?categoryId=${encodeURIComponent(categoryId)}`).catch(() => cloudCall('product', { action: 'pointsList', categoryId })) },
  getPointsProductDetail(id) { return http(`/api/v1/catalog/points-products/${encodeURIComponent(id)}`).catch(() => cloudCall('product', { action: 'pointsDetail', id })) },
  getCategoryList() { return http('/api/v1/catalog/categories').catch(() => cloudCall('category', { action: 'list' })) }, getCategoryTree() { return cloudCall('category', { action: 'tree' }) }, getBanners(position = 'home') { return http(`/api/v1/catalog/banners?position=${encodeURIComponent(position)}`).catch(() => cloudCall('banner', { position })) },
  getUserInfo() { return requestOrCloud('profile', '/api/v1/me', 'GET', undefined, 'user', { action: 'getInfo' }) }, updateUserInfo(data) { return requestOrCloud('profile', '/api/v1/me', 'PUT', data, 'user', { action: 'updateInfo', ...data }) }, getUserPoints() { return requestOrCloud('userRead', '/api/v1/me/points', 'GET', undefined, 'user', { action: 'getPoints' }) }, getPointsLogs(page = 1, pageSize = 20) { return requestOrCloud('userRead', paged('/api/v1/me/points/logs', { page, pageSize }), 'GET', undefined, 'user', { action: 'getPointsLogs', page, pageSize }) }, getMemberLevel() { return requestOrCloud('userRead', '/api/v1/me/membership', 'GET', undefined, 'user', { action: 'getMemberLevel' }) },
  getAddressList() { return requestOrCloud('addresses', '/api/v1/addresses', 'GET', undefined, 'address', { action: 'list' }) }, addAddress(data) { return requestOrCloud('addresses', '/api/v1/addresses', 'POST', data, 'address', { action: 'add', ...data }) }, updateAddress(data) { return requestOrCloud('addresses', `/api/v1/addresses/${data.id}`, 'PUT', data, 'address', { action: 'update', ...data }) }, deleteAddress(id) { return requestOrCloud('addresses', `/api/v1/addresses/${id}`, 'DELETE', undefined, 'address', { action: 'delete', id }) }, setDefaultAddress(id) { return requestOrCloud('addresses', `/api/v1/addresses/${id}/default`, 'PUT', undefined, 'address', { action: 'setDefault', id }) },
  getAvailableCoupons() { return requestOrCloud('coupons', '/api/v1/coupons', 'GET', undefined, 'coupon', { action: 'list', type: 'available' }) }, getMyCoupons(status = 'unused') { return requestOrCloud('coupons', `/api/v1/me/coupons?status=${encodeURIComponent(status)}`, 'GET', undefined, 'coupon', { action: 'my', status }) }, receiveCoupon(couponId) { return requestOrCloud('coupons', `/api/v1/coupons/${couponId}/claims`, 'POST', { idempotencyKey: key('coupon') }, 'coupon', { action: 'receive', couponId }) }, checkCoupon(couponId, orderAmount) { return requestOrCloud('coupons', `/api/v1/coupons/claims/${couponId}/check`, 'POST', { orderAmount }, 'coupon', { action: 'check', couponId, orderAmount }) },
  getMyScissors() { return requestOrCloud('toolsRead', '/api/v1/tools', 'GET', undefined, 'scissors', { action: 'list' }) }, bindScissors(sn) { return requestOrCloud('toolsWrite', '/api/v1/tools', 'POST', { sn }, 'scissors', { action: 'bind', sn }) }, unbindScissors(id) { return requestOrCloud('toolsWrite', `/api/v1/tools/${id}`, 'DELETE', undefined, 'scissors', { action: 'unbind', id }) }, getWarrantyInfo(sn) { return requestOrCloud('toolsRead', `/api/v1/tools/warranty?sn=${encodeURIComponent(sn)}`, 'GET', undefined, 'scissors', { action: 'warranty', sn }) }, getScissorsAfterSale(bindingId) { return requestOrCloud('afterSales', `/api/v1/tools/${bindingId}/after-sales`, 'GET', undefined, 'scissors', { action: 'afterSaleDetail', bindingId }) }, applyScissorsAfterSale(data) { return requestOrCloud('afterSales', `/api/v1/tools/${data.bindingId}/after-sales`, 'POST', data, 'scissors', { action: 'afterSaleApply', ...data }) }, submitScissorsAfterSaleShipping(data) { return requestOrCloud('afterSales', `/api/v1/after-sales/${data.requestId}/shipment`, 'POST', data, 'scissors', { action: 'afterSaleShip', ...data }) },
  async getOrderList(status, page = 1, pageSize = 10) {
    if (!feature('orders')) return cloudOrder('list', { status, page, pageSize })
    const [target, cloud] = await Promise.allSettled([http(paged('/api/v1/orders', { status, page, pageSize })), cloudOrder('list', { status, page, pageSize })])
    if (target.status !== 'fulfilled' && cloud.status !== 'fulfilled') throw target.reason || cloud.reason
    return mergedOrders(target.status === 'fulfilled' ? target.value : [], cloud.status === 'fulfilled' ? cloud.value : [])
  },
  getOrderDetail(orderId, backend = 'target') { return orderBackend(backend) === 'target' && feature('orders') ? http(`/api/v1/orders/${orderId}`) : cloudOrder('detail', { orderId }) },
  structuredCheckoutEnabled() { return feature('structuredCheckout') },
  createCheckoutQuote(data) { if (!feature('structuredCheckout')) return Promise.reject(new Error('结构化选配尚未启用')); return http('/api/v1/checkout/quotes', 'POST', data) },
  createOrder(data) { const payload = { ...data, idempotencyKey: data.idempotencyKey || key('order') }; if (payload.quoteId) { if (!feature('structuredCheckout')) return Promise.reject(new Error('结构化选配尚未启用')); return http('/api/v1/orders', 'POST', payload) } return requestOrCloud('orders', '/api/v1/orders', 'POST', payload, 'order', { action: 'create', ...payload }) },
  cancelOrder(orderId, backend = 'target') { return orderBackend(backend) === 'target' && feature('orders') ? http(`/api/v1/orders/${orderId}`, 'POST', {}) : cloudOrder('cancel', { orderId }) },
  confirmReceive(orderId, backend = 'target') { return orderBackend(backend) === 'target' && feature('orders') ? http(`/api/v1/orders/${orderId}/receive`, 'POST', {}) : cloudOrder('confirmReceive', { orderId }) },
  getWaybillToken(orderId, backend = 'target') { return orderBackend(backend) === 'target' && feature('orders') ? http(`/api/v1/orders/${orderId}/waybill`) : cloudOrder('getWaybillToken', { orderId }) },
  applyRefundRequest(data) { const payload = { ...data, idempotencyKey: data.idempotencyKey || key('refund') }; return orderBackend(payload.backend) === 'target' && feature('orders') ? http('/api/v1/refund-requests', 'POST', payload) : cloudOrder('applyRefund', payload) },
  getRefundRequestList(orderId, backend = 'target') { return orderBackend(backend) === 'target' && feature('orders') ? http(paged('/api/v1/refund-requests', { orderId })) : cloudOrder('listRefundRequests', { orderId }) },
  createPointsOrder(data) { const payload = { ...data, idempotencyKey: data.idempotencyKey || key('points') }; return feature('pointsOrders') ? http('/api/v1/points-orders', 'POST', payload).then(pointsOrderView) : cloudCall('order', { action: 'createPointsOrder', ...payload }) }, getPointsOrderList(status, page = 1, pageSize = 10) { return requestOrCloud('pointsOrders', paged('/api/v1/points-orders', { status, page, pageSize }), 'GET', undefined, 'order', { action: 'listPointsOrders', status, page, pageSize }) }, getPointsOrderDetail(orderId) { return requestOrCloud('pointsOrders', `/api/v1/points-orders/${orderId}`, 'GET', undefined, 'order', { action: 'getPointsOrderDetail', orderId }) }, cancelPointsOrder(orderId, cancelReason = '用户取消') { return requestOrCloud('pointsOrders', `/api/v1/points-orders/${orderId}`, 'POST', { cancelReason }, 'order', { action: 'cancelPointsOrder', orderId, cancelReason }) }, applyPointsRefundRequest(data) { return cloudCall('order', { action: 'applyPointsRefund', ...data }) },
  getGiftCardRedeemRecords(page = 1, pageSize = 10) { return requestOrCloud('giftCards', paged('/api/v1/gift-card-redemptions', { page, pageSize }), 'GET', undefined, 'giftCard', { action: 'records', page, pageSize }) }, redeemGiftCard(data) { const payload = typeof data === 'object' ? data : { code: data }; return requestOrCloud('giftCards', '/api/v1/gift-cards/redeem', 'POST', payload, 'giftCard', { action: 'redeem', ...payload }) }, confirmGiftCardProductAddress(data) { return requestOrCloud('giftCards', `/api/v1/gift-card-redemptions/${data.recordId}/address`, 'POST', data, 'giftCard', { action: 'confirmProductAddress', ...data }) },
  submitCooperation(data) { return requestOrCloud('inquiries', '/api/v1/inquiries', 'POST', data, 'contact', { action: 'submitCooperation', ...data }) },
  // 目标支付仅接受服务端按订单类型读取的金额；旧构建仍会保留 CloudBase 兼容调用。
  createPaymentOrder(data) { return feature('payments') && orderBackend(data?.backend) === 'target' ? http(`/api/v1/payments/wechat/orders/${encodeURIComponent(data.orderId)}`, 'POST', { orderType: data?.orderType === 'points' ? 'points' : 'goods' }) : cloudCall('paymentProxy', { action: 'createOrder', ...data }) }, refundOrder(data) { return cloudCall('paymentProxy', { action: 'refundOrder', ...data }) }
}

export default api
