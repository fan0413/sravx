/**
 * 订单云函数 - 使用 MySQL 数据库
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
  ssl: false
}

if (!dbConfig.password) {
  console.warn('[DB] DB_PASSWORD 未配置，请在云函数环境变量中设置')
}

let pool = null

async function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      ...dbConfig,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    })
  }
  return pool
}

/** 待付款超过 15 分钟：关单并标记 auto_cancel=1（仅「全部」列表展示，不出现在「已完成」） */
const PAYMENT_PENDING_MINUTES = 15

function calcMemberLevel(totalPoints) {
  const tp = parseInt(totalPoints, 10) || 0
  if (tp >= 60000) return 6
  if (tp >= 30000) return 5
  if (tp >= 10000) return 4
  if (tp >= 3000) return 3
  if (tp >= 1000) return 2
  return 1
}

function resolveEffectiveMemberLevel(userRow) {
  if (!userRow) return 1
  const storedLevel = Number(userRow.member_level) > 0 ? Number(userRow.member_level) : 1
  const dynamicLevel = calcMemberLevel(userRow.total_points || 0)
  return Math.max(storedLevel, dynamicLevel)
}

function resolveLinkedProductStock(row) {
  const stock = Number(row && row.linked_product_stock) || 0
  const reserved = Number(row && row.linked_product_reserved_stock) || 0
  return Math.max(0, stock - reserved)
}

function shouldUseLinkedProductStock(row) {
  return (
    Number(row && row.product_id) > 0 &&
    (Number(row && row.stock_available) || 0) <= 0 &&
    (Number(row && row.stock_total) || 0) <= 0 &&
    (Number(row && row.stock) || 0) <= 0 &&
    resolveLinkedProductStock(row) > 0
  )
}

async function syncMemberLevelByUserId(connection, userId) {
  const uid = Number(userId)
  if (!uid || Number.isNaN(uid)) return
  await connection.execute(
    `UPDATE users
     SET member_level = CASE
       WHEN IFNULL(total_points, 0) >= 60000 THEN 6
       WHEN IFNULL(total_points, 0) >= 30000 THEN 5
       WHEN IFNULL(total_points, 0) >= 10000 THEN 4
       WHEN IFNULL(total_points, 0) >= 3000 THEN 3
       WHEN IFNULL(total_points, 0) >= 1000 THEN 2
       ELSE 1
     END
     WHERE id = ?`,
    [uid]
  )
}

async function expirePendingPaymentOrders(connection) {
  const [rows] = await connection.execute(
    `SELECT id, user_id, used_coupon_id, used_points
     FROM orders
     WHERE status = 'pending_payment'
       AND created_at < DATE_SUB(NOW(), INTERVAL ${PAYMENT_PENDING_MINUTES} MINUTE)`
  )
  if (!rows || rows.length === 0) return

  await connection.beginTransaction()
  try {
    for (const row of rows) {
      const oid = Number(row.id)
      if (Number.isNaN(oid)) continue
      await connection.execute(
        'UPDATE orders SET status = ?, auto_cancel = 1, updated_at = NOW() WHERE id = ? AND status = ?',
        ['cancelled', oid, 'pending_payment']
      )
      const ucId = row.used_coupon_id != null ? Number(row.used_coupon_id) : null
      if (ucId && !Number.isNaN(ucId)) {
        await connection.execute(
          'UPDATE user_coupons SET status = "unused", used_at = NULL, used_order_id = NULL WHERE id = ?',
          [ucId]
        )
      }
      const pts = Number(row.used_points) || 0
      const uid = row.user_id != null ? Number(row.user_id) : null
      if (pts > 0 && uid && !Number.isNaN(uid)) {
        await connection.execute(
          'UPDATE users SET points = points + ?, total_points = total_points - ? WHERE id = ?',
          [pts, pts, uid]
        )
      }
    }
    await connection.commit()
  } catch (e) {
    await connection.rollback()
    throw e
  }
}

async function tryExpirePendingPaymentOrders(connection) {
  try {
    await expirePendingPaymentOrders(connection)
  } catch (e) {
    console.error('[Order] expirePendingPaymentOrders:', e)
  }
}

async function ensureWaybillTokenColumn(connection) {
  try {
    await connection.execute(
      `ALTER TABLE orders ADD COLUMN waybill_token VARCHAR(128) NULL AFTER logistics_no`
    )
    console.log('[Order] waybill_token 列已添加')
  } catch (e) {
    if (e.code !== 'ER_DUP_FIELDNAME' && !String(e.message).includes('Duplicate column')) {
      console.error('[Order] 添加 waybill_token 列失败:', e.message)
    }
  }
}

async function addColumnIfMissing(connection, tableName, columnSql) {
  try {
    await connection.execute(`ALTER TABLE ${tableName} ADD COLUMN ${columnSql}`)
  } catch (error) {
    if (error.code !== 'ER_DUP_FIELDNAME' && !String(error.message).includes('Duplicate column')) {
      throw error
    }
  }
}

async function ensureShippingColumns(connection) {
  await addColumnIfMissing(connection, 'products', "shipping_type VARCHAR(32) NOT NULL DEFAULT 'normal' AFTER allow_coupon")
  await addColumnIfMissing(connection, 'products', 'ship_deadline_days INT NOT NULL DEFAULT 2 AFTER shipping_type')
  await addColumnIfMissing(connection, 'products', "shipping_promise VARCHAR(120) NOT NULL DEFAULT '' AFTER ship_deadline_days")
  await addColumnIfMissing(connection, 'products', "shipping_delay_reason VARCHAR(80) NOT NULL DEFAULT '' AFTER shipping_promise")
  await addColumnIfMissing(connection, 'products', "shipping_note VARCHAR(500) NOT NULL DEFAULT '' AFTER shipping_delay_reason")
  await addColumnIfMissing(connection, 'product_specs', "shipping_type VARCHAR(32) NOT NULL DEFAULT 'normal' AFTER sku")
  await addColumnIfMissing(connection, 'product_specs', 'ship_deadline_days INT NOT NULL DEFAULT 2 AFTER shipping_type')
  await addColumnIfMissing(connection, 'product_specs', "shipping_promise VARCHAR(120) NOT NULL DEFAULT '' AFTER ship_deadline_days")
  await addColumnIfMissing(connection, 'product_specs', "shipping_delay_reason VARCHAR(80) NOT NULL DEFAULT '' AFTER shipping_promise")
  await addColumnIfMissing(connection, 'product_specs', "shipping_note VARCHAR(500) NOT NULL DEFAULT '' AFTER shipping_delay_reason")
  await addColumnIfMissing(connection, 'orders', "shipping_type VARCHAR(32) NOT NULL DEFAULT 'normal' AFTER buyer_message")
  await addColumnIfMissing(connection, 'orders', 'ship_deadline_days INT NOT NULL DEFAULT 2 AFTER shipping_type')
  await addColumnIfMissing(connection, 'orders', "shipping_promise VARCHAR(120) NOT NULL DEFAULT '' AFTER ship_deadline_days")
  await addColumnIfMissing(connection, 'orders', 'expected_ship_time DATETIME NULL AFTER shipping_promise')
  await addColumnIfMissing(connection, 'orders', "delay_shipping_reason VARCHAR(120) NOT NULL DEFAULT '' AFTER expected_ship_time")
  await addColumnIfMissing(connection, 'orders', "delay_shipping_note VARCHAR(500) NOT NULL DEFAULT '' AFTER delay_shipping_reason")
  await addColumnIfMissing(connection, 'orders', 'delay_shipping_updated_at DATETIME NULL AFTER delay_shipping_note')
}

async function ensureRefundRequestTable(connection) {
  await connection.execute(
    `CREATE TABLE IF NOT EXISTS order_refund_requests (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      order_id BIGINT UNSIGNED NOT NULL,
      order_no VARCHAR(64) NOT NULL,
      user_id BIGINT UNSIGNED NULL,
      _openid VARCHAR(128) NOT NULL,
      request_type VARCHAR(32) NOT NULL DEFAULT 'refund_only',
      reason VARCHAR(255) NOT NULL DEFAULT '',
      requested_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      status VARCHAR(32) NOT NULL DEFAULT 'pending_review',
      admin_note VARCHAR(255) NULL,
      approved_at DATETIME NULL,
      rejected_at DATETIME NULL,
      processed_refund_no VARCHAR(64) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_openid_created (_openid, created_at DESC),
      KEY idx_order_status (order_id, status, created_at DESC)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  )
}

function generateUnifiedOrderNo() {
  return `SA${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`
}

function buildIdempotencyKey(openid, externalKey) {
  const raw = String(externalKey || '').trim()
  if (raw) return `${openid}:${raw}`.slice(0, 80)
  return `${openid}:AUTO:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`.slice(0, 80)
}

function normalizeString(value, max = 500) {
  return String(value || '').trim().slice(0, max)
}

function normalizeShippingType(value) {
  const type = normalizeString(value, 32)
  return ['normal', 'presale', 'custom', 'delayed'].includes(type) ? type : 'normal'
}

function normalizeShipDeadlineDays(value, shippingType) {
  const fallback = shippingType === 'normal' ? 2 : 7
  const days = Math.floor(Number(value) || fallback)
  return Math.max(1, Math.min(120, days))
}

function buildShippingPromise(shippingType, shipDeadlineDays, customPromise) {
  const promise = normalizeString(customPromise, 120)
  if (promise) return promise
  if (shippingType === 'normal' && shipDeadlineDays <= 2) return '付款后48小时内发货'
  const typeTextMap = {
    normal: '现货商品',
    presale: '预售商品',
    custom: '定制商品',
    delayed: '特殊商品'
  }
  return `${typeTextMap[shippingType] || '商品'}，付款后${shipDeadlineDays}天内发货`
}

function hasSpecShippingOverride(spec) {
  if (!spec) return false
  const shippingType = normalizeShippingType(spec.shipping_type)
  const shipDeadlineDays = normalizeShipDeadlineDays(spec.ship_deadline_days, shippingType)
  return (
    normalizeString(spec.shipping_type, 32) !== 'normal' ||
    shipDeadlineDays !== 2 ||
    Boolean(normalizeString(spec.shipping_promise, 120)) ||
    Boolean(normalizeString(spec.shipping_delay_reason, 120)) ||
    Boolean(normalizeString(spec.shipping_note, 500))
  )
}

function safeJsonParse(raw, fallback) {
  if (raw == null) return fallback
  if (typeof raw === 'object') return raw
  try {
    return JSON.parse(String(raw))
  } catch (e) {
    return fallback
  }
}

async function ensurePointsTables(connection) {
  await connection.execute(
    `CREATE TABLE IF NOT EXISTS points_products (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      product_id BIGINT UNSIGNED NULL,
      name VARCHAR(200) NOT NULL DEFAULT '',
      short_name VARCHAR(80) NOT NULL DEFAULT '',
      \`desc\` VARCHAR(500) NOT NULL DEFAULT '',
      cover_image VARCHAR(500) NOT NULL DEFAULT '',
      images JSON NULL,
      detail_images JSON NULL,
      category_id BIGINT UNSIGNED NULL,
      points_price INT NOT NULL DEFAULT 0,
      cash_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      stock_total INT NOT NULL DEFAULT 0,
      stock_available INT NOT NULL DEFAULT 0,
      stock_frozen INT NOT NULL DEFAULT 0,
      sales_count INT NOT NULL DEFAULT 0,
      is_on_sale TINYINT NOT NULL DEFAULT 1,
      min_member_level TINYINT NOT NULL DEFAULT 1,
      support_mixed_pay TINYINT NOT NULL DEFAULT 0,
      ext_json JSON NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_points_products_product_id (product_id),
      KEY idx_points_products_on_sale_stock (is_on_sale, stock_available),
      KEY idx_points_products_level (min_member_level)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  )

  await addColumnIfMissing(connection, 'points_products', "name VARCHAR(200) NOT NULL DEFAULT '' AFTER product_id")
  await addColumnIfMissing(connection, 'points_products', "short_name VARCHAR(80) NOT NULL DEFAULT '' AFTER name")
  await addColumnIfMissing(connection, 'points_products', "`desc` VARCHAR(500) NOT NULL DEFAULT '' AFTER short_name")
  await addColumnIfMissing(connection, 'points_products', "cover_image VARCHAR(500) NOT NULL DEFAULT '' AFTER `desc`")
  await addColumnIfMissing(connection, 'points_products', "images JSON NULL AFTER cover_image")
  await addColumnIfMissing(connection, 'points_products', "detail_images JSON NULL AFTER images")
  await addColumnIfMissing(connection, 'points_products', "category_id BIGINT UNSIGNED NULL AFTER detail_images")

  await connection.execute(
    `CREATE TABLE IF NOT EXISTS points_orders (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      order_no VARCHAR(64) NOT NULL,
      idempotency_key VARCHAR(80) NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      _openid VARCHAR(64) NOT NULL,
      points_product_id BIGINT UNSIGNED NOT NULL,
      product_id BIGINT UNSIGNED NOT NULL,
      product_name_snapshot VARCHAR(120) NOT NULL DEFAULT '',
      product_image_snapshot VARCHAR(255) NOT NULL DEFAULT '',
      selected_spec_snapshot VARCHAR(100) NOT NULL DEFAULT '',
      quantity INT NOT NULL DEFAULT 1,
      unit_points INT NOT NULL DEFAULT 0,
      total_points INT NOT NULL DEFAULT 0,
      unit_cash DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      total_cash DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      payable_cash DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      status VARCHAR(32) NOT NULL DEFAULT 'pending_payment',
      payment_status VARCHAR(32) NOT NULL DEFAULT 'pending',
      payment_channel VARCHAR(32) NULL,
      pay_transaction_id VARCHAR(64) NULL,
      pay_callback_payload JSON NULL,
      refund_transaction_id VARCHAR(64) NULL,
      remark VARCHAR(255) NOT NULL DEFAULT '',
      receiver_name VARCHAR(50) NOT NULL DEFAULT '',
      receiver_phone VARCHAR(20) NOT NULL DEFAULT '',
      address_text VARCHAR(255) NOT NULL DEFAULT '',
      logistics_company VARCHAR(80) NOT NULL DEFAULT '',
      logistics_no VARCHAR(80) NOT NULL DEFAULT '',
      pay_time DATETIME NULL,
      ship_time DATETIME NULL,
      completed_at DATETIME NULL,
      cancelled_at DATETIME NULL,
      cancel_reason VARCHAR(255) NOT NULL DEFAULT '',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_points_orders_order_no (order_no),
      UNIQUE KEY uk_points_orders_idempotency (idempotency_key),
      KEY idx_points_orders_openid_status_created (_openid, status, created_at),
      KEY idx_points_orders_user_created (user_id, created_at),
      KEY idx_points_orders_pay_transaction (pay_transaction_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  )

  await connection.execute(
    `CREATE TABLE IF NOT EXISTS points_payment_logs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      order_id BIGINT UNSIGNED NOT NULL,
      order_no VARCHAR(64) NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      _openid VARCHAR(64) NOT NULL,
      direction VARCHAR(8) NOT NULL,
      biz_type VARCHAR(32) NOT NULL,
      points_change INT NOT NULL DEFAULT 0,
      cash_change DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      balance_before INT NOT NULL DEFAULT 0,
      balance_after INT NOT NULL DEFAULT 0,
      idempotency_key VARCHAR(120) NOT NULL,
      reconcile_date DATE NOT NULL,
      reconcile_status VARCHAR(16) NOT NULL DEFAULT 'pending',
      payment_channel VARCHAR(32) NOT NULL DEFAULT 'points_only',
      pay_transaction_id VARCHAR(64) NULL,
      ext_json JSON NULL,
      remark VARCHAR(255) NOT NULL DEFAULT '',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_points_payment_logs_idempotency (idempotency_key),
      KEY idx_points_payment_logs_user_date (user_id, reconcile_date),
      KEY idx_points_payment_logs_order (order_id, created_at),
      KEY idx_points_payment_logs_reconcile (reconcile_date, reconcile_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  )

  await connection.execute(
    `CREATE TABLE IF NOT EXISTS points_order_refund_requests (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      points_order_id BIGINT UNSIGNED NOT NULL,
      order_no VARCHAR(64) NOT NULL,
      user_id BIGINT UNSIGNED NULL,
      _openid VARCHAR(128) NOT NULL,
      reason VARCHAR(255) NOT NULL DEFAULT '',
      requested_points INT NOT NULL DEFAULT 0,
      requested_cash DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      status VARCHAR(32) NOT NULL DEFAULT 'pending_review',
      order_status_snapshot VARCHAR(32) NOT NULL DEFAULT '',
      auto_refund TINYINT NOT NULL DEFAULT 0,
      admin_note VARCHAR(255) NULL,
      approved_at DATETIME NULL,
      rejected_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_points_refund_openid_created (_openid, created_at DESC),
      KEY idx_points_refund_order_status (points_order_id, status, created_at DESC)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  )

}

async function executePointsRefund(connection, order, options = {}) {
  const reason = String(options.reason || '积分订单退款').trim().slice(0, 255)
  const refundTransactionId = String(options.refundTransactionId || '').trim().slice(0, 64)
  const actor = String(options.actor || 'user').trim().slice(0, 32) || 'user'

  const totalPoints = Number(order.total_points) || 0
  const payableCash = Number(order.payable_cash) || 0
  const qty = Number(order.quantity) || 0
  const status = String(order.status || '')
  const paymentChannel = order.payment_channel || 'points_only'

  const [uRows] = await connection.execute('SELECT points FROM users WHERE id = ? LIMIT 1 FOR UPDATE', [order.user_id])
  const balanceBefore = uRows && uRows[0] ? Number(uRows[0].points) || 0 : 0

  let pointsReturned = 0
  let stockReturned = 0

  let shouldReturnAssets = status !== 'cancelled'
  if (!shouldReturnAssets) {
    const [returnedLogs] = await connection.execute(
      `SELECT id
       FROM points_payment_logs
       WHERE order_id = ?
         AND direction = 'in'
         AND biz_type IN ('unfreeze', 'refund')
         AND points_change > 0
       LIMIT 1`,
      [order.id]
    )
    shouldReturnAssets = !returnedLogs || returnedLogs.length === 0
  }

  if (shouldReturnAssets) {
    await connection.execute('UPDATE users SET points = points + ? WHERE id = ?', [totalPoints, order.user_id])
    pointsReturned = totalPoints

    if (status === 'pending_payment') {
      await connection.execute(
        `UPDATE points_products
         SET stock_available = stock_available + ?, stock_frozen = stock_frozen - ?
         WHERE id = ? AND stock_frozen >= ?`,
        [qty, qty, order.points_product_id, qty]
      )
    } else {
      await connection.execute(
        'UPDATE points_products SET stock_available = stock_available + ? WHERE id = ?',
        [qty, order.points_product_id]
      )
    }
    stockReturned = qty
  }

  await connection.execute(
    `UPDATE points_orders
     SET status = 'refunded', payment_status = 'refunded', refund_transaction_id = ?, updated_at = NOW()
     WHERE id = ?`,
    [refundTransactionId || null, order.id]
  )

  await connection.execute(
    `INSERT INTO points_payment_logs (
      order_id, order_no, user_id, _openid, direction, biz_type,
      points_change, cash_change, balance_before, balance_after,
      idempotency_key, reconcile_date, payment_channel, pay_transaction_id, remark, created_at
    ) VALUES (?, ?, ?, ?, 'in', 'refund', ?, ?, ?, ?, ?, CURDATE(), ?, ?, ?, NOW())`,
    [
      order.id,
      order.order_no,
      order.user_id,
      order._openid,
      pointsReturned,
      payableCash > 0 ? -payableCash.toFixed(2) : 0,
      balanceBefore,
      balanceBefore + pointsReturned,
      `refund:${order.order_no}:${actor}`,
      paymentChannel,
      refundTransactionId || null,
      reason
    ]
  )

  return {
    orderId: order.id,
    status: 'refunded',
    pointsReturned,
    stockReturned
  }
}

function sanitizeSqlParams(values) {
  if (!Array.isArray(values)) return values
  return values.map((v) => (v === undefined ? null : v))
}

function isCloudFileID(value) {
  return typeof value === 'string' && value.trim().startsWith('cloud://')
}

async function getTempUrlMap(fileIDs) {
  const ids = Array.from(new Set((fileIDs || []).filter(isCloudFileID)))
  if (ids.length === 0) return {}

  try {
    const result = await cloud.getTempFileURL({
      fileList: ids.map(fileID => ({ fileID, maxAge: 60 * 60 * 24 * 30 }))
    })
    const urlMap = {}
    ;(result.fileList || []).forEach(item => {
      if (item.status === 0 && item.tempFileURL) {
        urlMap[item.fileID] = item.tempFileURL
      }
    })
    return urlMap
  } catch (error) {
    console.error('getTempUrlMap error:', error)
    return {}
  }
}

function mapImageValue(value, urlMap) {
  return isCloudFileID(value) ? (urlMap[value] || value) : value
}

async function convertOrderImageUrls(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return rows || []

  const urlMap = await getTempUrlMap(rows.flatMap(row => [
    row.product_image,
    row.product_image_snapshot,
    row.cover_image
  ]))

  return rows.map(row => ({
    ...row,
    product_image: mapImageValue(row.product_image, urlMap),
    product_image_snapshot: mapImageValue(row.product_image_snapshot, urlMap),
    cover_image: mapImageValue(row.cover_image, urlMap)
  }))
}

exports.main = async (event, context) => {
  const { action, ...params } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  // 需要登录的操作
  const needAuth = [
    'list', 'detail', 'create', 'cancel', 'confirmReceive', 'applyRefund', 'listRefundRequests',
    'listPointsOrders', 'getPointsOrderDetail', 'createPointsOrder', 'cancelPointsOrder', 'refundPointsOrder', 'applyPointsRefund',
    'getWaybillToken'
  ]
  if (needAuth.includes(action) && !openid) {
    return { success: false, error: '需要登录' }
  }

  let connection
  try {
    const pool = await getPool()
    connection = await pool.getConnection()
    const rawExecute = connection.execute.bind(connection)
    connection.execute = (sql, values) => rawExecute(sql, sanitizeSqlParams(values))
    await tryExpirePendingPaymentOrders(connection)
    await ensureRefundRequestTable(connection)
    await ensurePointsTables(connection)
    await ensureWaybillTokenColumn(connection)
    await ensureShippingColumns(connection)

    // 获取订单列表
    if (action === 'list') {
      const { status } = params
      // 小程序 / 序列化可能传入 null、空串或非数字，避免 NaN 传入 LIMIT 导致 mysqld_stmt_execute 报错
      const pageNum = Math.max(1, parseInt(String(params.page != null ? params.page : 1), 10) || 1)
      const pageSizeNum = Math.min(100, Math.max(1, parseInt(String(params.pageSize != null ? params.pageSize : 10), 10) || 10))
      const offset = (pageNum - 1) * pageSizeNum

      let sql = 'SELECT * FROM orders WHERE _openid = ?'
      const values = [openid]

      if (status) {
        if (status === 'pending') {
          sql += " AND status IN ('pending_payment', 'paid', 'shipped', 'received', 'refunding')"
        } else if (status === 'finished') {
          // 超时自动关单：cancelled 且 auto_cancel=1 仅在「全部」展示，不进入「已完成」
          sql +=
            " AND (status IN ('completed','refunded') OR (status = 'cancelled' AND IFNULL(auto_cancel,0) = 0))"
        } else {
          sql += ' AND status = ?'
          values.push(String(status))
        }
      }

      // CynosDB / 部分 MySQL 对 LIMIT/OFFSET 占位符支持差，会报 Incorrect arguments to mysqld_stmt_execute
      // pageSizeNum、offset 已钳位为安全整数，直接拼入 SQL
      sql += ` ORDER BY created_at DESC LIMIT ${pageSizeNum} OFFSET ${offset}`

      const [rows] = await connection.execute(sql, values)
      if (!rows || rows.length === 0) {
        return { success: true, data: [] }
      }

      const orderIds = rows.map((r) => Number(r.id)).filter((id) => !Number.isNaN(id))
      if (orderIds.length === 0) {
        const enrichedRows = rows.map((row) => ({
          ...row,
          product_name: '',
          product_image: '',
          full_address: ''
        }))
        return { success: true, data: enrichedRows }
      }

      const placeholders = orderIds.map(() => '?').join(',')
      const [items] = await connection.execute(
        `SELECT order_id, product_name, product_image
         FROM order_items
         WHERE order_id IN (${placeholders})
         ORDER BY id ASC`,
        orderIds
      )
      const [addresses] = await connection.execute(
        `SELECT order_id, province, city, district, detail
         FROM order_addresses
         WHERE order_id IN (${placeholders})
         ORDER BY id ASC`,
        orderIds
      )
      const [refundReqRows] = await connection.execute(
        `SELECT r.order_id, r.status
         FROM order_refund_requests r
         INNER JOIN (
           SELECT order_id, MAX(id) AS max_id
           FROM order_refund_requests
           WHERE order_id IN (${placeholders})
           GROUP BY order_id
         ) t ON t.max_id = r.id`,
        orderIds
      )

      const itemMap = {}
      for (const it of items || []) {
        if (!itemMap[it.order_id]) itemMap[it.order_id] = it
      }
      const addressMap = {}
      for (const addr of addresses || []) {
        if (!addressMap[addr.order_id]) {
          addressMap[addr.order_id] = `${addr.province || ''}${addr.city || ''}${addr.district || ''}${addr.detail || ''}`
        }
      }
      const refundStatusMap = {}
      for (const rr of refundReqRows || []) {
        refundStatusMap[rr.order_id] = rr.status
      }

      const enrichedRows = rows.map((row) => ({
        ...row,
        product_name: itemMap[row.id] ? itemMap[row.id].product_name : '',
        product_image: itemMap[row.id] ? itemMap[row.id].product_image : '',
        full_address: addressMap[row.id] || '',
        latest_refund_status: refundStatusMap[row.id] || ''
      }))

      return { success: true, data: await convertOrderImageUrls(enrichedRows) }
    }

    // 获取订单详情（支持数字 id，或 order_no 与微信支付 out_trade_no 一致，便于「小程序购物订单」跳转）
    if (action === 'detail') {
      const { orderId, orderNo } = params
      let orders
      if (orderNo) {
        const [rows] = await connection.execute(
          'SELECT * FROM orders WHERE order_no = ? AND _openid = ? LIMIT 1',
          [String(orderNo).trim(), openid]
        )
        orders = rows
      } else if (orderId !== undefined && orderId !== null && orderId !== '') {
        const id = parseInt(orderId, 10)
        if (Number.isNaN(id)) {
          return { success: false, error: '订单参数无效' }
        }
        const [rows] = await connection.execute(
          'SELECT * FROM orders WHERE id = ? AND _openid = ? LIMIT 1',
          [id, openid]
        )
        orders = rows
      } else {
        return { success: false, error: '缺少订单参数' }
      }

      if (!orders || orders.length === 0) {
        return { success: false, error: '订单不存在' }
      }

      const oid = orders[0].id
      const [items] = await connection.execute(
        'SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC',
        [oid]
      )
      const [addrRows] = await connection.execute(
        'SELECT name, phone, province, city, district, detail FROM order_addresses WHERE order_id = ? ORDER BY id ASC LIMIT 1',
        [oid]
      )
      const [refundRows] = await connection.execute(
        `SELECT status
         FROM order_refund_requests
         WHERE order_id = ?
         ORDER BY id DESC
         LIMIT 1`,
        [oid]
      )
      const latestRefundStatus = refundRows && refundRows[0] ? refundRows[0].status : ''
      const convertedItems = await convertOrderImageUrls(items || [])

      return {
        success: true,
        data: {
          ...orders[0],
          items: convertedItems,
          address: addrRows && addrRows[0] ? addrRows[0] : null,
          latest_refund_status: latestRefundStatus
        }
      }
    }

    // 创建订单（待支付）
    if (action === 'create') {
      const { addressId, productId, quantity = 1, couponId, remark, usedPoints = 0, selectedColor = '' } = params

      // 校验地址
      if (!addressId) {
        return { success: false, error: '请选择收货地址' }
      }

      // 获取用户信息（与 login/user 云函数一致：主键 openid，兼容历史 _openid）
      const [users] = await connection.execute(
        'SELECT id FROM users WHERE openid = ? OR _openid = ? LIMIT 1',
        [openid, openid]
      )

      if (!users || users.length === 0) {
        return { success: false, error: '用户不存在' }
      }

      const userId = users[0].id

      const [addrRows] = await connection.execute(
        'SELECT * FROM addresses WHERE id = ? AND openid = ? LIMIT 1',
        [addressId, openid]
      )
      if (!addrRows || addrRows.length === 0) {
        return { success: false, error: '收货地址不存在，请重新选择' }
      }
      const addressSnapshot = addrRows[0]

      // 获取商品信息
      let productInfo = null
      let selectedSpecPrice = null
      let selectedSpecInfo = null

      if (productId) {
        const [products] = await connection.execute(
          `SELECT id, name, price, cover_image,
             shipping_type, ship_deadline_days, shipping_promise,
             shipping_delay_reason, shipping_note
           FROM products
           WHERE id = ? AND is_on_sale = 1 AND deleted_at IS NULL
           LIMIT 1`,
          [productId]
        )
        if (products && products.length > 0) {
          productInfo = products[0]

          // 如果用户选择了规格，尝试从 product_specs 表中查询该规格对应的独立价格
          if (selectedColor) {
            const selectedColorText = String(selectedColor).trim()
            const [specRows] = await connection.execute(
              `SELECT price,
                 shipping_type, ship_deadline_days, shipping_promise,
                 shipping_delay_reason, shipping_note
                FROM product_specs 
                WHERE product_id = ? AND name = ?
                LIMIT 1`,
              [productId, selectedColorText]
            )

            if (specRows && specRows.length > 0) {
              const spec = specRows[0]
              selectedSpecInfo = spec
              const parsedSpecPrice = Number(spec.price)
              if (Number.isFinite(parsedSpecPrice) && parsedSpecPrice > 0) {
                selectedSpecPrice = parsedSpecPrice
              }
            }
          }
        }
      }

      if (!productInfo) {
        return { success: false, error: '商品不存在或已下架' }
      }
      const selectedColorText = String(selectedColor || '').trim().slice(0, 50)

      // 使用规格价格（如果存在）或商品基础价格
      const productBasePrice = Number(productInfo.price)
      const unitPrice = selectedSpecPrice != null ? selectedSpecPrice : productBasePrice
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        return { success: false, error: '商品价格异常，请联系管理员' }
      }

      // 计算金额
      const totalAmount = unitPrice * quantity
      let discountAmount = 0
      let couponAmount = 0
      let appliedUserCouponId = null

      // 处理优惠券：仅满减券。若未显式传 couponId，自动使用当前最优可用券（金额最大且满足门槛）
      const targetCouponId = couponId != null && couponId !== '' ? Number(couponId) : null
      if (targetCouponId && !Number.isNaN(targetCouponId)) {
        // 优先按「用户券ID」匹配（已领券场景）
        const [userCoupons] = await connection.execute(
          `SELECT uc.id AS uc_id, c.value AS coupon_value
           FROM user_coupons uc
           INNER JOIN coupons c ON c.id = uc.coupon_id
           WHERE uc.id = ? AND uc._openid = ? AND uc.status = 'unused'
             AND c.status = 'active'
             AND c.deleted_at IS NULL
             AND c.type = 'fixed'
             AND c.start_time <= NOW()
             AND c.expire_time > NOW()
             AND ? >= IFNULL(c.min_amount, 0)
           LIMIT 1`,
          [targetCouponId, openid, totalAmount]
        )
        if (userCoupons && userCoupons.length > 0) {
          const uc = userCoupons[0]
          couponAmount = Number(uc.coupon_value) || 0
          discountAmount += couponAmount
          appliedUserCouponId = uc.uc_id
          await connection.execute(
            'UPDATE user_coupons SET status = "used", used_at = NOW() WHERE id = ?',
            [appliedUserCouponId]
          )
        } else {
          // 兼容「未做领券流程」：按券模板ID直接使用，落一条 used 用户券记录
          const [couponTemplates] = await connection.execute(
            `SELECT id, value
             FROM coupons
             WHERE id = ?
               AND status = 'active'
               AND deleted_at IS NULL
               AND type = 'fixed'
               AND remain_count > 0
               AND start_time <= NOW()
               AND expire_time > NOW()
               AND ? >= IFNULL(min_amount, 0)
             LIMIT 1`,
            [targetCouponId, totalAmount]
          )
          if (couponTemplates && couponTemplates.length > 0) {
            const tpl = couponTemplates[0]
            couponAmount = Number(tpl.value) || 0
            discountAmount += couponAmount
            const [insertUc] = await connection.execute(
              'INSERT INTO user_coupons (_openid, coupon_id, status, received_at, used_at) VALUES (?, ?, "used", NOW(), NOW())',
              [openid, tpl.id]
            )
            appliedUserCouponId = insertUc.insertId
            await connection.execute(
              'UPDATE coupons SET remain_count = remain_count - 1 WHERE id = ? AND remain_count > 0',
              [tpl.id]
            )
          }
        }
      } else {
        // 未指定券时，自动使用用户已领取的最优可用满减券
        const [userCoupons] = await connection.execute(
          `SELECT uc.id AS uc_id, c.value AS coupon_value
           FROM user_coupons uc
           INNER JOIN coupons c ON c.id = uc.coupon_id
           WHERE uc._openid = ? AND uc.status = 'unused'
             AND c.status = 'active'
             AND c.deleted_at IS NULL
             AND c.type = 'fixed'
             AND c.start_time <= NOW()
             AND c.expire_time > NOW()
             AND ? >= IFNULL(c.min_amount, 0)
           ORDER BY c.value DESC, uc.received_at ASC
           LIMIT 1`,
          [openid, totalAmount]
        )
        if (userCoupons && userCoupons.length > 0) {
          const uc = userCoupons[0]
          couponAmount = Number(uc.coupon_value) || 0
          discountAmount += couponAmount
          appliedUserCouponId = uc.uc_id
          await connection.execute(
            'UPDATE user_coupons SET status = "used", used_at = NOW() WHERE id = ?',
            [appliedUserCouponId]
          )
        }
      }

      // 扣除积分
      if (usedPoints > 0) {
        await connection.execute(
          'UPDATE users SET points = points - ?, total_points = total_points + ? WHERE id = ?',
          [usedPoints, usedPoints, userId]
        )
      }

      // 实付金额
      const payAmount = Math.max(0, totalAmount - discountAmount)

      // 业务订单号 = 微信支付 out_trade_no（商户单号），勿改用数字 id
      const orderNo = generateUnifiedOrderNo()
      const shippingSource = hasSpecShippingOverride(selectedSpecInfo) ? selectedSpecInfo : productInfo
      const shippingType = normalizeShippingType(shippingSource.shipping_type)
      const shipDeadlineDays = normalizeShipDeadlineDays(shippingSource.ship_deadline_days, shippingType)
      const shippingPromise = buildShippingPromise(shippingType, shipDeadlineDays, shippingSource.shipping_promise)
      const delayShippingReason = normalizeString(shippingSource.shipping_delay_reason, 120)
      const delayShippingNote = normalizeString(shippingSource.shipping_note, 500)

      // 创建订单记录
      const [result] = await connection.execute(
        `INSERT INTO orders (
          order_no, user_id, _openid,
          total_amount, freight, discount_amount, coupon_amount, pay_amount,
          status, pay_type,
          buyer_message, shipping_type, ship_deadline_days, shipping_promise,
          delay_shipping_reason, delay_shipping_note,
          used_coupon_id, used_points,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, 0.00, ?, ?, ?, 'pending_payment', NULL, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          orderNo, userId, openid,
          totalAmount.toFixed(2), discountAmount.toFixed(2),
          couponAmount.toFixed(2), payAmount.toFixed(2),
          remark || '',
          shippingType,
          shipDeadlineDays,
          shippingPromise,
          delayShippingReason,
          delayShippingNote,
          appliedUserCouponId, usedPoints
        ]
      )

      const orderId = result.insertId

      if (appliedUserCouponId) {
        await connection.execute(
          'UPDATE user_coupons SET used_order_id = ? WHERE id = ?',
          [orderId, appliedUserCouponId]
        )
      }

      // 创建订单商品项
      const [itemsResult] = await connection.execute(
        `INSERT INTO order_items (
          order_id, _openid, product_id, product_name, product_image, 
          price, quantity, selected_color, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          orderId, openid, productInfo.id, productInfo.name, productInfo.cover_image || '',
          unitPrice, quantity, selectedColorText
        ]
      )

      // 记录收货地址快照（addresses 表用 openid 关联）
      await connection.execute(
        `INSERT INTO order_addresses (
          order_id, _openid, name, phone, province, city, district, detail,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          orderId, openid, addressSnapshot.name, addressSnapshot.phone || addressSnapshot.contact,
          addressSnapshot.province, addressSnapshot.city, addressSnapshot.district, addressSnapshot.detail
        ]
      )

      return {
        success: true,
        data: {
          orderId,
          orderNo,
          payAmount: payAmount.toFixed(2),
          totalAmount: totalAmount.toFixed(2)
        }
      }
    }

    // 取消订单（仅待付款，避免已支付单被误取消）
    if (action === 'cancel') {
      const { orderId } = params
      const [rows] = await connection.execute(
        'SELECT status, user_id, used_coupon_id, used_points FROM orders WHERE id = ? AND _openid = ? LIMIT 1',
        [orderId, openid]
      )
      if (!rows || rows.length === 0) {
        return { success: false, error: '订单不存在' }
      }
      if (rows[0].status !== 'pending_payment') {
        return { success: false, error: '当前状态不可取消' }
      }
      await connection.execute(
        'UPDATE orders SET status = "cancelled", auto_cancel = 0, updated_at = NOW() WHERE id = ? AND _openid = ?',
        [orderId, openid]
      )
      const ucId = rows[0].used_coupon_id != null ? Number(rows[0].used_coupon_id) : null
      if (ucId && !Number.isNaN(ucId)) {
        await connection.execute(
          'UPDATE user_coupons SET status = "unused", used_at = NULL, used_order_id = NULL WHERE id = ?',
          [ucId]
        )
      }
      const usedPts = Number(rows[0].used_points) || 0
      const uid = rows[0].user_id != null ? Number(rows[0].user_id) : null
      if (usedPts > 0 && uid && !Number.isNaN(uid)) {
        await connection.execute(
          'UPDATE users SET points = points + ?, total_points = total_points - ? WHERE id = ?',
          [usedPts, usedPts, uid]
        )
      }
      return { success: true }
    }

    // 确认收货（仅已发货）
    if (action === 'confirmReceive') {
      const { orderId } = params
      const [rows] = await connection.execute(
        'SELECT status FROM orders WHERE id = ? AND _openid = ? LIMIT 1',
        [orderId, openid]
      )
      if (!rows || rows.length === 0) {
        return { success: false, error: '订单不存在' }
      }
      if (rows[0].status !== 'shipped') {
        return { success: false, error: '当前状态不可确认收货' }
      }
      await connection.execute(
        'UPDATE orders SET status = "completed", receive_time = NOW(), updated_at = NOW() WHERE id = ? AND _openid = ?',
        [orderId, openid]
      )
      return { success: true }
    }

    // 更新支付状态（供 CloudRun 支付回调调用）
    if (action === 'updatePaymentStatus') {
      const { orderId, transactionId, status = 'paid' } = params
      if (!orderId || !transactionId) {
        return { success: false, error: '缺少 orderId 或 transactionId' }
      }
      const [stRows] = await connection.execute(
        'SELECT status FROM orders WHERE id = ? LIMIT 1',
        [orderId]
      )
      if (!stRows || stRows.length === 0) {
        return { success: false, error: '订单不存在' }
      }
      if (stRows[0].status === 'cancelled') {
        return { success: false, error: '订单已关闭' }
      }
      if (stRows[0].status === 'paid' || stRows[0].status === 'completed') {
        return { success: true, message: '订单已处理' }
      }
      const [upd] = await connection.execute(
        `UPDATE orders SET 
          status = ?, 
          pay_type = 'wechat',
          pay_transaction_id = ?,
          pay_time = NOW(),
          expected_ship_time = CASE
            WHEN ? = 'paid' THEN COALESCE(expected_ship_time, DATE_ADD(NOW(), INTERVAL GREATEST(IFNULL(ship_deadline_days, 2), 1) DAY))
            ELSE expected_ship_time
          END,
          updated_at = NOW()
         WHERE id = ? AND status = 'pending_payment'`,
        [status, transactionId, status, orderId]
      )
      if (upd.affectedRows === 0) {
        return { success: false, error: '订单状态不可更新' }
      }
      return { success: true, message: '支付状态已更新' }
    }

    // 通过订单号更新支付状态（CloudRun 回调专用，兼容实物订单 + 积分订单）
    if (action === 'updatePaymentStatusByOrderNo') {
      const { orderNo, transactionId, status = 'paid', callbackPayload } = params
      if (!orderNo || !transactionId) {
        return { success: false, error: '缺少 orderNo 或 transactionId' }
      }

      // 优先查实物订单
      const [orders] = await connection.execute(
        "SELECT id, status FROM orders WHERE order_no = ? LIMIT 1",
        [orderNo]
      )

      if (orders && orders.length > 0) {
        const order = orders[0]
        if (order.status === 'cancelled') {
          console.warn(`[Order] 订单已关闭，拒绝支付回调: ${orderNo}`)
          return { success: false, error: '订单已关闭' }
        }

        // 幂等检查：已是支付状态则跳过
        if (order.status === 'paid' || order.status === 'completed') {
          console.log(`[Order] 订单 ${orderNo} 已处于 ${order.status} 状态，跳过更新`)
          return { success: true, message: '订单已处理' }
        }

        const [upd] = await connection.execute(
          `UPDATE orders SET 
            status = ?, 
            pay_type = 'wechat',
            pay_transaction_id = ?,
            pay_time = NOW(),
            expected_ship_time = CASE
              WHEN ? = 'paid' THEN COALESCE(expected_ship_time, DATE_ADD(NOW(), INTERVAL GREATEST(IFNULL(ship_deadline_days, 2), 1) DAY))
              ELSE expected_ship_time
            END,
            updated_at = NOW()
           WHERE id = ? AND status = 'pending_payment'`,
          [status, transactionId, status, order.id]
        )
        if (upd.affectedRows === 0) {
          return { success: false, error: '订单状态不可更新' }
        }

        console.log(`[Order] 订单 ${orderNo} 支付状态已更新，流水号: ${transactionId}`)
        return { success: true, message: '支付状态已更新' }
      }

      // 未命中实物订单时，查积分订单
      const [pointsOrders] = await connection.execute(
        'SELECT * FROM points_orders WHERE order_no = ? LIMIT 1',
        [orderNo]
      )
      if (!pointsOrders || pointsOrders.length === 0) {
        console.warn(`[Order] 订单不存在: ${orderNo}`)
        return { success: false, error: '订单不存在' }
      }
      const pointsOrder = pointsOrders[0]
      if (pointsOrder.status === 'cancelled' || pointsOrder.status === 'refunded') {
        return { success: false, error: '订单已关闭或已退款' }
      }
      if (pointsOrder.payment_status === 'paid' || pointsOrder.status === 'pending_send' || pointsOrder.status === 'completed') {
        return { success: true, message: '订单已处理' }
      }

      await connection.beginTransaction()
      try {
        const [lockedRows] = await connection.execute(
          'SELECT * FROM points_orders WHERE id = ? LIMIT 1 FOR UPDATE',
          [pointsOrder.id]
        )
        if (!lockedRows || lockedRows.length === 0) throw new Error('积分订单不存在')
        const locked = lockedRows[0]
        if (locked.payment_status === 'paid' || locked.status === 'pending_send' || locked.status === 'completed') {
          await connection.commit()
          return { success: true, message: '订单已处理' }
        }
        if (locked.status !== 'pending_payment') throw new Error('积分订单状态不可更新')

        await connection.execute(
          `UPDATE points_orders
           SET status = 'pending_send',
               payment_status = 'paid',
               payment_channel = IFNULL(payment_channel, 'mixed'),
               pay_transaction_id = ?,
               pay_callback_payload = ?,
               pay_time = NOW(),
               updated_at = NOW()
           WHERE id = ?`,
          [transactionId, JSON.stringify(callbackPayload || {}), locked.id]
        )
        await connection.execute(
          `UPDATE points_products
           SET stock_frozen = stock_frozen - ?, sales_count = sales_count + ?
           WHERE id = ? AND stock_frozen >= ?`,
          [locked.quantity, locked.quantity, locked.points_product_id, locked.quantity]
        )
        await connection.execute(
          'UPDATE products SET sales_count = IFNULL(sales_count, 0) + ? WHERE id = ?',
          [locked.quantity, locked.product_id]
        )
        const [userRows] = await connection.execute('SELECT points FROM users WHERE id = ? LIMIT 1', [locked.user_id])
        const balance = userRows && userRows[0] ? Number(userRows[0].points) || 0 : 0
        await connection.execute(
          `INSERT INTO points_payment_logs (
            order_id, order_no, user_id, _openid, direction, biz_type,
            points_change, cash_change, balance_before, balance_after,
            idempotency_key, reconcile_date, payment_channel, pay_transaction_id, remark, created_at
          ) VALUES (?, ?, ?, ?, 'out', 'confirm', 0, ?, ?, ?, ?, CURDATE(), ?, ?, ?, NOW())`,
          [
            locked.id, locked.order_no, locked.user_id, locked._openid,
            Number(locked.payable_cash) || 0, balance, balance,
            `confirm:${locked.order_no}:${transactionId}`, locked.payment_channel || 'mixed', transactionId, '支付回调确认'
          ]
        )
        await connection.commit()
        return { success: true, message: '积分订单支付状态已更新' }
      } catch (e) {
        await connection.rollback()
        return { success: false, error: e.message || '积分订单支付更新失败' }
      }
    }

    // 查询订单信息（供 CloudRun 下单/退款使用）
    if (action === 'getOrderForPayment') {
      const { orderId, openid, orderType } = params

      let sql = 'SELECT id, order_no, pay_amount, status, pay_transaction_id, _openid, "normal" AS order_type FROM orders WHERE id = ?'
      const values = [orderId]

      // 如果提供了 openid，增加校验
      if (openid) {
        sql += ' AND _openid = ?'
        values.push(openid)
      }

      sql += ' LIMIT 1'

      const [orders] = await connection.execute(sql, values)

      if (orders && orders.length > 0) {
        return { success: true, data: orders[0] }
      }

      if (String(orderType || '') !== 'points') {
        return { success: false, error: '订单不存在' }
      }

      let psql = `SELECT id, order_no, payable_cash AS pay_amount, status, pay_transaction_id, _openid, "points" AS order_type
                  FROM points_orders WHERE id = ?`
      const pvalues = [orderId]
      if (openid) {
        psql += ' AND _openid = ?'
        pvalues.push(openid)
      }
      psql += ' LIMIT 1'
      const [pointsRows] = await connection.execute(psql, pvalues)
      if (!pointsRows || pointsRows.length === 0) {
        return { success: false, error: '订单不存在' }
      }
      return { success: true, data: pointsRows[0] }
    }

    // 更新订单为退款中状态（供 CloudRun 退款使用）
    if (action === 'updateRefundStatus') {
      const { orderId, orderType } = params
      if (!orderId) {
        return { success: false, error: '缺少 orderId' }
      }

      if (String(orderType || '') === 'points') {
        await connection.execute(
          "UPDATE points_orders SET status = 'refunding', payment_status = 'refunding', updated_at = NOW() WHERE id = ?",
          [orderId]
        )
        return { success: true, message: '积分订单退款状态已更新' }
      }

      await connection.execute(
        "UPDATE orders SET status = 'refunding', updated_at = NOW() WHERE id = ?",
        [orderId]
      )
      return { success: true, message: '退款状态已更新' }
    }

    // 申请退款（用户侧）
    // 未发货(paid) → 自动审批直接退款；已发货(shipped) → 需管理员审批
    if (action === 'applyRefund') {
      const { orderId, reason = '', refundType = 'refund_only', amount } = params
      const oid = parseInt(orderId, 10)
      if (!oid) return { success: false, error: '缺少 orderId' }

      const [orders] = await connection.execute(
        'SELECT id, order_no, user_id, _openid, status, pay_amount, pay_transaction_id, logistics_no FROM orders WHERE id = ? AND _openid = ? LIMIT 1',
        [oid, openid]
      )
      if (!orders || orders.length === 0) {
        return { success: false, error: '订单不存在' }
      }
      const order = orders[0]

      const allowedStatuses = ['paid', 'shipped']
      if (!allowedStatuses.includes(order.status)) {
        return { success: false, error: `当前状态(${order.status})不支持退款` }
      }

      const isAutoApprove = order.status === 'paid'
      const requestStatus = isAutoApprove ? 'approved' : 'pending_review'

      const [exists] = await connection.execute(
        `SELECT id, status
         FROM order_refund_requests
         WHERE order_id = ?
           AND status IN ('pending_review', 'approved', 'processing')
         ORDER BY id DESC
         LIMIT 1`,
        [oid]
      )
      if (exists && exists.length > 0) {
        return { success: false, error: '该订单已有退款申请处理中，请勿重复提交' }
      }

      const payAmount = Number(order.pay_amount) || 0
      const reqAmountNum = amount != null ? Number(amount) : payAmount
      const reqAmount = Number.isFinite(reqAmountNum) ? Math.max(0, Math.min(payAmount, reqAmountNum)) : payAmount
      const reasonStr = String(reason || '').trim().slice(0, 255)
      const typeStr = String(refundType || 'refund_only').trim().slice(0, 32) || 'refund_only'

      await connection.beginTransaction()
      let ins
      try {
        ;[ins] = await connection.execute(
          `INSERT INTO order_refund_requests (
            order_id, order_no, user_id, _openid, request_type, reason, requested_amount, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [order.id, order.order_no, order.user_id, order._openid, typeStr, reasonStr, reqAmount.toFixed(2), requestStatus]
        )

        await connection.execute(
          "UPDATE orders SET status = 'refunding', updated_at = NOW() WHERE id = ?",
          [order.id]
        )

        await connection.commit()
      } catch (e) {
        await connection.rollback()
        throw e
      }

      return {
        success: true,
        data: {
          requestId: ins.insertId,
          orderId: order.id,
          orderNo: order.order_no,
          status: requestStatus,
          autoApproved: isAutoApprove,
          payAmount: payAmount.toFixed(2),
          requestedAmount: reqAmount.toFixed(2),
          message: isAutoApprove
            ? '退款申请已自动通过，将为您发起退款'
            : '退款申请已提交，等待管理员审批'
        }
      }
    }

    // 查询退款申请记录（用户侧）
    if (action === 'listRefundRequests') {
      const { orderId } = params
      const values = [openid]
      let sql = `SELECT id, order_id, order_no, request_type, reason, requested_amount, status, admin_note, created_at, updated_at
                 FROM order_refund_requests
                 WHERE _openid = ?`
      if (orderId != null && String(orderId).trim() !== '') {
        sql += ' AND order_id = ?'
        values.push(parseInt(orderId, 10) || 0)
      }
      sql += ' ORDER BY id DESC LIMIT 50'
      const [rows] = await connection.execute(sql, values)
      return { success: true, data: rows || [] }
    }

    // 预留：管理员审核退款申请（后续管理后台接入）
    // approve: 申请标记 approved，订单保持 refunding；
    // reject: 申请标记 rejected，订单回退为 paid。
    // 实际调用微信退款建议由管理后台再调用 CloudRun /api/payment/refund。
    if (action === 'reviewRefundRequest') {
      const { requestId, decision, adminNote = '', adminSecret = '' } = params
      const secretFromEnv = process.env.REFUND_ADMIN_SECRET || ''
      if (!secretFromEnv || String(adminSecret) !== String(secretFromEnv)) {
        return { success: false, error: '无权限操作退款审核' }
      }
      const rid = parseInt(requestId, 10)
      if (!rid) return { success: false, error: '缺少 requestId' }
      const decide = String(decision || '').trim()
      if (decide !== 'approve' && decide !== 'reject') {
        return { success: false, error: 'decision 仅支持 approve/reject' }
      }

      const [reqRows] = await connection.execute(
        'SELECT id, order_id, status FROM order_refund_requests WHERE id = ? LIMIT 1',
        [rid]
      )
      if (!reqRows || reqRows.length === 0) return { success: false, error: '退款申请不存在' }
      const reqRow = reqRows[0]
      if (reqRow.status !== 'pending_review') {
        return { success: false, error: '该申请已处理，请勿重复审核' }
      }

      if (decide === 'approve') {
        await connection.beginTransaction()
        try {
          await connection.execute(
            `UPDATE order_refund_requests
             SET status = 'approved', admin_note = ?, approved_at = NOW(), updated_at = NOW()
             WHERE id = ?`,
            [String(adminNote || '').slice(0, 255), rid]
          )
          await connection.commit()
        } catch (e) {
          await connection.rollback()
          throw e
        }
        return {
          success: true,
          data: {
            requestId: rid,
            status: 'approved',
            nextAction: '请由管理后台调用 CloudRun /api/payment/refund 发起微信退款'
          }
        }
      }

      await connection.beginTransaction()
      try {
        await connection.execute(
          `UPDATE order_refund_requests
           SET status = 'rejected', admin_note = ?, rejected_at = NOW(), updated_at = NOW()
           WHERE id = ?`,
          [String(adminNote || '').slice(0, 255), rid]
        )
        const [orderRow] = await connection.execute(
          'SELECT logistics_no FROM orders WHERE id = ? LIMIT 1',
          [reqRow.order_id]
        )
        const wasShipped = orderRow && orderRow[0] && !!orderRow[0].logistics_no
        const restoreStatus = wasShipped ? 'shipped' : 'paid'

        await connection.execute(
          'UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ?',
          [restoreStatus, reqRow.order_id]
        )
        await connection.commit()
      } catch (e) {
        await connection.rollback()
        throw e
      }
      return { success: true, data: { requestId: rid, status: 'rejected', orderStatus: 'paid' } }
    }

    // 获取积分订单列表
    if (action === 'listPointsOrders') {
      const pageNum = Math.max(1, parseInt(String(params.page != null ? params.page : 1), 10) || 1)
      const pageSizeNum = Math.min(100, Math.max(1, parseInt(String(params.pageSize != null ? params.pageSize : 10), 10) || 10))
      const offset = (pageNum - 1) * pageSizeNum
      const status = String(params.status || '').trim()

      let sql = 'SELECT * FROM points_orders WHERE _openid = ?'
      const values = [openid]
      if (status) {
        if (status === 'pending') {
          sql += " AND status IN ('pending_payment','paid','pending_send','refunding')"
        } else if (status === 'finished') {
          sql += " AND status IN ('completed','cancelled','refunded')"
        } else {
          sql += ' AND status = ?'
          values.push(status)
        }
      }
      sql += ` ORDER BY created_at DESC LIMIT ${pageSizeNum} OFFSET ${offset}`

      const [rows] = await connection.execute(sql, values)
      const [users] = await connection.execute('SELECT points FROM users WHERE openid = ? LIMIT 1', [openid])
      const userAvailablePoints = users && users[0] ? Number(users[0].points) || 0 : 0
      return { success: true, data: { list: await convertOrderImageUrls(rows || []), userAvailablePoints } }
    }

    // 获取积分订单详情
    if (action === 'getPointsOrderDetail') {
      const rawOrderId = params.orderId
      const rawOrderNo = params.orderNo
      let rows

      if (rawOrderNo != null && String(rawOrderNo).trim() !== '') {
        ;[rows] = await connection.execute(
          'SELECT * FROM points_orders WHERE order_no = ? AND _openid = ? LIMIT 1',
          [String(rawOrderNo).trim(), openid]
        )
      } else {
        const oid = Number(rawOrderId)
        if (!oid || Number.isNaN(oid)) return { success: false, error: '订单参数无效' }
          ;[rows] = await connection.execute(
            'SELECT * FROM points_orders WHERE id = ? AND _openid = ? LIMIT 1',
            [oid, openid]
          )
      }

      if (!rows || rows.length === 0) return { success: false, error: '积分订单不存在' }
      const order = rows[0]
      const [userRows] = await connection.execute('SELECT points FROM users WHERE id = ? LIMIT 1', [order.user_id])
      const [logRows] = await connection.execute(
        `SELECT direction, biz_type, points_change, cash_change, balance_before, balance_after, payment_channel, pay_transaction_id, created_at
         FROM points_payment_logs
         WHERE order_id = ?
         ORDER BY id ASC`,
        [order.id]
      )
      const convertedItems = await convertOrderImageUrls([
        { product_image: order.product_image_snapshot }
      ])
      const productImage = convertedItems[0] ? convertedItems[0].product_image : order.product_image_snapshot
      return {
        success: true,
        data: {
          ...order,
          receiver_name: order.receiver_name || '',
          receiver_phone: order.receiver_phone || '',
          address_text: order.address_text || '',
          user_available_points: userRows && userRows[0] ? Number(userRows[0].points) || 0 : 0,
          items: [
            {
              id: order.points_product_id,
              product_id: order.product_id,
              product_name: order.product_name_snapshot,
              product_image: productImage,
              spec_text: order.selected_spec_snapshot,
              quantity: order.quantity,
              points_price: order.unit_points
            }
          ],
          payment_detail: {
            payment_status: order.payment_status,
            payment_channel: order.payment_channel,
            payable_cash: Number(order.payable_cash) || 0,
            pay_transaction_id: order.pay_transaction_id || ''
          },
          logistics: {
            logistics_company: order.logistics_company || '',
            logistics_no: order.logistics_no || '',
            ship_time: order.ship_time || null
          },
          flow_logs: logRows || []
        }
      }
    }

    // 创建积分订单：冻结库存 + 预扣积分（若无需现金则直接完成支付态）
    if (action === 'createPointsOrder') {
      const pointsProductId = Number(params.pointsProductId)
      const quantity = Math.max(1, parseInt(String(params.quantity || 1), 10) || 1)
      const addressId = params.addressId ? Number(params.addressId) : null
      const selectedSpecName = String(params.selectedSpecName || '').trim().slice(0, 100)
      const remark = String(params.remark || '').trim().slice(0, 255)
      const idempotencyKey = buildIdempotencyKey(openid, params.idempotencyKey || params.clientRequestId)

      if (!pointsProductId || Number.isNaN(pointsProductId)) {
        return { success: false, error: '积分商品参数无效' }
      }
      if (!addressId || Number.isNaN(addressId)) {
        return { success: false, error: '请选择收货地址' }
      }

      await connection.beginTransaction()
      try {
        const [existsRows] = await connection.execute(
          'SELECT id, order_no, status, payable_cash FROM points_orders WHERE idempotency_key = ? LIMIT 1',
          [idempotencyKey]
        )
        if (existsRows && existsRows.length > 0) {
          await connection.commit()
          return {
            success: true,
            data: {
              orderId: existsRows[0].id,
              orderNo: existsRows[0].order_no,
              status: existsRows[0].status,
              payableCash: Number(existsRows[0].payable_cash) || 0,
              idempotent: true
            }
          }
        }

        const [userRows] = await connection.execute(
          'SELECT id, points, total_points, member_level FROM users WHERE openid = ? OR _openid = ? LIMIT 1 FOR UPDATE',
          [openid, openid]
        )
        if (!userRows || userRows.length === 0) throw new Error('用户不存在')
        const user = userRows[0]
        const currentPoints = Number(user.points) || 0

        const [ppRows] = await connection.execute(
          `SELECT pp.*,
                  COALESCE(NULLIF(pp.name, ''), p.name, CONCAT('积分商品 #', pp.id)) AS product_name,
                  COALESCE(NULLIF(pp.cover_image, ''), p.cover_image, '') AS display_cover_image,
                  p.stock AS linked_product_stock,
                  p.reserved_stock AS linked_product_reserved_stock
           FROM points_products pp
           LEFT JOIN products p ON p.id = pp.product_id AND p.deleted_at IS NULL
           WHERE pp.id = ? AND pp.is_on_sale = 1 AND pp.deleted_at IS NULL AND p.deleted_at IS NULL
           LIMIT 1 FOR UPDATE`,
          [pointsProductId]
        )
        if (!ppRows || ppRows.length === 0) throw new Error('积分商品不存在或已下架')
        const pp = ppRows[0]

        const userLevel = resolveEffectiveMemberLevel(user)
        const minLevel = Number(pp.min_member_level || 1) || 1
        if (userLevel < minLevel) throw new Error(`需达到会员等级LV${minLevel}后才可兑换`)

        const useLinkedProductStock = shouldUseLinkedProductStock(pp)
        const stockAvailable = useLinkedProductStock ? resolveLinkedProductStock(pp) : Number(pp.stock_available) || 0
        if (stockAvailable < quantity) throw new Error('库存不足')

        const [pointSpecRows] = await connection.execute(
          `SELECT name, image, points_price, cash_price, sku
           FROM points_product_specs
           WHERE points_product_id = ?
           ORDER BY sort_order ASC, id ASC`,
          [pointsProductId]
        )
        let selectedSpec = null
        if (pointSpecRows && pointSpecRows.length > 0) {
          selectedSpec = selectedSpecName
            ? pointSpecRows.find((row) => String(row.name || '') === selectedSpecName)
            : pointSpecRows[0]
          if (selectedSpecName && !selectedSpec) throw new Error('所选积分商品规格不存在')
        }

        const supportMixedPay = Number(pp.support_mixed_pay) === 1
        const unitPoints = Math.max(0, Number(selectedSpec ? selectedSpec.points_price : pp.points_price) || 0)
        const totalPoints = unitPoints * quantity
        if (currentPoints < totalPoints) throw new Error('积分不足')

        const unitCash = Math.max(0, Number(selectedSpec ? selectedSpec.cash_price : pp.cash_price) || 0)
        const totalCash = unitCash * quantity
        const payableCash = supportMixedPay ? totalCash : 0
        const specSnapshot = selectedSpec ? String(selectedSpec.name || '') : selectedSpecName
        const productImageSnapshot = selectedSpec && selectedSpec.image ? selectedSpec.image : pp.display_cover_image || ''

        const [addrRows] = await connection.execute(
          'SELECT name, phone, province, city, district, detail FROM addresses WHERE id = ? AND openid = ? LIMIT 1',
          [addressId, openid]
        )
        if (!addrRows || addrRows.length === 0) throw new Error('收货地址不存在')
        const addr = addrRows[0]
        const addressText = `${addr.province || ''}${addr.city || ''}${addr.district || ''}${addr.detail || ''}`

        if (useLinkedProductStock) {
          await connection.execute(
            `UPDATE points_products
             SET stock = ?, stock_total = ?, stock_available = ?
             WHERE id = ?
               AND stock_available <= 0
               AND stock_total <= 0
               AND stock <= 0`,
            [stockAvailable, stockAvailable, stockAvailable, pointsProductId]
          )
        }

        const [stockUpdate] = await connection.execute(
          `UPDATE points_products
           SET stock_available = stock_available - ?, stock_frozen = stock_frozen + ?
           WHERE id = ? AND stock_available >= ?`,
          [quantity, quantity, pointsProductId, quantity]
        )
        if (!stockUpdate || stockUpdate.affectedRows === 0) throw new Error('库存不足')

        await connection.execute(
          'UPDATE users SET points = points - ? WHERE id = ? AND points >= ?',
          [totalPoints, user.id, totalPoints]
        )

        const orderNo = generateUnifiedOrderNo()
        const payChannel = payableCash > 0 ? 'mixed' : 'points_only'
        const [ins] = await connection.execute(
          `INSERT INTO points_orders (
            order_no, idempotency_key, user_id, _openid,
            points_product_id, product_id, product_name_snapshot, product_image_snapshot,
            selected_spec_snapshot, quantity, unit_points, total_points,
            unit_cash, total_cash, payable_cash,
            status, payment_status, payment_channel, remark,
            receiver_name, receiver_phone, address_text,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment', 'pending', ?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            orderNo, idempotencyKey, user.id, openid,
            pointsProductId, Number(pp.product_id) || 0, pp.product_name || '', productImageSnapshot,
            specSnapshot, quantity, unitPoints, totalPoints,
            unitCash.toFixed(2), totalCash.toFixed(2), payableCash.toFixed(2),
            payChannel, remark,
            addr.name || '', addr.phone || '', addressText
          ]
        )
        const orderId = ins.insertId

        await connection.execute(
          `INSERT INTO points_payment_logs (
            order_id, order_no, user_id, _openid, direction, biz_type,
            points_change, cash_change, balance_before, balance_after,
            idempotency_key, reconcile_date, payment_channel, remark, created_at
          ) VALUES (?, ?, ?, ?, 'out', 'freeze', ?, 0.00, ?, ?, ?, CURDATE(), ?, ?, NOW())`,
          [
            orderId, orderNo, user.id, openid, -totalPoints, currentPoints, currentPoints - totalPoints,
            `freeze:${orderNo}`, payChannel, '创建积分订单预扣积分'
          ]
        )

        if (payableCash <= 0) {
          await connection.execute(
            `UPDATE points_orders
             SET status = 'pending_send', payment_status = 'paid', payment_channel = 'points_only',
                 pay_time = NOW(), updated_at = NOW()
             WHERE id = ?`,
            [orderId]
          )
          await connection.execute(
            `UPDATE points_products
             SET stock_frozen = stock_frozen - ?, sales_count = sales_count + ?
             WHERE id = ? AND stock_frozen >= ?`,
            [quantity, quantity, pointsProductId, quantity]
          )
          await connection.execute(
            'UPDATE products SET sales_count = IFNULL(sales_count, 0) + ? WHERE id = ?',
            [quantity, pp.product_id]
          )
          await connection.execute(
            `INSERT INTO points_payment_logs (
              order_id, order_no, user_id, _openid, direction, biz_type,
              points_change, cash_change, balance_before, balance_after,
              idempotency_key, reconcile_date, payment_channel, remark, created_at
            ) VALUES (?, ?, ?, ?, 'out', 'confirm', 0, 0.00, ?, ?, ?, CURDATE(), 'points_only', ?, NOW())`,
            [orderId, orderNo, user.id, openid, currentPoints - totalPoints, currentPoints - totalPoints, `confirm:${orderNo}`, '积分支付确认']
          )
        }

        await connection.commit()
        return {
          success: true,
          data: {
            orderId,
            orderNo,
            status: payableCash > 0 ? 'pending_payment' : 'pending_send',
            totalPoints,
            payableCash: Number(payableCash.toFixed(2)),
            needCashPayment: payableCash > 0
          }
        }
      } catch (e) {
        await connection.rollback()
        return { success: false, error: e.message || '创建积分订单失败' }
      }
    }

    // 取消积分订单（仅待支付）
    if (action === 'cancelPointsOrder') {
      const orderId = Number(params.orderId)
      const cancelReason = String(params.cancelReason || '用户取消').trim().slice(0, 255)
      if (!orderId || Number.isNaN(orderId)) return { success: false, error: '订单参数无效' }

      await connection.beginTransaction()
      try {
        const [rows] = await connection.execute(
          'SELECT * FROM points_orders WHERE id = ? AND _openid = ? LIMIT 1 FOR UPDATE',
          [orderId, openid]
        )
        if (!rows || rows.length === 0) throw new Error('积分订单不存在')
        const order = rows[0]
        if (order.status === 'cancelled') {
          await connection.commit()
          return { success: true, data: { orderId, status: 'cancelled', idempotent: true } }
        }
        if (order.status !== 'pending_payment') throw new Error('当前状态不可取消')

        const [uRows] = await connection.execute('SELECT points FROM users WHERE id = ? LIMIT 1 FOR UPDATE', [order.user_id])
        const balanceBefore = uRows && uRows[0] ? Number(uRows[0].points) || 0 : 0
        const totalPoints = Number(order.total_points) || 0

        await connection.execute(
          `UPDATE points_products
           SET stock_available = stock_available + ?, stock_frozen = stock_frozen - ?
           WHERE id = ? AND stock_frozen >= ?`,
          [order.quantity, order.quantity, order.points_product_id, order.quantity]
        )
        await connection.execute(
          'UPDATE users SET points = points + ? WHERE id = ?',
          [totalPoints, order.user_id]
        )
        await connection.execute(
          `UPDATE points_orders
           SET status = 'cancelled', payment_status = 'cancelled', cancelled_at = NOW(), cancel_reason = ?, updated_at = NOW()
           WHERE id = ?`,
          [cancelReason, orderId]
        )
        await connection.execute(
          `INSERT INTO points_payment_logs (
            order_id, order_no, user_id, _openid, direction, biz_type,
            points_change, cash_change, balance_before, balance_after,
            idempotency_key, reconcile_date, payment_channel, remark, created_at
          ) VALUES (?, ?, ?, ?, 'in', 'unfreeze', ?, 0.00, ?, ?, ?, CURDATE(), ?, ?, NOW())`,
          [
            order.id, order.order_no, order.user_id, order._openid, totalPoints,
            balanceBefore, balanceBefore + totalPoints, `unfreeze:${order.order_no}`,
            order.payment_channel || 'points_only', cancelReason || '取消订单返还积分'
          ]
        )

        await connection.commit()
        return { success: true, data: { orderId, status: 'cancelled' } }
      } catch (e) {
        await connection.rollback()
        return { success: false, error: e.message || '取消积分订单失败' }
      }
    }

    // 积分订单退款：返还积分与库存，状态回滚为 refunded
    if (action === 'refundPointsOrder') {
      const orderId = Number(params.orderId)
      const refundReason = String(params.refundReason || '用户退款').trim().slice(0, 255)
      const refundTransactionId = String(params.refundTransactionId || '').trim().slice(0, 64)
      if (!orderId || Number.isNaN(orderId)) return { success: false, error: '订单参数无效' }

      await connection.beginTransaction()
      try {
        const [rows] = await connection.execute(
          'SELECT * FROM points_orders WHERE id = ? AND _openid = ? LIMIT 1 FOR UPDATE',
          [orderId, openid]
        )
        if (!rows || rows.length === 0) throw new Error('积分订单不存在')
        const order = rows[0]
        if (order.status === 'refunded') {
          await connection.commit()
          return { success: true, data: { orderId, status: 'refunded', idempotent: true } }
        }
        if (!['paid', 'pending_send', 'completed', 'refunding'].includes(order.status)) {
          throw new Error('当前状态不可退款')
        }

        const [uRows] = await connection.execute('SELECT points FROM users WHERE id = ? LIMIT 1 FOR UPDATE', [order.user_id])
        const balanceBefore = uRows && uRows[0] ? Number(uRows[0].points) || 0 : 0
        const totalPoints = Number(order.total_points) || 0
        const payableCash = Number(order.payable_cash) || 0

        await connection.execute(
          'UPDATE users SET points = points + ? WHERE id = ?',
          [totalPoints, order.user_id]
        )
        await connection.execute(
          'UPDATE points_products SET stock_available = stock_available + ? WHERE id = ?',
          [order.quantity, order.points_product_id]
        )
        await connection.execute(
          `UPDATE points_orders
           SET status = 'refunded', payment_status = 'refunded', refund_transaction_id = ?, updated_at = NOW()
           WHERE id = ?`,
          [refundTransactionId || null, orderId]
        )
        await connection.execute(
          `INSERT INTO points_payment_logs (
            order_id, order_no, user_id, _openid, direction, biz_type,
            points_change, cash_change, balance_before, balance_after,
            idempotency_key, reconcile_date, payment_channel, pay_transaction_id, remark, created_at
          ) VALUES (?, ?, ?, ?, 'in', 'refund', ?, ?, ?, ?, ?, CURDATE(), ?, ?, ?, NOW())`,
          [
            order.id, order.order_no, order.user_id, order._openid,
            totalPoints, payableCash > 0 ? -payableCash.toFixed(2) : 0,
            balanceBefore, balanceBefore + totalPoints,
            `refund:${order.order_no}`, order.payment_channel || 'mixed', refundTransactionId || null, refundReason
          ]
        )

        await connection.commit()
        return { success: true, data: { orderId, status: 'refunded' } }
      } catch (e) {
        await connection.rollback()
        return { success: false, error: e.message || '积分订单退款失败' }
      }
    }

    // 积分订单申请退款：未发货/已取消自动退款，其余进入后台审批
    if (action === 'applyPointsRefund') {
      const orderId = Number(params.orderId)
      const refundReason = String(params.refundReason || '用户申请退款').trim().slice(0, 255)
      if (!orderId || Number.isNaN(orderId)) return { success: false, error: '订单参数无效' }

      const autoRefundStatuses = ['pending_payment', 'paid', 'pending_send', 'cancelled']
      const reviewStatuses = ['shipped', 'completed', 'refunding']

      await connection.beginTransaction()
      try {
        const [rows] = await connection.execute(
          'SELECT * FROM points_orders WHERE id = ? AND _openid = ? LIMIT 1 FOR UPDATE',
          [orderId, openid]
        )
        if (!rows || rows.length === 0) throw new Error('积分订单不存在')
        const order = rows[0]

        if (order.status === 'refunded') {
          await connection.commit()
          return { success: true, data: { orderId, status: 'refunded', idempotent: true } }
        }

        const [exists] = await connection.execute(
          `SELECT id, status
           FROM points_order_refund_requests
           WHERE points_order_id = ?
             AND status IN ('pending_review', 'approved', 'processing')
           ORDER BY id DESC
           LIMIT 1`,
          [orderId]
        )
        if (exists && exists.length > 0) {
          throw new Error('该积分订单已有退款申请处理中，请勿重复提交')
        }

        if (autoRefundStatuses.includes(order.status)) {
          const result = await executePointsRefund(connection, order, {
            reason: refundReason || '未发货/取消状态自动退款',
            actor: 'auto'
          })
          await connection.execute(
            `INSERT INTO points_order_refund_requests (
              points_order_id, order_no, user_id, _openid, reason,
              requested_points, requested_cash, status, order_status_snapshot, auto_refund,
              admin_note, approved_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', ?, 1, ?, NOW(), NOW(), NOW())`,
            [
              order.id,
              order.order_no,
              order.user_id,
              order._openid,
              refundReason,
              Number(order.total_points) || 0,
              Number(order.payable_cash || 0).toFixed(2),
              order.status || '',
              '系统自动退款（未发货或已取消）'
            ]
          )
          await connection.commit()
          return {
            success: true,
            data: {
              orderId,
              requestStatus: 'approved',
              orderStatus: result.status,
              autoRefund: true,
              message: '订单状态符合自动退款条件，已自动处理'
            }
          }
        }

        if (!reviewStatuses.includes(order.status)) {
          throw new Error('当前状态不可申请退款')
        }

        const [ins] = await connection.execute(
          `INSERT INTO points_order_refund_requests (
            points_order_id, order_no, user_id, _openid, reason,
            requested_points, requested_cash, status, order_status_snapshot, auto_refund,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_review', ?, 0, NOW(), NOW())`,
          [
            order.id,
            order.order_no,
            order.user_id,
            order._openid,
            refundReason,
            Number(order.total_points) || 0,
            Number(order.payable_cash || 0).toFixed(2),
            order.status || ''
          ]
        )

        await connection.execute(
          "UPDATE points_orders SET status = 'refunding', payment_status = 'refunding', updated_at = NOW() WHERE id = ?",
          [order.id]
        )
        await connection.commit()
        return {
          success: true,
          data: {
            requestId: ins.insertId,
            orderId: order.id,
            orderNo: order.order_no,
            status: 'pending_review',
            orderStatus: 'refunding',
            autoRefund: false,
            message: '退款申请已提交，等待后台审批'
          }
        }
      } catch (e) {
        await connection.rollback()
        return { success: false, error: e.message || '积分订单申请退款失败' }
      }
    }

    // 管理后台：查询积分退款申请
    if (action === 'listPointsRefundRequests') {
      const { status = '', adminSecret = '' } = params
      const secretFromEnv = process.env.REFUND_ADMIN_SECRET || ''
      if (!secretFromEnv || String(adminSecret) !== String(secretFromEnv)) {
        return { success: false, error: '无权限查询积分退款申请' }
      }
      const values = []
      let sql = `SELECT id, points_order_id, order_no, user_id, reason, requested_points, requested_cash, status,
                        order_status_snapshot, auto_refund, admin_note, approved_at, rejected_at, created_at, updated_at
                 FROM points_order_refund_requests`
      if (String(status || '').trim()) {
        sql += ' WHERE status = ?'
        values.push(String(status).trim())
      }
      sql += ' ORDER BY id DESC LIMIT 200'
      const [rows] = await connection.execute(sql, values)
      return { success: true, data: rows || [] }
    }

    // 管理后台：审批积分退款申请（approve 自动执行退款，reject 回滚到原状态）
    if (action === 'reviewPointsRefundRequest') {
      const { requestId, decision, adminNote = '', adminSecret = '', refundTransactionId = '' } = params
      const secretFromEnv = process.env.REFUND_ADMIN_SECRET || ''
      if (!secretFromEnv || String(adminSecret) !== String(secretFromEnv)) {
        return { success: false, error: '无权限操作积分退款审核' }
      }
      const rid = parseInt(requestId, 10)
      if (!rid) return { success: false, error: '缺少 requestId' }
      const decide = String(decision || '').trim()
      if (decide !== 'approve' && decide !== 'reject') {
        return { success: false, error: 'decision 仅支持 approve/reject' }
      }

      await connection.beginTransaction()
      try {
        const [reqRows] = await connection.execute(
          'SELECT * FROM points_order_refund_requests WHERE id = ? LIMIT 1 FOR UPDATE',
          [rid]
        )
        if (!reqRows || reqRows.length === 0) throw new Error('积分退款申请不存在')
        const req = reqRows[0]
        if (req.status !== 'pending_review') throw new Error('该申请已处理，请勿重复审核')

        const [orderRows] = await connection.execute(
          'SELECT * FROM points_orders WHERE id = ? LIMIT 1 FOR UPDATE',
          [req.points_order_id]
        )
        if (!orderRows || orderRows.length === 0) throw new Error('积分订单不存在')
        const order = orderRows[0]

        if (decide === 'approve') {
          await executePointsRefund(connection, order, {
            reason: req.reason || '后台审批通过退款',
            refundTransactionId,
            actor: 'admin'
          })
          await connection.execute(
            `UPDATE points_order_refund_requests
             SET status = 'approved', admin_note = ?, approved_at = NOW(), updated_at = NOW()
             WHERE id = ?`,
            [String(adminNote || '').slice(0, 255), rid]
          )
          await connection.commit()
          return { success: true, data: { requestId: rid, status: 'approved', orderStatus: 'refunded' } }
        }

        const rollbackStatus = String(req.order_status_snapshot || 'shipped').trim() || 'shipped'
        await connection.execute(
          `UPDATE points_order_refund_requests
           SET status = 'rejected', admin_note = ?, rejected_at = NOW(), updated_at = NOW()
           WHERE id = ?`,
          [String(adminNote || '').slice(0, 255), rid]
        )
        await connection.execute(
          'UPDATE points_orders SET status = ?, payment_status = "paid", updated_at = NOW() WHERE id = ?',
          [rollbackStatus, req.points_order_id]
        )
        await connection.commit()
        return { success: true, data: { requestId: rid, status: 'rejected', orderStatus: rollbackStatus } }
      } catch (e) {
        await connection.rollback()
        return { success: false, error: e.message || '积分退款审核失败' }
      }
    }

    // 发货：更新顺丰运单号和 waybill_token
    if (action === 'ship') {
      const { orderId, expressCompany, expressNo, waybillToken } = params
      if (!orderId || !expressCompany || !expressNo) {
        return { success: false, error: '缺少 orderId、expressCompany 或 expressNo' }
      }
      const [orderRows] = await connection.execute(
        'SELECT id, status FROM orders WHERE id = ? LIMIT 1',
        [orderId]
      )
      if (!orderRows || orderRows.length === 0) {
        return { success: false, error: '订单不存在' }
      }
      if (orderRows[0].status !== 'paid') {
        return { success: false, error: '仅已付款的订单可以发货' }
      }
      await connection.execute(
        `UPDATE orders SET
          status = 'shipped',
          logistics_company = ?,
          logistics_no = ?,
          waybill_token = ?,
          ship_time = NOW(),
          updated_at = NOW()
         WHERE id = ? AND status = 'paid'`,
        [expressCompany, expressNo, waybillToken || '', orderId]
      )
      return { success: true, data: { orderId, expressCompany, expressNo, waybillToken: waybillToken || '' } }
    }

    // 获取 waybill_token（供小程序物流插件使用，支持实物+积分订单）
    if (action === 'getWaybillToken') {
      const { orderId } = params
      if (!orderId) {
        return { success: false, error: '缺少 orderId' }
      }
      let [rows] = await connection.execute(
        'SELECT waybill_token, logistics_company, logistics_no, status FROM orders WHERE id = ? LIMIT 1',
        [orderId]
      )
      let tableName = 'orders'

      if (!rows || rows.length === 0) {
        ;[rows] = await connection.execute(
          'SELECT waybill_token, logistics_company, logistics_no, status FROM points_orders WHERE id = ? LIMIT 1',
          [orderId]
        )
        tableName = 'points_orders'
      }

      if (!rows || rows.length === 0) {
        return { success: false, error: '订单不存在' }
      }
      const order = rows[0]
      if (!order.waybill_token) {
        return { success: false, error: '该订单暂无物流信息' }
      }
      return {
        success: true,
        data: {
          waybillToken: order.waybill_token,
          expressCompany: order.logistics_company || '',
          expressNo: order.logistics_no || '',
          status: order.status,
          source: tableName
        }
      }
    }

    // 退款回调：标记订单已退款（供 CloudRun 退款回调调用）
    if (action === 'completeRefundByOrderNo') {
      const { orderNo, outRefundNo, refundId } = params
      const processedRefundNo = String(outRefundNo || refundId || '').trim().slice(0, 64) || null
      if (!orderNo) return { success: false, error: '缺少 orderNo' }

      const [orders] = await connection.execute(
        "SELECT id, status FROM orders WHERE order_no = ? LIMIT 1",
        [orderNo]
      )
      if (orders && orders.length > 0) {
        const order = orders[0]
        await connection.execute(
          `UPDATE order_refund_requests
           SET status = 'approved',
               approved_at = IFNULL(approved_at, NOW()),
               processed_refund_no = COALESCE(NULLIF(processed_refund_no, ''), ?),
               updated_at = NOW()
           WHERE order_id = ?
             AND status IN ('pending_review', 'approved', 'processing')
           ORDER BY id DESC
           LIMIT 1`,
          [processedRefundNo, order.id]
        )
        if (order.status === 'refunded') {
          return { success: true, message: '订单已退款' }
        }
        await connection.execute(
          "UPDATE orders SET status = 'refunded', updated_at = NOW() WHERE id = ? AND status <> 'refunded'",
          [order.id]
        )
        return { success: true, message: '退款状态已更新' }
      }

      const [pointsOrders] = await connection.execute(
        'SELECT id, status FROM points_orders WHERE order_no = ? LIMIT 1',
        [orderNo]
      )
      if (!pointsOrders || pointsOrders.length === 0) {
        return { success: false, error: '订单不存在' }
      }
      const po = pointsOrders[0]
      await connection.execute(
        `UPDATE points_order_refund_requests
         SET status = 'approved',
             approved_at = IFNULL(approved_at, NOW()),
             updated_at = NOW()
         WHERE points_order_id = ?
           AND status IN ('pending_review', 'approved', 'processing')
         ORDER BY id DESC
         LIMIT 1`,
        [po.id]
      )
      if (po.status === 'refunded') return { success: true, message: '订单已退款' }
      await connection.execute(
        "UPDATE points_orders SET status = 'refunded', payment_status = 'refunded', refund_transaction_id = COALESCE(NULLIF(refund_transaction_id, ''), ?), updated_at = NOW() WHERE id = ? AND status <> 'refunded'",
        [processedRefundNo, po.id]
      )
      return { success: true, message: '积分订单退款状态已更新' }
    }

    return { success: false, error: '未知操作' }
  } catch (error) {
    console.error('Order error:', error)
    return { success: false, error: error.message }
  } finally {
    if (connection) {
      connection.release()
    }
  }
}
