/**
 * 用户云函数 - 使用 MySQL 数据库
 */
const cloud = require('wx-server-sdk')
const mysql = require('mysql2/promise')

cloud.init({
  env: process.env.ENV_ID || 'cloud1-8gk3bptqefbf01d6'
})

// MySQL 连接配置
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

function calcMemberLevel(totalPoints) {
  const tp = parseInt(totalPoints) || 0
  if (tp >= 40000) return 6  // 约 60 把：区域领袖/大型学校
  if (tp >= 20000) return 5  // 约 30 把：资深店长/高产美容师
  if (tp >= 8000)  return 4  // 约 12 把：职业忠粉
  if (tp >= 3000)  return 3  // 约 5 把：熟客
  if (tp >= 1200)  return 2  // 约 2 把：回头客
  return 1
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

function normalizeDateOnly(value) {
  if (!value) return ''
  if (typeof value === 'string') {
    const match = value.match(/^\d{4}-\d{2}-\d{2}/)
    return match ? match[0] : ''
  }
  if (value instanceof Date && !isNaN(value.getTime())) {
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return ''
}

async function ensureProfileUpdatedAtColumn(connection) {
  const [columns] = await connection.query("SHOW COLUMNS FROM users LIKE 'profile_updated_at'")
  if (!columns || columns.length === 0) {
    await connection.query(
      "ALTER TABLE users ADD COLUMN profile_updated_at DATETIME NULL COMMENT '资料最近修改时间' AFTER updated_at"
    )
  }
}

exports.main = async (event, context) => {
  const { action, ...params } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  const needAuth = ['getInfo', 'updateInfo', 'getPoints', 'getPointsLogs', 'getMemberLevel']
  if (needAuth.includes(action) && !openid) {
    return { success: false, error: '需要登录' }
  }

  let connection
  try {
    connection = await getConnection()

    // 获取用户信息
    if (action === 'getInfo') {
      const [rows] = await connection.query(
        'SELECT * FROM users WHERE openid = ? LIMIT 1',
        [openid]
      )

      if (rows && rows.length > 0) {
        const userData = { ...rows[0] }
        userData.birthday = normalizeDateOnly(userData.birthday)
        // 动态计算会员等级（基于累积积分）
        userData.member_level = calcMemberLevel(userData.total_points || 0)
        return { success: true, data: userData }
      }
      return { success: false, error: '用户不存在' }
    }

    // 更新用户信息
    if (action === 'updateInfo') {
      const { username, avatar, phone, gender, birthday, occupation } = params
      const enforceMonthlyLimit = params.enforceMonthlyLimit === true || params.enforceMonthlyLimit === 'true'

      if (enforceMonthlyLimit) {
        await ensureProfileUpdatedAtColumn(connection)
      }

      const [rows] = await connection.execute(
        'SELECT id FROM users WHERE openid = ? LIMIT 1',
        [openid]
      )

      if (!rows || rows.length === 0) {
        return { success: false, error: '用户不存在' }
      }

      if (enforceMonthlyLimit) {
        const [quotaRows] = await connection.execute(
          `SELECT
             profile_updated_at,
             profile_updated_at >= DATE_FORMAT(NOW(), '%Y-%m-01') AS changed_this_month,
             DATE_FORMAT(DATE_ADD(LAST_DAY(NOW()), INTERVAL 1 DAY), '%Y-%m-%d') AS next_available_date
           FROM users
           WHERE openid = ?
           LIMIT 1`,
          [openid]
        )
        const quota = quotaRows && quotaRows[0] ? quotaRows[0] : {}
        if (Number(quota.changed_this_month) === 1) {
          return {
            success: false,
            error: `本月已修改过资料，请于 ${quota.next_available_date || '下个月'} 后再试`
          }
        }
      }

      const updateFields = []
      const updateValues = []

      if (hasOwn(params, 'username')) {
        updateFields.push('username = ?')
        updateValues.push(username || '')
      }
      if (hasOwn(params, 'avatar')) {
        updateFields.push('avatar = ?')
        updateValues.push(avatar || '')
      }
      if (hasOwn(params, 'phone')) {
        updateFields.push('phone = ?')
        updateValues.push(phone || '')
      }
      if (hasOwn(params, 'gender')) {
        updateFields.push('gender = ?')
        updateValues.push(gender || '')
      }
      if (hasOwn(params, 'birthday')) {
        updateFields.push('birthday = ?')
        updateValues.push(normalizeDateOnly(birthday))
      }
      if (hasOwn(params, 'occupation')) {
        updateFields.push('occupation = ?')
        updateValues.push(occupation || '')
      }
      if (enforceMonthlyLimit) {
        updateFields.push('profile_updated_at = NOW()')
      }

      updateFields.push('updated_at = NOW()')
      updateValues.push(openid)

      const updateSql = enforceMonthlyLimit
        ? `UPDATE users SET ${updateFields.join(', ')}
           WHERE openid = ?
             AND (profile_updated_at IS NULL OR profile_updated_at < DATE_FORMAT(NOW(), '%Y-%m-01'))`
        : `UPDATE users SET ${updateFields.join(', ')} WHERE openid = ?`
      const [updateResult] = await connection.execute(updateSql, updateValues)

      if (enforceMonthlyLimit && (!updateResult || updateResult.affectedRows === 0)) {
        return { success: false, error: '本月已修改过资料，请下个月再试' }
      }

      return { success: true, data: { message: '更新成功' } }
    }

    // 获取积分
    if (action === 'getPoints') {
      const [rows] = await connection.query(
        'SELECT points, total_points FROM users WHERE openid = ? LIMIT 1',
        [openid]
      )

      if (rows && rows.length > 0) {
        return {
          success: true,
          data: {
            points: rows[0].points || 0,
            total_points: rows[0].total_points || 0
          }
        }
      }
      return { success: false, error: '用户不存在' }
    }

    // 获取积分记录
    if (action === 'getPointsLogs') {
      const { page = 1, pageSize = 20 } = params
      const offset = (parseInt(page) - 1) * parseInt(pageSize)

      const [rows] = await connection.query(
        'SELECT * FROM points_logs WHERE openid = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [openid, parseInt(pageSize), offset]
      )

      return { success: true, data: rows || [] }
    }

    // 获取会员等级（根据累积积分动态计算）
    if (action === 'getMemberLevel') {
      const [rows] = await connection.query(
        'SELECT total_points, total_spent, order_count FROM users WHERE openid = ? LIMIT 1',
        [openid]
      )

      if (rows && rows.length > 0) {
        const totalPoints = rows[0].total_points || 0
        return {
          success: true,
          data: {
            member_level: calcMemberLevel(totalPoints),
            total_points: totalPoints,
            total_spent: rows[0].total_spent || 0,
            order_count: rows[0].order_count || 0
          }
        }
      }
      return { success: false, error: '用户不存在' }
    }

    return { success: false, error: '未知操作' }
  } catch (error) {
    console.error('User error:', error)
    return { success: false, error: error.message }
  } finally {
    if (connection) {
      connection.release()
    }
  }
}
