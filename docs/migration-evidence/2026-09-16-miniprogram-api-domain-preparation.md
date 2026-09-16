# 2026-09-16 小程序 API 域名准备

## 已验证

- `https://api.sravxpet.com/health` 返回 200，HTTPS 与 Nginx 到本机 API 的代理正常。
- `https://api.sravxpet.com/api/v1/catalog/home` 返回 200，但目标目录数据为空；不得因此开启小程序目录迁移。
- 小程序迁移配置已预置正式 API 域名，但 `readOnlyApiMigration.enabled` 与 `authenticatedApiMigration.enabled` 均保持 `false`，线上版本继续使用 CloudBase。

## 微信公众平台配置

仅在“小程序后台 → 开发管理 → 开发设置 → 服务器域名”中新增一项：

- request 合法域名：`https://api.sravxpet.com`

当前不添加 uploadFile、downloadFile 或 socket 域名：小程序尚未将这些通道迁移至目标 API。保存域名不等于发布小程序代码，也不应在数据迁移前开启任何 API 开关。

## 激活前门槛

1. 目标 MySQL 完成商品、分类、轮播图及关联媒体的数据迁移与核验；当前目录为空。
2. 微信公众平台域名保存成功，并以真机验证 HTTPS 请求。
3. 目标登录、用户会话、地址簿接口完成隔离测试；支付、订单、退款继续维持旧路径。
4. 使用内部测试账号灰度开启只读目录开关，确认商品、分类、图片回显后再扩大范围。
