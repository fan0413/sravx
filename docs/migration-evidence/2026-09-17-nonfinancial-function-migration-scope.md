# 非资金云函数迁移范围

日期：2026-09-17。依据负责人最新决定：目标库只导入用户基础资料；支付、退款、支付回调、积分扣减/兑换、订单创建与库存扣减最后单独处理。本记录不更改 CloudBase 资源、微信配置或生产数据。

## 已在目标 API 实现并可进行后续真机验证

| CloudBase 函数 | 目标模块 | 状态 |
|---|---|---|
| `login`、`user` | 微信登录、会话、用户资料、手机号绑定 | 已实现，迁移开关默认关闭。 |
| `banner`、`category`、`product` | 公开目录 API | 已实现；新目录为空，后续重新创建。 |
| `address` | 用户地址 API | 已实现；尚未切换写入。 |
| `contact` | 合作咨询 API | 已实现 `POST /api/v1/inquiries`；必须由签名用户会话确定归属。 |
| `scissors`、本地未发布的 `scissorsAfterSale` | 工具档案、售后 API | 已实现基础读写；剪刀绑定产生积分时不得在资金阶段前启用。 |
| `admin-banner`、`admin-category`、`admin-product` | 后台目录管理 | 已实现，使用独立后台会话、角色和 COS 上传意图。 |

## 按负责人边界后置

| CloudBase 函数 | 后置原因 |
|---|---|
| `paymentProxy`、`wxpayFunctions`、CloudBase Run `payment-api` | 支付、退款、回调验签与幂等。 |
| `order`、`admin-order` | 订单创建、取消、售后退款、库存与支付状态强耦合。仅有目标端只读骨架，不切换。 |
| `admin-points-product`、积分商品相关 `product` action | 积分兑换、库存和金额规则尚未放行。 |
| `sf-express` | 发货、物流下单与微信发货上报依赖订单和外部平台配置。 |

## 不复制旧功能，改为受控新业务或退役候选

| CloudBase 函数 | 处置 |
|---|---|
| `coupon`、`admin-coupon`、`giftCard` | 旧券、旧礼品卡和权益不导入。未来如重新启用，作为新的交易业务设计，不复刻旧记录或余额。 |
| `mysql-api` | 不迁移通用数据库查询入口；目标 API 只提供按业务授权的接口。 |
| `scissors-admin` | 旧 NoSQL 管理入口与目标 MySQL 工具模型重复，作为退役候选；先保留旧端观察。 |
| `lowcode-automation`、`lowcode-automation-preview`、`lowcode-datasource`、`lowcode-datasource-preview` | 自动生成的低代码运行时，未发现确认的业务调用方或负责人；不建立无用途的替代公开接口。需确认其真实业务后迁移或停用。 |
| `admin-user`、`admin-scissors`、`admin-inquiry`、`admin-stats` | 后台运营能力将按目标数据范围重写：只展示目标端新用户、工具、咨询和目录数据；不导入旧业务历史。需补角色权限和页面调用合同。 |

## 放行规则

1. 任何目标端写入均只产生切换后新业务数据，不复制历史订单、券、礼品卡、地址、积分、剪刀或咨询。
2. 小程序或管理端切换前必须通过相应 API 合约、越权和真机测试；迁移开关默认关闭。
3. CloudBase 函数继续运行，直至负责人确认功能已替换、旧客户端覆盖完成且无回调依赖；本记录不构成删除或停用授权。
