# 后台运营 API：用户与合作咨询

日期：2026-09-17。此批次实现的是目标端新数据的后台运营接口，不导入任何 CloudBase 历史订单、商品、优惠券、礼品卡、积分、地址、剪刀或咨询记录。

## 接口与权限

| 接口 | 行为 | 权限 |
|---|---|---|
| `GET /api/v1/admin/users` | 分页查看目标端用户基础资料 | `operations_manager` |
| `GET /api/v1/admin/users/:id` | 查看目标端用户基础资料及其目标端地址 | `operations_manager` |
| `GET /api/v1/admin/inquiries` | 分页查看目标端合作咨询 | `operations_manager` |
| `PUT /api/v1/admin/inquiries/:id` | 修改咨询处理状态（待处理、已联系、已合作） | `operations_manager` |

用户接口不返回 OpenID、UnionID 或 `_openid`，也不提供积分、等级、订单、优惠券或账户状态的后台修改入口。用户权益及交易相关操作仍留在资金阶段。

## 管理端适配

管理端增加独立开关 `VITE_ADMIN_OPERATIONS_MODE=target`。默认关闭；开启后，用户列表、用户资料和合作咨询改调目标 API。用户资料页在此模式下只读，避免把积分、等级或状态修改误接入非资金迁移。

## 验证

- `server`: `npm test`，76 项通过。
- `admin-web`: `npm run build` 通过。
- 接口单测覆盖独立角色、分页过滤、身份标识不下发，以及咨询状态白名单。

## 未执行的动作

- 未向目标库写入用户、咨询或任何历史数据。
- 未创建或授予 `operations_manager` 角色。
- 未开启管理端运营开关、未切换用户流量、未修改 CloudBase 函数或资源。
