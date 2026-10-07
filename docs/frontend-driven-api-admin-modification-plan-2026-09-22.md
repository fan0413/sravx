# 前端驱动的 API 与管理端改造方案

更新日期：2026-09-22
适用源码：`E:\sravxapp\sravx`、`D:\saven\server`、`D:\saven\admin-web`

## 1. 结论

当前 UniApp 已完成主要购物体验；目标 API 和管理端的首轮结构化目录、服务端报价和订单快照代码也已完成本地适配。它们尚未发布或启用结构化开关，因此不能把本地代码完成视为线上业务已切换。

推荐按以下顺序改造：

1. 先建立结构化商品目录、组合 SKU 和服务计划模型。
2. 再增加服务端报价接口，让确认订单停止使用本地价格。
3. 随后调整订单快照和已上线支付链路。
4. 最后切换管理端商品、积分商品、订单、退款和服务内容页面到目标 API。

SRAVX Protect 首期保持 `draft` 或 `display_only`，不计入订单金额、不自动延长保修。学徒支持首期只维护公开说明，不采集身份证或认证材料。

## 2. 已保存并在当前前端实现的修改

| 前端模块 | 当前实现 | 对后端/管理端的要求 |
| --- | --- | --- |
| 首页 | Basic、Pro、Master、配件系列入口；服务区展示激光雕刻、Protect、学徒支持、换购优惠 | 商品需要结构化系列和排序；服务卡需要可审核的内容与启停状态 |
| 商城 | 系列 → 用途 → 形态筛选；已删除“按需求选购”标签组 | API 需按系列、用途、形态、尺寸筛选，不能依赖商品名关键词 |
| 商品详情 | 固定为型号、颜色、Protect、技术参数、详情长图；底部保留首页、客服、分享、加入购物袋 | API 需返回型号、颜色、SKU、媒体用途和可用 Protect 报价 |
| 购物袋 | 按商品、型号、颜色、Protect 区分本地条目；加入后自动跳转购物袋；单件结账 | 结账前必须向服务端重新报价；本地价格只能用于展示 |
| 确认订单 | 地址、优惠券、备注、支付流程已存在 | 当前会丢失型号和 Protect，且价格由前端计算，必须改为 `quoteId` 创建订单 |
| 用户中心 | 用户资料、积分、优惠券、我的剪刀、礼品卡、地址、合作咨询、客服 | 继续使用现有会话 API；隐藏没有启用的新权益入口 |
| 工具档案/售后 | 展示型号、SN、激活日期、保修期及售后记录 | 订单 SKU 与 SN 必须能关联；Protect 生效后需返回实际权益记录 |

## 3. 当前实际缺口

### 3.1 仍待业务决策的 API 缝隙

- Protect 的价格、延保月数、换购条件、条款版本和生效规则尚未获业务确认；现阶段只能展示说明，不能收费或创建权益。
- 结构化目录仍保留旧规格和名称推断的兼容读取路径，待新商品资料补齐并完成线上切换后才可移除。
- 首页服务内容和 Protect 的完整后台发布页尚未开发；现有结构只支持目标 API 的受控读取与展示。

### 3.2 管理端剩余边界

- 目标模式已开放并适配商品、SKU、积分商品、普通/积分订单、退款审核、剪刀、用户和咨询页面；目标路径不再调用旧 CloudBase 函数。
- 优惠券和礼品卡页面仍保留为旧系统兼容功能，在目标模式隐藏且路由不放行。
- 运营角色默认进入用户列表；目录角色可进入目标库看板。两类角色的入口和路由均分开处理。
- 没有 Protect 计划、商品适用关系、条款版本和权益查询页面；仪表盘也尚未统计订单、GMV、退款和支付入站。

## 4. 推荐数据模型

### 4.1 商品与 SKU

| 表/实体 | 关键字段 | 用途 |
| --- | --- | --- |
| `products` | `series`、`tool_group`、`tool_subtype`、`display_size`、`steel_material`、`sort_order` | SPU 和商城筛选 |
| `product_models` | `product_id`、`name`、`sort_order` | 型号定义 |
| `product_colors` | `product_id`、`name`、`swatch`、`sort_order` | 颜色定义 |
| `product_skus` | `product_id`、`model_id`、`color_id`、`sku_code`、`price_fen`、`stock_available`、`stock_frozen`、`is_on_sale` | 唯一可售组合和库存事实源 |
| `product_media` | `product_id`、`sku_id`、`purpose`、`object_key`、`sort_order` | 主图、轮播、详情图、档案卡图和 SKU 图 |

约束：`(product_id, model_id, color_id)` 唯一；金额使用整数分；库存不得由前端提交结论。现有 `product_specs` 可迁入 `product_models`，在商品补齐颜色前建立一个“默认颜色”兼容 SKU。

### 4.2 服务内容与 SRAVX Protect

| 表/实体 | 关键字段 | 用途 |
| --- | --- | --- |
| `service_contents` | `code`、`title`、`summary`、`detail`、`status`、`effective_at`、`sort_order` | 首页激光雕刻、Protect、学徒支持、换购优惠的公开内容 |
| `service_plans` | `code`、`name`、`status`、`terms_version`、`terms_object_key` | Protect 计划定义 |
| `service_plan_offers` | `plan_id`、`product_id`/`sku_id`、`price_fen`、`warranty_extension_months`、`tradein_rule`、`effective_from/to` | 可购买报价和适用范围 |
| `order_service_plan_items` | `order_id`、`order_item_id`、`offer_id`、价格/条款/权益快照、`status` | 订单中的服务项 |
| `tool_protection_entitlements` | `user_scissors_id`、`order_service_plan_item_id`、`starts_at`、`ends_at`、`status` | SN 绑定后的实际权益 |

Protect 状态建议：`draft`、`reviewing`、`active`、`retired`。只有 `active` 且在有效期内的 offer 才能进入报价。当前业务规则未确认前统一使用 `draft` 或 `display_only`。

### 4.3 报价与订单快照

新增 `checkout_quotes`、`checkout_quote_items`，保存短时服务端报价；普通订单项补充：`sku_id`、型号快照、颜色快照、SKU 快照、单价快照。报价默认 10 分钟失效，创建订单时再次校验库存与状态。

## 5. API 修改方案

### 5.1 保留并扩展的目录 API

| 方法 | 路径 | 修改内容 |
| --- | --- | --- |
| `GET` | `/api/v1/catalog/home` | 返回系列入口、推荐商品和已发布的 `serviceContents` |
| `GET` | `/api/v1/catalog/products` | 新增 `series`、`toolGroup`、`toolSubtype`、`size` 查询参数 |
| `GET` | `/api/v1/catalog/products/{id}` | 返回 `models`、`colors`、`skus`、分用途媒体和 `protectOffers` |
| `GET` | `/api/v1/catalog/service-contents/{code}` | 返回已发布服务详情；草稿不对小程序暴露 |

商品详情响应中的每个 SKU 至少包含：`id`、`modelId`、`colorId`、`skuCode`、`priceFen`、`available`、`image`。前端不再拼接规格名称判断库存和价格。

### 5.2 新增报价 API

`POST /api/v1/checkout/quotes`

当前本地实现只接受：`skuId`、`quantity`、可选 `protectOfferId`；客户端传入的价格、商品名称和库存结论一律忽略。响应返回：`quoteId`、`expiresAt`、商品金额、服务金额、应付金额和型号/颜色/SKU 快照。首期只允许一件购物袋条目结账。

`protectOfferId` 目前仅用于返回可追溯的 `displayOnly` 服务说明，金额固定为零；不写入服务订单项，也不会创建真实收费。优惠券活动功能继续保留在旧订单兼容链路，目标结构化报价暂不接收优惠券，避免在没有活动数据时形成无效优惠结算。

### 5.3 修改订单与支付

- 在 `STRUCTURED_CHECKOUT_ENABLED=true` 后，`POST /api/v1/orders` 接受 `quoteId`、`addressId`、`remark`、`idempotencyKey`；停止接受客户端价格、商品名、型号文本和 Protect 布尔值。开关关闭时，旧订单 API 完全保持兼容。
- 保留当前支付路径 `POST /api/v1/payments/wechat/orders/{orderId}`，继续由服务端读取订单金额。
- 订单详情与列表增加 SKU、型号、颜色和 Protect 快照。
- 支付成功消费者在同一事务中确认商品库存、订单和服务计划订单项。
- SN 绑定时根据订单项和生效规则创建 `tool_protection_entitlements`；绑定前 Protect 显示“待激活”。

### 5.4 管理端 API

| 模块 | 建议接口 |
| --- | --- |
| 商品结构 | 扩展现有 `/api/v1/admin/products` CRUD，一次提交 SPU、型号、颜色、SKU 和媒体 |
| 系列预览 | `GET /api/v1/admin/catalog/preview?series=pro` |
| Protect 计划 | `/api/v1/admin/service-plans` CRUD、`/{id}/offers`、`/{id}/publish` |
| 服务内容 | `/api/v1/admin/service-contents` CRUD、预览、发布/撤回 |
| 积分商品 | 直接适配已上线 `/api/v1/admin/points-products` |
| 订单 | 直接适配已上线 `/api/v1/admin/orders?type=goods|points` 和 `/{id}/shipment` |
| 退款 | 直接适配已上线 `/api/v1/admin/refund-requests`、`decision`、`execute` |
| 统计 | 扩展 `/api/v1/admin/overview`，只统计目标库新业务 |

所有管理端写接口使用现有管理员会话、RBAC 和审计日志；发布 Protect 和服务内容需要比普通编辑更高的发布权限。

## 6. 管理端页面修改方案

### P0：先切换已有目标能力

1. **已完成（本地待发布）**：目标模式路由守卫开放积分商品、普通订单、积分订单、退款、剪刀和售后页面；按目录编辑与运营管理两类权限分别校验。
2. **已完成（本地待发布）**：`admin.ts` 中积分商品、订单、积分订单和退款审核优先走目标 API；旧 CloudBase 仅保留在未启用目标模式时的兼容分支。
3. **已完成（本地待发布）**：积分商品采用“上传意图 → 服务端确认对象 → 保存对象键”的受控图片链路，页面层继续使用原 snake_case 展示字段。
4. **部分完成（本地待发布）**：普通订单详情可在目标模式逐单录入物流并调用目标发货接口；旧的批量发货、顺丰、微信同步和延期操作在目标模式隐藏。SKU、颜色、Protect 快照需随 P1/P2 的订单模型升级完成。

### P1：商品编辑升级

1. 商品基础区增加系列、用途、形态、尺寸和真实材质。
2. 把现有“规格”改名为“型号”，增加独立颜色列表和色值。
3. 增加 SKU 组合表格：型号 × 颜色，逐项维护 SKU、价格、库存、图片、上下架和履约信息。
4. 媒体按主图、轮播、详情长图、档案卡图、SKU 图分区管理。
5. 发布前校验非配件商品必须有系列、用途、型号、至少一个可售 SKU、主图和保修期。

### P2：服务计划与内容

1. 新增“服务内容”页面，管理首页四类服务卡、详情、排序、有效期和发布状态。
2. 新增“SRAVX Protect”页面，分为计划、适用商品/SKU、价格、延保月数、换购规则和条款版本。
3. 提供草稿预览；发布前检查价格、条款、适用范围和生效时间。
4. 学徒支持仅维护公开说明和申请入口状态；首期不增加身份证上传字段。

### P3：运营预览和统计

1. 增加系列目录、商品详情和服务卡预览。
2. 仪表盘显示目标库订单、GMV、待发货、退款、低库存和支付入站异常。
3. 增加字段缺失提示，避免商品因为系列或 SKU 不完整而在小程序出现错误分组。

## 7. 小程序配套修改

1. 商品详情以 SKU ID 记录选择，不再只保存型号/颜色文本。
2. 购物袋保存 `skuId` 和可选 `protectOfferId`；名称、价格和图片只作本地展示缓存。
3. 进入确认订单和数量、优惠券发生变化时重新请求报价。
4. 确认订单只展示报价响应并使用 `quoteId` 下单，不在前端计算最终金额。
5. Protect 没有 active offer 时显示说明卡或隐藏购买选项，不显示“已选付费服务”。

## 8. 实施顺序与验收

| 阶段 | 交付物 | 验收结果 |
| --- | --- | --- |
| A | 目录/SKU/服务计划数据库迁移与仓储 | 可建立一个型号、两个颜色、两个 SKU 的测试商品 |
| B | 商品详情和报价 API | 篡改价格、失效报价、无库存 SKU 均不能下单 |
| C | 管理端 P0/P1 | 目标模式不再调用对应 CloudBase 函数；可完整维护商品选配 |
| D | 订单快照和小程序切换 | 型号、颜色、SKU、Protect 在购物袋、订单、支付后保持一致 |
| E | Protect/服务内容管理 | 草稿不对用户可售；发布内容与条款可追溯 |
| F | 预览、统计和回归 | 首页、商城、详情、购物袋、支付、工具档案形成完整闭环 |

## 8.1 本轮本地实现状态（未发布）

- 已新增 `server/migrations/012_structured_catalog_sku_and_services.sql`：结构化 SPU/SKU、服务内容、服务计划、短时报价、订单服务快照和工具权益表均已定义；该文件没有被应用程序自动执行。
- 已新增受开关保护的结构化目录与报价能力：目录可在开关打开后返回型号、颜色、SKU、媒体、已发布服务内容与 Protect 说明；`POST /api/v1/checkout/quotes` 以服务端 SKU 价格创建十分钟报价；使用报价创建订单时写入 SKU、型号、颜色和 SKU 编码快照。
- 支付成功的库存结算代码可在同一开关下释放 SKU 冻结库存并累计 SPU 销量；取消未支付结构化订单时同样释放该 SKU 冻结库存。该能力尚未接入真实支付验收。
- Protect 仍是展示状态：即使存在 active offer，报价金额为零，订单不会形成服务计划项或权益。
- 已通过后端 132 项自动测试；UniApp 的结构化选配演练构建已通过。浏览器级管理端和小程序页面验证尚待后续构建后的设备验收。
- 管理端已具备受同一开关保护的 SKU 管理页面与接口：商品列表可进入“型号与 SKU”页面，通过 `GET/PUT /api/v1/admin/products/{id}/variants` 维护系列、工具分类、型号、颜色和组合 SKU；接口只接受目录编辑者的管理员会话。省略的旧 SKU 会自动下架而非删除，以保留报价与订单的可追溯性。

后续开发约定：不再要求为每项功能建立隔离恢复库演练；直接完成本地代码、构建和自动测试。启用前仍须审核目标库当前结构与备份，并经负责人明确确认后执行生产迁移、发布带开关的 API；仅在数据库结构、支付结算和小程序 `quoteId` 调用均验收后设置 `STRUCTURED_CHECKOUT_ENABLED=true`。任何一步未完成时不得开启该配置。

## 8.2 管理端目标 API 适配复核（已发布，待业务验收）

- 商品删除在目标模式直接使用目标管理员会话和删除接口，不再弹出旧 CloudBase 密码校验；历史订单不受删除操作影响。
- 退款列表的状态、订单号、分页都由目标 API 在服务端筛选；退款详情只返回运营审核所需的用户、订单、地址和商品快照，不展示 OpenID 或微信交易号。
- 用户详情在目标模式为只读资料与地址页，历史订单、优惠券和编辑动作仅在旧系统兼容模式保留。
- 运营角色只能访问用户、咨询、订单、退款和剪刀售后；目录角色只能访问看板、商品、SKU、积分商品、分类、轮播和剪刀 SN。优惠券、礼品卡没有目标模式入口。
- 验证：管理端生产构建通过；后端自动测试 132 项全部通过。2026-09-22 已发布 API 与管理端制品，发布后健康、就绪、公开目录、管理端入口和未认证后台拒绝检查均通过；未修改生产数据库、未发布商品，也未发起支付或退款。

## 9. 已知事实、合理推测和待确认信息

### 已知事实

- UniApp 当前真实源码位于 `E:\sravxapp\sravx`。
- 目标 API 已上线登录、用户、目录、普通/积分订单、支付、退款、积分商品后台和订单后台接口。
- 前端购物袋仍以本地价格和文本选配为主；订单没有保存型号与 Protect。
- 管理端仍同时包含目标 API 与 CloudBase 两套适配。

### 合理推测

- 首期继续单件结账，可以显著降低报价、库存和支付改造复杂度。
- 商品数量尚少时直接建立标准 SKU，比继续扩展 `product_specs` 的兼容字段更易维护。

### 待业务确认

- Protect 的价格、延保月数、换购条件、例外情形、条款和生效时点。
- 学徒支持的申请条件、认证材料、权益、有效期和申诉流程。
- 激光雕刻的收费、交期、内容限制和售后规则。
- 换购优惠的估价、回收、折抵和活动期限。

这些信息未确认前，只能做草稿配置和展示说明，不能生成收费、权益或身份采集流程。
