# CloudBase 云函数实时清单（2026-09-15）

## 采集范围

使用 CloudBase 只读函数清单接口复核当前活动函数；未修改任何函数、触发器、环境变量或流量配置。

## 结果

- 线上活动函数：30 个。
- 本地 `cloudfunctions/` 目录：17 个。
- 本地独有目录：`scissorsAfterSale`；其线上替代关系须在后续处置时确认。
- 线上独有函数共 14 个，均未具备退役条件：

| 类别 | 函数 |
|---|---|
| 后台运营 | `admin-category`、`admin-inquiry`、`admin-stats`、`admin-banner`、`admin-scissors`、`admin-coupon`、`admin-user`、`admin-order` |
| 物流与支付 | `sf-express`、`wxpayFunctions` |
| 低代码运行时 | `lowcode-datasource`、`lowcode-automation`、`lowcode-datasource-preview`、`lowcode-automation-preview` |

## 处置约束

所有线上独有函数暂标为“保留 / 待确认”。其中后台运营函数需纳入管理端迁移；物流与支付函数需纳入支付回调与物流迁移演练；低代码运行时需先确认是否存在后台页面、自动化或外部调用方。

本次详情探查返回的代码与运行配置不进入本仓库；后续如需归档，应使用受控位置保存脱敏制品摘要、代码哈希和负责人确认记录。
