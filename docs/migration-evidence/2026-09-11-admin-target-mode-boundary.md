# 2026-09-11 管理端目标模式入口收敛

## 目的

在管理端切换到 `VITE_ADMIN_AUTH_MODE=target` 后，只开放已经接入云服务器 API、目标 MySQL 和私有 COS 的目录管理能力，避免操作人员误进入仍依赖 CloudBase 的板块。

## 已纳入目标模式

- 目标看板（商品与轮播图统计）
- 商品列表、新建商品、编辑商品（含库存与履约信息）、删除商品
- 分类列表
- 轮播图管理
- 私有 COS 商品与轮播图预览链接
- 商品创建页的分类读取
- 商品名称、分类、上架状态、低库存、SKU 与发货类型筛选

## 暂不开放

积分商品、订单、退款、用户、优惠券、礼品卡、剪刀 SN、剪刀售后和合作咨询。这些页面在目标模式下从菜单隐藏；通过地址直接进入时会回到目标看板。

## 验证

2026-09-16 在本机执行：

```powershell
$env:VITE_ADMIN_AUTH_MODE='target'
$env:VITE_API_BASE_URL='https://admin-api.invalid'
npm --prefix D:\saven\admin-web run build
```

构建通过。Vite 报告的单个前端包体积告警不影响构建结果；后续可单独进行依赖拆分。

## 发布状态

本次未发布静态管理端。根域名的 ICP 接入服务已显示正常，但尚未核验 `admin.sravxpet.com` 的 DNS、证书、COS 精确 CORS 与浏览器端到端流程；完成这些核验前不得发布构建产物。
