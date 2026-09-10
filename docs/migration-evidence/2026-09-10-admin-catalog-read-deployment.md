# 后台目录只读接口部署记录

- 时间：2026-09-10（Asia/Shanghai）
- 范围：分类、普通商品、商品规格、轮播图的后台只读查询。

## 实现

- 以目标 MySQL 的实时字段为准建立只读仓储；查询会排除软删除记录，并使用参数绑定、分页上限和角色校验。
- 新增 `catalog_editor` 管理员会话可调用的接口：
  - `GET /api/v1/admin/categories`
  - `GET /api/v1/admin/products`
  - `GET /api/v1/admin/products/:id`
  - `GET /api/v1/admin/banners`
- 这些接口不返回数据库连接信息或 COS 凭证。

## 验证

- 本地：`server` 中 `npm test`，32/32 通过；对新增文件与运行时入口执行语法检查。
- 服务器：更新 `/opt/sravx-api` 后重启 `sravx-api.service`；服务为 active，服务器本机 `/health` 返回成功，未认证后台商品请求返回 401。
- 未写入、更新或删除任何目标库业务记录；未上传、复制或删除任何业务图片；未开放公网 API。

## 后续限制

商品创建和编辑仍未启用。目标表的物流履约字段为必填项，须先以实际业务规则完成表单映射与服务端校验，不能用猜测值补齐。
