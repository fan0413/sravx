export type AdminChannel = 'common' | 'web' | 'miniprogram';
export const workspaceStorageKey = 'sravx.admin.workspace';
export function parseAdminChannel(value: unknown): AdminChannel | null {
  return value === 'common' || value === 'web' || value === 'miniprogram' ? value : null;
}
export function workspacePath(channel: AdminChannel) { return `/channel/${channel}`; }
export function channelLabel(channel: AdminChannel) {
  return { common: '通用管理', web: '网页管理', miniprogram: '小程序管理' }[channel];
}
export function isWorkspacePath(path: string) { return /^\/channel\/(common|web|miniprogram)$/.test(path); }
export function workspaceForPath(path: string): AdminChannel {
  if (isWorkspacePath(path)) return parseAdminChannel(path.split('/')[2]) || 'common';
  if (/^\/(points-product|points-order)(\/|$)/.test(path) || /^\/scissors\/(?!after-sale(?:\/|$))/.test(path)) return 'miniprogram';
  return 'common';
}
export function isWorkspaceEditorPath(path: string) {
  return /^\/(product|points-product)\/(create|edit|delete|variants)(\/|$)/.test(path) || /^\/user\/detail\//.test(path);
}
// Leaving an editor is confirmed by the router before this navigation commits.
export function channelSwitchPath(path: string, channel: AdminChannel) {
  return path === workspacePath(channel) ? null : workspacePath(channel);
}

export interface WorkspaceFeatures { targetMode: boolean; catalogMode: boolean; operationsMode: boolean }
export interface WorkspaceMenuGroup {
  key: string;
  title: string;
  description: string;
  items: { title: string; path: string }[];
}
// One registry serves the sidebar and landing cards: no duplicate business pages.
export function workspaceMenuGroups(channel: AdminChannel, features: WorkspaceFeatures): WorkspaceMenuGroup[] {
  const catalog = !features.targetMode || features.catalogMode;
  const operations = !features.targetMode || features.operationsMode;
  const groups: WorkspaceMenuGroup[] = [];
  function add(enabled: boolean, key: string, title: string, description: string, items: WorkspaceMenuGroup['items']) {
    if (enabled) groups.push({ key, title, description, items });
  }
  if (channel === 'common') {
    add(catalog, 'dashboard', '经营看板', '查看共用经营数据，不按管理界面拆分数据。', [{ title: '经营看板', path: '/dashboard' }]);
    add(catalog, 'product', '商品管理', '统一维护商品、图片、系列、剪型与购买资料。', [{ title: '商品列表', path: '/product/list' }, { title: '新建商品', path: '/product/create' }]);
    add(catalog, 'category', '分类管理', '维护两端共用的产品系列与细分类。', [{ title: '分类列表', path: '/category/list' }]);
    add(catalog, 'banner', '内容运营', '维护现有共用轮播；当前记录没有独立渠道字段。', [
      { title: '轮播图管理', path: '/banner/list' },
      ...(!features.targetMode ? [{ title: '优惠券管理', path: '/coupon/list' }, { title: '礼品卡管理', path: '/gift-card/list' }] : [])
    ]);
    add(operations, 'order', '订单管理', '处理共用普通订单，沿用既有业务与权限。', [{ title: '订单列表', path: '/order/list' }]);
    add(operations, 'refund', '售后管理', '使用原售后退款与剪刀售后流程，不复制业务函数。', [{ title: '售后退款', path: '/refund/list' }, { title: '剪刀售后', path: '/scissors/after-sale' }]);
    add(features.operationsMode, 'user', '用户管理', '维护现有用户信息，沿用后台权限。', [{ title: '用户列表', path: '/user/list' }]);
    add(features.operationsMode, 'inquiry', '合作咨询', '处理共用合作咨询记录。', [{ title: '咨询列表', path: '/inquiry/list' }]);
  } else if (channel === 'miniprogram') {
    add(catalog, 'points-product', '积分商品', '维护现有积分商品与规格。', [{ title: '积分商品列表', path: '/points-product/list' }, { title: '新建积分商品', path: '/points-product/create' }]);
    add(operations, 'points-order', '积分订单', '处理现有积分订单，不另建订单或库存函数。', [{ title: '积分订单列表', path: '/points-order/list' }]);
    add(catalog, 'scissors', '工具绑定与 SN', '沿用工具档案与 SN 管理接口；售后仍在通用管理。', [{ title: 'SN 码管理', path: '/scissors/list' }]);
  }
  return groups;
}
