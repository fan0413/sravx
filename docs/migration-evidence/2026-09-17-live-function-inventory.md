# 线上云函数实时盘点

盘点时间：2026-09-17。通过 CloudBase 只读函数清单获取；所有条目均为 `Active`，总数为 30。该盘点不读取函数源码、不导出生产数据、不修改 CloudBase 资源。

## 已有目标端替代实现

`login`、`user`、`banner`、`category`、`product`、`address`、`contact`、`admin-banner`、`admin-category`、`admin-product`、`admin-user`、`admin-inquiry`。

其中小程序与后台切换开关仍默认关闭；`admin-user` 只读，`admin-inquiry` 仅允许修改处理状态。

## 资金阶段后置

`paymentProxy`、`wxpayFunctions`、`order`、`admin-order`、`admin-points-product`、`coupon`、`admin-coupon`、`giftCard`、`sf-express`。

这些函数包含支付、退款、订单、积分、优惠券、礼品卡或物流等资金和外部平台行为，须按专项迁移方案、冻结和负责人授权处理。

## 暂不复刻，保留旧端观察

`mysql-api`：通用数据访问入口，不迁移为公开 API。

`scissors`、`admin-scissors`、`scissors-admin`：当前绑定 SN 会产生积分权益；仅在积分规则和权限模型完成后迁移写能力。

`admin-stats`：目录类统计已有目标实现；订单、金额、积分统计留在资金阶段。

`lowcode-automation`、`lowcode-automation-preview`、`lowcode-datasource`、`lowcode-datasource-preview`：线上标记为自动生成，尚无确认调用方或业务负责人，不能臆造替代接口或删除旧函数。

## 当前结论

非资金链路的目标 API 与前端兼容层已覆盖用户资料、目录、地址、合作咨询及后台目录/运营读取；未启用任何用户流量。完整迁移尚不满足退役 CloudBase 的条件，旧函数继续保留。
