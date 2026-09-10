# 管理端目标 API 登录适配记录

- 时间：2026-09-10（Asia/Shanghai）

## 实现

- 新 API 增加 `GET /api/v1/admin/auth/session`，仅在有效管理员会话下返回签发会话对应的管理员 ID 与角色列表；不接受客户端指定 ID。
- 管理端新增可选目标 API 登录适配层。仅在构建时明确设置 `VITE_ADMIN_AUTH_MODE=target` 和 `VITE_API_BASE_URL` 后启用；默认仍使用 CloudBase 登录。
- 目标模式使用浏览器 `sessionStorage` 保存短期管理员令牌，路由守卫通过服务端会话核验判断登录状态，退出时调用服务端撤销会话。

## 验证与边界

- API：本地 `npm test` 36/36 通过；服务器重启后 `/readyz` 成功。
- 管理端：在原受控源码副本使用既有依赖执行 `npm run build` 成功。构建存在既有 CloudBase 代码块体积警告，未发布任何构建产物。
- 当前除登录和会话核验外，管理端业务请求仍调用 CloudBase；目标模式不得上线或作为后台切换依据，直到目录功能适配和完整回归通过。
