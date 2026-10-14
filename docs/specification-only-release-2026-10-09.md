# 规格单维度选购发布及核验

日期：2026-10-09。负责人确认去掉管理端、网页、小程序及接口的颜色选择，云数据库同步适配，旧兼容列暂保留。

## 变更边界

- 当前云数据库无product_models/product_colors/product_skus/checkout_quotes表，实际商品使用product_specs；不创建新结构化表或启用新交易开关。
- 管理端旧组合编辑入口与路由转到统一商品编辑，其旧页面退为兼容提示，无颜色编辑控件。
- 两端购买模板移除颜色步骤及摘要；普通购物袋/确认订单只传selectedSpecName。无规格商品的展示默认型号不再拿去查规格表；真实规格必须属于商品，价格由服务器读取。
- 旧selectedColor不再用作普通订单规格查找；旧缓存selectedModel可作为兼容规格名称。未猜测某个颜色SKU的价格或库存，同型号多SKU场景拒绝自动选择。

## API及云数据库

- API仅修改mysql-order-write、mysql-gift-card、mysql-structured-checkout三个仓库中的选配/订单快照语句。精确补丁有原文次数预检；旧源码在 `/opt/sravx-api/.specification-only-20261009-backup`，目录700，摘要清单600。
- 普通商品查询增加has_spec，规格商品缺失名称拒绝；所有新order_items.selected_color写NULL。未启用结构化路径同步NULL写入，仍未开放交易或建表。
- 迁移015在实际远端托管MySQL执行：保留nullable selected_color列，新增ck_order_items_no_color CHECK(selected_color IS NULL)。执行前不存在非空旧记录，不删除数据；查询information_schema确认ENFORCED=YES。合成临时表验证允许NULL、拒绝非空；连接关闭后自动清理。
- API与Nginx active、本机readyz ready；受控api/mysql/cos/payment配置摘要不变，未改支付参数、数据库业务数据、商品价格或库存。最终orders数量仍0。

## 管理端

- 类型检查/构建通过，8项隔离回归通过。既有大分块警告仍存在。
- 管理端资产复制后原子更新入口，公网入口与构建逐字一致；旧哈希资产保留，静态备份 `/var/www/sravx-admin.backup-specification-only-20261009`，目录700。
- 本地及线上真实Chrome合成夹具验证：旧variants路由转编辑，无添加颜色控件；系列→剪型→分类、保存重载、配件与额外参数保留。所有业务请求拦截，不使用真实管理员会话，不改生产商品。

## 前端核验及未验收项

- 后端157项、前端83项通过；新增普通规格无需颜色、旧颜色请求拒绝、颜色组合不能静默选取及模板无颜色控件回归。
- H5构建、26页微信构建、23个非入口返回产物检查通过。
- 实际H5购买组件以其Vue模板及脚本在Chrome合成夹具挂载，切换第二规格后购物袋保存正确规格及价格，不产生selectedColor。夹具仅本地，未调用生产写接口。
- 独立H5应用入口挂载仍无内容、无pageerror，属于已记录的既存入口缺口。本次未修复根入口或发布官网，不能把组件验收表述为整站购买链路验收。
- 无可用Nightly自动化，未进行小程序模拟器/真机点击或正式发布。HBuilderX使用者需重新编译E盘源码。实际下单、支付及回调仍由负责人验收。
- 代码审查核对签名会话/用户所有权和私有图片边界保持，不新增调试响应或凭据回显；不删除历史订单快照列。
- 未Git提交/推送，不修改D盘；不创建真实订单、付款、退款、改微信配置或退役旧资源。
