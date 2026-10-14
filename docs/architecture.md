# 代码分工

更新：2026-10-14。

## 一次商品请求怎么走

页面调用sravx/common/api.js里的函数，函数向后端发请求。后端先检查参数和登录状态，再通过仓储文件查询MySQL，最后把结果返回页面。

官网和小程序读取同一份商品，不分别复制一套商品数据。管理端负责维护这份数据。

| 文件或目录 | 主要作用 |
|---|---|
| sravx/pages | 小程序和网页页面入口 |
| sravx/components | 页面组件，ScissorOrbitH5是官网剪刀展示 |
| sravx/common/api.js | 用户端请求入口 |
| sravx/common/product-classification.mjs | 整理系列和剪型 |
| sravx/common/product-price.mjs | 检查价格、计算最低规格价 |
| admin-web/src/api/admin.ts | 管理端业务请求函数 |
| admin-web/src/lib/target-admin-auth.ts | 管理端登录、请求和图片上传 |
| server/src/main.js | 启动服务 |
| server/src/runtime.js | 连接数据库并组装各模块 |
| server/src/server.js | 根据路径处理请求和检查权限 |
| server/src/routes/catalog.js | 商品公开查询 |
| server/src/repositories | 数据库查询与保存 |
| server/src/payments | 支付通知和订单更新 |

## 图片怎么显示

数据库保存图片引用，图片本身放COS。查询商品时，后端生成有时效的HTTPS地址，前端用地址显示图片。临时地址过期后，需要重新查询商品；不能把临时链接当成永久地址保存。

## 几个需要注意的地方

- 官网公开商品查询不需要登录，地址和订单查询需要用户登录，后台接口需要管理员权限。
- 前端显示价格，但最终金额和库存检查由后端完成。
- 收到支付通知后先保存，再处理订单；重复通知不能重复扣库存或修改订单。
- 退款申请提交成功，不等于退款已经到账。
- 官网展示组件只放在H5构建里，小程序不使用它。

早期云开发目录仅作参考。当前代码不应该在服务器请求失败时重新调用过期云环境。
