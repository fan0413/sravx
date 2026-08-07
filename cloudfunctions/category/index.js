/**
 * 分类云函数 - 使用 MySQL 数据库
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

exports.main = async (event, context) => {
  const { action } = event
  let connection

  try {
    const pool = await getPool()
    connection = await pool.getConnection()

    // 获取分类列表
    if (action === 'list') {
      const [rows] = await connection.execute(
        `SELECT id, parent_id, name, icon, image, description, level, sort_order, is_show, is_nav
         FROM categories
         WHERE deleted_at IS NULL AND is_show = 1
         ORDER BY sort_order ASC, id ASC`
      )
      return { success: true, data: rows }
    }

    // 获取分类树形结构
    if (action === 'tree') {
      const [rows] = await connection.execute(
        `SELECT id, parent_id, name, icon, image, description, level, sort_order, is_show, is_nav
         FROM categories
         WHERE deleted_at IS NULL AND is_show = 1
         ORDER BY sort_order ASC, id ASC`
      )
      return { success: true, data: rows }
    }

    return { success: false, error: '未知操作' }
  } catch (error) {
    console.error('Category error:', error)
    return { success: false, error: error.message }
  } finally {
    if (connection) {
      connection.release()
    }
  }
}
