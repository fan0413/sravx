/**
 * API 调用工具
 * 统一管理所有 API 调用：
 *   - 云函数调用（callFunction）：用于非支付接口
 *   - HTTP 请求（httpRequest）：用于支付等需要外网能力的接口，走 CloudRun
 */

const app = getApp()

/**
 * CloudRun 支付服务地址
 * 部署在腾讯云 CloudBase 云托管 (env: cloud1-8gk3bptqefbf01d6)，服务名：payment-api
 */
const PAYMENT_API_BASE = 'https://payment-api-248775-6-1419382340.sh.run.tcloudbase.com'

function getReadOnlyApiBase() {
  const config = app && app.globalData && app.globalData.readOnlyApiMigration
  if (!config || config.enabled !== true || typeof config.baseUrl !== 'string') return null
  const baseUrl = config.baseUrl.trim().replace(/\/$/, '')
  return /^https:\/\//.test(baseUrl) ? baseUrl : null
}

function requestReadOnlyApi(path) {
  const baseUrl = getReadOnlyApiBase()
  if (!baseUrl) return null
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}${path}`,
      method: 'GET',
      header: { Accept: 'application/json' },
      success: (res) => {
        const body = res.data
        if (res.statusCode >= 200 && res.statusCode < 300 && body && body.success) return resolve(body.data)
        const detail = body && body.error
        reject({ message: (detail && detail.message) || '目录服务暂不可用', code: (detail && detail.code) || 'CATALOG_API_ERROR', statusCode: res.statusCode })
      },
      fail: (err) => reject({ message: err.errMsg || '目录服务网络错误', code: 'CATALOG_API_NETWORK_ERROR' })
    })
  })
}

function migratedRead(path, legacyRequest) {
  const request = requestReadOnlyApi(path)
  return request || legacyRequest()
}

function getAuthenticatedApiBase() {
  const config = app && app.globalData && app.globalData.authenticatedApiMigration
  if (!config || config.enabled !== true || typeof config.baseUrl !== 'string') return null
  const baseUrl = config.baseUrl.trim().replace(/\/$/, '')
  return /^https:\/\//.test(baseUrl) ? baseUrl : null
}

function targetSessionCache() {
  const inMemory = app && app.globalData && app.globalData.authenticatedApiSession
  if (inMemory && typeof inMemory.token === 'string') return inMemory
  try {
    const cached = wx.getStorageSync('sravx_authenticated_api_session')
    return cached && typeof cached.token === 'string' ? cached : null
  } catch (err) {
    return null
  }
}

function storeTargetSession(session) {
  if (app && app.globalData) app.globalData.authenticatedApiSession = session
  try { wx.setStorageSync('sravx_authenticated_api_session', session) } catch (err) {}
}

function clearTargetSession() {
  if (app && app.globalData) app.globalData.authenticatedApiSession = null
  try { wx.removeStorageSync('sravx_authenticated_api_session') } catch (err) {}
}

function rawTargetRequest(baseUrl, path, method, data, token) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}${path}`,
      method,
      data,
      header: {
        Accept: 'application/json',
        ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      success: (res) => {
        const body = res.data
        if (res.statusCode >= 200 && res.statusCode < 300 && body && body.success) return resolve(body.data)
        const detail = body && body.error
        reject({ message: (detail && detail.message) || '服务暂不可用', code: (detail && detail.code) || 'TARGET_API_ERROR', statusCode: res.statusCode })
      },
      fail: (err) => reject({ message: err.errMsg || '服务网络错误', code: 'TARGET_API_NETWORK_ERROR' })
    })
  })
}

async function targetSession(baseUrl) {
  const cached = targetSessionCache()
  const now = Math.floor(Date.now() / 1000)
  if (cached && cached.expiresAt > now + 60) return cached.token
  const login = await new Promise((resolve, reject) => wx.login({ success: resolve, fail: reject }))
  if (!login || typeof login.code !== 'string' || !login.code) throw { message: '登录状态获取失败', code: 'TARGET_LOGIN_FAILED' }
  const data = await rawTargetRequest(baseUrl, '/api/v1/auth/wechat/session', 'POST', { code: login.code })
  if (!data || typeof data.token !== 'string' || !Number.isFinite(Number(data.expiresAt))) throw { message: '登录服务返回无效', code: 'TARGET_LOGIN_FAILED' }
  storeTargetSession({ token: data.token, expiresAt: Number(data.expiresAt) })
  return data.token
}

function authenticatedMigrationRequest(path, method, data, legacyRequest) {
  const baseUrl = getAuthenticatedApiBase()
  if (!baseUrl) return legacyRequest()
  return targetSession(baseUrl)
    .then((token) => rawTargetRequest(baseUrl, path, method, data, token))
    .catch((err) => {
      if (err && err.statusCode === 401) clearTargetSession()
      throw err
    })
}

/**
 * 获取全局 openid
 */
function getOpenid() {
  try {
    return app && app.globalData && app.globalData.userInfo && app.globalData.userInfo.openid
  } catch (e) {
    return null
  }
}

function hasPhoneAuthorized() {
  try {
    if (!app || !app.globalData) return false
    if (typeof app.hasPhoneAuthorized === 'function') {
      return app.hasPhoneAuthorized()
    }
    return !!(app.globalData.userInfo && app.globalData.userInfo.phone)
  } catch (e) {
    return false
  }
}

async function refreshLoginStateIfNeeded(shouldRefresh) {
  if (!shouldRefresh || !app || typeof app.refreshLoginState !== 'function') return null
  try {
    return await app.refreshLoginState()
  } catch (err) {
    console.warn('[API] refreshLoginState failed:', err)
    return null
  }
}

function rejectNeedPhoneAuth(reject) {
  wx.showToast({ title: '请先授权手机号', icon: 'none' })
  reject({ message: '请先授权手机号', code: 'NEED_PHONE_AUTH' })
}

/**
 * 调用云函数
 * @param {string} name - 云函数名称
 * @param {Object} data - 传递给云函数的参数
 * @param {boolean} needAuth - 是否需要登录（默认 false）
 * @returns {Promise<Object>} 云函数返回结果
 */
function callFunction(name, data = {}, needAuth = false) {
  return new Promise(async (resolve, reject) => {
    // 如果需要登录但没有 openid，直接拒绝
    if (needAuth) {
      let openid = getOpenid()
      if (!openid || !hasPhoneAuthorized()) {
        await refreshLoginStateIfNeeded(true)
        openid = getOpenid()
      }
      if (!openid && !hasPhoneAuthorized()) {
        reject({ message: '用户未登录', code: 'NOT_LOGIN' })
        return
      }
      if (!hasPhoneAuthorized()) {
        rejectNeedPhoneAuth(reject)
        return
      }
      if (openid) data.openid = openid
    }

    wx.cloud.callFunction({
      name,
      data,
      success: (res) => {
        if (res.result && res.result.success) {
          resolve(res.result.data)
        } else {
          const error = res.result ? res.result.error : '网络错误'
          console.error(`[API] ${name} error:`, error)
          reject({ message: error, code: 'CLOUD_ERROR' })
        }
      },
      fail: (err) => {
        console.error(`[API] ${name} fail:`, err)
        reject({ message: err.message || '网络错误', code: 'NETWORK_ERROR' })
      }
    })
  })
}

/**
 * 带加载提示的云函数调用
 * @param {string} name - 云函数名称
 * @param {Object} data - 传递给云函数的参数
 * @param {string} loadingText - 加载提示文字，默认 '加载中...'
 * @param {boolean} needAuth - 是否需要登录
 */
async function callFunctionWithLoading(name, data = {}, loadingText = '加载中...', needAuth = false) {
  try {
    wx.showLoading({ title: loadingText, mask: true })
    const result = await callFunction(name, data, needAuth)
    wx.hideLoading()
    return result
  } catch (err) {
    wx.hideLoading()
    throw err
  }
}

/**
 * HTTP 请求 CloudRun 服务（用于支付等需要外网能力的接口）
 * @param {string} path - API 路径，如 '/api/payment/createOrder'
 * @param {Object} data - POST 请求体数据
 * @returns {Promise<Object>} 响应的 data 字段
 */
function httpRequest(path, data = {}) {
  return new Promise(async (resolve, reject) => {
    // 如果需要 openid，自动注入
    const openid = getOpenid()
    let paymentOpenid = data.openid || openid
    if (!paymentOpenid || !hasPhoneAuthorized()) {
      await refreshLoginStateIfNeeded(true)
      paymentOpenid = getOpenid()
    }
    if (paymentOpenid && !data.openid) {
      data.openid = paymentOpenid
    }
    if (!paymentOpenid) {
      reject({ message: '用户未登录', code: 'NOT_LOGIN' })
      return
    }
    if (!hasPhoneAuthorized()) {
      rejectNeedPhoneAuth(reject)
      return
    }

    const url = PAYMENT_API_BASE + path

    console.log(`[HTTP] POST ${url}`)

    wx.request({
      url,
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const body = res.data
          if (body && body.success) {
            resolve(body.data)
          } else {
            const errorMsg = body ? body.error : '服务器错误'
            console.error(`[HTTP] ${path} error:`, errorMsg)
            reject({ message: errorMsg, code: 'API_ERROR', statusCode: res.statusCode })
          }
        } else if (res.statusCode === 401 || res.statusCode === 403) {
          reject({ message: '无权限访问', code: 'FORBIDDEN', statusCode: res.statusCode })
        } else {
          console.error(`[HTTP] ${path} fail (${res.statusCode}):`, res.data)
          reject({ message: `请求失败(${res.statusCode})`, code: 'HTTP_ERROR', statusCode: res.statusCode })
        }
      },
      fail: (err) => {
        console.error(`[HTTP] ${path} network error:`, err)
        reject({ message: err.errMsg || '网络错误', code: 'NETWORK_ERROR' })
      }
    })
  })
}

// ==================== 登录/用户模块 ====================

/**
 * 登录
 * @param {Object} phoneData - 可选，包含 encryptedData 和 iv 用于获取手机号
 */
function login(phoneData = {}) {
  return callFunction('login', phoneData, false)
}

/**
 * 获取用户信息（需要登录）
 * @param {Object} params - 可选参数
 */
function getUserInfo(params = {}) {
  return callFunction('user', { action: 'getInfo', ...params }, true)
}

/**
 * 更新用户信息（云函数自动获取 openid，无需 needAuth）
 * @param {Object} params - { nickname, avatar, phone, gender, birthday, occupation }
 */
function updateUserInfo(params = {}) {
  return callFunction('user', { action: 'updateInfo', ...params }, false)
}

/**
 * 获取用户积分（需要登录）
 */
function getUserPoints() {
  return callFunction('user', { action: 'getPoints' }, true)
}

/**
 * 获取积分记录（需要登录）
 * @param {number} page - 页码
 * @param {number} pageSize - 每页数量
 */
function getPointsLogs(page = 1, pageSize = 20) {
  return callFunction('user', { action: 'getPointsLogs', page, pageSize }, true)
}

/**
 * 获取会员等级信息（需要登录）
 */
function getMemberLevel() {
  return callFunction('user', { action: 'getMemberLevel' }, true)
}

// ==================== 商品模块 ====================

/**
 * 获取首页数据
 */
function getHomeProducts() {
  return migratedRead('/api/v1/catalog/home', () => callFunction('product', { action: 'home' }))
}

/**
 * 获取商品列表
 * @param {Object} params - { categoryId, page, pageSize, keyword }
 */
function getProductList(params = {}) {
  const query = Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '').map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&')
  return migratedRead(`/api/v1/catalog/products${query ? `?${query}` : ''}`, () => callFunction('product', { action: 'list', ...params }))
}

/**
 * 获取商品详情
 * @param {number} id - 商品ID
 */
function getProductDetail(id) {
  return migratedRead(`/api/v1/catalog/products/${encodeURIComponent(id)}`, () => callFunction('product', { action: 'detail', id }))
}

/**
 * 获取积分商品列表
 * @param {number} categoryId - 分类ID（0=全部）
 */
function getPointsProducts(categoryId = 0) {
  const target = requestReadOnlyApi(`/api/v1/catalog/points-products?categoryId=${encodeURIComponent(Number(categoryId) || 0)}`)
  if (target) return target
  return callFunction('product', { action: 'pointsList', categoryId: Number(categoryId) || 0 }, false)
    .catch((err) => {
      if (isUnknownActionError(err)) {
        console.warn('[API] product pointsList 未发布，降级为空列表')
        return { products: [], categories: [], current_member_level: 1 }
      }
      throw err
    })
}

function isUnknownActionError(err) {
  const msg = (err && err.message) ? String(err.message) : ''
  return msg.includes('未知操作')
}

/**
 * 获取积分商品详情
 * @param {number} id - 积分商品ID（points_products.id）
 */
function getPointsProductDetail(id) {
  const target = requestReadOnlyApi(`/api/v1/catalog/points-products/${encodeURIComponent(id)}`)
  if (target) return target
  return callFunction('product', { action: 'pointsDetail', id }, false)
    .catch((err) => {
      if (isUnknownActionError(err)) {
        throw { message: '积分商品接口未发布，请先部署 product 云函数', code: 'POINTS_API_NOT_DEPLOYED' }
      }
      throw err
    })
}

// ==================== 分类模块 ====================

/**
 * 获取分类列表
 */
function getCategoryList() {
  return migratedRead('/api/v1/catalog/categories', () => callFunction('category', { action: 'list' }))
}

/**
 * 获取分类树形结构
 */
function getCategoryTree() {
  return migratedRead('/api/v1/catalog/categories', () => callFunction('category', { action: 'tree' }))
}

// ==================== 轮播图模块 ====================

/**
 * 获取轮播图
 * @param {string} position - 位置，如 'home'
 */
function getBanners(position = 'home') {
  return migratedRead(`/api/v1/catalog/banners?position=${encodeURIComponent(position)}`, () => callFunction('banner', { position }))
}

// ==================== 支付模块（云函数代理到 CloudRun payment-api）====================

/**
 * 创建支付订单，获取微信支付参数（需要登录）
 * @param {Object} params - { orderId }
 * @returns {Promise<Object>} { appId, timeStamp, nonceStr, package, signType, paySign }
 */
function createPaymentOrder(params) {
  return callFunction('paymentProxy', { action: 'createOrder', ...params }, true)
}

/**
 * 发起退款（需要登录）
 * @param {Object} params - { orderId, reason, totalFee }
 */
function refundOrder(params) {
  return callFunction('paymentProxy', { action: 'refundOrder', ...params }, true)
}

// ==================== 订单模块 ====================

/**
 * 获取订单列表（需要登录）
 * @param {string} status - 订单状态筛选
 * @param {number} page - 页码
 * @param {number} pageSize - 每页数量
 */
function getOrderList(status, page = 1, pageSize = 10) {
  const data = {
    action: 'list',
    page: Number(page) > 0 ? Number(page) : 1,
    pageSize: Number(pageSize) > 0 ? Number(pageSize) : 10
  }
  if (status !== undefined && status !== null && status !== '') {
    data.status = status
  }
  return callFunction('order', data, true)
}

/**
 * 获取订单详情（需要登录）
 * @param {number|string} orderIdOrNo - 数字订单 id，或与微信支付 out_trade_no 一致的 order_no（微信「小程序购物订单」跳转）
 */
function getOrderDetail(orderIdOrNo) {
  if (orderIdOrNo === undefined || orderIdOrNo === null || String(orderIdOrNo).trim() === '') {
    return Promise.reject({ message: '缺少订单信息', code: 'INVALID_ORDER' })
  }
  const raw = String(orderIdOrNo).trim()
  if (/^\d+$/.test(raw)) {
    return callFunction('order', { action: 'detail', orderId: parseInt(raw, 10) }, true)
  }
  return callFunction('order', { action: 'detail', orderNo: raw }, true)
}

/**
 * 创建订单（需要登录）
 * @param {Object} params - { addressId, productId, quantity, couponId, remark }
 */
function createOrder(params) {
  return callFunction('order', { action: 'create', ...params }, true)
}

/**
 * 创建积分订单
 * @param {Object} params - { pointsProductId, addressId, quantity, selectedSpecName, remark, idempotencyKey }
 */
function createPointsOrder(params) {
  const payload = { ...params }
  if (!payload.idempotencyKey) {
    payload.idempotencyKey = `pp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }
  return callFunction('order', { action: 'createPointsOrder', ...payload }, true)
}

/**
 * 获取积分订单列表
 * @param {string} status - 状态筛选
 * @param {number} page - 页码
 * @param {number} pageSize - 每页数量
 */
function getPointsOrderList(status, page = 1, pageSize = 10) {
  const data = {
    action: 'listPointsOrders',
    page: Number(page) > 0 ? Number(page) : 1,
    pageSize: Number(pageSize) > 0 ? Number(pageSize) : 10
  }
  if (status !== undefined && status !== null && status !== '') data.status = status
  return callFunction('order', data, true)
    .catch((err) => {
      if (isUnknownActionError(err)) {
        console.warn('[API] order listPointsOrders 未发布，降级为空列表')
        return { list: [], userAvailablePoints: 0 }
      }
      throw err
    })
}

/**
 * 获取积分订单详情
 * @param {number|string} orderIdOrNo - 订单ID或订单号
 */
function getPointsOrderDetail(orderIdOrNo) {
  if (orderIdOrNo === undefined || orderIdOrNo === null || String(orderIdOrNo).trim() === '') {
    return Promise.reject({ message: '缺少订单信息', code: 'INVALID_ORDER' })
  }
  const raw = String(orderIdOrNo).trim()
  if (/^\d+$/.test(raw)) {
    return callFunction('order', { action: 'getPointsOrderDetail', orderId: parseInt(raw, 10) }, true)
      .catch((err) => {
        if (isUnknownActionError(err)) {
          throw { message: '积分订单接口未发布，请先部署 order 云函数', code: 'POINTS_API_NOT_DEPLOYED' }
        }
        throw err
      })
  }
  return callFunction('order', { action: 'getPointsOrderDetail', orderNo: raw }, true)
    .catch((err) => {
      if (isUnknownActionError(err)) {
        throw { message: '积分订单接口未发布，请先部署 order 云函数', code: 'POINTS_API_NOT_DEPLOYED' }
      }
      throw err
    })
}

/**
 * 取消积分订单
 * @param {number} orderId - 订单ID
 * @param {string} cancelReason - 取消原因
 */
function cancelPointsOrder(orderId, cancelReason = '用户取消') {
  return callFunction('order', { action: 'cancelPointsOrder', orderId, cancelReason }, true)
}

/**
 * 积分订单退款
 * @param {Object} params - { orderId, refundReason, refundTransactionId }
 */
function refundPointsOrder(params) {
  return callFunction('order', { action: 'refundPointsOrder', ...params }, true)
}

/**
 * 申请积分订单退款（未发货/已取消自动退款，其余进入后台审批）
 * @param {Object} params - { orderId, refundReason }
 */
function applyPointsRefundRequest(params) {
  return callFunction('order', { action: 'applyPointsRefund', ...params }, true)
}

/**
 * 取消订单（需要登录）
 * @param {number} orderId - 订单ID
 */
function cancelOrder(orderId) {
  return callFunction('order', { action: 'cancel', orderId }, true)
}

/**
 * 确认收货（需要登录）
 * @param {number} orderId - 订单ID
 */
function confirmReceive(orderId) {
  return callFunction('order', { action: 'confirmReceive', orderId }, true)
}

/**
 * 获取物流 waybillToken（需要登录）
 * @param {number} orderId - 订单ID
 */
function getWaybillToken(orderId) {
  return callFunction('order', { action: 'getWaybillToken', orderId }, true)
}

/**
 * 提交退款申请（进入管理员审核队列，不直接退款）
 * @param {Object} params - { orderId, reason, refundType, amount }
 */
function applyRefundRequest(params) {
  return callFunction('order', { action: 'applyRefund', ...params }, true)
}

/**
 * 查询退款申请记录
 * @param {number} orderId - 可选，按订单筛选
 */
function getRefundRequestList(orderId) {
  return callFunction('order', { action: 'listRefundRequests', orderId }, true)
}

// ==================== 优惠券模块 ====================

/**
 * 获取可领取的优惠券列表
 */
function getAvailableCoupons() {
  return callFunction('coupon', { action: 'list', type: 'available' })
}

/**
 * 获取我的优惠券（需要登录）
 * @param {string} status - 'unused' | 'used' | 'expired'
 */
function getMyCoupons(status = 'unused') {
  return callFunction('coupon', { action: 'my', status }, true)
}

/**
 * 领取优惠券（需要登录）
 * @param {number} couponId - 优惠券ID
 */
function receiveCoupon(couponId) {
  return callFunction('coupon', { action: 'receive', couponId }, true)
}

/**
 * 检查优惠券是否可用
 * @param {number} couponId - 优惠券ID
 * @param {number} orderAmount - 订单金额
 */
function checkCoupon(couponId, orderAmount) {
  return callFunction('coupon', { action: 'check', couponId, orderAmount })
}

// ==================== 礼品卡模块 ====================

/**
 * 兑换礼品卡（需要登录）
 * @param {string} code - 礼品卡兑换码
 */
function redeemGiftCard(codeOrParams) {
  const payload = typeof codeOrParams === 'object' && codeOrParams !== null
    ? codeOrParams
    : { code: codeOrParams }
  return callFunction('giftCard', { action: 'redeem', ...payload }, true)
}

/**
 * 兑换商品礼品时补充收货地址并生成礼品订单（需要登录）
 * @param {Object} params - { recordId, addressId }
 */
function confirmGiftCardProductAddress(params) {
  return callFunction('giftCard', { action: 'confirmProductAddress', ...params }, true)
}

/**
 * 获取礼品卡兑换记录（需要登录）
 */
function getGiftCardRedeemRecords(page = 1, pageSize = 10) {
  return callFunction('giftCard', { action: 'records', page, pageSize }, true)
    .catch((err) => {
      const msg = err && err.message ? String(err.message) : ''
      if (msg.includes('giftCard') || msg.includes('function') || msg.includes('not found')) {
        console.warn('[API] giftCard 未发布，降级为空记录')
        return []
      }
      throw err
    })
}

// ==================== 地址模块 ====================

/**
 * 获取地址列表（需要登录）
 */
function getAddressList() {
  return authenticatedMigrationRequest('/api/v1/addresses', 'GET', undefined, () => callFunction('address', { action: 'list' }, true))
}

/**
 * 新增地址（需要登录）
 * @param {Object} address - 地址信息
 */
function addAddress(address) {
  return authenticatedMigrationRequest('/api/v1/addresses', 'POST', address, () => callFunction('address', { action: 'add', ...address }, true))
}

/**
 * 更新地址（需要登录）
 * @param {Object} address - 地址信息（含 id）
 */
function updateAddress(address) {
  const id = Number(address && address.id)
  if (!id) return Promise.reject({ message: '地址信息无效', code: 'INVALID_ADDRESS' })
  return authenticatedMigrationRequest(`/api/v1/addresses/${id}`, 'PUT', address, () => callFunction('address', { action: 'update', ...address }, true))
}

/**
 * 删除地址（需要登录）
 * @param {number} id - 地址ID
 */
function deleteAddress(id) {
  return authenticatedMigrationRequest(`/api/v1/addresses/${Number(id)}`, 'DELETE', undefined, () => callFunction('address', { action: 'delete', id }, true))
}

/**
 * 设置默认地址（需要登录）
 * @param {number} id - 地址ID
 */
function setDefaultAddress(id) {
  return authenticatedMigrationRequest(`/api/v1/addresses/${Number(id)}/default`, 'PUT', undefined, () => callFunction('address', { action: 'setDefault', id }, true))
}

// ==================== 剪刀模块 ====================

/**
 * 获取我的剪刀列表（需要登录）
 */
function getMyScissors() {
  return callFunction('scissors', { action: 'list' }, true)
}

/**
 * 绑定剪刀（需要登录）
 * @param {string} sn - 剪刀序列号
 */
function bindScissors(sn) {
  return callFunction('scissors', { action: 'bind', sn }, true)
}

/**
 * 解绑剪刀（需要登录）
 * @param {number} id - 绑定记录ID
 */
function unbindScissors(id) {
  return callFunction('scissors', { action: 'unbind', id }, true)
}

/**
 * 查询保修信息（需要登录）
 * @param {string} sn - 剪刀序列号
 */
function getWarrantyInfo(sn) {
  return callFunction('scissors', { action: 'warranty', sn }, true)
}

/**
 * 获取某把已绑定剪刀的售后记录与卖家留言（需要登录）
 * @param {number} bindingId 用户剪刀绑定记录 ID
 */
function getScissorsAfterSale(bindingId) {
  return callFunction('scissors', { action: 'afterSaleDetail', bindingId }, true)
}

/**
 * 提交剪刀维修或置换申请（需要登录）
 * @param {Object} params - { bindingId, serviceType, description }
 */
function applyScissorsAfterSale(params) {
  return callFunction('scissors', { action: 'afterSaleApply', ...params }, true)
}

function submitScissorsAfterSaleShipping(params) {
  return callFunction('scissors', { action: 'afterSaleShip', ...params }, true)
}

/**
 * 提交合作咨询
 */
function submitCooperation(formData) {
  return callFunction('contact', { action: 'submitCooperation', ...formData })
}

module.exports = {
  callFunction,
  callFunctionWithLoading,
  getOpenid,

  // 登录/用户
  login,
  getUserInfo,
  updateUserInfo,
  getUserPoints,
  getPointsLogs,
  getMemberLevel,

  // 商品
  getHomeProducts,
  getProductList,
  getProductDetail,
  getPointsProducts,
  getPointsProductDetail,

  // 分类
  getCategoryList,
  getCategoryTree,

  // 轮播图
  getBanners,

  // 支付
  createPaymentOrder,
  refundOrder,

  // 订单
  getOrderList,
  getOrderDetail,
  createOrder,
  createPointsOrder,
  getPointsOrderList,
  getPointsOrderDetail,
  cancelPointsOrder,
  refundPointsOrder,
  applyPointsRefundRequest,
  cancelOrder,
  confirmReceive,
  getWaybillToken,
  applyRefundRequest,
  getRefundRequestList,

  // 优惠券
  getAvailableCoupons,
  getMyCoupons,
  receiveCoupon,
  checkCoupon,

  // 礼品卡
  redeemGiftCard,
  confirmGiftCardProductAddress,
  getGiftCardRedeemRecords,

  // 地址
  getAddressList,
  addAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,

  // 剪刀
  getMyScissors,
  bindScissors,
  unbindScissors,
  getWarrantyInfo,
  getScissorsAfterSale,
  applyScissorsAfterSale,
  submitScissorsAfterSaleShipping,

  // 合作咨询
  submitCooperation
};
