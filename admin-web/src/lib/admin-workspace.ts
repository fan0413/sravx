export type AdminChannel = 'web' | 'miniprogram';
export const workspaceStorageKey = 'sravx.admin.workspace';
export function parseAdminChannel(value: unknown): AdminChannel | null {
  return value === 'web' || value === 'miniprogram' ? value : null;
}
export function workspacePath(channel: AdminChannel) { return `/channel/${channel}`; }
export function channelLabel(channel: AdminChannel) { return channel === 'web' ? '网页功能' : '小程序功能'; }
export function isWorkspacePath(path: string) { return /^\/channel\/(web|miniprogram)$/.test(path); }
// Switching a shared editor must not navigate away or discard its unsaved form.
export function channelSwitchPath(path: string, channel: AdminChannel) {
  return isWorkspacePath(path) ? workspacePath(channel) : null;
}
