/**
 * 礼品卡兑换云函数 - 使用 MySQL 数据库
 *
 * action:
 * - redeem: 兑换礼品卡，支持 product / points / coupon / combo
 * - records: 查询我的兑换记录
 * - confirmProductAddress: 商品礼品补充地址后生成 0 元订单
 */
const cloud = require('wx-server-sdk')
const mysql = require('mysql2/promise')

cloud.init({
  env: process.env.ENV_ID || 'cloud1-8gk3bptqefbf01d6'
})

const dbConfig = {
  host: process.env.DB_HOST || 'sh-cynosdbmysql-grp-qs403jue.sql.tencentcdb.com',
  port: Number(process.env.DB_PORT) || 22069,
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'cloud1-8gk3bptqefbf01d6',
  ssl: false,
  connectTimeout: 10000,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000
}

if (!dbConfig.password) {
  console.warn('[DB] DB_PASSWORD 未配置，请在云函数环境变量中设置')
}

let pool = null

async function getPool() {
  if (!pool) {
    pool = mysql.createPool(dbConfig)
  }
  return pool
}

async function getConnection() {
  let p = await getPool()
  try {
    return await p.getConnection()
  } catch (err) {
    console.error('getConnection failed, recreating pool:', err.message)
    pool = null
    p = await getPool()
    return await p.getConnection()
  }
}

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 64)
}

function toPositiveInt(value, fallback = 1) {
  const n = parseInt(value, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function safeJsonParse(raw, fallback = {}) {
  if (raw == null) return fallback
  if (typeof raw === 'object') return raw
  try {
    return JSON.parse(String(raw))
  } catch (e) {
    return fallback
  }
}

function generateOrderNo() {
  return `SA${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`
}

function buildAddressText(addr) {
  return `${addr.province || ''}${addr.city || ''}${addr.district || ''}${addr.detail || ''}`
}

function getPayload(card) {
  return safeJsonParse(card.gift_payload, {})
}

function getGiftTitle(card, payload, fallback) {
  return String(card.title || payload.title || payload.name || fallback || '礼品卡').slice(0, 120)
}

function makeChildCard(parent, giftType, payload, index) {
  return {
    ...parent,
    gift_type: giftType,
    title: payload.title || payload.name || parent.title || `组合权益${index + 1}`,
    gift_payload: payload
  }
}

async function ensureGiftTables(connection) {
  await connection.execute(
    `CREATE TABLE IF NOT EXISTS gift_cards (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      code VARCHAR(64) NOT NULL,
      title VARCHAR(120) NOT NULL DEFAULT '',
      gift_type VARCHAR(20) NOT NULL,
      gift_payload JSON NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'unused',
      batch_no VARCHAR(64) NOT NULL DEFAULT '',
      redeemed_by VARCHAR(128) NULL,
      redeemed_record_id BIGINT UNSIGNED NULL,
      redeemed_at DATETIME NULL,
      expire_time DATETIME NULL,
      admin_note VARCHAR(255) NOT NULL DEFAULT '',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_gift_cards_code (code),
      KEY idx_gift_cards_status_expire (status, expire_time),
      KEY idx_gift_cards_batch (batch_no),
      KEY idx_gift_cards_redeemed_by (redeemed_by, redeemed_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  )

  await connection.execute(
    `CREATE TABLE IF NOT EXISTS gift_redeem_records (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      gift_card_id BIGINT UNSIGNED NOT NULL,
      code VARCHAR(64) NOT NULL,
      user_id BIGINT UNSIGNED NULL,
      _openid VARCHAR(128) NOT NULL,
      gift_type VARCHAR(20) NOT NULL,
      gift_title VARCHAR(120) NOT NULL DEFAULT '',
      gift_snapshot JSON NULL,
      redeem_status VARCHAR(20) NOT NULL DEFAULT 'success',
      fulfillment_status VARCHAR(32) NOT NULL DEFAULT 'fulfilled',
      order_id BIGINT UNSIGNED NULL,
      order_no VARCHAR(64) NULL,
      user_coupon_id BIGINT UNSIGNED NULL,
      points_change INT NOT NULL DEFAULT 0,
      fail_reason VARCHAR(255) NOT NULL DEFAULT '',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_gift_records_card (gift_card_id),
      KEY idx_gift_records_openid_created (_openid, created_at),
      KEY idx_gift_records_fulfillment (fulfillment_status, created_at),
      KEY idx_gift_records_order (order_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  )
}

async function getUser(connection, openid) {
  const [rows] = await connection.execute(
    'SELECT id, points, total_points FROM users WHERE openid = ? OR _openid = ? LIMIT 1 FOR UPDATE',
    [openid, openid]
  )
  if (!rows || rows.length === 0) {
    throw new Error('用户不存在')
  }
  return rows[0]
}

async function tryInsertPointsLog(connection, user, openid, points, balanceAfter, remark) {
  try {
    await connection.execute(
      `INSERT INTO points_logs (user_id, openid, change_type, points, balance, order_id, remark, created_at)
       VALUES (?, ?, 'activity_reward', ?, ?, NULL, ?, NOW())`,
      [user.id, openid, points, balanceAfter, remark]
    )
    return
  } catch (err) {
    if (err.code !== 'ER_BAD_FIELD_ERROR') throw err
  }

  await connection.execute(
    `INSERT INTO points_logs (user_id, change_type, points, balance, order_id, remark, created_at)
     VALUES (?, 'activity_reward', ?, ?, NULL, ?, NOW())`,
    [user.id, points, balanceAfter, remark]
  )
}

async function redeemPoints(connection, card, user, openid) {
  const payload = getPayload(card)
  const points = toPositiveInt(payload.points, 0)
  if (points <= 0) throw new Error('积分礼品配置无效')

  const before = Number(user.points) || 0
  const after = before + points
  await connection.execute(
    'UPDATE users SET points = points + ?, total_points = total_points + ?, updated_at = NOW() WHERE id = ?',
    [points, points, user.id]
  )
  await tryInsertPointsLog(connection, user, openid, points, after, `礼品卡兑换：${card.code}`)

  const title = getGiftTitle(card, payload, `${points} 积分`)
  return {
    giftTitle: title,
    snapshot: { ...payload, points, title },
    fulfillmentStatus: 'fulfilled',
    pointsChange: points,
    response: {
      giftType: 'points',
      title: '积分兑换成功',
      benefitText: `+${points} 积分已到账`,
      points,
      nextAction: 'points_mall',
      actionText: '去积分商城'
    }
  }
}

async function redeemCoupon(connection, card, user, openid) {
  const payload = getPayload(card)
  const couponId = Number(payload.couponId || payload.coupon_id)
  if (!couponId || Number.isNaN(couponId)) throw new Error('优惠券礼品配置无效')

  const [coupons] = await connection.execute(
    `SELECT id, name, value, min_amount, expire_time, remain_count, status
     FROM coupons
     WHERE id = ? AND deleted_at IS NULL LIMIT 1 FOR UPDATE`,
    [couponId]
  )
  if (!coupons || coupons.length === 0) throw new Error('优惠券不存在')
  const coupon = coupons[0]
  if (coupon.status !== 'active') throw new Error('优惠券不可领取')
  if (coupon.expire_time && new Date(coupon.expire_time).getTime() <= Date.now()) throw new Error('优惠券已过期')
  if (Number(coupon.remain_count) <= 0) throw new Error('优惠券已领完')

  const [inserted] = await connection.execute(
    'INSERT INTO user_coupons (_openid, coupon_id, status, received_at) VALUES (?, ?, "unused", NOW())',
    [openid, coupon.id]
  )
  await connection.execute(
    'UPDATE coupons SET remain_count = remain_count - 1 WHERE id = ? AND remain_count > 0',
    [coupon.id]
  )

  const value = Number(coupon.value) || 0
  const min = Number(coupon.min_amount) || 0
  const title = getGiftTitle(card, payload, coupon.name || '优惠券')
  return {
    giftTitle: title,
    snapshot: {
      ...payload,
      couponId: coupon.id,
      couponName: coupon.name || title,
      value,
      minAmount: min,
      userCouponId: inserted.insertId
    },
    fulfillmentStatus: 'fulfilled',
    userCouponId: inserted.insertId,
    response: {
      giftType: 'coupon',
      title: '优惠券兑换成功',
      benefitText: `${coupon.name || '优惠券'}已到账`,
      couponId: coupon.id,
      userCouponId: inserted.insertId,
      valueText: value > 0 ? `￥${value.toFixed(0)}` : '',
      conditionText: min > 0 ? `满${min.toFixed(0)}可用` : '无门槛',
      nextAction: 'coupon_list',
      actionText: '查看优惠券'
    }
  }
}

async function selectAddress(connection, openid, addressId) {
  const aid = Number(addressId)
  if (aid && !Number.isNaN(aid)) {
    const [rows] = await connection.execute(
      'SELECT * FROM addresses WHERE id = ? AND openid = ? LIMIT 1',
      [aid, openid]
    )
    if (rows && rows.length > 0) return rows[0]
    throw new Error('收货地址不存在')
  }

  const [rows] = await connection.execute(
    'SELECT * FROM addresses WHERE openid = ? ORDER BY is_default DESC, id DESC LIMIT 1',
    [openid]
  )
  return rows && rows.length > 0 ? rows[0] : null
}

async function createGiftProductOrder(connection, user, openid, payload, address) {
  const productId = Number(payload.productId || payload.product_id)
  const quantity = toPositiveInt(payload.quantity, 1)
  const selectedSpecName = String(payload.selectedSpecName || payload.selected_spec_name || payload.selectedColor || '').trim().slice(0, 100)
  if (!productId || Number.isNaN(productId)) throw new Error('商品礼品配置无效')

  const [products] = await connection.execute(
    'SELECT id, name, price, cover_image FROM products WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [productId]
  )
  if (!products || products.length === 0) throw new Error('商品不存在')
  const product = products[0]

  let unitPrice = Number(product.price) || 0
  if (selectedSpecName) {
    const [specRows] = await connection.execute(
      'SELECT price, image FROM product_specs WHERE product_id = ? AND name = ? LIMIT 1',
      [productId, selectedSpecName]
    )
    if (specRows && specRows.length > 0 && specRows[0].price != null) {
      unitPrice = Number(specRows[0].price) || unitPrice
      if (specRows[0].image) product.cover_image = specRows[0].image
    }
  }

  const totalAmount = unitPrice * quantity
  const orderNo = generateOrderNo()
  const buyerMessage = `礼品卡兑换${payload.sourceCode ? `：${payload.sourceCode}` : ''}`

  const [orderResult] = await connection.execute(
    `INSERT INTO orders (
      order_no, user_id, _openid,
      total_amount, freight, discount_amount, coupon_amount, pay_amount,
      status, pay_type,
      buyer_message, used_coupon_id, used_points,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, 0.00, ?, 0.00, 0.00, 'paid', 'other', ?, NULL, 0, NOW(), NOW())`,
    [
      orderNo, user.id, openid,
      totalAmount.toFixed(2), totalAmount.toFixed(2),
      buyerMessage
    ]
  )
  const orderId = orderResult.insertId

  await connection.execute(
    `INSERT INTO order_items (
      order_id, _openid, product_id, product_name, product_image,
      price, quantity, selected_color, created_at
    ) VALUES (?, ?, ?, ?, ?, 0.00, ?, ?, NOW())`,
    [
      orderId, openid, product.id, product.name, product.cover_image || '',
      quantity, selectedSpecName
    ]
  )

  await connection.execute(
    `INSERT INTO order_addresses (
      order_id, _openid, name, phone, province, city, district, detail,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      orderId, openid, address.name, address.phone || address.contact,
      address.province, address.city, address.district, address.detail
    ]
  )

  await connection.execute(
    'UPDATE products SET sales_count = IFNULL(sales_count, 0) + ? WHERE id = ?',
    [quantity, product.id]
  )

  return {
    orderId,
    orderNo,
    product,
    quantity,
    selectedSpecName,
    totalAmount,
    addressText: buildAddressText(address)
  }
}

async function redeemProduct(connection, card, user, openid, addressId) {
  const payload = { ...getPayload(card), sourceCode: card.code }
  const title = getGiftTitle(card, payload, '商品礼品')
  const address = await selectAddress(connection, openid, addressId)

  if (!address) {
    return {
      giftTitle: title,
      snapshot: payload,
      fulfillmentStatus: 'pending_address',
      response: {
        giftType: 'product',
        title: '礼品已锁定',
        benefitText: `${title} 待填写收货地址`,
        nextAction: 'select_address',
        actionText: '填写收货地址'
      }
    }
  }

  const order = await createGiftProductOrder(connection, user, openid, payload, address)
  return {
    giftTitle: title,
    snapshot: {
      ...payload,
      productId: order.product.id,
      productName: order.product.name,
      productImage: order.product.cover_image || '',
      quantity: order.quantity,
      selectedSpecName: order.selectedSpecName,
      orderId: order.orderId,
      orderNo: order.orderNo
    },
    fulfillmentStatus: 'fulfilled',
    orderId: order.orderId,
    orderNo: order.orderNo,
    response: {
      giftType: 'product',
      title: '商品兑换成功',
      benefitText: `${order.product.name} x${order.quantity} 已生成礼品订单`,
      orderId: order.orderId,
      orderNo: order.orderNo,
      nextAction: 'order_detail',
      actionText: '查看订单'
    }
  }
}

function resolveGiftItems(card) {
  const payload = getPayload(card)
  const type = String(card.gift_type || '').trim()
  const gifts = Array.isArray(payload.gifts) ? payload.gifts : []
  if ((type === 'combo' || type === 'bundle') && gifts.length > 0) {
    return gifts.map((item) => ({
      type: String(item.type || item.giftType || item.gift_type || '').trim(),
      payload: item
    })).filter(item => item.type)
  }
  if (gifts.length > 0) {
    return gifts.map((item) => ({
      type: String(item.type || item.giftType || item.gift_type || '').trim(),
      payload: item
    })).filter(item => item.type)
  }
  return [{ type, payload }]
}

function summarizeGrant(grant) {
  const res = grant.response || {}
  return res.benefitText || grant.giftTitle || '权益已到账'
}

function buildComboResponse(card, grants, recordId) {
  const hasPendingProduct = grants.some(item => item.fulfillmentStatus === 'pending_address')
  const productOrder = grants.find(item => item.orderId)
  const hasCoupon = grants.some(item => item.userCouponId)
  const hasPoints = grants.some(item => Number(item.pointsChange) > 0)
  const benefitText = grants.map(summarizeGrant).join('；')

  let nextAction = ''
  let actionText = ''
  if (hasPendingProduct) {
    nextAction = 'select_address'
    actionText = '确认收货地址'
  } else if (productOrder) {
    nextAction = 'order_detail'
    actionText = '查看订单'
  } else if (hasCoupon) {
    nextAction = 'coupon_list'
    actionText = '查看优惠券'
  } else if (hasPoints) {
    nextAction = 'points_mall'
    actionText = '去积分商城'
  }

  return {
    giftType: 'combo',
    title: hasPendingProduct ? '组合权益已领取' : '组合兑换成功',
    benefitText,
    recordId,
    orderId: productOrder ? productOrder.orderId : null,
    orderNo: productOrder ? productOrder.orderNo : '',
    nextAction,
    actionText
  }
}

async function runRedeem(connection, card, user, openid, params) {
  const items = resolveGiftItems(card)
  if (items.length > 1 || String(card.gift_type || '').trim() === 'combo' || String(card.gift_type || '').trim() === 'bundle') {
    const grants = []
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i]
      const childCard = makeChildCard(card, item.type, item.payload, i)
      let grant
      if (item.type === 'points') grant = await redeemPoints(connection, childCard, user, openid)
      else if (item.type === 'coupon') grant = await redeemCoupon(connection, childCard, user, openid)
      else if (item.type === 'product') grant = await redeemProduct(connection, childCard, user, openid, params.addressId)
      else throw new Error(`组合礼品类型不支持：${item.type}`)

      if (Number(grant.pointsChange) > 0) {
        user.points = (Number(user.points) || 0) + Number(grant.pointsChange)
        user.total_points = (Number(user.total_points) || 0) + Number(grant.pointsChange)
      }
      grants.push({
        type: item.type,
        giftTitle: grant.giftTitle,
        snapshot: grant.snapshot || {},
        fulfillmentStatus: grant.fulfillmentStatus || 'fulfilled',
        orderId: grant.orderId || null,
        orderNo: grant.orderNo || '',
        userCouponId: grant.userCouponId || null,
        pointsChange: grant.pointsChange || 0,
        response: grant.response || {}
      })
    }

    const pendingProduct = grants.find(item => item.type === 'product' && item.fulfillmentStatus === 'pending_address')
    const productOrder = grants.find(item => item.orderId)
    return {
      giftTitle: getGiftTitle(card, getPayload(card), '组合礼品卡'),
      snapshot: {
        combo: true,
        title: getGiftTitle(card, getPayload(card), '组合礼品卡'),
        gifts: grants
      },
      fulfillmentStatus: pendingProduct ? 'pending_address' : 'fulfilled',
      orderId: productOrder ? productOrder.orderId : null,
      orderNo: productOrder ? productOrder.orderNo : null,
      userCouponId: (grants.find(item => item.userCouponId) || {}).userCouponId || null,
      pointsChange: grants.reduce((sum, item) => sum + (Number(item.pointsChange) || 0), 0),
      response: buildComboResponse(card, grants)
    }
  }

  const giftType = items[0] ? items[0].type : String(card.gift_type || '').trim()
  if (giftType === 'points') return redeemPoints(connection, card, user, openid)
  if (giftType === 'coupon') return redeemCoupon(connection, card, user, openid)
  if (giftType === 'product') return redeemProduct(connection, card, user, openid, params.addressId)
  throw new Error('礼品类型不支持')
}

function getComboValueText(snapshot) {
  const gifts = Array.isArray(snapshot.gifts) ? snapshot.gifts : []
  if (gifts.length === 0) return '组合权益'
  return gifts.map((item) => {
    if (item.type === 'points') return `+${Number(item.pointsChange) || item.snapshot.points || 0}积分`
    if (item.type === 'coupon') return '优惠券'
    if (item.type === 'product') return item.fulfillmentStatus === 'pending_address' ? '商品待地址' : '商品订单'
    return '权益'
  }).join(' + ')
}

function toRecordView(row) {
  const snapshot = safeJsonParse(row.gift_snapshot, {})
  let valueText = '已到账'
  if (row.gift_type === 'points') valueText = `+${Number(row.points_change) || snapshot.points || 0} 积分`
  if (row.gift_type === 'coupon') valueText = snapshot.couponName || snapshot.title || '优惠券'
  if (row.gift_type === 'product') {
    valueText = row.fulfillment_status === 'pending_address' ? '待填写地址' : '已生成订单'
  }
  if (row.gift_type === 'combo' || row.gift_type === 'bundle') {
    valueText = getComboValueText(snapshot)
  }
  return {
    id: row.id,
    code: row.code,
    giftType: row.gift_type,
    title: row.gift_title || snapshot.title || '礼品卡兑换',
    valueText,
    fulfillmentStatus: row.fulfillment_status,
    orderId: row.order_id,
    orderNo: row.order_no,
    userCouponId: row.user_coupon_id,
    points: Number(row.points_change) || 0,
    created_at: row.created_at,
    snapshot,
    nextAction: (row.gift_type === 'product' || row.gift_type === 'combo' || row.gift_type === 'bundle') && row.fulfillment_status === 'pending_address' ? 'select_address' : ''
  }
}

function buildExistingRedeemResponse(row) {
  const view = toRecordView(row)
  const needsAddress = view.nextAction === 'select_address'
  const hasOrder = Boolean(row.order_id)
  return {
    giftType: row.gift_type,
    title: needsAddress ? '商品礼品待确认地址' : (hasOrder ? '商品兑换成功' : '礼品卡已兑换'),
    benefitText: view.valueText || '权益已到账',
    recordId: row.id,
    orderId: row.order_id,
    orderNo: row.order_no,
    nextAction: needsAddress ? 'select_address' : (hasOrder ? 'order_detail' : ''),
    actionText: needsAddress ? '确认收货地址' : (hasOrder ? '查看订单' : ''),
    fulfillmentStatus: row.fulfillment_status
  }
}

function toDateTime(value) {
  if (!value) return null
  const raw = String(value).trim()
  if (!raw) return null
  const d = new Date(raw.replace('T', ' ').replace(/\.\d+Z$/, ''))
  if (Number.isNaN(d.getTime())) return null
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function normalizeText(value, max = 120) {
  return String(value || '').trim().slice(0, max)
}

function normalizeGiftType(value) {
  const type = normalizeText(value, 20)
  return ['points', 'coupon', 'product', 'combo'].includes(type) ? type : ''
}

function normalizeGiftItem(raw) {
  const type = normalizeGiftType(raw && raw.type)
  if (!type || type === 'combo') return null
  const item = {
    type,
    title: normalizeText(raw.title || raw.name, 120)
  }
  if (type === 'points') item.points = toPositiveInt(raw.points, 0)
  if (type === 'coupon') item.couponId = Number(raw.couponId || raw.coupon_id || 0)
  if (type === 'product') {
    item.productId = Number(raw.productId || raw.product_id || 0)
    item.quantity = toPositiveInt(raw.quantity, 1)
    const selectedSpecName = normalizeText(raw.selectedSpecName || raw.specName || raw.spec_name, 100)
    if (selectedSpecName) item.selectedSpecName = selectedSpecName
  }
  return item
}

function normalizeGiftPayload(giftType, payload) {
  const source = safeJsonParse(payload, payload || {})
  if (giftType === 'combo') {
    const gifts = Array.isArray(source.gifts) ? source.gifts.map(normalizeGiftItem).filter(Boolean) : []
    return { ...source, gifts }
  }
  const item = normalizeGiftItem({ ...source, type: giftType })
  return item || {}
}

function getValidationItems(giftType, giftPayload) {
  if (giftType === 'combo') return Array.isArray(giftPayload.gifts) ? giftPayload.gifts : []
  return [normalizeGiftItem({ ...giftPayload, type: giftType })].filter(Boolean)
}

function toCardView(row) {
  const payload = safeJsonParse(row.gift_payload, {})
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    gift_type: row.gift_type,
    gift_payload: payload,
    status: row.status,
    batch_no: row.batch_no,
    redeemed_by: row.redeemed_by,
    redeemed_record_id: row.redeemed_record_id,
    redeemed_at: row.redeemed_at,
    expire_time: row.expire_time,
    admin_note: row.admin_note,
    created_at: row.created_at,
    updated_at: row.updated_at,
    redeemed_username: row.redeemed_username || null,
    redeemed_phone: row.redeemed_phone || null
  }
}

async function validateGiftPayload(connection, giftType, giftPayload, cardCount = 1) {
  const type = normalizeGiftType(giftType)
  if (!type) throw new Error('Gift type is invalid')
  const items = getValidationItems(type, giftPayload)
  if (type === 'combo' && (items.length < 2 || items.length > 3)) throw new Error('Combo gift must contain 2 or 3 benefits')
  if (items.length === 0) throw new Error('Gift payload is empty')
  const couponNeeds = new Map()
  const productNeeds = new Map()
  for (const item of items) {
    if (item.type === 'points' && !toPositiveInt(item.points, 0)) throw new Error('Points benefit must be greater than 0')
    if (item.type === 'coupon') {
      const couponId = Number(item.couponId || 0)
      if (!couponId) throw new Error('Coupon benefit requires a valid coupon ID')
      couponNeeds.set(couponId, (couponNeeds.get(couponId) || 0) + cardCount)
    }
    if (item.type === 'product') {
      const productId = Number(item.productId || 0)
      if (!productId) throw new Error('Product benefit requires a valid product ID')
      productNeeds.set(productId, (productNeeds.get(productId) || 0) + toPositiveInt(item.quantity, 1) * cardCount)
    }
  }
  for (const [couponId, need] of couponNeeds.entries()) {
    const [rows] = await connection.execute(
      `SELECT id, status, remain_count, expire_time FROM coupons WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [couponId]
    )
    if (!rows || rows.length === 0) throw new Error(`Coupon #${couponId} does not exist`)
    const coupon = rows[0]
    if (coupon.status !== 'active') throw new Error(`Coupon #${couponId} is not active`)
    if (coupon.expire_time && new Date(coupon.expire_time).getTime() <= Date.now()) throw new Error(`Coupon #${couponId} is expired`)
    if (Number(coupon.remain_count) < need) throw new Error(`Coupon #${couponId} remaining quantity is not enough, need ${need}`)
  }
  for (const [productId, need] of productNeeds.entries()) {
    const [rows] = await connection.execute(
      `SELECT id, stock, reserved_stock, is_on_sale FROM products WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [productId]
    )
    if (!rows || rows.length === 0) throw new Error(`Product #${productId} does not exist`)
    const product = rows[0]
    if (Number(product.is_on_sale) !== 1) throw new Error(`Product #${productId} is not on sale`)
    const available = (Number(product.stock) || 0) - (Number(product.reserved_stock) || 0)
    if (available < need) throw new Error(`Product #${productId} stock is not enough, need ${need}, available ${available}`)
  }
}

async function adminListCards(connection, params) {
  const page = toPositiveInt(params.page, 1)
  const pageSize = Math.min(toPositiveInt(params.pageSize, 20), 100)
  const offset = (page - 1) * pageSize
  const where = []
  const values = []
  const keyword = normalizeText(params.keyword, 64)
  const status = normalizeText(params.status, 20)
  const giftType = normalizeGiftType(params.giftType)
  const batchNo = normalizeText(params.batchNo, 64)
  if (keyword) {
    where.push('(gc.code LIKE ? OR gc.title LIKE ?)')
    values.push(`%${keyword}%`, `%${keyword}%`)
  }
  if (status) {
    where.push('gc.status = ?')
    values.push(status)
  }
  if (giftType) {
    where.push('gc.gift_type = ?')
    values.push(giftType)
  }
  if (batchNo) {
    where.push('gc.batch_no = ?')
    values.push(batchNo)
  }
  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : ''
  const [countRows] = await connection.execute(`SELECT COUNT(*) AS total FROM gift_cards gc${whereSql}`, values)
  const [rows] = await connection.execute(
    `SELECT gc.*, NULL AS redeemed_username, NULL AS redeemed_phone
     FROM gift_cards gc
     ${whereSql}
     ORDER BY gc.created_at DESC, gc.id DESC
     LIMIT ${pageSize} OFFSET ${offset}`,
    values
  )
  return { success: true, data: { list: (rows || []).map(toCardView), total: Number(countRows[0].total) || 0 } }
}

async function adminListRecords(connection, params) {
  const page = toPositiveInt(params.page, 1)
  const pageSize = Math.min(toPositiveInt(params.pageSize, 20), 100)
  const offset = (page - 1) * pageSize
  const where = []
  const values = []
  const keyword = normalizeText(params.keyword, 64)
  const fulfillmentStatus = normalizeText(params.fulfillmentStatus, 32)
  if (keyword) {
    where.push('(gr.code LIKE ? OR u.phone LIKE ? OR u.username LIKE ? OR gr._openid LIKE ?)')
    values.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`)
  }
  if (fulfillmentStatus) {
    where.push('gr.fulfillment_status = ?')
    values.push(fulfillmentStatus)
  }
  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : ''
  const [countRows] = await connection.execute(
    `SELECT COUNT(*) AS total FROM gift_redeem_records gr LEFT JOIN users u ON u.id = gr.user_id${whereSql}`,
    values
  )
  const [rows] = await connection.execute(
    `SELECT gr.*, gc.batch_no, u.username, u.phone
     FROM gift_redeem_records gr
     LEFT JOIN gift_cards gc ON gc.id = gr.gift_card_id
     LEFT JOIN users u ON u.id = gr.user_id
     ${whereSql}
     ORDER BY gr.created_at DESC, gr.id DESC
     LIMIT ${pageSize} OFFSET ${offset}`,
    values
  )
  return { success: true, data: { list: rows || [], total: Number(countRows[0].total) || 0 } }
}

async function adminOptions(connection) {
  const [coupons] = await connection.execute(
    `SELECT id, name, type, value, min_amount, remain_count, status, expire_time
     FROM coupons WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 200`
  )
  const [products] = await connection.execute(
    `SELECT id, name, stock, reserved_stock, is_on_sale, cover_image
     FROM products WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 200`
  )
  return {
    success: true,
    data: {
      coupons: (coupons || []).map(item => ({
        ...item,
        available: item.status === 'active' && (!item.expire_time || new Date(item.expire_time).getTime() > Date.now()) && Number(item.remain_count) > 0
      })),
      products: (products || []).map(item => {
        const stockAvailable = (Number(item.stock) || 0) - (Number(item.reserved_stock) || 0)
        return { ...item, stock_available: stockAvailable, available: Number(item.is_on_sale) === 1 && stockAvailable > 0 }
      })
    }
  }
}

async function adminCheckCode(connection, params) {
  const code = normalizeCode(params.code)
  if (!code) return { success: true, data: { exists: false, code: '' } }
  const [rows] = await connection.execute('SELECT id, status FROM gift_cards WHERE code = ? LIMIT 1', [code])
  return { success: true, data: { exists: rows && rows.length > 0, code, row: rows && rows[0] ? rows[0] : null } }
}

async function adminCreateCard(connection, params) {
  const code = normalizeCode(params.code)
  if (code.length < 8) throw new Error('Code must contain at least 8 valid characters')
  const giftType = normalizeGiftType(params.gift_type || params.giftType)
  const giftPayload = normalizeGiftPayload(giftType, params.gift_payload || params.giftPayload || {})
  await validateGiftPayload(connection, giftType, giftPayload, 1)
  const title = normalizeText(params.title, 120) || 'Gift card'
  const batchNo = normalizeText(params.batch_no || params.batchNo, 64)
  const expireTime = toDateTime(params.expire_time || params.expireTime)
  const adminNote = normalizeText(params.admin_note || params.adminNote, 255)
  try {
    const [result] = await connection.execute(
      `INSERT INTO gift_cards (code, title, gift_type, gift_payload, status, batch_no, expire_time, admin_note, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'unused', ?, ?, ?, NOW(), NOW())`,
      [code, title, giftType, JSON.stringify(giftPayload), batchNo, expireTime, adminNote]
    )
    return { success: true, data: { id: result.insertId, code } }
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new Error(`Code ${code} already exists`)
    throw err
  }
}

function parseImportCodes(params) {
  const rawList = Array.isArray(params.codes) ? params.codes : String(params.codesText || params.codes || '').split(/[\s,;，；]+/)
  const seen = new Set()
  const codes = []
  const duplicatesInInput = []
  for (const raw of rawList) {
    const code = normalizeCode(raw)
    if (!code) continue
    if (seen.has(code)) {
      duplicatesInInput.push(code)
      continue
    }
    seen.add(code)
    codes.push(code)
  }
  return { codes, duplicatesInInput }
}

async function adminImportCards(connection, params) {
  const { codes, duplicatesInInput } = parseImportCodes(params)
  if (codes.length === 0) throw new Error('No valid codes to import')
  if (codes.length > 1000) throw new Error('Import up to 1000 codes at a time')
  const giftType = normalizeGiftType(params.gift_type || params.giftType)
  const giftPayload = normalizeGiftPayload(giftType, params.gift_payload || params.giftPayload || {})
  await validateGiftPayload(connection, giftType, giftPayload, codes.length)
  const placeholders = codes.map(() => '?').join(',')
  const [existsRows] = await connection.execute(`SELECT code FROM gift_cards WHERE code IN (${placeholders})`, codes)
  const existing = new Set((existsRows || []).map(item => String(item.code)))
  const insertCodes = codes.filter(code => !existing.has(code))
  const title = normalizeText(params.title, 120) || 'Gift card'
  const batchNo = normalizeText(params.batch_no || params.batchNo, 64)
  const expireTime = toDateTime(params.expire_time || params.expireTime)
  const adminNote = normalizeText(params.admin_note || params.adminNote, 255)
  for (const code of insertCodes) {
    await connection.execute(
      `INSERT INTO gift_cards (code, title, gift_type, gift_payload, status, batch_no, expire_time, admin_note, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'unused', ?, ?, ?, NOW(), NOW())`,
      [code, title, giftType, JSON.stringify(giftPayload), batchNo, expireTime, adminNote]
    )
  }
  return {
    success: true,
    data: {
      inserted: insertCodes.length,
      skipped: codes.length - insertCodes.length,
      existing: Array.from(existing),
      duplicatesInInput
    }
  }
}

async function adminUpdateCard(connection, params) {
  const id = Number(params.id)
  if (!id) throw new Error('Card id is required')
  const [rows] = await connection.execute('SELECT * FROM gift_cards WHERE id = ? LIMIT 1', [id])
  if (!rows || rows.length === 0) throw new Error('Gift card does not exist')
  const card = rows[0]
  if (card.status === 'redeemed') throw new Error('Redeemed card cannot be changed')
  const status = normalizeText(params.status, 20) || card.status
  if (!['unused', 'disabled', 'expired'].includes(status)) throw new Error('Status is invalid')
  const hasExpire = Object.prototype.hasOwnProperty.call(params, 'expire_time') || Object.prototype.hasOwnProperty.call(params, 'expireTime')
  const hasNote = Object.prototype.hasOwnProperty.call(params, 'admin_note') || Object.prototype.hasOwnProperty.call(params, 'adminNote')
  const title = Object.prototype.hasOwnProperty.call(params, 'title') ? normalizeText(params.title, 120) : card.title
  const expireTime = hasExpire ? toDateTime(params.expire_time || params.expireTime) : card.expire_time
  const adminNote = hasNote ? normalizeText(params.admin_note || params.adminNote, 255) : card.admin_note
  await connection.execute(
    `UPDATE gift_cards SET title = ?, status = ?, expire_time = ?, admin_note = ?, updated_at = NOW() WHERE id = ?`,
    [title, status, expireTime, adminNote, id]
  )
  return { success: true, data: { id, status } }
}

function resolveEventPayload(event) {
  if (!event || typeof event !== 'object') return {}
  if (event.action) return event
  if (event.data && typeof event.data === 'object' && event.data.action) return event.data
  if (event.queryStringParameters && typeof event.queryStringParameters === 'object' && event.queryStringParameters.action) {
    return event.queryStringParameters
  }
  if (typeof event.body === 'string' && event.body.trim()) {
    const parsed = safeJsonParse(event.body, null)
    if (parsed && typeof parsed === 'object') {
      if (parsed.action) return parsed
      if (parsed.data && typeof parsed.data === 'object' && parsed.data.action) return parsed.data
    }
  }
  return event
}

exports.main = async (event, context) => {
  const payload = resolveEventPayload(event)
  const { action, ...params } = payload || {}
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  const adminActions = new Set([
    'adminList',
    'adminCreate',
    'adminImport',
    'adminUpdate',
    'adminCheckCode',
    'adminRecords',
    'adminOptions'
  ])

  if (!openid && !adminActions.has(action)) {
    return { success: false, error: '需要登录' }
  }

  let connection
  try {
    connection = await getConnection()
    await ensureGiftTables(connection)

    if (action === 'adminList') return await adminListCards(connection, params)
    if (action === 'adminRecords') return await adminListRecords(connection, params)
    if (action === 'adminOptions') return await adminOptions(connection)
    if (action === 'adminCheckCode') return await adminCheckCode(connection, params)
    if (action === 'adminCreate') return await adminCreateCard(connection, params)
    if (action === 'adminUpdate') return await adminUpdateCard(connection, params)
    if (action === 'adminImport') {
      await connection.beginTransaction()
      try {
        const result = await adminImportCards(connection, params)
        await connection.commit()
        return result
      } catch (err) {
        await connection.rollback()
        throw err
      }
    }

    if (action === 'records') {
      const page = toPositiveInt(params.page, 1)
      const pageSize = Math.min(toPositiveInt(params.pageSize, 10), 50)
      const offset = (page - 1) * pageSize
      const [rows] = await connection.execute(
        `SELECT *
         FROM gift_redeem_records
         WHERE _openid = ?
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [openid, pageSize, offset]
      )
      return { success: true, data: { list: (rows || []).map(toRecordView) } }
    }

    if (action === 'redeem') {
      const code = normalizeCode(params.code)
      if (code.length < 8) return { success: false, error: '兑换码格式不正确' }

      await connection.beginTransaction()
      try {
        const user = await getUser(connection, openid)
        const [cards] = await connection.execute(
          'SELECT * FROM gift_cards WHERE code = ? LIMIT 1 FOR UPDATE',
          [code]
        )
        if (!cards || cards.length === 0) throw new Error('兑换码不存在')
        const card = cards[0]
        if (card.status === 'redeemed') {
          const [records] = await connection.execute(
            `SELECT *
             FROM gift_redeem_records
             WHERE (id = ? OR gift_card_id = ?) AND _openid = ?
             ORDER BY id DESC
             LIMIT 1`,
            [card.redeemed_record_id || 0, card.id, openid]
          )
          if (records && records.length > 0) {
            await connection.commit()
            return {
              success: true,
              data: {
                ...buildExistingRedeemResponse(records[0]),
                code: card.code
              }
            }
          }
        }
        if (card.status === 'redeemed') throw new Error('该礼品卡已被兑换')
        if (card.status === 'disabled') throw new Error('该礼品卡已停用')
        if (card.status === 'expired') throw new Error('该礼品卡已过期')
        if (card.status !== 'unused') throw new Error('该礼品卡状态不可兑换')
        if (card.expire_time && new Date(card.expire_time).getTime() <= Date.now()) {
          await connection.execute('UPDATE gift_cards SET status = "expired", updated_at = NOW() WHERE id = ?', [card.id])
          throw new Error('该礼品卡已过期')
        }

        const grant = await runRedeem(connection, card, user, openid, params)
        const [recordResult] = await connection.execute(
          `INSERT INTO gift_redeem_records (
            gift_card_id, code, user_id, _openid, gift_type, gift_title, gift_snapshot,
            redeem_status, fulfillment_status, order_id, order_no, user_coupon_id, points_change,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'success', ?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            card.id, card.code, user.id, openid, card.gift_type, grant.giftTitle,
            JSON.stringify(grant.snapshot || {}),
            grant.fulfillmentStatus || 'fulfilled',
            grant.orderId || null,
            grant.orderNo || null,
            grant.userCouponId || null,
            grant.pointsChange || 0
          ]
        )
        await connection.execute(
          `UPDATE gift_cards
           SET status = 'redeemed', redeemed_by = ?, redeemed_record_id = ?, redeemed_at = NOW(), updated_at = NOW()
           WHERE id = ?`,
          [openid, recordResult.insertId, card.id]
        )
        await connection.commit()
        return {
          success: true,
          data: {
            ...grant.response,
            recordId: recordResult.insertId,
            code: card.code,
            fulfillmentStatus: grant.fulfillmentStatus || 'fulfilled'
          }
        }
      } catch (err) {
        await connection.rollback()
        throw err
      }
    }

    if (action === 'confirmProductAddress') {
      const recordId = Number(params.recordId)
      const addressId = Number(params.addressId)
      if (!recordId || Number.isNaN(recordId)) return { success: false, error: '兑换记录参数无效' }
      if (!addressId || Number.isNaN(addressId)) return { success: false, error: '请选择收货地址' }

      await connection.beginTransaction()
      try {
        const user = await getUser(connection, openid)
        const [records] = await connection.execute(
          `SELECT *
           FROM gift_redeem_records
           WHERE id = ? AND _openid = ? AND gift_type IN ('product', 'combo', 'bundle')
           LIMIT 1 FOR UPDATE`,
          [recordId, openid]
        )
        if (!records || records.length === 0) throw new Error('兑换记录不存在')
        const record = records[0]
        if (record.fulfillment_status === 'fulfilled' && record.order_id) {
          await connection.commit()
          return {
            success: true,
            data: {
              giftType: 'product',
              title: '商品兑换成功',
              benefitText: '礼品订单已生成',
              orderId: record.order_id,
              orderNo: record.order_no,
              nextAction: 'order_detail',
              actionText: '查看订单'
            }
          }
        }
        if (record.fulfillment_status !== 'pending_address') throw new Error('当前记录不需要补充地址')

        const originalSnapshot = safeJsonParse(record.gift_snapshot, {})
        const pendingProducts = Array.isArray(originalSnapshot.gifts)
          ? originalSnapshot.gifts.filter(item => item.type === 'product' && item.fulfillmentStatus === 'pending_address')
          : [{ snapshot: originalSnapshot }]
        if (pendingProducts.length === 0) throw new Error('当前记录没有待处理商品')
        const address = await selectAddress(connection, openid, addressId)
        if (!address) throw new Error('收货地址不存在')

        const createdOrders = []
        if (Array.isArray(originalSnapshot.gifts)) {
          for (const item of originalSnapshot.gifts) {
            if (item.type === 'product' && item.fulfillmentStatus === 'pending_address') {
              const order = await createGiftProductOrder(connection, user, openid, item.snapshot || {}, address)
              item.fulfillmentStatus = 'fulfilled'
              item.orderId = order.orderId
              item.orderNo = order.orderNo
              item.snapshot = {
                ...(item.snapshot || {}),
                productId: order.product.id,
                productName: order.product.name,
                productImage: order.product.cover_image || '',
                quantity: order.quantity,
                selectedSpecName: order.selectedSpecName,
                orderId: order.orderId,
                orderNo: order.orderNo
              }
              item.response = {
                giftType: 'product',
                title: '商品兑换成功',
                benefitText: `${order.product.name} x${order.quantity} 已生成礼品订单`,
                orderId: order.orderId,
                orderNo: order.orderNo,
                nextAction: 'order_detail',
                actionText: '查看订单'
              }
              createdOrders.push(order)
            }
          }
        } else {
          const order = await createGiftProductOrder(connection, user, openid, originalSnapshot, address)
          createdOrders.push(order)
          originalSnapshot.productId = order.product.id
          originalSnapshot.productName = order.product.name
          originalSnapshot.productImage = order.product.cover_image || ''
          originalSnapshot.quantity = order.quantity
          originalSnapshot.selectedSpecName = order.selectedSpecName
          originalSnapshot.orderId = order.orderId
          originalSnapshot.orderNo = order.orderNo
        }
        const firstOrder = createdOrders[0]
        const nextSnapshot = originalSnapshot
        await connection.execute(
          `UPDATE gift_redeem_records
           SET gift_snapshot = ?, fulfillment_status = 'fulfilled', order_id = ?, order_no = ?, updated_at = NOW()
           WHERE id = ?`,
          [JSON.stringify(nextSnapshot), firstOrder.orderId, firstOrder.orderNo, record.id]
        )
        await connection.commit()
        return {
          success: true,
          data: {
            giftType: record.gift_type,
            title: '商品兑换成功',
            benefitText: createdOrders.map(order => `${order.product.name} x${order.quantity}`).join('；'),
            orderId: firstOrder.orderId,
            orderNo: firstOrder.orderNo,
            nextAction: 'order_detail',
            actionText: '查看订单'
          }
        }
      } catch (err) {
        await connection.rollback()
        throw err
      }
    }

    return { success: false, error: '未知操作' }
  } catch (error) {
    console.error('GiftCard error:', error)
    return { success: false, error: error.message || '礼品卡服务异常' }
  } finally {
    if (connection) {
      connection.release()
    }
  }
}
