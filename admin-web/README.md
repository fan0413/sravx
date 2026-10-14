# 管理后台

用于编辑商品、分类、图片以及查看订单和售后，使用Vue 3、TypeScript、Vue Router和Element Plus。

## 启动和检查

- npm ci：安装依赖。
- npm run dev：本地开发。
- npm run build：检查类型并构建，产物在dist。
- node --test scripts/*.test.mjs：检查工作区和请求封装。

默认同域请求后端，本地开发由Vite代理转发。需要独立接口地址时再配置VITE_API_BASE_URL，不把账号密码写进仓库。

## 代码在哪

- src/views：后台页面。
- src/api/admin.ts：商品、订单、用户等请求函数。
- src/lib/target-admin-auth.ts：登录会话、请求封装和图片上传。
- src/router：页面路由，使用hash方式，刷新不会找不到静态页面。

通用、网页和小程序工作区主要用于整理功能入口，不代表三个不同数据库，也不自动分开轮播内容。旧云开发适配器不再执行。

函数参数查代码类型及[接口备忘](../docs/api-reference.md)。调试用模拟账号和数据，退款、发货等操作不要直接拿线上订单测试。
