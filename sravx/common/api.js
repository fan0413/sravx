import { catalogBase, readCatalog } from './catalog-transport.mjs'
import { catalogProduct, catalogResult, collectProducts } from './product-classification.mjs'
// 页面只通过这里请求业务数据，失败由页面捕获并提示；详见docs/api-reference.md。
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

/** 统一JSON请求：返回body.data，失败抛出带statusCode的Error；空token表示公开查询。 */
function http(path, method = 'GET', data, token = targetToken(), base = API_BASE_URL) {
  return new Promise((resolve, reject) => uni.request({
    url: `${base}${path}`, method, data,
    header: { Accept: 'application/json', ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    success(res) {
      const body = res.data;
      res.statusCode >= 200 && res.statusCode < 300 && body && body.success
        ? resolve(body.data)
        : reject(Object.assign(new Error((body && body.error && body.error.message) || '服务暂不可用'), { statusCode: res.statusCode }))
    },
    fail() { reject(new Error('网络连接失败，请检查商品接口连接或跨域配置')) }
  }))
}
const catalog = path => readCatalog(webCatalog, () => http(path, 'GET', undefined, '', CATALOG_BASE_URL))
const asList = value => Array.isArray(value) ? value : (value && (value.products || value.list || value.data)) || []
const productName = item => item && (item.short_name || item.name) || '未命名商品'
function productImage(item = {}) { if (item.image || item.cover_image) return item.image || item.cover_image; if (Array.isArray(item.images)) return item.images[0] || ''; if (typeof item.images === 'string') { try { return JSON.parse(item.images)[0] || '' } catch { return item.images } } return '' }
const targetOrder = (backend, action) => backend === 'cloud' ? Promise.reject(new Error('旧环境已停用，请重新进入服务器订单列表')) : action()
const withOrderBackend = (value, backend) => ({ ...(value || {}), __sravxOrderBackend: backend })
function wechatLogin() { return new Promise((resolve, reject) => uni.login({ success: result => result && result.code ? resolve(result.code) : reject(new Error('微信登录凭证获取失败')), fail: () => reject(new Error('微信登录凭证获取失败')) })) }
// 微信登录code和手机号授权code不同，先创建会话再按需绑定手机号。
async function targetLogin(phoneData = {}) { const session = await http('/api/v1/auth/wechat/session', 'POST', { code: await wechatLogin() }, ''); if (!session || !session.token) throw new Error('登录会话创建失败'); saveTargetSession(session.token); if (phoneData && phoneData.code) await http('/api/v1/me/phone', 'POST', { code: phoneData.code }); return http('/api/v1/me') }
const pointsOrderView = result => { const payableCash = Number(result && (result.payable_cash ?? result.payableCash) || 0); return { ...result, orderId: result.orderId ?? result.id, orderNo: result.orderNo ?? result.order_no, payableCash, needCashPayment: payableCash > 0 } }

const api = {
  /** 把常见列表返回格式转成数组。 */
  asList,

  /** 读取商品显示名称，缺失时给出占位。 */
  productName,

  /** 读取封面或第一张图片。 */
  productImage,

  /** 发送普通GET请求，默认携带当前登录会话。 */
  request: path => http(path),

  /** 读取本地用户会话。 */
  targetToken,

  /** 清除本地用户会话。 */
  clearTargetSession,

  /** 微信登录；可选传手机号授权code，返回用户资料。浏览器不能直接照搬微信登录。 */
  login(data = {}) { return targetLogin(data) },

  /** 读取首页商品，返回商品及分类内容。 */
  getHomeProducts() { return catalog('/api/v1/catalog/home').then(catalogResult) },

  /** 按分类、关键字和分页条件读取商品。 */
  getProductList(params = {}) { return catalog(paged('/api/v1/catalog/products', params)).then(catalogResult) },

  /** 逐页读取并合并商品，避免列表只拿到第一页。 */
  getAllProducts(params = {}) { return collectProducts(page => api.getProductList({ ...params, ...page })) },

  /** 按商品ID读取详情，整理分类及媒体字段。 */
  getProductDetail(id) { return catalog(`/api/v1/catalog/products/${encodeURIComponent(id)}`).then(catalogProduct) },

  /** 按分类ID读取积分商品。 */
  getPointsProducts(categoryId = 0) { return catalog(`/api/v1/catalog/points-products?categoryId=${encodeURIComponent(categoryId)}`) },

  /** 读取积分商品详情。 */
  getPointsProductDetail(id) { return catalog(`/api/v1/catalog/points-products/${encodeURIComponent(id)}`) },

  /** 读取可展示分类。 */
  getCategoryList() { return catalog('/api/v1/catalog/categories') },

  /** 把分类列表整理成两层树，使用parent_id关联。 */
  async getCategoryTree() { const rows = asList(await api.getCategoryList()); return rows.filter(row => !row.parent_id).map(row => ({ ...row, children: rows.filter(child => Number(child.parent_id) === Number(row.id)) })) },

  /** 按展示位置读取轮播图。 */
  getBanners(position = 'home') { return catalog(`/api/v1/catalog/banners?position=${encodeURIComponent(position)}`) },

  /** 读取当前登录用户资料。 */
  getUserInfo() { return http('/api/v1/me', 'GET', undefined) },

  /** 提交用户资料修改，字段由服务器校验。 */
  updateUserInfo(data) { return http('/api/v1/me', 'PUT', data) },

  /** 读取当前用户积分。 */
  getUserPoints() { return http('/api/v1/me/points', 'GET', undefined) },

  /** 分页读取积分记录。 */
  getPointsLogs(page = 1, pageSize = 20) { return http(paged('/api/v1/me/points/logs', { page, pageSize }), 'GET', undefined) },

  /** 读取会员信息。 */
  getMemberLevel() { return http('/api/v1/me/membership', 'GET', undefined) },

  /** 读取当前用户地址。 */
  getAddressList() { return http('/api/v1/addresses', 'GET', undefined) },

  /** 新增地址，提交收件人、电话、地区及详细地址。 */
  addAddress(data) { return http('/api/v1/addresses', 'POST', data) },

  /** 更新地址，data中需要包含id。 */
  updateAddress(data) { return http(`/api/v1/addresses/${data.id}`, 'PUT', data) },

  /** 按地址ID删除当前用户的地址。 */
  deleteAddress(id) { return http(`/api/v1/addresses/${id}`, 'DELETE', undefined) },

  /** 把指定地址设为默认地址。 */
  setDefaultAddress(id) { return http(`/api/v1/addresses/${id}/default`, 'PUT', undefined) },

  /** 读取可以领取的优惠券。 */
  getAvailableCoupons() { return http('/api/v1/coupons', 'GET', undefined) },

  /** 按状态读取用户优惠券。 */
  getMyCoupons(status = 'unused') { return http(`/api/v1/me/coupons?status=${encodeURIComponent(status)}`, 'GET', undefined) },

  /** 领取优惠券，附带防重复提交编号。 */
  receiveCoupon(couponId) { return http(`/api/v1/coupons/${couponId}/claims`, 'POST', { idempotencyKey: key('coupon') }) },

  /** 检查优惠券适用条件；最终优惠在下单时重新计算。 */
  checkCoupon(couponId, orderAmount) { return http(`/api/v1/coupons/claims/${couponId}/check`, 'POST', { orderAmount }) },

  /** 读取用户绑定的工具。 */
  getMyScissors() { return http('/api/v1/tools', 'GET', undefined) },

  /** 按序列号sn绑定剪刀。 */
  bindScissors(sn) { return http('/api/v1/tools', 'POST', { sn }) },

  /** 按绑定记录ID解绑。 */
  unbindScissors(id) { return http(`/api/v1/tools/${id}`, 'DELETE', undefined) },

  /** 按剪刀序列号查询质保。 */
  getWarrantyInfo(sn) { return http(`/api/v1/tools/warranty?sn=${encodeURIComponent(sn)}`, 'GET', undefined) },

  /** 按绑定ID读取售后记录。 */
  getScissorsAfterSale(bindingId) { return http(`/api/v1/tools/${bindingId}/after-sales`, 'GET', undefined) },

  /** 提交工具售后申请，data包含bindingId。 */
  applyScissorsAfterSale(data) { return http(`/api/v1/tools/${data.bindingId}/after-sales`, 'POST', data) },

  /** 提交售后寄回物流，data包含requestId。 */
  submitScissorsAfterSaleShipping(data) { return http(`/api/v1/after-sales/${data.requestId}/shipment`, 'POST', data) },

  /** 分页读取订单，并补上服务器订单来源标记。 */
  async getOrderList(status, page = 1, pageSize = 10) {
    const value = await http(paged('/api/v1/orders', { status, page, pageSize }))
    return { ...(Array.isArray(value) ? {} : value), list: asList(value).map(item => withOrderBackend(item, 'target')) }
  },

  /** 读取订单详情；拒绝把旧云端ID当成服务器ID。 */
  getOrderDetail(orderId, backend = 'target') { return targetOrder(backend, () => http(`/api/v1/orders/${orderId}`)) },

  /** 客户端支持结构化选配；服务器仍会检查是否启用。 */
  structuredCheckoutEnabled() { return true },

  /** 按skuId和数量获取报价，返回quoteId等金额信息。 */
  createCheckoutQuote(data) { return http('/api/v1/checkout/quotes', 'POST', data) },

  /** 创建订单，金额和库存由服务器确定；重试应复用同一个idempotencyKey。 */
  createOrder(data) { const payload = { ...data, idempotencyKey: data.idempotencyKey || key('order') }; return http('/api/v1/orders', 'POST', payload) },

  /** 取消指定订单，不是直接执行退款。 */
  cancelOrder(orderId, backend = 'target') { return targetOrder(backend, () => http(`/api/v1/orders/${orderId}`, 'POST', {})) },

  /** 确认订单收货。 */
  confirmReceive(orderId, backend = 'target') { return targetOrder(backend, () => http(`/api/v1/orders/${orderId}/receive`, 'POST', {})) },

  /** 读取订单物流展示信息。 */
  getWaybillToken(orderId, backend = 'target') { return targetOrder(backend, () => http(`/api/v1/orders/${orderId}/waybill`)) },

  /** 提交退款申请，提交成功不等于已经退款到账。 */
  applyRefundRequest(data) { const payload = { ...data, idempotencyKey: data.idempotencyKey || key('refund') }; return targetOrder(payload.backend, () => http('/api/v1/refund-requests', 'POST', payload)) },

  /** 查询订单的退款申请及处理状态。 */
  getRefundRequestList(orderId, backend = 'target') { return targetOrder(backend, () => http(paged('/api/v1/refund-requests', { orderId }))) },

  /** 创建积分订单，返回是否需要现金补差。 */
  createPointsOrder(data) { const payload = { ...data, idempotencyKey: data.idempotencyKey || key('points') }; return http('/api/v1/points-orders', 'POST', payload).then(pointsOrderView) },

  /** 分页读取积分订单。 */
  getPointsOrderList(status, page = 1, pageSize = 10) { return http(paged('/api/v1/points-orders', { status, page, pageSize }), 'GET', undefined) },

  /** 读取积分订单详情。 */
  getPointsOrderDetail(orderId) { return http(`/api/v1/points-orders/${orderId}`, 'GET', undefined) },

  /** 取消积分订单，可传取消原因。 */
  cancelPointsOrder(orderId, cancelReason = '用户取消') { return http(`/api/v1/points-orders/${orderId}`, 'POST', { cancelReason }) },

  /** 积分退款尚未接入服务器，明确报错，不调用旧函数。 */
  applyPointsRefundRequest(data) { return Promise.reject(new Error('积分订单退款申请尚未接入服务器，请联系客服处理')) },

  /** 分页读取礼品卡兑换记录。 */
  getGiftCardRedeemRecords(page = 1, pageSize = 10) { return http(paged('/api/v1/gift-card-redemptions', { page, pageSize }), 'GET', undefined) },

  /** 兑换礼品卡，附带防重复提交编号。 */
  redeemGiftCard(data) { const value = typeof data === 'object' ? data : { code: data }; const payload = { ...value, idempotencyKey: value.idempotencyKey || key('giftCard') }; return http('/api/v1/gift-cards/redeem', 'POST', payload) },

  /** 给兑换记录补收货地址，data包含recordId和addressId。 */
  confirmGiftCardProductAddress(data) { return http(`/api/v1/gift-card-redemptions/${data.recordId}/address`, 'POST', data) },

  /** 提交合作咨询表单。 */
  submitCooperation(data) { return http('/api/v1/inquiries', 'POST', data) },

  /** 用订单ID获取微信支付参数，拿到参数不表示付款成功。 */
  createPaymentOrder(data) { return targetOrder(data?.backend, () => http(`/api/v1/payments/wechat/orders/${encodeURIComponent(data.orderId)}`, 'POST', { orderType: data?.orderType === 'points' ? 'points' : 'goods' })) },

  /** 不提供用户直接退款，应提交退款申请。 */
  refundOrder() { return Promise.reject(new Error('退款由管理端审核执行，请提交退款申请')) }
}

// Keep an explicit source marker for order links; never reinterpret cached legacy IDs.
for (const method of ['createOrder', 'createPointsOrder']) {
  const create = api[method].bind(api)
  api[method] = data => create(data).then(result => withOrderBackend(result, 'target'))
}

export default api
