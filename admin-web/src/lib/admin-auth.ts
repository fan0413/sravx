import { isNonAnonymousLoggedIn, signInWithUsernamePassword, signOutCloudbase } from './cloudbase';
import { targetAdminLoggedIn, targetAdminLogin, targetAdminLogout, targetAdminModeEnabled } from './target-admin-auth';

export async function adminLoggedIn() { return targetAdminModeEnabled() ? targetAdminLoggedIn() : isNonAnonymousLoggedIn(); }

export async function adminLogin(username: string, password: string) {
  if (targetAdminModeEnabled()) return targetAdminLogin(username, password);
  return signInWithUsernamePassword(username, password);
}

export async function adminLogout() {
  if (targetAdminModeEnabled()) return targetAdminLogout();
  return signOutCloudbase();
}
