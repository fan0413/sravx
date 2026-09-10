const mysql = require("mysql2/promise");

const dbConfig = {
  host: process.env.DB_HOST || 'sh-cynosdbmysql-grp-qs403jue.sql.tencentcdb.com',
  port: Number(process.env.DB_PORT) || 22069,
  user: process.env.DB_USER || "admin",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || 'cloud1-8gk3bptqefbf01d6',
  ssl: false
};

let pool = null;

async function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      ...dbConfig,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
  }
  return pool;
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeString(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function buildFixedParams(rawParams) {
  const fixedKeys = ["核心材质", "手柄材质", "尺寸", "重量(g)", "质保周期"];
  const input = rawParams && typeof rawParams === "object" ? rawParams : {};
  const result = {};
  fixedKeys.forEach((key) => {
    const value = normalizeString(input[key] || "", 200);
    if (value) result[key] = value;
  });
  return result;
}

function parseWeight(rawValue) {
  const text = normalizeString(rawValue, 50);
  if (!text) return null;
  const matched = text.match(/-?\d+(\.\d+)?/);
  if (!matched) return null;
  const weight = Number(matched[0]);
  return Number.isFinite(weight) ? weight : null;
}

function normalizeSpecConfigs(rawSpecs) {
  if (!Array.isArray(rawSpecs)) return [];
  return rawSpecs
    .map((item, index) => {
      const name = normalizeString(item?.name || "", 50);
      if (!name) return null;
      return {
        name,
        image: normalizeString(item?.image || "", 500),
        price: toNumber(item?.price, 0),
        sku: normalizeString(item?.sku || "", 64),
        sort_order: toNumber(item?.sort_order, index + 1) || index + 1
      };
    })
    .filter(Boolean);
}

async function writeSpecs(connection, productId, specs) {
  await connection.execute("DELETE FROM product_specs WHERE product_id = ?", [productId]);
  if (specs.length === 0) return;
  for (const [i, spec] of specs.entries()) {
    const sku = spec.sku || `P${String(productId).padStart(4, '0')}-${String(i + 1).padStart(2, '0')}`;
    await connection.execute(
      `INSERT INTO product_specs (product_id, name, image, price, sort_order, sku)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        productId,
        spec.name,
        spec.image || null,
        spec.price || 0,
        spec.sort_order,
        sku
      ]
    );
  }
}

exports.main = async (event) => {
  const { action, ...params } = event;
  let connection;

  try {
    const poolRef = await getPool();
    connection = await poolRef.getConnection();

    if (action === "list") {
      const { categoryId, page = 1, pageSize = 50, keyword, status, lowStock } = params;
      const offset = (toNumber(page, 1) - 1) * toNumber(pageSize, 50);
      const limit = toNumber(pageSize, 50);

      let whereSql = " WHERE 1=1";
      const values = [];

      if (categoryId) {
        whereSql += " AND category_id = ?";
        values.push(toNumber(categoryId));
      }
      if (keyword) {
        whereSql += " AND (name LIKE ? OR short_name LIKE ? OR `desc` LIKE ?)";
        values.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
      }
      if (status === 0 || status === 1) {
        whereSql += " AND is_on_sale = ?";
        values.push(status);
      }
      if (toNumber(lowStock, 0) === 1) {
        whereSql += " AND stock < ?";
        values.push(10);
      }

      const countSql = `SELECT COUNT(*) AS total FROM products${whereSql}`;
      const [countRows] = await connection.query(countSql, values);
      const total = toNumber(countRows?.[0]?.total, 0);

      let sql = `SELECT * FROM products${whereSql}`;
      sql += " ORDER BY sales_count DESC, id DESC LIMIT ? OFFSET ?";
      values.push(limit, offset);

      const [rows] = await connection.query(sql, values);
      return { success: true, data: { list: rows, total } };
    }

    if (action === "detail") {
      const id = toNumber(params.id, 0);
      if (!id) return { success: false, error: "缺少商品ID" };

      const [products] = await connection.execute("SELECT * FROM products WHERE id = ? AND deleted_at IS NULL LIMIT 1", [id]);
      if (!products || products.length === 0) {
        return { success: false, error: "商品不存在" };
      }

      const [specRows] = await connection.execute(
        "SELECT id, name, image, price, sort_order, sku FROM product_specs WHERE product_id = ? ORDER BY sort_order ASC, id ASC",
        [id]
      );

      const product = products[0];
      product.specs = (specRows || []).map((spec) => ({
        id: spec.id,
        name: spec.name,
        image: spec.image || null,
        price: Number(spec.price) || 0,
        sku: spec.sku || "",
        sort_order: spec.sort_order
      }));
      return { success: true, data: product };
    }

    if (action === "add") {
      const name = normalizeString(params.name, 200);
      if (!name) return { success: false, error: "商品名称不能为空" };

      const shortName = normalizeString(params.short_name, 50);
      const desc = normalizeString(params.desc, 500);
      const price = toNumber(params.price, 0);
      const categoryId = toNumber(params.category_id, 0);
      const coverImage = normalizeString(params.cover_image, 500);
      const images = Array.isArray(params.images) ? params.images.map((x) => normalizeString(x, 500)).filter(Boolean) : [];
      const detailImages = Array.isArray(params.detail_images)
        ? params.detail_images.map((x) => normalizeString(x, 500)).filter(Boolean)
        : [];
      const stock = toNumber(params.stock, 0);
      const sortOrder = toNumber(params.sort_order, 0);
      const isOnSale = toNumber(params.is_on_sale, 1) === 0 ? 0 : 1;
      const isRecommend = toNumber(params.is_recommend, 0) === 1 ? 1 : 0;
      const fixedParams = buildFixedParams(params.params);
      const coreMaterial = fixedParams["核心材质"] || null;
      const handleMaterial = fixedParams["手柄材质"] || null;
      const size = fixedParams["尺寸"] || null;
      const weight = parseWeight(fixedParams["重量(g)"]);
      const warrantyPeriod = fixedParams["质保周期"] || null;
      const specConfigs = normalizeSpecConfigs(params.specs);
      const customSkus = specConfigs.map((item) => item.sku).filter(Boolean);
      if (new Set(customSkus).size !== customSkus.length) {
        return { success: false, error: "SKU 不能重复" };
      }
      const hasSpec = specConfigs.length > 0 ? 1 : 0;

      const [result] = await connection.execute(
        `INSERT INTO products (
          name, short_name, \`desc\`, price,
          category_id, cover_image, images, detail_images,
          core_material, handle_material, size, weight, warranty_period,
          stock, has_spec, sort_order, is_on_sale, is_recommend
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name, shortName || null, desc || null, price,
          categoryId || null, coverImage || null,
          JSON.stringify(images), JSON.stringify(detailImages),
          coreMaterial, handleMaterial, size, weight, warrantyPeriod,
          stock, hasSpec, sortOrder, isOnSale, isRecommend
        ]
      );

      const productId = result.insertId;
      await writeSpecs(connection, productId, specConfigs);
      return { success: true, data: { id: productId } };
    }

    if (action === "update") {
      const id = toNumber(params.id, 0);
      if (!id) return { success: false, error: "缺少商品ID" };
      const name = normalizeString(params.name, 200);
      if (!name) return { success: false, error: "商品名称不能为空" };

      const shortName = normalizeString(params.short_name, 50);
      const desc = normalizeString(params.desc, 500);
      const price = toNumber(params.price, 0);
      const categoryId = toNumber(params.category_id, 0);
      const coverImage = normalizeString(params.cover_image, 500);
      const images = Array.isArray(params.images) ? params.images.map((x) => normalizeString(x, 500)).filter(Boolean) : [];
      const detailImages = Array.isArray(params.detail_images)
        ? params.detail_images.map((x) => normalizeString(x, 500)).filter(Boolean)
        : [];
      const stock = toNumber(params.stock, 0);
      const sortOrder = toNumber(params.sort_order, 0);
      const isOnSale = toNumber(params.is_on_sale, 1) === 0 ? 0 : 1;
      const isRecommend = toNumber(params.is_recommend, 0) === 1 ? 1 : 0;
      const fixedParams = buildFixedParams(params.params);
      const coreMaterial = fixedParams["核心材质"] || null;
      const handleMaterial = fixedParams["手柄材质"] || null;
      const size = fixedParams["尺寸"] || null;
      const weight = parseWeight(fixedParams["重量(g)"]);
      const warrantyPeriod = fixedParams["质保周期"] || null;
      const specConfigs = normalizeSpecConfigs(params.specs);
      const customSkus = specConfigs.map((item) => item.sku).filter(Boolean);
      if (new Set(customSkus).size !== customSkus.length) {
        return { success: false, error: "SKU 不能重复" };
      }
      const hasSpec = specConfigs.length > 0 ? 1 : 0;

      await connection.beginTransaction();
      const [updateResult] = await connection.execute(
        `UPDATE products SET
          name = ?, short_name = ?, \`desc\` = ?, price = ?,
          category_id = ?, cover_image = ?, images = ?, detail_images = ?,
          core_material = ?, handle_material = ?, size = ?, weight = ?, warranty_period = ?,
          stock = ?, has_spec = ?, sort_order = ?, is_on_sale = ?, is_recommend = ?
        WHERE id = ?`,
        [
          name, shortName || null, desc || null, price,
          categoryId || null, coverImage || null,
          JSON.stringify(images), JSON.stringify(detailImages),
          coreMaterial, handleMaterial, size, weight, warrantyPeriod,
          stock, hasSpec, sortOrder, isOnSale, isRecommend, id
        ]
      );

      if (!updateResult || updateResult.affectedRows === 0) {
        await connection.rollback();
        return { success: false, error: "商品不存在或未更新" };
      }

      await writeSpecs(connection, id, specConfigs);
      await connection.commit();
      return { success: true, data: { id } };
    }

    if (action === "delete") {
      const id = toNumber(params.id, 0);
      if (!id) return { success: false, error: "缺少商品ID" };

      await connection.beginTransaction();
      await connection.execute("DELETE FROM product_specs WHERE product_id = ?", [id]);
      const [result] = await connection.execute("DELETE FROM products WHERE id = ? LIMIT 1", [id]);
      if (!result || result.affectedRows === 0) {
        await connection.rollback();
        return { success: false, error: "商品不存在或已删除" };
      }
      await connection.commit();
      return { success: true, data: { id } };
    }

    if (action === "restock") {
      const id = toNumber(params.id, 0);
      const stock = Math.floor(toNumber(params.stock, -1));
      if (!id) return { success: false, error: "缺少商品ID" };
      if (stock < 0) return { success: false, error: "库存值必须大于等于0" };

      const [result] = await connection.execute(
        "UPDATE products SET stock = ? WHERE id = ? LIMIT 1",
        [stock, id]
      );
      if (!result || result.affectedRows === 0) {
        return { success: false, error: "商品不存在或更新库存失败" };
      }

      const [rows] = await connection.execute("SELECT stock FROM products WHERE id = ? LIMIT 1", [id]);
      const latestStock = toNumber(rows?.[0]?.stock, 0);
      return { success: true, data: { id, stock: latestStock } };
    }

    return { success: false, error: "未知操作" };
  } catch (error) {
    console.error("admin-product error:", error);
    return { success: false, error: error.message };
  } finally {
    if (connection) connection.release();
  }
};
