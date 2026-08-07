function hasColumn(columns, name) {
  return !!(columns && columns[name])
}

function columnExpr(alias, column, columns) {
  return hasColumn(columns, column) ? `${alias}.${column}` : 'NULL'
}

function buildSpecMatchCondition(columns, specAlias, scissorsAlias) {
  const conditions = []

  if (hasColumn(columns, 'spec_id')) {
    conditions.push(`${scissorsAlias}.spec_id IS NOT NULL AND ${specAlias}.id = ${scissorsAlias}.spec_id`)
  }
  if (hasColumn(columns, 'sku')) {
    conditions.push(`${scissorsAlias}.sku IS NOT NULL AND ${specAlias}.sku = ${scissorsAlias}.sku`)
  }
  if (hasColumn(columns, 'spec_name')) {
    conditions.push(`${scissorsAlias}.spec_name IS NOT NULL AND ${specAlias}.name = ${scissorsAlias}.spec_name`)
  }

  return conditions.length > 0 ? conditions.map(item => `(${item})`).join(' OR ') : '1 = 0'
}

function buildSpecMatchOrder(columns, specAlias, scissorsAlias) {
  const clauses = []

  if (hasColumn(columns, 'spec_id')) {
    clauses.push(`WHEN ${scissorsAlias}.spec_id IS NOT NULL AND ${specAlias}.id = ${scissorsAlias}.spec_id THEN 1`)
  }
  if (hasColumn(columns, 'sku')) {
    clauses.push(`WHEN ${scissorsAlias}.sku IS NOT NULL AND ${specAlias}.sku = ${scissorsAlias}.sku THEN 2`)
  }
  if (hasColumn(columns, 'spec_name')) {
    clauses.push(`WHEN ${scissorsAlias}.spec_name IS NOT NULL AND ${specAlias}.name = ${scissorsAlias}.spec_name THEN 3`)
  }

  return clauses.length > 0 ? `CASE ${clauses.join(' ')} ELSE 9 END` : '9'
}

function firstNonEmpty(values) {
  return values.find(value => typeof value === 'string' && value.trim()) || ''
}

function resolveCardImage(row = {}) {
  return firstNonEmpty([
    row.scissors_card_image,
    row.spec_card_image,
    row.single_spec_card_image,
    row.spec_image,
    row.single_spec_image,
    row.scissors_image,
    row.product_cover_image,
    row.user_image
  ])
}

function mapUrl(url, urlMap = {}) {
  if (!url) return ''
  return urlMap[url] || url
}

function normalizeScissorsItem(row = {}, urlMap = {}) {
  const rawCardImage = resolveCardImage(row)

  return {
    ...row,
    spec_id: row.matched_spec_id || row.spec_id_snapshot || null,
    spec_name: row.matched_spec_name || row.spec_name_snapshot || '',
    sku: row.matched_spec_sku || row.sku_snapshot || '',
    card_image: mapUrl(rawCardImage, urlMap)
  }
}

module.exports = {
  columnExpr,
  buildSpecMatchCondition,
  buildSpecMatchOrder,
  resolveCardImage,
  normalizeScissorsItem
}
