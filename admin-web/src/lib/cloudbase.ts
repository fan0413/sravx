import tcb from "@cloudbase/js-sdk";

const envId = import.meta.env.VITE_TCB_ENV_ID || "cloud1-8gk3bptqefbf01d6";

const app = tcb.init({
  env: envId
});

type LoginUser = {
  uid?: string;
  loginType?: string;
  username?: string;
};

function getAuth() {
  return app.auth({ persistence: "local" });
}

export async function getLoginUser(): Promise<LoginUser | null> {
  const state = await getAuth().getLoginState();
  const user = (state as { user?: LoginUser } | null)?.user;
  if (!user) return null;
  return user;
}

export async function isNonAnonymousLoggedIn() {
  const user = await getLoginUser();
  if (!user) return false;
  if (user.loginType === "ANONYMOUS") return false;
  return true;
}

export async function signInWithUsernamePassword(username: string, password: string) {
  const auth = getAuth() as unknown as {
    signInWithPassword: (params: { username: string; password: string }) => Promise<unknown>;
  };
  await auth.signInWithPassword({ username, password });
  const user = await getLoginUser();
  if (!user || user.loginType === "ANONYMOUS") {
    throw new Error("登录未生效，请检查账号权限");
  }
  return user;
}

export async function signOutCloudbase() {
  await getAuth().signOut();
}

export async function ensureNonAnonymousAuth() {
  const ok = await isNonAnonymousLoggedIn();
  if (!ok) {
    throw new Error("请先使用用户名密码登录");
  }
}

export async function callCloudFunction<T = unknown>(name: string, data: Record<string, unknown>) {
  await ensureNonAnonymousAuth();
  const res = await app.callFunction({
    name,
    data
  });

  return res.result as T;
}

export async function uploadFileToCloud(cloudPath: string, file: File) {
  await ensureNonAnonymousAuth();
  const result = await app.uploadFile({
    cloudPath,
    filePath: file as unknown as string
  });
  return result.fileID;
}

export async function getTempFileUrlMap(fileIDs: string[]) {
  await ensureNonAnonymousAuth();
  const cleanIds = fileIDs.map((id) => String(id || "").trim()).filter(Boolean);
  if (cleanIds.length === 0) return {} as Record<string, string>;
  const result = await app.getTempFileURL({
    fileList: cleanIds.map((fileID) => ({
      fileID,
      maxAge: 60 * 60 * 1000 * 24 * 7
    }))
  });
  const map: Record<string, string> = {};
  (result.fileList || []).forEach((item: { fileID?: string; tempFileURL?: string; code?: string }) => {
    if (item.fileID && item.tempFileURL && item.code !== "STORAGE_FILE_NONEXIST") {
      map[item.fileID] = item.tempFileURL;
    }
  });
  return map;
}
