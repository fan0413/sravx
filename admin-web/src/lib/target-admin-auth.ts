const mode = import.meta.env.VITE_ADMIN_AUTH_MODE;
const apiBase = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const tokenKey = 'sravx.target.admin.session';

function enabled() { return mode === 'target'; }
function endpoint(path: string) { if (!apiBase) throw new Error('未配置 VITE_API_BASE_URL'); return `${apiBase}${path}`; }
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
