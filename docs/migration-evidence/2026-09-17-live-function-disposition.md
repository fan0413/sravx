# 线上云函数制品与处置复核（2026-09-17）

## 复核结果

CloudBase 当前仍有 30 个活动云函数，均成功取得运行时、最近修改时间、处理入口、触发器数量和环境变量名称清单；本记录不包含环境变量值、用户资料或任何机密。

- 30 个函数均为活动状态，且没有定时触发器。
- 目录、登录、用户、地址、咨询、工具档案、售后、订单读取和礼品卡记录读取已有目标 API 实现；后台售后仅迁移工单查询、收件地址和商家留言。小程序迁移开关仍关闭。
- 低代码 4 个函数和 `mysql-api` 未在当前仓库检出调用点；集中日志服务已启用，但 2026-09-10 至 2026-09-17 的函数名检索没有命中。该事实不足以证明可以停用，仍需业务负责人确认调用方。

## 处置分类

| 分类 | 函数 | 当前结论 |
| --- | --- | --- |
| 已有目标兼容实现 | `login`、`user`、`address`、`banner`、`category`、`product`、`contact`、`scissors`、`order`、`admin-banner`、`admin-category`、`admin-product`、`admin-user`、`admin-inquiry` | 保留 CloudBase 入口，待目标数据、真机回归和流量切换验证。目标 `admin-product` 已补齐精确库存设置接口，供新建目标商品使用；`scissors` 的后台售后仅开放目标新工单的查询、收件地址及商家留言，状态流转、物流、补贴和换货仍后置。 |
| 已有目标实现，待部署验收 | `paymentProxy`、`wxpayFunctions`、`admin-order`、`admin-points-product` | 支付下单、验签回调、退款处理、积分商品管理和后台订单管理已有目标 API；CloudBase 保留至新客户端和真实交易验收完成。 |
| 履约后置 | `sf-express` | 目标 API 已支持受权限保护的物流单号登记；顺丰下单、物流查询、微信发货上报和失败补偿仍未完成。 |
| 新业务重建设计 | `coupon`、`admin-coupon`、`giftCard`、`admin-scissors`、`admin-stats` | 历史券、礼品卡、剪刀和统计不导入；未来只基于目标新数据重新建立。目标后台剪刀编号库存接口已于本日完成并部署。 |
| 不迁移的历史重复入口 | `scissors-admin` | 线上制品是已废弃的 NoSQL 版剪刀管理，动作仅为 `add`、`batchAdd`、`list`、`detail`、`delete`；其中删除还会直接删除绑定记录。当前仓库没有调用点，且功能已由受 RBAC 保护、只软删除未使用编号的目标 `admin-scissors` 接口覆盖。保留旧函数，不复制、不删除。 |
| 不迁移的通用/重复入口 | `mysql-api` | 线上制品包含目录查询的重复动作（轮播、分类、商品、推荐、商品详情）以及可由调用方指定表名和参数的通用查询。目录动作已由目标受控目录 API 覆盖；通用查询会绕过目标端的接口、权限和字段边界，不复制、不开放。保留旧函数，等待后续停用审批。 |
| 需明确归属 | `lowcode-automation`、`lowcode-automation-preview`、`lowcode-datasource`、`lowcode-datasource-preview` | 两个 automation 是可执行传入脚本的通用 VM 运行时，两个 datasource 是 WeDa 运行时代理；无当前仓库调用点和近 7 天日志命中。不复制通用低代码运行时，等待负责人确认调用方、保留期限或退役。 |

## 运行时风险

`lowcode-automation*` 仍使用 Node.js 16，`lowcode-datasource*` 和 `wxpayFunctions` 仍使用 Node.js 12。它们在确认实际用途前不得复制为新的生产入口；若需保留，应先设计受维护运行时和权限边界。

## 下一步

优先按目标新数据模型补齐后台剪刀库存管理的只读和建档能力；不包含用户绑定、积分奖励、订单、支付、退款或物流操作。现有 CloudBase 函数继续保留。
