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

function normalizeString(value, max = 500) {
  return String(value || '').trim().slice(0, max)
}

exports.main = async (event, context) => {
  const { action, ...params } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID || ''

  let connection
  try {
    connection = await getConnection()

    if (action === 'submitCooperation') {
      const name = normalizeString(params.name, 50)
      const gender = normalizeString(params.gender, 10)
      const scale = normalizeString(params.scale, 20)
      const phone = normalizeString(params.phone, 20)
      const wechat = normalizeString(params.wechat, 60)
      const address = normalizeString(params.address, 200)
      const intention = normalizeString(params.intention, 500)

      if (!name || !gender || !scale || !phone) {
        return { success: false, error: '请完善必填信息' }
      }

      await connection.execute(
        `INSERT INTO cooperation_inquiries (name, gender, scale, phone, wechat, address, intention, _openid, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [name, gender, scale, phone, wechat, address, intention, openid]
      )

      return { success: true, data: { message: '提交成功' } }
    }

    return { success: false, error: '未知操作' }
  } catch (error) {
    console.error('contact error:', error)
    return { success: false, error: error.message }
  } finally {
    if (connection) connection.release()
  }
}
