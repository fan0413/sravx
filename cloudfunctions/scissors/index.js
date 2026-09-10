/**
 * 剪刀云函数 - 使用 MySQL 数据库
 */
const cloud = require('wx-server-sdk')
const tcb = require('@cloudbase/node-sdk')
const mysql = require('mysql2/promise')
const {
  columnExpr,
  buildSpecMatchCondition,
  buildSpecMatchOrder,
  resolveCardImage,
  normalizeScissorsItem
} = require('./card-logic')

cloud.init({
  env: process.env.ENV_ID || 'cloud1-8gk3bptqefbf01d6'
})
const authApp = tcb.init({ env: process.env.ENV_ID || 'cloud1-8gk3bptqefbf01d6' })

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

let pool = null
let scissorsColumnsCache = null

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
    p = null
    pool = null
    p = await getPool()
    return await p.getConnection()
  }
}

async function getScissorsColumns(connection) {
  if (scissorsColumnsCache) return scissorsColumnsCache

  try {
    const [rows] = await connection.query(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'scissors'
         AND COLUMN_NAME IN ('spec_id', 'sku', 'spec_name', 'card_image', 'image')`
    )
    scissorsColumnsCache = {}
    ;(rows || []).forEach(row => {
      scissorsColumnsCache[row.COLUMN_NAME] = true
    })
    return scissorsColumnsCache
  } catch (err) {
    console.warn('getScissorsColumns failed:', err.message)
    scissorsColumnsCache = {}
    return scissorsColumnsCache
  }
}

async function resolveCloudUrls(urls) {
  const cloudFiles = []
  urls.forEach(url => {
    if (url && url.startsWith('cloud://')) {
      cloudFiles.push({ fileID: url, maxAge: 60 * 60 * 24 * 30 })
    }
  })
  if (cloudFiles.length === 0) return {}
  try {
    const result = await cloud.getTempFileURL({ fileList: cloudFiles })
    const map = {}
    result.fileList.forEach(item => {
      if (item.status === 0 && item.tempFileURL) {
        map[item.fileID] = item.tempFileURL
      }
    })
    return map
  } catch (e) {
    console.error('resolveCloudUrls error:', e)
    return {}
  }
}

async function ensureUserId(connection, openid) {
  if (!openid) return null

  const [users] = await connection.query(
    'SELECT id FROM users WHERE openid = ? OR _openid = ? LIMIT 1',
    [openid, openid]
  )
  if (users && users[0] && users[0].id) {
    return users[0].id
  }

  try {
    const [result] = await connection.query(
      `INSERT INTO users (
        openid, _openid, member_level, points, total_points,
        order_count, total_spent, status, last_login_at, created_at, updated_at
      ) VALUES (?, ?, 1, 0, 0, 0, 0.00, 'active', NOW(), NOW(), NOW())`,
      [openid, openid]
    )
    return result.insertId
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') {
      const [retryUsers] = await connection.query(
        'SELECT id FROM users WHERE openid = ? OR _openid = ? LIMIT 1',
        [openid, openid]
      )
      if (retryUsers && retryUsers[0] && retryUsers[0].id) {
        return retryUsers[0].id
      }
    }
    throw err
  }
}

async function syncMemberLevelByUserId(connection, userId) {
  const uid = Number(userId)
  if (!uid || Number.isNaN(uid)) return
  await connection.query(
    `UPDATE users
     SET member_level = CASE
       WHEN IFNULL(total_points, 0) >= 60000 THEN 6
       WHEN IFNULL(total_points, 0) >= 30000 THEN 5
       WHEN IFNULL(total_points, 0) >= 10000 THEN 4
       WHEN IFNULL(total_points, 0) >= 3000 THEN 3
       WHEN IFNULL(total_points, 0) >= 1000 THEN 2
       ELSE 1
     END,
     updated_at = NOW()
     WHERE id = ?`,
    [uid]
  )
}

async function insertBindPointsLog(connection, userId, openid, points, balanceAfter, sn) {
  const remark = `绑定剪刀奖励：${sn}`
  try {
    await connection.query(
      `INSERT INTO points_logs (user_id, openid, _openid, change_type, points, balance, order_id, reason, remark, created_at)
       VALUES (?, ?, ?, 'activity_reward', ?, ?, NULL, 'bind_scissors', ?, NOW())`,
      [userId, openid, openid, points, balanceAfter, remark]
    )
  } catch (err) {
    if (err && err.code === 'ER_BAD_FIELD_ERROR') {
      await connection.query(
        `INSERT INTO points_logs (user_id, openid, change_type, points, balance, order_id, remark, created_at)
         VALUES (?, ?, 'activity_reward', ?, ?, NULL, ?, NOW())`,
        [userId, openid, points, balanceAfter, remark]
      )
      return
    }
    throw err
  }
}

function toDateOnly(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10)
  }
  return date.toISOString().slice(0, 10)
}

function addMonths(date, months) {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return new Date()
  d.setMonth(d.getMonth() + months)
  return d
}

function resolveActivationDate(createdAt) {
  const now = new Date()
  const created = new Date(createdAt || now)
  if (Number.isNaN(created.getTime())) {
    return now
  }
  const autoStartAt = addMonths(created, 1)
  return now > autoStartAt ? autoStartAt : now
}

const AFTER_SALE_OPEN_STATUSES = ['submitted', 'awaiting_shipment', 'shipped', 'received', 'inspecting', 'repairing', 'replacement_pending', 'awaiting_user', 'returning']
const AFTER_SALE_ALL_STATUSES = [...AFTER_SALE_OPEN_STATUSES, 'completed', 'rejected', 'cancelled']

function cleanAfterSaleText(value, maxLength) {
  return String(value || '').trim().replace(/[\r\n]{3,}/g, '\n\n').slice(0, maxLength)
}

function createAfterSaleRequestNo() {
  const now = new Date()
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  return `AS${date}${Math.random().toString(36).slice(2, 8).toUpperCase()}`
}

async function getAfterSaleRecords(connection, bindingId) {
  const [records] = await connection.query(
    `SELECT id, request_no, service_type, issue_description, status, seller_message,
            seller_message_at, replacement_sn, created_at, updated_at,
            recipient_name, recipient_phone, recipient_address_text,
            service_contact, service_phone, service_address_text,
            return_carrier, return_tracking_no, return_shipped_at, return_freight_amount,
            outbound_carrier, outbound_tracking_no, outbound_shipped_at,
            freight_coupon_status, freight_coupon_note
       FROM scissors_after_sales
      WHERE user_scissors_id = ?
      ORDER BY created_at DESC`,
    [bindingId]
  )
  if (!records || records.length === 0) return []
  const ids = records.map(row => row.id)
  const placeholders = ids.map(() => '?').join(',')
  const [messages] = await connection.query(
    `SELECT id, after_sale_id, sender_role, content, created_at
       FROM scissors_after_sale_messages
      WHERE after_sale_id IN (${placeholders}) AND visible_to_user = 1
      ORDER BY created_at ASC`,
    ids
  )
  const grouped = {}
  ;(messages || []).forEach(message => {
    if (!grouped[message.after_sale_id]) grouped[message.after_sale_id] = []
    grouped[message.after_sale_id].push(message)
  })
  return records.map(record => ({ ...record, messages: grouped[record.id] || [] }))
}

function getAfterSaleAdminUid() {
  try {
    const identity = authApp.auth().getUserInfo()
    return identity.uid || identity.customUserId || identity.openId || ''
  } catch (error) {
    console.warn('读取售后管理员身份失败:', error.message)
    return ''
  }
}

function requireAfterSaleAdmin(openid) {
  const admins = String(process.env.ADMIN_OPENIDS || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
  const adminUids = String(process.env.ADMIN_UIDS || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
  const uid = getAfterSaleAdminUid()
  if (!admins.includes(openid) && !adminUids.includes(uid)) throw new Error('无管理员权限')
}

exports.main = async (event, context) => {
  const { action, ...params } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  const needAuth = ['list', 'bind', 'unbind', 'warranty', 'afterSaleDetail', 'afterSaleApply', 'afterSaleShip']
  if (needAuth.includes(action) && !openid) {
    return { success: false, error: '需要登录' }
  }

  let connection
  try {
    connection = await getConnection()

    if (action === 'list') {
      const scissorColumns = await getScissorsColumns(connection)
      const specMatchCondition = buildSpecMatchCondition(scissorColumns, 'ps2', 's')
      const specMatchOrder = buildSpecMatchOrder(scissorColumns, 'ps2', 's')
      const specIdSelect = columnExpr('s', 'spec_id', scissorColumns)
      const skuSelect = columnExpr('s', 'sku', scissorColumns)
      const specNameSelect = columnExpr('s', 'spec_name', scissorColumns)
      const scissorCardImageSelect = columnExpr('s', 'card_image', scissorColumns)
      const scissorImageSelect = columnExpr('s', 'image', scissorColumns)

      const [rows] = await connection.query(
        `SELECT
          us.*,
          us.image AS user_image,
          s.product_id,
          ${specIdSelect} AS spec_id_snapshot,
          ${skuSelect} AS sku_snapshot,
          ${specNameSelect} AS spec_name_snapshot,
          ${scissorCardImageSelect} AS scissors_card_image,
          ${scissorImageSelect} AS scissors_image,
          p.cover_image AS product_cover_image,
          ps.id AS matched_spec_id,
          ps.name AS matched_spec_name,
          ps.sku AS matched_spec_sku,
          ps.card_image AS spec_card_image,
          ps.image AS spec_image,
          ps_single.card_image AS single_spec_card_image,
          ps_single.image AS single_spec_image
         FROM user_scissors us
         LEFT JOIN scissors s ON s.id = us.scissors_id AND s.deleted_at IS NULL
         LEFT JOIN products p ON p.id = s.product_id
         LEFT JOIN product_specs ps ON ps.id = (
           SELECT ps2.id
           FROM product_specs ps2
           WHERE ps2.product_id = s.product_id
             AND (${specMatchCondition})
           ORDER BY ${specMatchOrder}, ps2.sort_order ASC, ps2.id ASC
           LIMIT 1
         )
         LEFT JOIN (
           SELECT product_id, MIN(id) AS first_spec_id, COUNT(*) AS spec_count
           FROM product_specs
           GROUP BY product_id
         ) spec_stat ON spec_stat.product_id = s.product_id
         LEFT JOIN product_specs ps_single
           ON ps_single.id = spec_stat.first_spec_id
          AND spec_stat.spec_count = 1
         WHERE us._openid = ?
         ORDER BY us.created_at DESC`,
        [openid]
      )

      const urlMap = await resolveCloudUrls(
        (rows || [])
          .map(row => resolveCardImage(row))
          .filter(Boolean)
      )
      const items = (rows || []).map(row => normalizeScissorsItem(row, urlMap))

      return { success: true, data: items }
    }

    if (action === 'bind') {
      const { sn } = params
      const scissorColumns = await getScissorsColumns(connection)
      const specMatchCondition = buildSpecMatchCondition(scissorColumns, 'ps2', 's')
      const specMatchOrder = buildSpecMatchOrder(scissorColumns, 'ps2', 's')
      const specIdSelect = columnExpr('s', 'spec_id', scissorColumns)
      const skuSelect = columnExpr('s', 'sku', scissorColumns)
      const specNameSelect = columnExpr('s', 'spec_name', scissorColumns)
      const scissorCardImageSelect = columnExpr('s', 'card_image', scissorColumns)
      const scissorImageSelect = columnExpr('s', 'image', scissorColumns)

      const [rows] = await connection.query(
        `SELECT
          s.id,
          s.sn,
          s.model,
          s.product_id,
          s.points_value,
          s.created_at,
          ${specIdSelect} AS spec_id_snapshot,
          ${skuSelect} AS sku_snapshot,
          ${specNameSelect} AS spec_name_snapshot,
          ${scissorCardImageSelect} AS scissors_card_image,
          ${scissorImageSelect} AS scissors_image,
          p.name AS product_name,
          p.cover_image AS product_cover_image,
          p.warranty_months,
          ps.id AS matched_spec_id,
          ps.name AS matched_spec_name,
          ps.sku AS matched_spec_sku,
          ps.card_image AS spec_card_image,
          ps.image AS spec_image,
          ps_single.card_image AS single_spec_card_image,
          ps_single.image AS single_spec_image
         FROM scissors s
         LEFT JOIN products p ON p.id = s.product_id
         LEFT JOIN product_specs ps ON ps.id = (
           SELECT ps2.id
           FROM product_specs ps2
           WHERE ps2.product_id = s.product_id
             AND (${specMatchCondition})
           ORDER BY ${specMatchOrder}, ps2.sort_order ASC, ps2.id ASC
           LIMIT 1
         )
         LEFT JOIN (
           SELECT product_id, MIN(id) AS first_spec_id, COUNT(*) AS spec_count
           FROM product_specs
           GROUP BY product_id
         ) spec_stat ON spec_stat.product_id = s.product_id
         LEFT JOIN product_specs ps_single
           ON ps_single.id = spec_stat.first_spec_id
          AND spec_stat.spec_count = 1
         WHERE s.sn = ? AND s.deleted_at IS NULL LIMIT 1`,
        [sn]
      )

      if (!rows || rows.length === 0) {
        return { success: false, error: '剪刀序列号不存在' }
      }

      const d = rows[0]

      const warrantyMonths = Number(d.warranty_months) || 0
      const activationDateObj = resolveActivationDate(d.created_at)
      const activationDate = toDateOnly(activationDateObj)
      const warrantyExpire = warrantyMonths > 0
        ? toDateOnly(addMonths(activationDateObj, warrantyMonths))
        : '2099-12-31'
      const cardImage = resolveCardImage(d) || ''
      const productName = d.product_name || d.name || ''
      const awardPoints = Math.max(0, parseInt(String(d.points_value || 0), 10) || 0)

      await connection.beginTransaction()
      try {
        const [existing] = await connection.query(
          'SELECT id FROM user_scissors WHERE scissors_id = ? LIMIT 1 FOR UPDATE',
          [d.id]
        )

        if (existing && existing.length > 0) {
          await connection.rollback()
          return { success: false, error: '该剪刀已被绑定' }
        }

        const userId = await ensureUserId(connection, openid)
        if (!userId) {
          await connection.rollback()
          return { success: false, error: '用户信息初始化失败，请重新登录后再试' }
        }

        const [userRows] = await connection.query(
          'SELECT points, total_points FROM users WHERE id = ? LIMIT 1 FOR UPDATE',
          [userId]
        )
        const currentPoints = userRows && userRows[0] ? Number(userRows[0].points) || 0 : 0

        await connection.query(
          'INSERT INTO user_scissors (_openid, user_id, scissors_id, sn, name, model, image, activation_date, warranty_months, warranty_expire, status, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "active", "bind")',
          [openid, userId, d.id, d.sn, productName, d.model, cardImage, activationDate, warrantyMonths, warrantyExpire]
        )

        if (awardPoints > 0) {
          const balanceAfter = currentPoints + awardPoints
          await connection.query(
            'UPDATE users SET points = points + ?, total_points = total_points + ?, updated_at = NOW() WHERE id = ?',
            [awardPoints, awardPoints, userId]
          )
          await syncMemberLevelByUserId(connection, userId)
          await insertBindPointsLog(connection, userId, openid, awardPoints, balanceAfter, d.sn)
        }

        await connection.commit()
      } catch (err) {
        await connection.rollback()
        throw err
      }

      return {
        success: true,
        data: {
          id: d.id,
          sn: d.sn,
          name: productName,
          points_awarded: awardPoints,
          spec_id: d.matched_spec_id || d.spec_id_snapshot || null,
          spec_name: d.matched_spec_name || d.spec_name_snapshot || '',
          sku: d.matched_spec_sku || d.sku_snapshot || '',
          card_image: cardImage
        }
      }
    }

    if (action === 'unbind') {
      const { id } = params
      await connection.query(
        'DELETE FROM user_scissors WHERE id = ? AND _openid = ?',
        [id, openid]
      )
      return { success: true }
    }

    if (action === 'warranty') {
      const { sn } = params
      const scissorColumns = await getScissorsColumns(connection)
      const specMatchCondition = buildSpecMatchCondition(scissorColumns, 'ps2', 's')
      const specMatchOrder = buildSpecMatchOrder(scissorColumns, 'ps2', 's')
      const specIdSelect = columnExpr('s', 'spec_id', scissorColumns)
      const skuSelect = columnExpr('s', 'sku', scissorColumns)
      const specNameSelect = columnExpr('s', 'spec_name', scissorColumns)
      const scissorCardImageSelect = columnExpr('s', 'card_image', scissorColumns)
      const scissorImageSelect = columnExpr('s', 'image', scissorColumns)

      const [scissors] = await connection.query(
        `SELECT
          s.sn,
          s.model,
          ${specIdSelect} AS spec_id_snapshot,
          ${skuSelect} AS sku_snapshot,
          ${specNameSelect} AS spec_name_snapshot,
          ${scissorCardImageSelect} AS scissors_card_image,
          ${scissorImageSelect} AS scissors_image,
          p.name,
          p.cover_image AS product_cover_image,
          p.warranty_months,
          ps.id AS matched_spec_id,
          ps.name AS matched_spec_name,
          ps.sku AS matched_spec_sku,
          ps.card_image AS spec_card_image,
          ps.image AS spec_image,
          ps_single.card_image AS single_spec_card_image,
          ps_single.image AS single_spec_image
         FROM scissors s
         LEFT JOIN products p ON p.id = s.product_id
         LEFT JOIN product_specs ps ON ps.id = (
           SELECT ps2.id
           FROM product_specs ps2
           WHERE ps2.product_id = s.product_id
             AND (${specMatchCondition})
           ORDER BY ${specMatchOrder}, ps2.sort_order ASC, ps2.id ASC
           LIMIT 1
         )
         LEFT JOIN (
           SELECT product_id, MIN(id) AS first_spec_id, COUNT(*) AS spec_count
           FROM product_specs
           GROUP BY product_id
         ) spec_stat ON spec_stat.product_id = s.product_id
         LEFT JOIN product_specs ps_single
           ON ps_single.id = spec_stat.first_spec_id
          AND spec_stat.spec_count = 1
         WHERE s.sn = ? LIMIT 1`,
        [sn]
      )

      if (!scissors || scissors.length === 0) {
        return { success: false, error: '剪刀序列号不存在' }
      }

      const row = scissors[0]
      return {
        success: true,
        data: {
          ...row,
          spec_id: row.matched_spec_id || row.spec_id_snapshot || null,
          spec_name: row.matched_spec_name || row.spec_name_snapshot || '',
          sku: row.matched_spec_sku || row.sku_snapshot || '',
          card_image: resolveCardImage(row)
        }
      }
    }

    if (action === 'afterSaleDetail') {
      const bindingId = Number(params.bindingId)
      if (!bindingId) return { success: false, error: '剪刀信息无效' }
      const [rows] = await connection.query(
        `SELECT us.id, us.scissors_id, us.sn, us.name, us.model, us.image, us.warranty_expire,
                p.name AS product_name, p.cover_image
           FROM user_scissors us
           LEFT JOIN scissors s ON s.id = us.scissors_id AND s.deleted_at IS NULL
           LEFT JOIN products p ON p.id = s.product_id
          WHERE us.id = ? AND us._openid = ?
          LIMIT 1`,
        [bindingId, openid]
      )
      if (!rows || !rows[0]) return { success: false, error: '无权查看该剪刀的售后信息' }
      const d = rows[0]
      const image = d.image || d.cover_image || ''
      const urlMap = await resolveCloudUrls([image])
      return {
        success: true,
        data: {
          scissors: {
            id: d.id,
            sn: d.sn,
            name: d.product_name || d.name,
            model: d.model,
            image: urlMap[image] || image,
            warranty_expire: d.warranty_expire
          },
          records: await getAfterSaleRecords(connection, bindingId)
        }
      }
    }

    if (action === 'afterSaleApply') {
      const bindingId = Number(params.bindingId)
      const recipientAddressId = Number(params.recipientAddressId)
      const serviceType = params.serviceType
      const description = cleanAfterSaleText(params.description, 500)
      if (!bindingId || !recipientAddressId || !['repair', 'replacement'].includes(serviceType)) {
        return { success: false, error: '售后类型或剪刀信息无效' }
      }
      if (description.length < 5) return { success: false, error: '请至少说明 5 个字的问题' }

      await connection.beginTransaction()
      try {
        const [bindings] = await connection.query(
          'SELECT id, user_id, scissors_id, sn FROM user_scissors WHERE id = ? AND _openid = ? LIMIT 1 FOR UPDATE',
          [bindingId, openid]
        )
        if (!bindings || !bindings[0]) throw new Error('无权为该剪刀申请售后')
        const binding = bindings[0]
        const [addressRows] = await connection.query(
          `SELECT id, name, contact, phone, province, city, district, detail
             FROM addresses WHERE id = ? AND openid = ? LIMIT 1 FOR UPDATE`,
          [recipientAddressId, openid]
        )
        if (!addressRows || !addressRows[0]) throw new Error('请选择有效的收货地址')
        const address = addressRows[0]
        const recipientName = address.name || address.contact || ''
        const recipientAddress = [address.province, address.city, address.district, address.detail].filter(Boolean).join('')
        if (!recipientName || !address.phone || !recipientAddress) throw new Error('收货地址信息不完整')
        const placeholders = AFTER_SALE_OPEN_STATUSES.map(() => '?').join(',')
        const [openRequests] = await connection.query(
          `SELECT id FROM scissors_after_sales
            WHERE user_scissors_id = ? AND status IN (${placeholders})
            LIMIT 1 FOR UPDATE`,
          [bindingId, ...AFTER_SALE_OPEN_STATUSES]
        )
        if (openRequests && openRequests.length > 0) throw new Error('该剪刀已有处理中售后申请')
        const requestNo = createAfterSaleRequestNo()
        const [result] = await connection.query(
          `INSERT INTO scissors_after_sales
            (request_no, user_id, openid, _openid, user_scissors_id, scissors_id, sn, service_type, issue_description, status,
             recipient_name, recipient_phone, recipient_address_text)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?, ?)`,
          [requestNo, binding.user_id, openid, openid, bindingId, binding.scissors_id, binding.sn, serviceType, description,
            recipientName, address.phone, recipientAddress]
        )
        await connection.query(
          `INSERT INTO scissors_after_sale_messages
            (after_sale_id, sender_role, sender_id, content, visible_to_user)
           VALUES (?, 'user', ?, ?, 1)`,
          [result.insertId, binding.user_id, description]
        )
        await connection.commit()
        return { success: true, data: { id: result.insertId, requestNo } }
      } catch (error) {
        await connection.rollback()
        throw error
      }
    }

    if (action === 'afterSaleShip') {
      const requestId = Number(params.requestId)
      const carrier = cleanAfterSaleText(params.carrier, 50)
      const trackingNo = cleanAfterSaleText(params.trackingNo, 64)
      const freightAmount = Number(params.freightAmount)
      if (!requestId || !carrier || !trackingNo || Number.isNaN(freightAmount) || freightAmount < 0) {
        return { success: false, error: '请填写快递公司、单号与实际运费' }
      }
      const [result] = await connection.query(
        `UPDATE scissors_after_sales
            SET return_carrier = ?, return_tracking_no = ?, return_shipped_at = NOW(),
                return_freight_amount = ?, status = 'shipped', updated_at = NOW()
          WHERE id = ? AND _openid = ? AND status = 'awaiting_shipment'`,
        [carrier, trackingNo, freightAmount, requestId, openid]
      )
      if (!result.affectedRows) return { success: false, error: '当前售后单暂不可填写寄回物流' }
      await connection.query(
        `INSERT INTO scissors_after_sale_messages
          (after_sale_id, sender_role, content, visible_to_user)
         VALUES (?, 'user', ?, 1)`,
        [requestId, `已寄回：${carrier} ${trackingNo}`]
      )
      return { success: true, data: { id: requestId } }
    }

    // 管理端预留：需通过 ADMIN_OPENIDS 显式授权后才可调用。
    if (['afterSaleAdminList', 'afterSaleAdminUpdate', 'afterSaleAdminReply', 'afterSaleServiceAddressList', 'afterSaleServiceAddressSave'].includes(action)) {
      requireAfterSaleAdmin(openid)
    }

    if (action === 'afterSaleAdminList') {
      const status = params.status
      const keyword = cleanAfterSaleText(params.keyword, 64)
      const serviceType = params.serviceType
      const values = []
      let where = 'WHERE 1 = 1'
      if (status && AFTER_SALE_ALL_STATUSES.includes(status)) {
        where += ' AND asa.status = ?'
        values.push(status)
      }
      if (keyword) {
        where += ' AND (asa.request_no LIKE ? OR asa.sn LIKE ?)'
        values.push(`%${keyword}%`, `%${keyword}%`)
      }
      if (['repair', 'replacement'].includes(serviceType)) {
        where += ' AND asa.service_type = ?'
        values.push(serviceType)
      }
      const [rows] = await connection.query(
        `SELECT asa.*, u.username, u.phone
           FROM scissors_after_sales asa LEFT JOIN users u ON u.id = asa.user_id
           ${where} ORDER BY asa.created_at DESC LIMIT 100`,
        values
      )
      return { success: true, data: rows || [] }
    }

    if (action === 'afterSaleServiceAddressList') {
      const [rows] = await connection.query(
        `SELECT id, label, contact, phone, province, city, district, detail, is_enabled, sort_order
           FROM after_sale_service_addresses ORDER BY is_enabled DESC, sort_order ASC, id DESC`
      )
      return { success: true, data: rows || [] }
    }

    if (action === 'afterSaleServiceAddressSave') {
      const payload = params.address || {}
      const id = Number(payload.id)
      const label = cleanAfterSaleText(payload.label, 50)
      const contact = cleanAfterSaleText(payload.contact, 50)
      const phone = cleanAfterSaleText(payload.phone, 20)
      const province = cleanAfterSaleText(payload.province, 50)
      const city = cleanAfterSaleText(payload.city, 50)
      const district = cleanAfterSaleText(payload.district, 50)
      const detail = cleanAfterSaleText(payload.detail, 200)
      if (!label || !contact || !phone || !detail) return { success: false, error: '售后收件地址信息不完整' }
      if (id) {
        await connection.query(
          `UPDATE after_sale_service_addresses
              SET label=?, contact=?, phone=?, province=?, city=?, district=?, detail=?,
                  is_enabled=?, sort_order=?, updated_at=NOW() WHERE id=?`,
          [label, contact, phone, province, city, district, detail, payload.is_enabled === false ? 0 : 1, Number(payload.sort_order) || 0, id]
        )
        return { success: true, data: { id } }
      }
      const [result] = await connection.query(
        `INSERT INTO after_sale_service_addresses
          (label, contact, phone, province, city, district, detail, is_enabled, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [label, contact, phone, province, city, district, detail, payload.is_enabled === false ? 0 : 1, Number(payload.sort_order) || 0]
      )
      return { success: true, data: { id: result.insertId } }
    }

    if (action === 'afterSaleAdminUpdate') {
      const id = Number(params.id)
      const status = params.status
      const serviceAddressId = Number(params.serviceAddressId)
      if (!id || !AFTER_SALE_ALL_STATUSES.includes(status)) return { success: false, error: '售后状态无效' }
      let service = null
      if (serviceAddressId) {
        const [addresses] = await connection.query(
          `SELECT id, contact, phone, province, city, district, detail
             FROM after_sale_service_addresses WHERE id = ? AND is_enabled = 1 LIMIT 1`,
          [serviceAddressId]
        )
        service = addresses && addresses[0]
        if (!service) return { success: false, error: '售后收件地址不可用' }
      }
      const serviceAddressText = service ? [service.province, service.city, service.district, service.detail].filter(Boolean).join('') : null
      const [result] = await connection.query(
        `UPDATE scissors_after_sales
            SET status=?, service_address_id=?, service_contact=?, service_phone=?, service_address_text=?,
                replacement_sn=NULLIF(?, ''), outbound_carrier=NULLIF(?, ''), outbound_tracking_no=NULLIF(?, ''),
                outbound_shipped_at=CASE WHEN ? <> '' THEN NOW() ELSE outbound_shipped_at END,
                freight_coupon_status=?, freight_coupon_note=NULLIF(?, ''), handled_by_name=?, updated_at=NOW()
          WHERE id=?`,
        [status, service ? service.id : null, service ? service.contact : null, service ? service.phone : null, serviceAddressText,
          cleanAfterSaleText(params.replacementSn, 32), cleanAfterSaleText(params.outboundCarrier, 50), cleanAfterSaleText(params.outboundTrackingNo, 64),
          cleanAfterSaleText(params.outboundTrackingNo, 64), ['none', 'pending', 'issued', 'failed'].includes(params.freightCouponStatus) ? params.freightCouponStatus : 'none',
          cleanAfterSaleText(params.freightCouponNote, 255), process.env.ADMIN_DISPLAY_NAME || '售后专员', id]
      )
      if (!result.affectedRows) return { success: false, error: '售后单不存在' }
      return { success: true, data: { id, status } }
    }

    if (action === 'afterSaleAdminReply') {
      const id = Number(params.id)
      const content = cleanAfterSaleText(params.content, 1000)
      if (!id || !content) return { success: false, error: '请输入卖家留言' }
      await connection.beginTransaction()
      try {
        const [rows] = await connection.query('SELECT id FROM scissors_after_sales WHERE id = ? LIMIT 1 FOR UPDATE', [id])
        if (!rows || !rows[0]) throw new Error('售后单不存在')
        await connection.query(
          `INSERT INTO scissors_after_sale_messages (after_sale_id, sender_role, content, visible_to_user)
           VALUES (?, 'seller', ?, 1)`, [id, content]
        )
        await connection.query(
          `UPDATE scissors_after_sales SET seller_message=?, seller_message_at=NOW(), handled_by_name=?, updated_at=NOW() WHERE id=?`,
          [content, process.env.ADMIN_DISPLAY_NAME || '售后专员', id]
        )
        await connection.commit()
        return { success: true, data: { id } }
      } catch (error) {
        await connection.rollback()
        throw error
      }
    }

    return { success: false, error: '未知操作' }
  } catch (error) {
    console.error('Scissors error:', error)
    return { success: false, error: error.message }
  } finally {
    if (connection) {
      connection.release()
    }
  }
}
