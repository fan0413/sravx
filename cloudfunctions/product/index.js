const cloud = require('wx-server-sdk')
const mysql = require('mysql2/promise')

cloud.init({
  env: process.env.ENV_ID || 'cloud1-8gk3bptqefbf01d6'
})

const dbConfig = {
  host: process.env.DB_HOST || '172.17.0.12',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'cloud1-8gk3bptqefbf01d6'
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

function calcMemberLevel(totalPoints) {
  const tp = parseInt(totalPoints, 10) || 0
  if (tp >= 60000) return 6
  if (tp >= 30000) return 5
  if (tp >= 10000) return 4
  if (tp >= 3000) return 3
  if (tp >= 1000) return 2
  return 1
}

function resolveLinkedProductStock(row) {
  const stock = Number(row && row.linked_product_stock) || 0
  const reserved = Number(row && row.linked_product_reserved_stock) || 0
  return Math.max(0, stock - reserved)
}

function resolvePointsStockAvailable(row) {
  const pointsStock = Number(row && row.stock_available) || 0
  const linkedStock = resolveLinkedProductStock(row)
  const pointsStockUninitialized =
    Number(row && row.product_id) > 0 &&
    pointsStock <= 0 &&
    (Number(row && row.stock_total) || 0) <= 0 &&
    (Number(row && row.stock) || 0) <= 0

  return pointsStockUninitialized && linkedStock > 0 ? linkedStock : Math.max(0, pointsStock)
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
    Boolean(normalizeString(spec.shipping_delay_reason, 80)) ||
    Boolean(normalizeString(spec.shipping_note, 500))
  )
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

async function ensureProductSpecShippingColumns(connection) {
  await addColumnIfMissing(connection, 'product_specs', "shipping_type VARCHAR(32) NOT NULL DEFAULT 'normal' AFTER sku")
  await addColumnIfMissing(connection, 'product_specs', "card_image VARCHAR(500) NOT NULL DEFAULT '' AFTER image")
  await addColumnIfMissing(connection, 'product_specs', 'ship_deadline_days INT NOT NULL DEFAULT 2 AFTER shipping_type')
  await addColumnIfMissing(connection, 'product_specs', "shipping_promise VARCHAR(120) NOT NULL DEFAULT '' AFTER ship_deadline_days")
  await addColumnIfMissing(connection, 'product_specs', "shipping_delay_reason VARCHAR(80) NOT NULL DEFAULT '' AFTER shipping_promise")
  await addColumnIfMissing(connection, 'product_specs', "shipping_note VARCHAR(500) NOT NULL DEFAULT '' AFTER shipping_delay_reason")
}

async function ensurePointsProductDisplayColumns(connection) {
  await addColumnIfMissing(connection, 'points_products', "name VARCHAR(200) NOT NULL DEFAULT '' AFTER product_id")
  await addColumnIfMissing(connection, 'points_products', "short_name VARCHAR(80) NOT NULL DEFAULT '' AFTER name")
  await addColumnIfMissing(connection, 'points_products', "`desc` VARCHAR(500) NOT NULL DEFAULT '' AFTER short_name")
  await addColumnIfMissing(connection, 'points_products', "cover_image VARCHAR(500) NOT NULL DEFAULT '' AFTER `desc`")
  await addColumnIfMissing(connection, 'points_products', "images JSON NULL AFTER cover_image")
  await addColumnIfMissing(connection, 'points_products', "detail_images JSON NULL AFTER images")
  await addColumnIfMissing(connection, 'points_products', "category_id BIGINT UNSIGNED NULL AFTER detail_images")
}

async function queryProductSpecs(connection, productId, fallbackProduct = null) {
  const [rows] = await connection.execute(
    `SELECT name, image, card_image, price, sort_order, sku,
       shipping_type, ship_deadline_days, shipping_promise,
       shipping_delay_reason, shipping_note
     FROM product_specs
     WHERE product_id = ?
     ORDER BY sort_order ASC, id ASC`,
    [productId]
  )
  return (rows || []).map(r => {
    const shippingSource = hasSpecShippingOverride(r) ? r : (fallbackProduct || r)
    const shippingType = normalizeShippingType(shippingSource.shipping_type)
    const shipDeadlineDays = normalizeShipDeadlineDays(shippingSource.ship_deadline_days, shippingType)
    return {
      name: r.name,
      image: r.image || null,
      card_image: r.card_image || null,
      price: Number(r.price) || 0,
      sku: r.sku || '',
      shipping_type: shippingType,
      ship_deadline_days: shipDeadlineDays,
      shipping_promise: buildShippingPromise(shippingType, shipDeadlineDays, shippingSource.shipping_promise),
      shipping_delay_reason: shippingSource.shipping_delay_reason || '',
      shipping_note: shippingSource.shipping_note || ''
    }
  })
}

async function queryPointsProductSpecs(connection, pointsProductIds) {
  if (!pointsProductIds || pointsProductIds.length === 0) return {}
  try {
    const placeholders = pointsProductIds.map(() => '?').join(',')
    const [rows] = await connection.execute(
      `SELECT points_product_id, name, image, points_price, cash_price, sort_order, sku
       FROM points_product_specs
       WHERE points_product_id IN (${placeholders})
       ORDER BY sort_order ASC, id ASC`,
      pointsProductIds
    )
    const map = {}
    ;(rows || []).forEach(r => {
      if (!map[r.points_product_id]) map[r.points_product_id] = []
      map[r.points_product_id].push({
        name: r.name,
        image: r.image || null,
        points_price: Number(r.points_price) || 0,
        cash_price: Number(r.cash_price) || 0,
        sku: r.sku || ''
      })
    })
    return map
  } catch (err) {
    if (err && err.code === 'ER_NO_SUCH_TABLE') return {}
    if (err && err.code === 'ER_BAD_FIELD_ERROR') return {}
    console.error('queryPointsProductSpecs error:', err)
    return {}
  }
}

function safeParseImages(rawImages) {
  if (!rawImages) return []
  if (Array.isArray(rawImages)) return rawImages
  if (typeof rawImages === 'string') {
    try {
      const parsed = JSON.parse(rawImages)
      if (Array.isArray(parsed)) return parsed
    } catch (e) {
      return rawImages ? [rawImages] : []
    }
  }
  return []
}

function isCloudFileID(value) {
  return typeof value === 'string' && value.trim().startsWith('cloud://')
}

function uniqueCloudFileIDs(values) {
  return Array.from(new Set((values || []).filter(isCloudFileID)))
}

async function getTempUrlMap(fileIDs) {
  const ids = uniqueCloudFileIDs(fileIDs)
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
  } catch (e) {
    console.error('getTempUrlMap error:', e)
    return {}
  }
}

function mapImageValue(value, urlMap) {
  return isCloudFileID(value) ? (urlMap[value] || value) : value
}

function normalizeImageField(value) {
  if (value === undefined || value === null || value === '') return value
  return safeParseImages(value).map(item => String(item || '').trim()).filter(Boolean)
}

async function convertImageUrls(products) {
  if (!products || products.length === 0) return products

  const normalizedProducts = products.map(p => ({
    ...p,
    images: normalizeImageField(p.images),
    detail_images: normalizeImageField(p.detail_images)
  }))

  const fileIDs = []
  normalizedProducts.forEach(p => {
    if (p.cover_image) fileIDs.push(p.cover_image)
    ;(p.images || []).forEach(img => fileIDs.push(img))
    ;(p.detail_images || []).forEach(img => fileIDs.push(img))
    ;(p.specs || []).forEach(spec => {
      if (spec && spec.image) fileIDs.push(spec.image)
      if (spec && spec.card_image) fileIDs.push(spec.card_image)
    })
  })

  const urlMap = await getTempUrlMap(fileIDs)
  return normalizedProducts.map(p => ({
    ...p,
    cover_image: mapImageValue(p.cover_image, urlMap),
    images: Array.isArray(p.images) ? p.images.map(img => mapImageValue(img, urlMap)) : p.images,
    detail_images: Array.isArray(p.detail_images) ? p.detail_images.map(img => mapImageValue(img, urlMap)) : p.detail_images,
    specs: Array.isArray(p.specs)
      ? p.specs.map(spec => ({
        ...spec,
        image: mapImageValue(spec.image, urlMap),
        card_image: mapImageValue(spec.card_image, urlMap)
      }))
      : p.specs
  }))
}

async function convertSpecImages(specs) {
  if (!Array.isArray(specs) || specs.length === 0) return specs || []
  const urlMap = await getTempUrlMap(specs.flatMap(spec => [spec && spec.image, spec && spec.card_image]))
  return specs.map(spec => ({
    ...spec,
    image: mapImageValue(spec.image, urlMap),
    card_image: mapImageValue(spec.card_image, urlMap)
  }))
}

async function convertSpecsMapImages(specsMap) {
  if (!specsMap || typeof specsMap !== 'object') return specsMap || {}
  const allSpecs = Object.values(specsMap).flat().filter(Boolean)
  const urlMap = await getTempUrlMap(allSpecs.flatMap(spec => [spec.image, spec.card_image]))
  const nextMap = {}
  Object.entries(specsMap).forEach(([key, specs]) => {
    nextMap[key] = (specs || []).map(spec => ({
      ...spec,
      image: mapImageValue(spec.image, urlMap),
      card_image: mapImageValue(spec.card_image, urlMap)
    }))
  })
  return nextMap
}

exports.main = async (event, context) => {
  const { action, ...params } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID || ''
  let connection

  try {
    const pool = await getPool()
    connection = await pool.getConnection()
    await ensureProductSpecShippingColumns(connection)

    if (action === 'home') {
      const [products] = await connection.execute(
        `SELECT p.*
         FROM products p
          INNER JOIN categories c ON c.id = p.category_id
          WHERE p.is_on_sale = 1
            AND p.is_recommend = 1
            AND p.deleted_at IS NULL
            AND c.deleted_at IS NULL
           AND c.is_show = 1
         ORDER BY p.sort_order ASC, p.id DESC`
      )
      const [categories] = await connection.execute(
        `SELECT id, parent_id, name, icon, image, description, level, sort_order, is_show, is_nav
         FROM categories
         WHERE deleted_at IS NULL AND is_show = 1
         ORDER BY sort_order ASC, id ASC`
      )
      const convertedProducts = await convertImageUrls(products)
      return { success: true, data: { products: convertedProducts, categories } }
    }

    if (action === 'list') {
      const { categoryId, page = 1, pageSize = 20, keyword } = params
      const offset = (parseInt(page) - 1) * parseInt(pageSize)
      const limit = parseInt(pageSize)

      let sql = `SELECT p.*
        FROM products p
        INNER JOIN categories c ON c.id = p.category_id
        WHERE p.is_on_sale = 1
          AND p.deleted_at IS NULL
          AND c.deleted_at IS NULL
          AND c.is_show = 1`
      const values = []

      if (categoryId) {
        sql += ' AND p.category_id = ?'
        values.push(categoryId)
      }
      if (keyword) {
        sql += ' AND (p.name LIKE ? OR p.short_name LIKE ? OR p.`desc` LIKE ?)'
        values.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`)
      }

      sql += ' ORDER BY p.sort_order ASC, p.id DESC LIMIT ? OFFSET ?'
      values.push(limit, offset)

      const [products] = await connection.query(sql, values)
      const convertedProducts = await convertImageUrls(products)
      return { success: true, data: convertedProducts }
    }

    if (action === 'detail') {
      const numericId = Number(params.id)
      if (!Number.isInteger(numericId) || numericId <= 0) {
        return { success: false, error: 'Invalid product id' }
      }
      const id = String(numericId)
      const [products] = await connection.execute(
        `SELECT p.*
         FROM products p
         INNER JOIN categories c ON c.id = p.category_id
         WHERE p.id = ?
           AND p.is_on_sale = 1
           AND p.deleted_at IS NULL
           AND c.deleted_at IS NULL
           AND c.is_show = 1
         LIMIT 1`,
        [id]
      )
      if (products && products.length > 0) {
        const converted = await convertImageUrls(products)
        const product = converted[0]
        const specRows = await queryProductSpecs(connection, id, product)
        product.specs = await convertSpecImages(specRows)
        return { success: true, data: product }
      }
      return { success: false, error: '商品不存在' }
    }

    if (action === 'pointsList') {
      await ensurePointsProductDisplayColumns(connection)
      const categoryId = Number(params.categoryId) || 0
      const values = []
      let sql = `SELECT
          pp.id,
          pp.product_id,
          COALESCE(NULLIF(pp.name, ''), p.name, CONCAT('积分商品 #', pp.id)) AS name,
          COALESCE(NULLIF(pp.short_name, ''), p.short_name, '') AS short_name,
          COALESCE(NULLIF(pp.cover_image, ''), p.cover_image, '') AS cover_image,
          COALESCE(pp.images, p.images) AS images,
          COALESCE(pp.detail_images, p.detail_images) AS detail_images,
          COALESCE(pp.category_id, p.category_id) AS category_id,
          pp.points_price,
          pp.cash_price,
          pp.stock,
          pp.stock_total,
          pp.stock_available,
          pp.stock_frozen,
          pp.sales_count,
          pp.is_on_sale,
          pp.min_member_level,
          pp.support_mixed_pay,
          p.stock AS linked_product_stock,
          p.reserved_stock AS linked_product_reserved_stock
        FROM points_products pp
        LEFT JOIN products p ON p.id = pp.product_id AND p.deleted_at IS NULL
        LEFT JOIN categories c ON c.id = COALESCE(pp.category_id, p.category_id)
        WHERE pp.is_on_sale = 1
          AND pp.deleted_at IS NULL
          AND (c.id IS NULL OR (c.deleted_at IS NULL AND c.is_show = 1))`
      if (categoryId > 0) {
        sql += ' AND COALESCE(pp.category_id, p.category_id) = ?'
        values.push(categoryId)
      }
      sql += ' ORDER BY pp.sort_order ASC, pp.id DESC'
      const [rows] = await connection.execute(sql, values)

      const ppIds = (rows || []).map(r => r.id)
      const specsMap = await convertSpecsMapImages(await queryPointsProductSpecs(connection, ppIds))

      const [categories] = await connection.execute(
        'SELECT id, name FROM categories WHERE deleted_at IS NULL AND is_show = 1 ORDER BY sort_order ASC, id ASC'
      )

      let currentMemberLevel = 1
      if (openid) {
        const [userRows] = await connection.execute(
          'SELECT member_level, total_points FROM users WHERE openid = ? OR _openid = ? LIMIT 1',
          [openid, openid]
        )
        if (userRows && userRows[0]) {
          currentMemberLevel = Math.max(
            Number(userRows[0].member_level) || 1,
            calcMemberLevel(userRows[0].total_points || 0)
          )
        }
      }

      const converted = await convertImageUrls((rows || []).map(r => ({
        ...r,
        cover_image: r.cover_image,
        images: safeParseImages(r.images)
      })))
      const products = converted.map(item => {
        const minLevel = Number(item.min_member_level || 1) || 1
        const effectiveStockAvailable = resolvePointsStockAvailable(item)
        return {
          ...item,
          stock_available: effectiveStockAvailable,
          specs: specsMap[item.id] || [],
          can_redeem: currentMemberLevel >= minLevel && effectiveStockAvailable > 0,
          current_member_level: currentMemberLevel
        }
      })

      return { success: true, data: { products, categories, current_member_level: currentMemberLevel } }
    }

    if (action === 'pointsDetail') {
      await ensurePointsProductDisplayColumns(connection)
      const id = Number(params.id)
      if (!id || Number.isNaN(id)) return { success: false, error: '积分商品参数无效' }

      const [rows] = await connection.execute(
        `SELECT
            pp.id,
            pp.product_id,
            pp.points_price,
            pp.cash_price,
            pp.stock,
            pp.stock_total,
            pp.stock_available,
            pp.stock_frozen,
            pp.sales_count,
            pp.is_on_sale,
            pp.min_member_level,
            pp.support_mixed_pay,
            COALESCE(NULLIF(pp.name, ''), p.name, CONCAT('积分商品 #', pp.id)) AS name,
            COALESCE(NULLIF(pp.short_name, ''), p.short_name, '') AS short_name,
            COALESCE(NULLIF(pp.cover_image, ''), p.cover_image, '') AS cover_image,
            COALESCE(pp.images, p.images) AS images,
            COALESCE(pp.\`desc\`, p.detail, '') AS detail,
            COALESCE(pp.detail_images, p.detail_images) AS detail_images,
            p.params,
            p.core_material,
            p.handle_material,
            p.size,
            p.weight,
            p.warranty_period,
            p.stock AS linked_product_stock,
            p.reserved_stock AS linked_product_reserved_stock
         FROM points_products pp
         LEFT JOIN products p ON p.id = pp.product_id AND p.deleted_at IS NULL
         LEFT JOIN categories c ON c.id = COALESCE(pp.category_id, p.category_id)
         WHERE pp.id = ? AND pp.is_on_sale = 1
            AND pp.deleted_at IS NULL
            AND (c.id IS NULL OR (c.deleted_at IS NULL AND c.is_show = 1))
         LIMIT 1`,
        [id]
      )
      if (!rows || rows.length === 0) return { success: false, error: '积分商品不存在' }

      const specsMap = await convertSpecsMapImages(await queryPointsProductSpecs(connection, [id]))

      const row = rows[0]
      let currentMemberLevel = 1
      if (openid) {
        const [userRows] = await connection.execute(
          'SELECT member_level, total_points FROM users WHERE openid = ? OR _openid = ? LIMIT 1',
          [openid, openid]
        )
        if (userRows && userRows[0]) {
          currentMemberLevel = Math.max(
            Number(userRows[0].member_level) || 1,
            calcMemberLevel(userRows[0].total_points || 0)
          )
        }
      }
      const converted = await convertImageUrls([{ ...row, images: safeParseImages(row.images) }])
      const data = converted[0]
      const minLevel = Number(data.min_member_level || 1) || 1
      const effectiveStockAvailable = resolvePointsStockAvailable(data)
      return {
        success: true,
        data: {
          ...data,
          stock_available: effectiveStockAvailable,
          specs: specsMap[id] || [],
          can_redeem: currentMemberLevel >= minLevel && effectiveStockAvailable > 0,
          current_member_level: currentMemberLevel,
          detail_images: safeParseImages(data.detail_images || data.images)
        }
      }
    }

    if (action === 'add') {
      return { success: false, error: 'Forbidden: product writes are admin-only' }
    }

    if (false) {
      if (!name) return { success: false, error: '商品名称不能为空' }

    }

    return { success: false, error: '未知操作' }
  } catch (error) {
    console.error('Product error:', error)
    return { success: false, error: error.message }
  } finally {
    if (connection) connection.release()
  }
}
