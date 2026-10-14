# 地址错误及 HBuilderX 返回组件修复证据

日期：2026-10-09。E盘主工作区源码修复，地址API补丁已部署；小程序未发布。

## 已核验原因

- 地址列表与订单读取地址的users/addresses JOIN，在现用托管MySQL返回ER_CANT_AGGREGATE_2COLLATIONS：utf8mb4_unicode_ci与utf8mb4_0900_ai_ci隐式比较冲突。用不存在的合成用户ID复现，没有输出真实用户或地址记录。
- 普通订单仓库读取地址使用同一比较，仓库异常映射为503；地址查询异常映射为500。订单幂等查询只读探测成功。这证明当前地址比较缺陷，不代表全部交易流程已经验收。
- HBuilderX的unpackage/dist/dev/mp-weixin/pages/shop/index.wxml包含sravx-page-back标签，index.json却为usingComponents空对象；CLI dist/build产物已注册。此前只检查CLI产物遗漏了HBuilderX实际输出。

## 修复范围

- mysql-address-repository的list/remove及mysql-order-write、mysql-admin-operations、mysql-after-sale、mysql-gift-card、mysql-structured-checkout仓库，共7处地址所有权JOIN显式采用utf8mb4_bin。保留u.id鉴权、不改地址数据、不改数据库DDL、不改价格或支付配置。
- 19个使用共用返回组件的页面显式导入并注册，避免仅依赖easycom；新增源码注册回归约束。既有安全区、页面上级和历史回退逻辑保留。
- 后端新增6仓库的SQL比较/用户约束回归；原地址仓库SQL断言同步。前端隔离夹具增加组件注册桩。

## 验证

- 后端155项通过，前端80项通过。
- 26页微信构建与23个非入口返回控件检查通过，H5构建通过，git diff --check通过（仅换行提示）。
- 修正地址JOIN在现用数据库以合成用户ID只读执行成功，结果0行；使用合成字符串验证身份大小写不会被合并。未进行真实地址、订单、支付写入。

## 待完成

- 在微信开发工具与真机验证返回安全区与地址/下单。当前未完成该运行时验证；当前dev产物注册复核结果见下节。
- 实际付款仍由负责人执行；本次没有创建订单、支付、退款、改微信配置或Git推送。

## 确认后发布及复核

- 负责人在本地修复结果与部署范围说明后回复“修复”，执行API发布address-collation-20261009。对线上原文件先校验各处旧比较次数，再精确替换7处比较，不用本地整文件覆盖；6文件语法检查通过。
- 线上原源码及逐文件摘要清单备份在 `/opt/sravx-api/.address-collation-20261009-backup`（目录权限700）。仅应用源码可恢复，不回切数据库。api/mysql/cos/payment受控配置前后摘要一致。
- 重启后API/Nginx active，本机3000端口readyz返回ready；公网目录200、未登录地址401。公网根路径readyz为404，不作为健康接口，不新增对外暴露。
- 直接调用已部署地址仓库的list，以预先确认不存在的合成正整数用户ID查询返回空列表；订单取址JOIN只读查询通过。没有创建会话、读取真实地址内容、写入地址或下单。
- 后端155项、前端80项测试复验通过；26页微信构建及23个非入口返回控件检查通过。
- 当前HBuilderX的unpackage/dist/dev/mp-weixin输出中19个组件引用页面JSON与WXML均包含返回组件注册/引用，组件JS包含胶囊安全区计算与安全返回函数。shop JSON修改时间为2026-10-09 19:52:16（北京时间）；这是现存产物复核，并非本轮自动运行HBuilderX或模拟器点击验收。
