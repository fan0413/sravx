/**
 * 轮播图云函数 - 使用 MySQL 数据库
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

function normalizePosition(value) {
  if (value === undefined || value === null) return 'home'
  const position = String(value).trim()
  return position || 'home'
}

function isCloudFileID(value) {
  return typeof value === 'string' && value.trim().startsWith('cloud://')
}

async function convertBannerImageUrls(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return rows || []

  const fileIDs = Array.from(new Set(
    rows
      .flatMap(row => [row.image, row.mobile_image])
      .filter(isCloudFileID)
  ))
  if (fileIDs.length === 0) return rows

  try {
    const result = await cloud.getTempFileURL({
      fileList: fileIDs.map(fileID => ({ fileID, maxAge: 60 * 60 * 24 * 30 }))
    })
    const urlMap = {}
    ;(result.fileList || []).forEach(item => {
      if (item.status === 0 && item.tempFileURL) {
        urlMap[item.fileID] = item.tempFileURL
      }
    })
    return rows.map(row => ({
      ...row,
      image: isCloudFileID(row.image) ? (urlMap[row.image] || row.image) : row.image,
      mobile_image: isCloudFileID(row.mobile_image) ? (urlMap[row.mobile_image] || row.mobile_image) : row.mobile_image
    }))
  } catch (error) {
    console.error('convertBannerImageUrls error:', error)
    return rows
  }
}

exports.main = async (event, context) => {
  const position = normalizePosition(event && event.position)
  let connection

  try {
    connection = await getConnection()

    const [rows] = await connection.query(
      'SELECT * FROM banners WHERE position = ? AND is_active = 1 AND deleted_at IS NULL ORDER BY sort_order ASC',
      [position]
    )
    return { success: true, data: await convertBannerImageUrls(rows) }
  } catch (error) {
    console.error('Banner error:', error)
    return { success: false, error: error.message }
  } finally {
    if (connection) {
      connection.release()
    }
  }
}
