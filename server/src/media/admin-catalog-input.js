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
