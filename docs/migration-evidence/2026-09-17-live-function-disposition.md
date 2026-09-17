# 线上云函数制品与处置复核（2026-09-17）

## 复核结果

CloudBase 当前仍有 30 个活动云函数，均成功取得运行时、最近修改时间、处理入口、触发器数量和环境变量名称清单；本记录不包含环境变量值、用户资料或任何机密。

- 30 个函数均为活动状态，且没有定时触发器。
- 目录、登录、用户、地址、咨询、工具档案、售后、订单读取和礼品卡记录读取已有目标 API 实现，但小程序迁移开关仍关闭。
- 低代码 4 个函数和 `mysql-api` 未在当前仓库检出调用点；集中日志服务已启用，但 2026-09-10 至 2026-09-17 的函数名检索没有命中。该事实不足以证明可以停用，仍需业务负责人确认调用方。

## 处置分类

| 分类 | 函数 | 当前结论 |
| --- | --- | --- |
| 已有目标兼容实现 | `login`、`user`、`address`、`banner`、`category`、`product`、`contact`、`scissors`、`order`、`admin-banner`、`admin-category`、`admin-product`、`admin-user`、`admin-inquiry` | 保留 CloudBase 入口，待目标数据、真机回归和流量切换验证。 |
| 资金或履约后置 | `paymentProxy`、`wxpayFunctions`、`admin-order`、`admin-points-product`、`sf-express` | 支付、退款、库存、积分或物流强耦合；等待专项事务、回调和对账方案。 |
| 新业务重建设计 | `coupon`、`admin-coupon`、`giftCard`、`admin-scissors`、`admin-stats` | 历史券、礼品卡、剪刀和统计不导入；未来只基于目标新数据重新建立。 |
| 需明确归属 | `lowcode-automation`、`lowcode-automation-preview`、`lowcode-datasource`、`lowcode-datasource-preview`、`mysql-api`、`scissors-admin` | 无确认业务调用方；不复制通用 SQL 或低代码运行时，等待负责人确认迁移、保留或退役。 |

## 运行时风险

`lowcode-automation*` 仍使用 Node.js 16，`lowcode-datasource*` 和 `wxpayFunctions` 仍使用 Node.js 12。它们在确认实际用途前不得复制为新的生产入口；若需保留，应先设计受维护运行时和权限边界。

## 下一步

优先按目标新数据模型补齐后台剪刀库存管理的只读和建档能力；不包含用户绑定、积分奖励、订单、支付、退款或物流操作。现有 CloudBase 函数继续保留。
