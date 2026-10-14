# SRAVX 电商管理端（Vue 3）

基于 `Vue3 + Vite + TypeScript + Vue Router + Element Plus` 的管理后台，包含：

- 商品管理：商品列表、新建商品
- 订单管理：订单列表、订单详情
- 用户管理：用户列表

## 本地启动

```bash
npm install
npm run dev
```

默认本地地址：`http://localhost:5173`

## 构建产物

```bash
npm run build
```

构建后产物目录为 `dist/`。

## 当前接口与交付边界

- 当前管理端使用服务器API，默认同域请求；开发/预览通过Vite代理。身份会话与权限由服务器校验，不使用旧CloudBase适配器。
- 管理端与官网、小程序分别构建和发布，源码更新不自动改变线上版本。
- 本地可运行`node --test scripts/*.test.mjs`；`npm run build`包含类型检查。真实后台登录、写商品或审批退款不得作为无授权面试演示。

## 路由与刷新策略

- 当前项目使用 `hash` 路由（`createWebHashHistory`），静态托管无需额外重写规则
- 如果后续切换成 `history` 路由，需要在静态托管配置 URL 重写到 `index.html`

## 环境变量

默认不需要覆盖接口域名。确有独立环境时参考当前`src/lib/target-admin-auth.ts`的配置契约，不把生产会话或密钥写入环境示例。

# 渠道工作区

顶部可切换网页功能与小程序功能，入口分别为 `#/channel/web`、`#/channel/miniprogram`。共用业务仍使用原页面和原 API；在共用编辑页切换不会跳转或清空表单。渠道偏好仅保存于本机，不是权限或数据库切换。

当前工作区只组织已有功能入口，欢迎页/官网导航独立编辑、商品渠道展示/排序尚未接入；轮播也不会按工作区自动隔离。验收详情见主工作区 `docs/admin-channel-workspace-validation-2026-10-08.md`。
