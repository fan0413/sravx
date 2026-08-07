/**
 * 剪刀云函数 - 使用 MySQL 数据库
 */
const cloud = require('wx-server-sdk')
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

exports.main = async (event, context) => {
  const { action, ...params } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  const needAuth = ['list', 'bind', 'unbind', 'warranty']
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
