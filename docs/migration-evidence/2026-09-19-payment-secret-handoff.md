# 支付密钥迁入交接（2026-09-19）

## 已完成

- 只读检查显示旧 CloudBase Run `payment-api` 正常运行，且配置中存在商户号、AppID、APIv3 密钥、商户私钥、商户证书序列号、平台公钥/证书和回调地址；平台返回均为脱敏值，未读取或输出任何原文。
- 服务器已建立 `/home/deploy/.config/sravx/payment.env`，所有者 `deploy:deploy`、权限 `0600`。
- 已生成服务器侧独立的入站加密密钥；`PAYMENT_CALLBACK_ENABLED=false`，所以回调路径继续返回 404。
- `sravx-api` 重启后 ready 检查通过。

## 仍需由商户平台负责人完成

从旧支付服务的受控配置或微信支付商户平台取得下列现有值，并仅写入服务器受控位置，绝不发送到聊天、Git、截图、普通文档或客户端：

| 用途 | 目标配置 |
| --- | --- |
| 商户与小程序标识 | `WECHAT_PAY_MCH_ID`、`WECHAT_PAY_APP_ID` |
| APIv3 回调解密 | `WECHAT_PAY_API_V3_KEY` |
| 商户请求签名 | 商户证书序列号与私钥文件路径 |
| 回调验签 | 当前及轮换期平台证书，按序列号保存 |

在这批机密由负责人写入服务器后，只需告知“支付密钥已就位”，无需提供值。后续操作将先完成本机验签和回调重放演练；不会立即改微信支付回调地址或开启真实收款。

## 仍然禁止的动作

- 不开启 `PAYMENT_CALLBACK_ENABLED`。
- 不修改微信支付商户平台的通知地址。
- 不创建付款、退款、发货或物流请求。
- 不停用 CloudBase 的 `paymentProxy`、`wxpayFunctions` 或旧 `payment-api`。
