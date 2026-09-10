import { isNonAnonymousLoggedIn, signInWithUsernamePassword, signOutCloudbase } from './cloudbase';
import { targetAdminLoggedIn, targetAdminLogin, targetAdminLogout, targetAdminModeEnabled } from './target-admin-auth';
export async function adminLoggedIn() { return targetAdminModeEnabled() ? targetAdminLoggedIn() : isNonAnonymousLoggedIn(); }
export async function adminLogin(username: string, password: string) { return targetAdminModeEnabled() ? targetAdminLogin(username, password) : signInWithUsernamePassword(username, password); }
export async function adminLogout() { return targetAdminModeEnabled() ? targetAdminLogout() : signOutCloudbase(); }
