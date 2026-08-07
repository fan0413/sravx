const mysql = require("mysql2/promise");

const dbConfig = {
    host: process.env.DB_HOST || "172.17.0.12",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "admin",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "cloud1-8gk3bptqefbf01d6"
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

function normalizeImages(value) {
    if (Array.isArray(value)) return value.map(item => normalizeString(item, 500)).filter(Boolean);
    if (typeof value === "string") {
        const text = value.trim();
        if (!text) return [];
        try {
            const parsed = JSON.parse(text);
            return Array.isArray(parsed) ? parsed.map(item => normalizeString(item, 500)).filter(Boolean) : [text];
        } catch (_e) {
            return [text];
        }
    }
    return [];
}

async function addColumnIfMissing(connection, tableName, columnSql) {
    try {
        await connection.execute(`ALTER TABLE ${tableName} ADD COLUMN ${columnSql}`);
    } catch (error) {
        if (error.code !== "ER_DUP_FIELDNAME" && !String(error.message || "").includes("Duplicate column")) {
            throw error;
        }
    }
}

async function ensurePointsProductColumns(connection) {
    await addColumnIfMissing(connection, "points_products", "name VARCHAR(200) NOT NULL DEFAULT '' AFTER product_id");
    await addColumnIfMissing(connection, "points_products", "short_name VARCHAR(80) NOT NULL DEFAULT '' AFTER name");
    await addColumnIfMissing(connection, "points_products", "`desc` VARCHAR(500) NOT NULL DEFAULT '' AFTER short_name");
    await addColumnIfMissing(connection, "points_products", "cover_image VARCHAR(500) NOT NULL DEFAULT '' AFTER `desc`");
    await addColumnIfMissing(connection, "points_products", "images JSON NULL AFTER cover_image");
    await addColumnIfMissing(connection, "points_products", "detail_images JSON NULL AFTER images");
    await addColumnIfMissing(connection, "points_products", "category_id BIGINT UNSIGNED NULL AFTER detail_images");
}

function normalizeSpecs(value) {
    if (!Array.isArray(value)) return [];
    return value
        .map((item, idx) => {
            const row = item && typeof item === "object" ? item : {};
            const name = normalizeString(row.name, 80);
            if (!name) return null;
            return {
                name,
                image: normalizeString(row.image, 500),
                points_price: toNumber(row.points_price, 0),
                cash_price: toNumber(row.cash_price, 0),
                sort_order: toNumber(row.sort_order, idx + 1)
            };
        })
        .filter(Boolean);
}

async function querySpecsByProductIds(connection, ppIds) {
    if (!ppIds || ppIds.length === 0) return {};
    const placeholders = ppIds.map(() => "?").join(",");
    const [rows] = await connection.execute(
        `SELECT points_product_id, name, image, points_price, cash_price, sort_order, sku
         FROM points_product_specs
         WHERE points_product_id IN (${placeholders})
         ORDER BY sort_order ASC, id ASC`,
        ppIds
    );
    const map = {};
    (rows || []).forEach(r => {
        if (!map[r.points_product_id]) map[r.points_product_id] = [];
        map[r.points_product_id].push({
            name: r.name,
            image: r.image || null,
            points_price: Number(r.points_price) || 0,
            cash_price: Number(r.cash_price) || 0,
            sku: r.sku || ''
        });
    });
    return map;
}

async function writeSpecs(connection, pointsProductId, specs) {
    await connection.execute("DELETE FROM points_product_specs WHERE points_product_id = ?", [pointsProductId]);
    if (specs.length === 0) return;
    for (let i = 0; i < specs.length; i++) {
        const spec = specs[i];
        const sku = `PP${String(pointsProductId).padStart(4, '0')}-${String(i + 1).padStart(2, '0')}`;
        await connection.execute(
            `INSERT INTO points_product_specs (points_product_id, name, image, points_price, cash_price, sort_order, sku)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                pointsProductId,
                spec.name,
                spec.image || null,
                spec.points_price || 0,
                spec.cash_price || 0,
                spec.sort_order || 1,
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
            const { page = 1, pageSize = 50, keyword, status } = params;
            await ensurePointsProductColumns(connection);
            const offset = (toNumber(page, 1) - 1) * toNumber(pageSize, 50);
            const limit = toNumber(pageSize, 50);
            const filters = [];
            const values = [];

            if (normalizeString(keyword, 100)) {
                filters.push("(pp.name LIKE ? OR p.name LIKE ?)");
                const likeVal = `%${normalizeString(keyword, 100)}%`;
                values.push(likeVal, likeVal);
            }
            if (status === 0 || status === 1 || status === "0" || status === "1") {
                filters.push("pp.is_on_sale = ?");
                values.push(toNumber(status, 1));
            }

            let fromClause = "FROM points_products pp LEFT JOIN products p ON p.id = pp.product_id";
            let whereSql = filters.length > 0 ? ` WHERE ${filters.join(" AND ")}` : " WHERE 1=1";

            const skuVal = normalizeString(params.sku, 64);
            if (skuVal) {
                fromClause += " LEFT JOIN points_product_specs pps ON pps.points_product_id = pp.id";
                whereSql += " AND pps.sku LIKE ?";
                values.push(`%${skuVal}%`);
            }

            const [rows] = await connection.query(
                `SELECT
                    pp.id, pp.product_id,
                    COALESCE(NULLIF(pp.name, ''), p.name, CONCAT('积分商品 #', pp.id)) AS name,
                    COALESCE(NULLIF(pp.short_name, ''), p.short_name, '') AS short_name,
                    COALESCE(NULLIF(pp.cover_image, ''), p.cover_image, '') AS cover_image,
                    COALESCE(pp.images, p.images) AS images,
                    COALESCE(pp.detail_images, p.detail_images) AS detail_images,
                    COALESCE(pp.category_id, p.category_id) AS category_id,
                    pp.points_price, pp.cash_price, pp.stock, pp.stock_total,
                    pp.stock_available, pp.stock_frozen, pp.sales_count,
                    pp.is_on_sale, pp.min_member_level, pp.support_mixed_pay,
                    pp.sort_order, pp.created_at, pp.updated_at
                 ${fromClause} ${whereSql}
                 ORDER BY pp.sort_order ASC, pp.id DESC
                 LIMIT ? OFFSET ?`,
                [...values, limit, offset]
            );
            const [countRows] = await connection.query(
                `SELECT COUNT(DISTINCT pp.id) AS total ${fromClause} ${whereSql}`,
                values
            );
            const total = toNumber(countRows?.[0]?.total, 0);

            const ppIds = (rows || []).map(r => r.id);
            const specsMap = await querySpecsByProductIds(connection, ppIds);
            const list = (rows || []).map(r => ({ ...r, specs: specsMap[r.id] || [] }));

            return { success: true, data: { list, total } };
        }

        if (action === "detail") {
            await ensurePointsProductColumns(connection);
            const id = toNumber(params.id, 0);
            if (!id) return { success: false, error: "缺少积分商品ID" };
            const [products] = await connection.execute(
                `SELECT
                    pp.id, pp.product_id,
                    COALESCE(NULLIF(pp.name, ''), p.name, CONCAT('积分商品 #', pp.id)) AS name,
                    COALESCE(NULLIF(pp.short_name, ''), p.short_name, '') AS short_name,
                    pp.\`desc\`,
                    COALESCE(NULLIF(pp.cover_image, ''), p.cover_image, '') AS cover_image,
                    COALESCE(pp.images, p.images) AS images,
                    COALESCE(pp.detail_images, p.detail_images) AS detail_images,
                    COALESCE(pp.category_id, p.category_id) AS category_id,
                    pp.points_price, pp.cash_price, pp.stock, pp.stock_total,
                    pp.stock_available, pp.stock_frozen, pp.sales_count,
                    pp.is_on_sale, pp.min_member_level, pp.support_mixed_pay,
                    pp.sort_order, pp.created_at, pp.updated_at
                 FROM points_products pp
                 LEFT JOIN products p ON p.id = pp.product_id
                 WHERE pp.id = ? LIMIT 1`,
                [id]
            );
            if (!products || products.length === 0) return { success: false, error: "积分商品不存在" };

            const specsMap = await querySpecsByProductIds(connection, [id]);
            return { success: true, data: { ...products[0], specs: specsMap[id] || [] } };
        }

        if (action === "add") {
            await ensurePointsProductColumns(connection);
            const name = normalizeString(params.name, 200);
            if (!name) return { success: false, error: "积分商品名称不能为空" };
            const shortName = normalizeString(params.short_name, 80);
            const desc = normalizeString(params.desc, 500);
            const coverImage = normalizeString(params.cover_image, 500);
            const images = normalizeImages(params.images);
            const detailImages = normalizeImages(params.detail_images);
            const categoryId = toNumber(params.category_id, 0) || null;
            const pointsPrice = Math.max(0, toNumber(params.points_price, 0));
            const cashPrice = Math.max(0, toNumber(params.cash_price, 0));
            const stockTotal = Math.max(0, toNumber(params.stock_total ?? params.stock, 0));
            const minMemberLevel = Math.max(1, Math.min(6, toNumber(params.min_member_level, 1)));
            const supportMixedPay = toNumber(params.support_mixed_pay, 0) === 1 ? 1 : 0;
            const sortOrder = toNumber(params.sort_order, 0);
            const isOnSale = toNumber(params.is_on_sale, 1) === 0 ? 0 : 1;
            const productId = toNumber(params.product_id, 0) || null;
            const specs = normalizeSpecs(params.specs);

            const [result] = await connection.execute(
                `INSERT INTO points_products (
                    product_id, name, short_name, \`desc\`, cover_image, images, detail_images, category_id,
                    points_price, cash_price,
                    stock, stock_total, stock_available, stock_frozen,
                    sales_count, is_on_sale, min_member_level, support_mixed_pay, sort_order
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)`,
                [
                    productId,
                    name,
                    shortName,
                    desc,
                    coverImage,
                    JSON.stringify(images.length ? images : [coverImage]),
                    JSON.stringify(detailImages),
                    categoryId,
                    pointsPrice,
                    cashPrice.toFixed(2),
                    stockTotal,
                    stockTotal,
                    stockTotal,
                    isOnSale,
                    minMemberLevel,
                    supportMixedPay,
                    sortOrder
                ]
            );

            const ppId = result.insertId;
            await writeSpecs(connection, ppId, specs);
            return { success: true, data: { id: ppId } };
        }

        if (action === "update") {
            await ensurePointsProductColumns(connection);
            const id = toNumber(params.id, 0);
            if (!id) return { success: false, error: "缺少积分商品ID" };

            const name = normalizeString(params.name, 200);
            if (!name) return { success: false, error: "积分商品名称不能为空" };
            const shortName = normalizeString(params.short_name, 80);
            const desc = normalizeString(params.desc, 500);
            const coverImage = normalizeString(params.cover_image, 500);
            if (!coverImage) return { success: false, error: "请上传积分商品封面图" };
            const images = normalizeImages(params.images);
            const detailImages = normalizeImages(params.detail_images);
            const categoryId = toNumber(params.category_id, 0) || null;
            const pointsPrice = Math.max(0, toNumber(params.points_price, 0));
            const cashPrice = Math.max(0, toNumber(params.cash_price, 0));
            const minMemberLevel = Math.max(1, Math.min(6, toNumber(params.min_member_level, 1)));
            const supportMixedPay = toNumber(params.support_mixed_pay, 0) === 1 ? 1 : 0;
            const sortOrder = toNumber(params.sort_order, 0);
            const isOnSale = toNumber(params.is_on_sale, 1) === 0 ? 0 : 1;
            const addStock = toNumber(params.add_stock, 0);
            const productId = toNumber(params.product_id, 0) || null;
            const specs = normalizeSpecs(params.specs);

            let sql = `UPDATE points_products SET
                product_id = ?, name = ?, short_name = ?, \`desc\` = ?,
                cover_image = ?, images = ?, detail_images = ?, category_id = ?,
                points_price = ?, cash_price = ?,
                min_member_level = ?, support_mixed_pay = ?,
                sort_order = ?, is_on_sale = ?`;
            const values = [
                productId,
                name,
                shortName,
                desc,
                coverImage,
                JSON.stringify(images.length ? images : [coverImage]),
                JSON.stringify(detailImages),
                categoryId,
                pointsPrice,
                cashPrice.toFixed(2),
                minMemberLevel,
                supportMixedPay,
                sortOrder,
                isOnSale
            ];

            if (addStock !== 0) {
                sql += ", stock = stock + ?, stock_total = stock_total + ?, stock_available = stock_available + ?";
                values.push(addStock, addStock, addStock);
            }
            sql += " WHERE id = ? LIMIT 1";
            values.push(id);
            await connection.execute(sql, values);

            await writeSpecs(connection, id, specs);
            return { success: true, data: { id } };
        }

        if (action === "toggle") {
            const id = toNumber(params.id, 0);
            if (!id) return { success: false, error: "缺少积分商品ID" };
            const isOnSale = toNumber(params.is_on_sale, 1) === 0 ? 0 : 1;
            await connection.execute("UPDATE points_products SET is_on_sale = ? WHERE id = ? LIMIT 1", [isOnSale, id]);
            return { success: true, data: { id } };
        }

        return { success: false, error: "未知操作" };
    } catch (error) {
        console.error("admin-points-product error:", error);
        return { success: false, error: error.message };
    } finally {
        if (connection) connection.release();
    }
};
