const mode = import.meta.env.VITE_ADMIN_AUTH_MODE;
const apiBase = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const tokenKey = 'sravx.target.admin.session';

function enabled() { return mode === 'target'; }
function endpoint(path: string) { return apiBase ? `${apiBase}${path}` : path; }
async function request(path: string, init: RequestInit = {}) {
  const token = sessionStorage.getItem(tokenKey); const headers = new Headers(init.headers);
  if (token) headers.set('authorization', `Bearer ${token}`);
  const response = await fetch(endpoint(path), { ...init, headers });
  const body = await response.json().catch(() => null) as { success?: boolean; data?: unknown; error?: { message?: string } } | null;
  if (!response.ok || !body?.success) throw new Error(body?.error?.message || '后台服务暂不可用');
  return body.data;
}
export function targetAdminModeEnabled() { return enabled(); }
export async function targetAdminLogin(username: string, password: string) { const data = await request('/api/v1/admin/auth/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) }) as { token: string }; if (!data?.token) throw new Error('登录未返回会话'); sessionStorage.setItem(tokenKey, data.token); return data; }
export async function targetAdminLoggedIn() { if (!sessionStorage.getItem(tokenKey)) return false; try { await request('/api/v1/admin/auth/session'); return true; } catch { sessionStorage.removeItem(tokenKey); return false; } }
export async function targetAdminLogout() { try { if (sessionStorage.getItem(tokenKey)) await request('/api/v1/auth/session', { method: 'DELETE' }); } finally { sessionStorage.removeItem(tokenKey); } }

export async function targetAdminRequest<T>(path: string, init: RequestInit = {}) { return request(path, init) as Promise<T>; }

const targetMediaPrefix = 'target-media://';

function mediaTypeForFolder(folder: string) {
  if (folder.startsWith('banners/')) return 'banner';
  if (folder.startsWith('products/')) return 'product';
  if (folder.startsWith('categories/')) return 'category';
  return null;
}

async function sha256(file: File) {
  if (!globalThis.crypto?.subtle) throw new Error('当前浏览器不支持文件完整性校验');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

export function targetMediaIntentId(value: string | undefined | null) {
  const source = String(value || '');
  return source.startsWith(targetMediaPrefix) ? source.slice(targetMediaPrefix.length) : null;
}

export async function targetAdminUploadImage(file: File, folder: string) {
  const mediaType = mediaTypeForFolder(folder);
  if (!mediaType) throw new Error('该模块尚未迁移到目标图片存储');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('仅支持 JPG、PNG 或 WebP 图片');
  const intent = await request('/api/v1/admin/media/upload-intents', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mediaType, contentType: file.type, byteSize: file.size, sha256: await sha256(file) })
  }) as { id: string; uploadUrl: string };
  const upload = await fetch(intent.uploadUrl, { method: 'PUT', headers: { 'content-type': file.type }, body: file });
  if (!upload.ok) throw new Error('图片上传至对象存储失败');
  await request(`/api/v1/admin/media/upload-intents/${intent.id}/confirm`, { method: 'POST' });
  return `${targetMediaPrefix}${intent.id}`;
}

