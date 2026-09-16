import { isNonAnonymousLoggedIn, signInWithUsernamePassword, signOutCloudbase } from './cloudbase';
import { targetAdminLogin, targetAdminLogout, targetAdminCatalogModeEnabled } from './target-admin-auth';

export async function adminLoggedIn() { return isNonAnonymousLoggedIn(); }

export async function adminLogin(username: string, password: string) {
  const result = await signInWithUsernamePassword(username, password);
  if (targetAdminCatalogModeEnabled()) await targetAdminLogin(username, password);
  return result;
}

export async function adminLogout() {
  try {
    if (targetAdminCatalogModeEnabled()) await targetAdminLogout();
  } finally {
    await signOutCloudbase();
  }
}
