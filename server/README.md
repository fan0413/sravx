# SRAVX API 代码导航

本目录是 `api.sravxpet.com` 的 Node.js 服务源码。它不包含生产密钥；运行时配置由服务器受限环境文件提供。

## 启动路径

`src/main.js` → `src/runtime.js` → `src/server.js`

- `main.js` 只负责启动 HTTP 服务。
- `runtime.js` 负责创建 MySQL 连接、业务仓储、会话、COS 与支付服务。
- `server.js` 负责 HTTP 路由、认证、输入校验与错误边界；业务 SQL 不应放在这里。

## 业务模块

- `auth/`：微信登录、手机号绑定、后台账号登录。
- `repositories/`：按领域封装 MySQL 查询和事务。
- `payments/`：微信支付下单、回调验签、加密入站账本和结算消费者。
- `media/`：COS 上传许可和对象键确认。
- `observability/`：请求追踪与脱敏审计。
- `migrations/`：受控结构迁移，禁止在请求处理中修改数据库结构。

## 维护规则

1. 新路由先在 `server.js` 建立认证和输入边界，再在独立仓储中实现数据操作。
2. 金额、库存、用户身份、订单状态必须由服务端读取和事务决定。
3. 支付回调先持久化，再异步消费；不得在回调请求中直接依赖客户端数据。
4. 每次代码变更至少运行 `npm test`；涉及小程序接口时同时构建对应 UniApp 模式。
5. 生产配置、证书、回调原文和用户隐私不得提交到此目录。

完整架构和任务清单见 `../docs/architecture.md` 与 `../docs/project-status-and-next-tasks.md`。
