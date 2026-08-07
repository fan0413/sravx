/**
 * 优惠券云函数 - 使用 MySQL 数据库
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
    p = null
    pool = null
    p = await getPool()
    return await p.getConnection()
  }
}

async function ensureCouponCodes(connection) {
  await connection.query(
    `UPDATE coupons
     SET coupon_code = CONCAT('JM', DATE_FORMAT(expire_time, '%Y%m%d'), LPAD(id, 5, '0'))
     WHERE coupon_code IS NULL OR coupon_code = ''`
  )
}

exports.main = async (event, context) => {
  const { action, ...params } = event
  const nestedParams = params.params && typeof params.params === 'object' ? params.params : null
  const normalizedAction = (nestedParams && nestedParams.action) || action || 'list'
  const requestParams = nestedParams ? { ...params, ...nestedParams } : params
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  const needAuth = ['my', 'receive']
  if (needAuth.includes(normalizedAction) && !openid) {
    return { success: false, error: '需要登录' }
  }

  let connection
  try {
    connection = await getConnection()
    await ensureCouponCodes(connection)

    // 获取可领取的优惠券（仅满减券）
    if (['list', 'available', 'getAvailable', 'listAvailable'].includes(normalizedAction)) {
      const [rows] = await connection.query(
        `SELECT *,
                COALESCE(coupon_code, CONCAT('JM', DATE_FORMAT(expire_time, '%Y%m%d'), LPAD(id, 5, '0'))) AS coupon_code
         FROM coupons
         WHERE status = "active"
           AND type = "fixed"
           AND remain_count > 0
           AND start_time <= NOW()
           AND expire_time > NOW()
            AND deleted_at IS NULL
          ORDER BY created_at DESC`
      )
      return { success: true, data: rows }
    }

    // 获取我的优惠券
    if (normalizedAction === 'my') {
      const { status = 'unused' } = requestParams
      let sql = 'SELECT c.*, COALESCE(c.coupon_code, CONCAT("JM", DATE_FORMAT(c.expire_time, "%Y%m%d"), LPAD(c.id, 5, "0"))) AS coupon_code, uc.id as user_coupon_id, uc.received_at, uc.used_at FROM user_coupons uc ' +
                'JOIN coupons c ON uc.coupon_id = c.id ' +
                'WHERE uc._openid = ? AND c.type = "fixed" AND c.deleted_at IS NULL'
      const values = [openid]
      
      if (status === 'unused') {
        sql += ' AND uc.status = "unused" AND c.expire_time > NOW()'
      } else if (status === 'used') {
        sql += ' AND uc.status = "used"'
      } else if (status === 'expired') {
        sql += ' AND c.expire_time <= NOW()'
      }
      
      sql += ' ORDER BY uc.received_at DESC LIMIT 1000'

      const [rows] = await connection.query(sql, values)
      return { success: true, data: rows }
    }

    // 领取优惠券
    if (normalizedAction === 'receive') {
      const { couponId } = requestParams
      
      const [coupons] = await connection.query(
        'SELECT * FROM coupons WHERE id = ? AND status = "active" AND type = "fixed" AND remain_count > 0 AND start_time <= NOW() AND expire_time > NOW() AND deleted_at IS NULL LIMIT 1',
        [couponId]
      )
      
      if (!coupons || coupons.length === 0) {
        return { success: false, error: '优惠券不存在或已领完' }
      }

      // 检查是否已领取
      const [existing] = await connection.query(
        'SELECT id FROM user_coupons WHERE _openid = ? AND coupon_id = ? LIMIT 1',
        [openid, couponId]
      )
      
      if (existing && existing.length > 0) {
        return { success: false, error: '已领取过该优惠券' }
      }

      // 领取
      await connection.query(
        'INSERT INTO user_coupons (_openid, coupon_id, status, received_at) VALUES (?, ?, "unused", NOW())',
        [openid, couponId]
      )
      
      // 减少库存
      await connection.query(
        'UPDATE coupons SET remain_count = remain_count - 1 WHERE id = ?',
        [couponId]
      )
      
      return { success: true }
    }

    // 检查优惠券是否可用
    if (normalizedAction === 'check') {
      const { couponId, orderAmount } = requestParams
      const [coupons] = await connection.query(
        'SELECT * FROM coupons WHERE id = ? AND status = "active" AND type = "fixed" AND start_time <= NOW() AND expire_time > NOW() AND deleted_at IS NULL LIMIT 1',
        [couponId]
      )
      
      if (!coupons || coupons.length === 0) {
        return { success: false, error: '优惠券不存在' }
      }
      
      const coupon = coupons[0]
      if (orderAmount < coupon.min_amount) {
        return { success: false, error: `订单金额需满${coupon.min_amount}元` }
      }
      
      return { success: true, data: coupon }
    }

    return { success: false, error: '未知操作' }
  } catch (error) {
    console.error('Coupon error:', error)
    return { success: false, error: error.message }
  } finally {
    if (connection) {
      connection.release()
    }
  }
}
