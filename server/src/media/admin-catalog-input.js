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
    iconIntentId: text(payload.iconIntentId, 36, 'iconIntentId'),
    imageIntentId: text(payload.imageIntentId, 36, 'imageIntentId')
  };
}

export function bannerInput(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid banner payload.');
  const linkType = text(payload.linkType, 20, 'linkType', { required: true });
  if (!['product', 'category', 'web', 'miniprogram', 'none'].includes(linkType)) throw new Error('Invalid linkType.');
  return {
    title: text(payload.title, 100, 'title', { required: true }),
    subtitle: text(payload.subtitle, 200, 'subtitle'),
    imageIntentId: text(payload.imageIntentId, 36, 'imageIntentId', { required: true }),
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
function fulfillment(payload) { const shipDeadlineDays = integer(payload.shipDeadlineDays, null, 0, 365); if (shipDeadlineDays === null) throw new Error('shipDeadlineDays is required.'); return { shippingType: text(payload.shippingType, 32, 'shippingType', { required: true }), shipDeadlineDays, shippingPromise: text(payload.shippingPromise, 120, 'shippingPromise', { required: true }), shippingDelayReason: text(payload.shippingDelayReason, 80, 'shippingDelayReason', { required: true }), shippingNote: text(payload.shippingNote, 500, 'shippingNote', { required: true }) }; }
export function productInput(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid product payload.');
  const hasSpec = flag(payload.hasSpec, 0); const specs = Array.isArray(payload.specs) ? payload.specs : [];
  if (hasSpec && specs.length === 0) throw new Error('At least one specification is required.');
  if (specs.length > 50) throw new Error('Too many specifications.');
  return { name: text(payload.name, 200, 'name', { required: true }), shortName: text(payload.shortName, 50, 'shortName'), description: text(payload.description, 500, 'description'), price: decimal(payload.price, 'price', { required: true }), categoryId: integer(payload.categoryId, null, 1), coverImageIntentId: intentId(payload.coverImageIntentId, 'coverImageIntentId', true), stock: integer(payload.stock, 0), warrantyMonths: integer(payload.warrantyMonths, null, 0, 1200), hasSpec, isOnSale: flag(payload.isOnSale, 1), isRecommend: flag(payload.isRecommend, 0), allowCoupon: flag(payload.allowCoupon, 1), sortOrder: integer(payload.sortOrder, 0), ...fulfillment(payload), specs: specs.map((spec) => ({ name: text(spec?.name, 50, 'spec.name', { required: true }), sku: text(spec?.sku, 64, 'spec.sku'), price: decimal(spec?.price, 'spec.price', { required: true }), sortOrder: integer(spec?.sortOrder, 0), ...fulfillment(spec || {}) })) };
}
