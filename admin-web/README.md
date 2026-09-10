# 电商管理平台前端骨架（Vue3）

基于 `Vue3 + Vite + TypeScript + Pinia + Vue Router + Element Plus` 的管理后台前端骨架，包含：

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

## 当前阶段说明（本地优先）

- 当前阶段先使用本地 `localhost` 联调
- 暂不做接口封装与托管上线流程
- 页面完善后再统一接入 API 封装并上传腾讯云静态托管

## 路由与刷新策略

- 当前项目使用 `hash` 路由（`createWebHashHistory`），静态托管无需额外重写规则
- 如果后续切换成 `history` 路由，需要在静态托管配置 URL 重写到 `index.html`

## 环境变量

本地与生产环境目前都先指向本地服务（后续上线再替换）：

```bash
VITE_API_BASE_URL=http://localhost:3000
```
