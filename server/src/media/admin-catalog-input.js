function text(value, maximum, name, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new Error(`${name} is required.`);
    return null;
  }
  if (typeof value !== 'string' || value.trim().length > maximum) throw new Error(`Invalid ${name}.`);
  return value.trim();
}

function flag(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (value === 0 || value === 1) return value;
  throw new Error('Invalid boolean flag.');
}

function integer(value, fallback, minimum = 0, maximum = 1000000) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) throw new Error('Invalid integer.');
  return number;
}

function categoryMediaReference(value, name) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${name}.`);
  const intent = intentId(value.intentId, `${name}.intentId`);
  const existingObjectKey = text(value.existingObjectKey, 512, `${name}.existingObjectKey`);
  if ((intent ? 1 : 0) + (existingObjectKey ? 1 : 0) !== 1) throw new Error(`Invalid ${name}.`);
  if (existingObjectKey && !existingObjectKey.startsWith('catalog/categories/')) throw new Error(`Invalid ${name}.`);
  return intent ? { intentId: intent } : { existingObjectKey };
}

export function categoryInput(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid category payload.');
  return {
    name: text(payload.name, 50, 'name', { required: true }),
    parentId: payload.parentId === null ? null : integer(payload.parentId, null, 1),
    description: text(payload.description, 255, 'description'),
    level: integer(payload.level, 1, 1, 9),
    sortOrder: integer(payload.sortOrder, 0),
    isShow: flag(payload.isShow, 1),
    isNav: flag(payload.isNav, 0),
    icon: categoryMediaReference(payload.icon, 'icon'),
    image: categoryMediaReference(payload.image, 'image'),
    iconProvided: Object.hasOwn(payload, 'icon'),
    imageProvided: Object.hasOwn(payload, 'image')
  };
}

export function bannerInput(payload, { existing = false } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid banner payload.');
  const linkType = text(payload.linkType, 20, 'linkType', { required: true });
  if (!['product', 'category', 'web', 'miniprogram', 'none'].includes(linkType)) throw new Error('Invalid linkType.');
  return {
    title: text(payload.title, 100, 'title', { required: true }),
    subtitle: text(payload.subtitle, 200, 'subtitle'),
    imageIntentId: text(payload.imageIntentId, 36, 'imageIntentId', { required: !existing }),
    mobileImageIntentId: text(payload.mobileImageIntentId, 36, 'mobileImageIntentId'),
    linkType,
    linkValue: text(payload.linkValue, 255, 'linkValue'),
    linkParam: payload.linkParam === undefined ? null : payload.linkParam,
    position: text(payload.position, 50, 'position') || 'home',
    sortOrder: integer(payload.sortOrder, 0),
    isActive: flag(payload.isActive, 1),
    startTime: text(payload.startTime, 30, 'startTime'),
    endTime: text(payload.endTime, 30, 'endTime')
  };
}

function decimal(value, name, { minimum = 0, required = false } = {}) {
  if (value === undefined || value === null || value === '') { if (required) throw new Error(`${name} is required.`); return null; }
  const number = Number(value); if (!Number.isFinite(number) || number < minimum || number > 99999999.99) throw new Error(`Invalid ${name}.`); return number;
}
function intentId(value, name, required = false) { const id = text(value, 36, name, { required }); if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error(`Invalid ${name}.`); return id; }
function intentIds(value, name, maximum = 20) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > maximum) throw new Error(`Invalid ${name}.`);
  return value.map((item, index) => intentId(item, `${name}[${index}]`, true));
}
function productParams(value) {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 30) throw new Error('Invalid params.');
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [text(key, 50, 'params.key', { required: true }), text(item, 200, 'params.value', { required: true })]));
}
function fulfillment(payload) { const shipDeadlineDays = integer(payload.shipDeadlineDays, null, 0, 365); if (shipDeadlineDays === null) throw new Error('shipDeadlineDays is required.'); return { shippingType: text(payload.shippingType, 32, 'shippingType', { required: true }), shipDeadlineDays, shippingPromise: text(payload.shippingPromise, 120, 'shippingPromise', { required: true }), shippingDelayReason: text(payload.shippingDelayReason, 80, 'shippingDelayReason', { required: true }), shippingNote: text(payload.shippingNote, 500, 'shippingNote', { required: true }) }; }
export function productInput(payload, { existing = false } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid product payload.');
  const hasSpec = flag(payload.hasSpec, 0); const specs = Array.isArray(payload.specs) ? payload.specs : [];
  if (hasSpec && specs.length === 0) throw new Error('At least one specification is required.');
  if (specs.length > 50) throw new Error('Too many specifications.');
  return { name: text(payload.name, 200, 'name', { required: true }), shortName: text(payload.shortName, 50, 'shortName'), description: text(payload.description, 500, 'description'), price: decimal(payload.price, 'price', { required: true }), categoryId: integer(payload.categoryId, null, 1), coverImageIntentId: intentId(payload.coverImageIntentId, 'coverImageIntentId', !existing), imageIntentIds: intentIds(payload.imageIntentIds, 'imageIntentIds', 7), detailImageIntentIds: intentIds(payload.detailImageIntentIds, 'detailImageIntentIds', 30), scissorsCardImageIntentId: intentId(payload.scissorsCardImageIntentId, 'scissorsCardImageIntentId'), params: productParams(payload.params), stock: integer(payload.stock, 0), warrantyMonths: integer(payload.warrantyMonths, null, 0, 1200), hasSpec, isOnSale: flag(payload.isOnSale, 1), isRecommend: flag(payload.isRecommend, 0), allowCoupon: flag(payload.allowCoupon, 1), sortOrder: integer(payload.sortOrder, 0), ...fulfillment(payload), specs: specs.map((spec) => ({ name: text(spec?.name, 50, 'spec.name', { required: true }), sku: text(spec?.sku, 64, 'spec.sku'), imageIntentId: intentId(spec?.imageIntentId, 'spec.imageIntentId'), cardImageIntentId: intentId(spec?.cardImageIntentId, 'spec.cardImageIntentId'), price: decimal(spec?.price, 'spec.price', { required: true }), sortOrder: integer(spec?.sortOrder, 0), ...fulfillment(spec || {}) })) };
}

function mediaReference(value, name, { required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) throw new Error(`${name} is required.`);
    return null;
  }
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${name}.`);
  const intent = intentId(value.intentId, `${name}.intentId`);
  const existingObjectKey = text(value.existingObjectKey, 512, `${name}.existingObjectKey`);
  if ((intent ? 1 : 0) + (existingObjectKey ? 1 : 0) !== 1) throw new Error(`Invalid ${name}.`);
  if (existingObjectKey && !existingObjectKey.startsWith('catalog/products/')) throw new Error(`Invalid ${name}.`);
  return intent ? { intentId: intent } : { existingObjectKey };
}

function mediaReferences(value, name, maximum) {
  if (!Array.isArray(value) || value.length > maximum) throw new Error(`Invalid ${name}.`);
  return value.map((item, index) => mediaReference(item, `${name}[${index}]`, { required: true }));
}

export function productUpdateInput(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid product payload.');
  const coverImage = mediaReference(payload.coverImage, 'coverImage');
  const images = mediaReferences(payload.images, 'images', 7);
  const detailImages = mediaReferences(payload.detailImages, 'detailImages', 30);
  const scissorsCardImage = mediaReference(payload.scissorsCardImage, 'scissorsCardImage');
  const specs = Array.isArray(payload.specs) ? payload.specs : [];
  const normalized = productInput({
    ...payload,
    coverImageIntentId: coverImage?.intentId,
    imageIntentIds: [],
    detailImageIntentIds: [],
    scissorsCardImageIntentId: scissorsCardImage?.intentId,
    specs: specs.map((spec) => ({ ...spec, imageIntentId: null, cardImageIntentId: null }))
  }, { existing: true });
  return {
    ...normalized,
    coverImage,
    images,
    detailImages,
    scissorsCardImage,
    specs: normalized.specs.map((spec, index) => ({
      ...spec,
      image: mediaReference(specs[index]?.image, `specs[${index}].image`),
      cardImage: mediaReference(specs[index]?.cardImage, `specs[${index}].cardImage`)
    }))
  };
}

function optionalStructuredText(value, maximum, name) {
  return text(value, maximum, name);
}

function colorSwatch(value) {
  const normalized = text(value, 32, 'color.swatch') || '';
  if (normalized && !/^(#[0-9a-f]{3,8}|[a-z]{1,24})$/i.test(normalized)) throw new Error('Invalid color.swatch.');
  return normalized;
}

function uniqueNames(items, name) {
  const seen = new Set();
  for (const item of items) {
    const key = item.name.toLocaleLowerCase('en-US');
    if (seen.has(key)) throw new Error(`Duplicate ${name}.`);
    seen.add(key);
  }
}

// This input is deliberately separate from the legacy product-specification
// input. It is accepted only when the runtime SKU feature flag is enabled and
// the migration-012 tables are present.
export function structuredProductVariantsInput(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid structured variants payload.');
  const models = Array.isArray(payload.models) ? payload.models : [];
  const colors = Array.isArray(payload.colors) ? payload.colors : [];
  const skus = Array.isArray(payload.skus) ? payload.skus : [];
  if (models.length < 1 || models.length > 50 || colors.length < 1 || colors.length > 50 || skus.length < 1 || skus.length > 250) throw new Error('Invalid structured variant count.');
  const normalizedModels = models.map((item, index) => ({ id: integer(item?.id, null, 1), name: text(item?.name, 80, 'model.name', { required: true }), sortOrder: integer(item?.sortOrder, index) }));
  const normalizedColors = colors.map((item, index) => ({ id: integer(item?.id, null, 1), name: text(item?.name, 80, 'color.name', { required: true }), swatch: colorSwatch(item?.swatch), sortOrder: integer(item?.sortOrder, index) }));
  uniqueNames(normalizedModels, 'model name');
  uniqueNames(normalizedColors, 'color name');
  const modelNames = new Set(normalizedModels.map((item) => item.name));
  const colorNames = new Set(normalizedColors.map((item) => item.name));
  const normalizedSkus = skus.map((item, index) => {
    const modelName = text(item?.modelName, 80, 'sku.modelName', { required: true });
    const colorName = text(item?.colorName, 80, 'sku.colorName', { required: true });
    if (!modelNames.has(modelName) || !colorNames.has(colorName)) throw new Error('SKU references an unknown model or color.');
    return {
      id: integer(item?.id, null, 1), modelName, colorName,
      skuCode: text(item?.skuCode, 64, 'sku.skuCode', { required: true }),
      priceFen: integer(item?.priceFen, null, 0, 999999999),
      stockAvailable: integer(item?.stockAvailable, null, 0, 10000000),
      isOnSale: flag(item?.isOnSale, 1),
      shippingType: text(item?.shippingType, 32, 'sku.shippingType', { required: true }),
      shipDeadlineDays: integer(item?.shipDeadlineDays, null, 0, 365),
      shippingPromise: text(item?.shippingPromise, 255, 'sku.shippingPromise', { required: true }),
      sortOrder: integer(item?.sortOrder, index)
    };
  });
  if (normalizedSkus.some((item) => item.priceFen === null || item.stockAvailable === null || item.shipDeadlineDays === null)) throw new Error('Invalid SKU numeric value.');
  const combinationKeys = new Set();
  const skuCodes = new Set();
  for (const item of normalizedSkus) {
    const combination = `${item.modelName}\u0000${item.colorName}`;
    if (combinationKeys.has(combination) || skuCodes.has(item.skuCode)) throw new Error('Duplicate SKU combination or code.');
    combinationKeys.add(combination); skuCodes.add(item.skuCode);
  }
  return {
    series: optionalStructuredText(payload.series, 32, 'series'),
    toolGroup: optionalStructuredText(payload.toolGroup, 64, 'toolGroup'),
    toolSubtype: optionalStructuredText(payload.toolSubtype, 64, 'toolSubtype'),
    displaySize: optionalStructuredText(payload.displaySize, 32, 'displaySize'),
    steelMaterial: optionalStructuredText(payload.steelMaterial, 128, 'steelMaterial'),
    models: normalizedModels, colors: normalizedColors, skus: normalizedSkus
  };
}
