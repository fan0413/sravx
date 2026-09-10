# CloudBase 函数运行时盘点快照（部分 B-01 证据）

- 采集时间：2026-09-10（Asia/Shanghai）
- 采集方式：CloudBase MCP 只读 `listFunctions`、`listFunctionTriggers`、`listFunctionLayers`
- 范围：环境 `cloud1-8gk3bptqefbf01d6` 的全部线上函数元数据。
- 数据保护：本记录不包含函数源码、环境变量、调用日志、用户数据或任何凭据。

## 已知事实

| 项目 | 结果 |
|---|---:|
| 线上函数总数 | 30 |
| 状态为 Active 的函数 | 30 |
| 已配置触发器 | 0 |
| 已配置依赖层 | 0 |
| 发现的定时触发器 | 0 |

本次逐项查询的函数为：`paymentProxy`、`giftCard`、`admin-category`、`sf-express`、`admin-inquiry`、`contact`、`admin-points-product`、`mysql-api`、`admin-stats`、`admin-banner`、`admin-scissors`、`admin-coupon`、`admin-user`、`admin-order`、`admin-product`、`lowcode-datasource`、`lowcode-automation`、`lowcode-datasource-preview`、`wxpayFunctions`、`lowcode-automation-preview`、`scissors-admin`、`order`、`banner`、`address`、`scissors`、`coupon`、`category`、`product`、`user`、`login`。

线上清单仍多于本地 16 个云函数目录，额外的后台、低代码、物流和支付相关能力不得因本次盘点而停用或退役。

## 变化观察

线上元数据表明，`admin-product` 最后修改于 2026-09-06 03:05:03，`scissors` 最后修改于 2026-09-06 02:56:22。它们晚于迁移计划的 2026-09-03 探查快照，因此该快照只能作为计划参考，不能作为生产切换依据。

## 结论与剩余门槛

本次仅确认了函数数量、运行状态、触发器和依赖层的当前元数据。它排除了“遗漏定时触发器或层依赖”这一项风险，但 **B-01 尚未完成**：仍需在不暴露源码和机密的受控环境中，逐项确认调用方、业务负责人、部署版本/制品指纹及迁移、保留、退役或待确认的处置状态。

支付相关的 `paymentProxy` 与 `wxpayFunctions` 保持待后置处理；未读取其实现、未修改其配置，也未触发任何真实支付请求。
