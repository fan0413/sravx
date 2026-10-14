export const SERIES = ['basic', 'pro', 'master', 'accessories'];
export const TOOLS = ['straight', 'curved', 'thinning', 'fishbone', 'texturizing'];

export function classificationInput(input, { required = false } = {}) {
  const params = input.params && typeof input.params === 'object' ? input.params : {};
  const series = input.series ?? params['目录系列'];
  const toolGroup = input.toolGroup ?? params['目录分类'];
  if (!series && !toolGroup && !required) return null;
  if (!SERIES.includes(series) || !(series === 'accessories' ? toolGroup === 'accessories' : TOOLS.includes(toolGroup))) throw new Error('Invalid catalog classification.');
  if ((params['目录系列'] && params['目录系列'] !== series) || (params['目录分类'] && params['目录分类'] !== toolGroup)) throw new Error('Conflicting catalog classification.');
  return { series, toolGroup };
}

export function classificationSql(normalized) {
  const json = `IF(JSON_VALID(p.params), p.params, JSON_OBJECT())`;
  // Keep unclassified existing goods visible in the unfiltered catalog until an
  // administrator explicitly assigns them. Series filters never guess ownership.
  return normalized ? { join: ' LEFT JOIN product_classifications pc ON pc.product_id = p.id', select: ", pc.series AS series, pc.tool_group AS tool_group, CASE WHEN pc.product_id IS NULL THEN 'legacy' ELSE 'normalized' END AS classification_source", series: 'pc.series', tool: 'pc.tool_group' }
    : { join: '', select: '', series: `JSON_UNQUOTE(JSON_EXTRACT(${json}, '$."目录系列"'))`, tool: `JSON_UNQUOTE(JSON_EXTRACT(${json}, '$."目录分类"'))` };
}

export function classificationFilters(sql, { series, toolGroup }, values) {
  if ((series && !SERIES.includes(series)) || (toolGroup && ![...TOOLS, 'accessories'].includes(toolGroup))) return ['1 = 0'];
  const filters = [];
  if (series) {
    filters.push(`${sql.series} = ?`); values.push(series);
  }
  if (toolGroup) {
    filters.push(`${sql.tool} = ?`); values.push(toolGroup);
  }
  return filters;
}

export async function saveClassification(connection, productId, input) {
  const classification = classificationInput(input, { required: true });
  const [categories] = await connection.execute(`SELECT c.name, c.parent_id, root.name AS root_name FROM categories c
    LEFT JOIN categories root ON root.id = c.parent_id AND root.deleted_at IS NULL
    WHERE c.id = ${input.categoryId == null ? '(SELECT category_id FROM products WHERE id = ?)' : '?'} AND c.deleted_at IS NULL FOR UPDATE`, [input.categoryId ?? productId]);
  const category = categories[0];
  const seriesNames = { basic: 'basic', pro: 'pro', master: 'master', accessories: '配件' };
  const toolNames = { straight: '直剪', curved: '弯剪', thinning: '牙剪', fishbone: '鱼骨剪', texturizing: '造型剪' };
  const name = value => String(value || '').trim().toLowerCase().replace(/^sravx\s*/, '').replace(/\s*系列$/, '');
  const owner = name(category?.root_name || category?.name);
  if (!category || ![classification.series, seriesNames[classification.series]].includes(owner) ||
      (classification.series !== 'accessories' && (!category.parent_id || ![classification.toolGroup, toolNames[classification.toolGroup]].includes(name(category.name))))) throw new Error('Category does not match catalog classification.');
  await connection.execute(`INSERT INTO product_classifications (product_id, series, tool_group)
    VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE series = VALUES(series), tool_group = VALUES(tool_group)`, [productId, classification.series, classification.toolGroup]);
}
