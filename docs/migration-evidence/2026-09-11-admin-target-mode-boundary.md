# 2026-09-11 管理端目标模式入口收敛

## 目的

在管理端切换到 `VITE_ADMIN_AUTH_MODE=target` 后，只开放已经接入云服务器 API、目标 MySQL 和私有 COS 的目录管理能力，避免操作人员误进入仍依赖 CloudBase 的板块。

## 已纳入目标模式

- 目标看板（商品与轮播图统计）
- 商品列表、新建商品、删除商品
- 分类列表
- 轮播图管理
- 私有 COS 商品与轮播图预览链接
- 商品创建页的分类读取

## 暂不开放

积分商品、订单、退款、用户、优惠券、礼品卡、剪刀 SN、剪刀售后、合作咨询，以及商品编辑和库存调整。这些页面在目标模式下从菜单隐藏；通过地址直接进入时会回到目标看板。

## 验证

2026-09-11 在本机执行：

```powershell
$env:VITE_ADMIN_AUTH_MODE='target'
Remove-Item Env:VITE_API_BASE_URL -ErrorAction SilentlyContinue
npm --prefix D:\saven\admin-web run build
```

构建通过。Vite 报告的单个前端包体积告警不影响构建结果；后续可单独进行依赖拆分。

## 发布状态

本次未发布静态管理端。`admin.sravxpet.com` 的互联网信息服务接入备案仍在办理，待通过后需先设置 COS 精确 CORS 规则并在浏览器完成登录、上传、目录写入和私有图片回显的端到端验收，再发布本构建产物。
