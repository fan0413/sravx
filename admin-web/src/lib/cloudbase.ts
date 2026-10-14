// Compatibility boundary for screens whose server implementation is pending.
// Never initialize an SDK or send a request to the expired environment.
function unavailable(): never {
  throw new Error('该功能尚未接入服务器，旧环境已停用；本次操作未执行');
}

export async function getLoginUser(): Promise<{ uid?: string; loginType?: string; username?: string } | null> { return unavailable(); }
export async function signInWithUsernamePassword(_username: string, _password: string): Promise<unknown> { return unavailable(); }
export async function callCloudFunction<T = unknown>(_name: string, _data: Record<string, unknown>): Promise<T> { return unavailable(); }
export async function uploadFileToCloud(_cloudPath: string, _file: File): Promise<string> { return unavailable(); }
export async function getTempFileUrlMap(_fileIDs: string[]): Promise<Record<string, string>> { return unavailable(); }
