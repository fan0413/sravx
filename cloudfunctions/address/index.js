/**
 * 地址云函数 - 使用 MySQL 数据库
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
  const { action, ...params } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  const needAuth = ['list', 'add', 'update', 'delete', 'setDefault']
  if (needAuth.includes(action) && !openid) {
    return { success: false, error: '需要登录' }
  }

  let connection
  try {
    const pool = await getPool()
    connection = await pool.getConnection()

    // 获取地址列表
    if (action === 'list') {
      const [rows] = await connection.execute(
        'SELECT * FROM addresses WHERE openid = ? ORDER BY is_default DESC, id DESC',
        [openid]
      )
      return { success: true, data: rows }
    }

    // 新增地址
    if (action === 'add') {
      const { name, contact, phone, province, city, district, detail, is_default, tag } = params
      const contactName = name || contact

      if (!contactName || !phone) {
        return { success: false, error: '联系人或手机号不能为空' }
      }

      // 如果设为默认，先取消其他默认
      if (is_default) {
        await connection.execute(
          'UPDATE addresses SET is_default = 0 WHERE openid = ?',
          [openid]
        )
      }

      const [result] = await connection.execute(
        `INSERT INTO addresses (openid, _openid, contact, name, phone, province, city, district, detail, is_default, tag, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [openid, openid, contactName, contactName, phone, province || '', city || '', district || '', detail || '', is_default ? 1 : 0, tag || '']
      )

      return { success: true, data: { id: result.insertId } }
    }

    // 更新地址
    if (action === 'update') {
      const { id, name, contact, phone, province, city, district, detail, is_default, tag } = params
      const contactName = name || contact

      if (!id) {
        return { success: false, error: '地址ID不能为空' }
      }

      if (is_default) {
        await connection.execute(
          'UPDATE addresses SET is_default = 0 WHERE openid = ?',
          [openid]
        )
      }

      await connection.execute(
        `UPDATE addresses SET contact = ?, name = ?, phone = ?, province = ?, city = ?,
         district = ?, detail = ?, is_default = ?, tag = ?, updated_at = NOW()
         WHERE id = ? AND openid = ?`,
        [contactName, contactName, phone, province || '', city || '', district || '', detail || '', is_default ? 1 : 0, tag || '', id, openid]
      )

      return { success: true }
    }

    // 删除地址
    if (action === 'delete') {
      const { id } = params
      await connection.execute(
        'DELETE FROM addresses WHERE id = ? AND openid = ?',
        [id, openid]
      )
      return { success: true }
    }

    // 设置默认地址
    if (action === 'setDefault') {
      const { id } = params
      await connection.execute(
        'UPDATE addresses SET is_default = 0 WHERE openid = ?',
        [openid]
      )
      await connection.execute(
        'UPDATE addresses SET is_default = 1 WHERE id = ? AND openid = ?',
        [id, openid]
      )
      return { success: true }
    }

    return { success: false, error: '未知操作' }
  } catch (error) {
    console.error('Address error:', error)
    return { success: false, error: error.message }
  } finally {
    if (connection) {
      connection.release()
    }
  }
}
