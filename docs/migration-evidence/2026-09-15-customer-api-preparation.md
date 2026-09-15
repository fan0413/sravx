# 2026-09-15 客户端 API 迁移准备记录

## 结论

本记录覆盖本地仓库中的目标 API 实现与小程序受控接入代码。它不代表服务器已部署新制品、目标库已导入业务数据、域名已备案，或 CloudBase 已切换/退役。

小程序的 `authenticatedApiMigration` 默认值仍为 `enabled: false`。未由负责人修改为启用状态前，所有既有调用继续走 CloudBase。

## 本次实现范围

| 业务域 | 目标 API | 小程序受控接入 | 关键约束 |
|---|---|---|---|
| 微信身份会话 | `POST /api/v1/auth/wechat/session` | 为已接入接口获取并缓存短期会话 | 仅服务端使用微信凭据；客户端不传 OpenID。 |
| 个人资料与积分读取 | `GET /api/v1/me`、`GET /api/v1/me/points` | 已接入开关 | 查询身份来自签名会话。 |
| 个人资料修改 | `PUT /api/v1/me` | 已接入开关 | 强制每月一次；依赖未执行的 `005_user_profile_monthly_limit.sql` 草案。 |
| 地址簿 | `GET/POST /api/v1/addresses`、`PUT/DELETE /api/v1/addresses/{id}`、`PUT /api/v1/addresses/{id}/default` | 已接入开关 | 所有增删改查按会话用户归属；默认地址更新使用事务。 |
| 工具档案 | `GET/POST /api/v1/tools`、`GET/DELETE /api/v1/tools/{id}` | 已接入开关 | SN 绑定锁定剪刀记录；保修快照与积分奖励同一事务。 |
| 工具售后 | `GET/POST /api/v1/tools/{id}/after-sales`、`POST /api/v1/after-sales/{id}/shipment` | 已接入开关 | 仅返回用户可见的记录与留言，不返回收件地址或手机号。 |
| 普通商品订单读取 | `GET /api/v1/orders`、`GET /api/v1/orders/{id}`、`GET /api/v1/orders?orderNo=` | 已接入开关 | 只读；按会话用户查询；旧 `cloud://` 图片标识不返回。 |
| 积分订单读取 | `GET /api/v1/points-orders`、`GET /api/v1/points-orders/{id}`、`GET /api/v1/points-orders?orderNo=` | 已接入开关 | 只读；返回当前用户自己的积分订单、积分余额和流水。 |

## 明确未迁移/未放行

- 资料字段 `profile_updated_at`：迁移草案已写入仓库，但尚未在目标库执行。
- 普通订单创建、取消、确认收货、库存变更、优惠券、积分抵扣、支付、退款和支付回调。
- 积分订单、礼品卡、用户优惠券、物流下单、管理端订单/售后操作。
- 任何真实登录、小程序请求域名配置、Nginx 路由发布、数据导入、域名/DNS/备案或 CloudBase 配置变更。

## 本地验证

- `server` 的 `npm test`：46 项测试通过。
- 小程序 `app.js` 与 `utils/api.js` 已进行 Node 语法检查。
- 重点覆盖：签名会话决定用户归属、伪造 `openid/userId` 参数无效、SN 绑定锁定、地址默认值事务、售后记录最小化返回、订单读取的用户隔离。

## 后续放行前条件

1. 重新采集线上函数、源库、对象存储和支付状态，完成迁移计划 B-01/B-02。
2. 在隔离环境完成目标库恢复演练和新旧 API 合约测试；不允许订单、库存、积分、礼品卡、退款长期双写。
3. 域名备案与小程序合法请求域名完成后，先在受限测试用户范围验证登录、地址、工具档案和售后端到端流程。
4. 支付入站持久化、验签、幂等与回调重放演练通过后，才评估订单写入与支付迁移。
