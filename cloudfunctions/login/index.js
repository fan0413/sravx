/**
 * 登录云函数 - 使用 MySQL 数据库
 */
const cloud = require('wx-server-sdk')
const mysql = require('mysql2/promise')

cloud.init({
  env: process.env.ENV_ID || 'cloud1-8gk3bptqefbf01d6'
})

// MySQL 连接配置（凭证优先从环境变量读取）
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

// 获取连接池
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

function normalizeSqlParams(params) {
  return (params || []).map((value) => {
    if (value === undefined) return null
    if (typeof value === 'number' && Number.isNaN(value)) return null
    return value
  })
}

async function safeExecute(connection, sql, params = []) {
  const normalized = normalizeSqlParams(params)
  if (params.some((value) => value === undefined || (typeof value === 'number' && Number.isNaN(value)))) {
    console.warn('[DB] normalized invalid SQL params:', JSON.stringify({
      sql: String(sql).replace(/\s+/g, ' ').trim().slice(0, 160),
      params: normalized
    }))
  }
  return connection.execute(sql, normalized)
}

function cleanString(value, maxLength) {
  if (value === undefined || value === null) return null
  const text = String(value).trim()
  if (!text) return null
  return maxLength ? text.slice(0, maxLength) : text
}

function normalizeProfile(event) {
  const source = event && event.profile && typeof event.profile === 'object'
    ? event.profile
    : {}

  return {
    username: cleanString(source.username || source.nickname, 64),
    avatar: cleanString(source.avatar, 512),
    gender: cleanString(source.gender, 20),
    birthday: cleanString(source.birthday, 20),
    occupation: cleanString(source.occupation, 64)
  }
}

function appendProfileUpdate(sqlState, params, profile) {
  ;[
    ['username', profile.username],
    ['avatar', profile.avatar],
    ['gender', profile.gender],
    ['birthday', profile.birthday],
    ['occupation', profile.occupation]
  ].forEach(([column, value]) => {
    if (!value) return
    sqlState.value += `, ${column} = ?`
    params.push(value)
  })
}

function hasProfilePayload(profile) {
  return !!(profile && (
    profile.username ||
    profile.avatar ||
    profile.gender ||
    profile.birthday ||
    profile.occupation
  ))
}

// 根据累积积分计算会员等级
function calcMemberLevel(totalPoints) {
  const tp = parseInt(totalPoints) || 0
  if (tp >= 60000) return 6
  if (tp >= 30000) return 5
  if (tp >= 10000) return 4
  if (tp >= 3000) return 3
  if (tp >= 1000) return 2
  return 1
}

function memberLevelName(level) {
  const names = {
    1: 'LV1普通会员',
    2: 'LV2银卡会员',
    3: 'LV3金卡会员',
    4: 'LV4钻石会员',
    5: 'LV5黑钻会员',
    6: 'LV6至臻会员'
  }
  return names[level] || 'LV1普通会员'
}

async function syncMemberLevelByUserId(connection, userId) {
  const uid = Number(userId)
  if (!uid || Number.isNaN(uid)) return
  await safeExecute(connection,
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

exports.main = async (event, context) => {
  // 获取微信云开发自动注入的用户身份
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const unionid = wxContext.UNIONID
  const sessionKey = wxContext.SESSIONKEY  // 用于解密手机号

  if (!openid) {
    return { success: false, error: '缺少用户身份' }
  }

  const profile = normalizeProfile(event)
  const profileSaved = hasProfilePayload(profile)
  let phone = null
  let phoneSource = 'none'

  // 路径1：cloudID 解密（微信最新推荐方式，最可靠）
  if (!phone && event.cloudID) {
    try {
      const openDataRes = await cloud.getOpenData({
        list: [event.cloudID]
      })
      console.log('getOpenData raw:', JSON.stringify(openDataRes))
      if (openDataRes && openDataRes.list && openDataRes.list[0]) {
        const data = openDataRes.list[0]
        if (data.json) {
          const parsed = typeof data.json === 'string' ? JSON.parse(data.json) : data.json
          phone = parsed.phoneNumber || parsed.purePhoneNumber || null
          if (phone) phoneSource = 'cloud_id'
        }
        if (!phone && data.data && data.data.phoneNumber) {
          phone = data.data.phoneNumber
          phoneSource = 'cloud_id_data'
        }
      }
      console.log(`Phone from cloudID: ${phone ? 'ok' : 'empty'} (source=${phoneSource})`)
    } catch (err) {
      console.error('getOpenData error:', err && err.message)
    }
  }

  // 路径2：code 方式
  if (!phone && event.code) {
    try {
      const phoneRes = await cloud.openapi.phonenumber.getPhoneNumber({
        code: event.code
      })
      console.log('phonenumber raw:', JSON.stringify(phoneRes))
      if (phoneRes) {
        const info = phoneRes.phoneInfo || phoneRes.phone_info
        if (info) {
          phone = info.phoneNumber || info.purePhoneNumber || null
          if (phone) phoneSource = 'code_api'
        }
        if (!phone && phoneRes.phoneNumber) {
          phone = phoneRes.phoneNumber
          if (phone) phoneSource = 'code_direct'
        }
      }
      console.log(`Phone from code: ${phone ? 'ok' : 'empty'} (source=${phoneSource})`)
    } catch (err) {
      console.error('phonenumber error:', err && err.message)
    }
  }

  // 路径3：encryptedData + iv + sessionKey 手动解密
  if (!phone && event.encryptedData && event.iv && sessionKey) {
    try {
      const WXBizDataCrypt = require('./WXBizDataCrypt')
      const pc = new WXBizDataCrypt(sessionKey)
      const decryptData = pc.decryptData(event.encryptedData, event.iv)
      console.log('decryptData:', JSON.stringify(decryptData))
      if (decryptData) {
        phone = (decryptData.phoneInfo && decryptData.phoneInfo.phoneNumber) || decryptData.phoneNumber || null
        if (phone) phoneSource = 'encrypted_data'
      }
      console.log(`Phone from decrypt: ${phone ? 'ok' : 'empty'} (source=${phoneSource})`)
    } catch (err) {
      console.error('Phone decrypt error:', err && err.message)
    }
  }

  let connection
  try {
    const pool = await getPool()
    connection = await pool.getConnection()

    // 查询用户是否存在
    const [rows] = await safeExecute(connection,
      'SELECT * FROM users WHERE openid = ? LIMIT 1',
      [openid]
    )

    let user
    let isNewUser = false

    if (rows && rows.length > 0) {
      // 用户已存在，更新登录时间和手机号
      user = rows[0]

      // 构建更新字段
      const updateSql = { value: 'UPDATE users SET last_login_at = NOW()' }
      const updateParams = []

      // 如果有新手机号则更新
      if (phone) {
        updateSql.value += ', phone = ?'
        updateParams.push(phone)
      }

      appendProfileUpdate(updateSql, updateParams, profile)
      updateSql.value += ', updated_at = NOW() WHERE id = ?'
      updateParams.push(user.id)

      await safeExecute(connection, updateSql.value, updateParams)

      const [refreshed] = await safeExecute(connection,
        'SELECT * FROM users WHERE id = ? LIMIT 1',
        [user.id]
      )
      if (refreshed && refreshed[0]) {
        user = refreshed[0]
      }
    } else {
      // 新用户，创建用户记录
      isNewUser = true
      // 确保值为 null 而不是 undefined
      const unionidValue = unionid ? unionid : null
      const phoneValue = phone ? phone : null

      const [result] = await safeExecute(connection,
        `INSERT INTO users (
          openid, unionid, _openid, phone, username, avatar, gender, birthday, occupation,
          member_level, points, total_points, order_count, total_spent, status, last_login_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          openid,
          unionidValue,
          openid,
          phoneValue,
          profile.username,
          profile.avatar,
          profile.gender,
          profile.birthday,
          profile.occupation,
          1,
          0,
          0,
          0,
          0,
          'active'
        ]
      )

      // 获取新用户信息
      const [newUsers] = await safeExecute(connection,
        'SELECT * FROM users WHERE id = ?',
        [result.insertId]
      )
      user = newUsers[0]
    }

    const resolvedPhone = phone || user.phone || null
    const needsProfileSetup = !resolvedPhone || !user.username || String(user.username).trim() === ''

    return {
      success: true,
      data: {
        userId: user.id,
        openid: openid,
        unionid: unionid,
        phone: resolvedPhone,
        username: user.username || '',
        avatar: user.avatar || '',
        gender: user.gender || '',
        birthday: user.birthday || '',
        occupation: user.occupation || '',
        isNewUser,
        needsProfileSetup,
        profileSaved,
        memberLevel: calcMemberLevel(user.total_points || 0),
        points: user.points || 0,
        totalPoints: user.total_points || 0
      }
    }
  } catch (error) {
    console.error('Login error:', error)
    return { success: false, error: error.message }
  } finally {
    if (connection) {
      connection.release()
    }
  }
}
