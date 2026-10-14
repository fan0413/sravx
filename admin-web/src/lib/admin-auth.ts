import { targetAdminLoggedIn, targetAdminLogin, targetAdminLogout } from './target-admin-auth';

export async function adminLoggedIn() { return targetAdminLoggedIn(); }

export async function adminLogin(username: string, password: string) {
  return targetAdminLogin(username, password);
}

export async function adminLogout() {
  return targetAdminLogout();
}
