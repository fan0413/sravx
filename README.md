# SRAVX 宠物美容工具商城

宠物美容剪刀的商品展示和销售项目。官网、小程序和管理后台共用后端，商品只在后台维护一份。

官网：https://sravxpet.com/

## 主要功能

- 官网可以浏览剪刀展示、查看商品和选择规格。
- 小程序包含商品、收货地址、订单、优惠券和售后等页面。
- 管理端可以编辑商品、分类、价格和图片，也可以处理订单和售后。
- 商品按Basic、Pro、Master和配件分类，价格以规格为准，列表显示最低规格价格。
- 图片放在私有COS中，后端提供临时图片地址。

官网已经上线，网页登录和完整网页支付还待验收。首页展示素材与后台商品分开，测试下单需要使用专门的测试商品。

## 使用的技术

| 部分 | 技术 |
|---|---|
| 官网和小程序 | UniApp、Vue 3、Vite |
| 管理后台 | Vue 3、TypeScript、Vue Router、Element Plus |
| 后端 | Node.js、MySQL |
| 图片和部署 | 腾讯COS、Nginx、HTTPS |

## 目录

| 目录 | 说明 |
|---|---|
| sravx | 当前官网和小程序 |
| admin-web | 当前管理后台 |
| server | 后端代码、数据库迁移和测试 |
| deploy | 网站配置 |
| docs | 简单的项目、接口和运行说明 |
| miniprogram、cloudfunctions、cloudrun | 早期版本，保留用于参考，不是当前开发入口 |

## 本地运行

建议使用Node.js 24。进入需要运行的模块，先执行npm ci，再执行下面的命令。

| 目录 | 命令 |
|---|---|
| sravx | npm run dev:h5：网页开发；npm run build:h5：网页构建 |
| sravx | npm run build:mp-weixin：小程序构建，产物导入微信开发工具 |
| admin-web | npm run dev：后台开发；npm run build：类型检查和构建 |
| server | npm test：运行测试；npm start：启动后端，需要本地环境配置 |

本地注意：商品查询依赖可用后端；后端另配数据库和环境变量。线上账号和密钥不进仓库。

## 测试

2026-10-14检查：后端175项、前端101项、管理端10项测试通过。三端相关构建通过；管理端仍有文件体积较大的提示。官网也检查了鼠标拖动、手机布局、商品图片和详情刷新。

以上是当日检查结果，后续改动需要重新跑对应测试。

安装管理端依赖后，还可以运行node scripts/check-project-docs.cjs，检查文档链接和接口函数名称。Windows如果git不在环境变量中，可以通过SRAVX_GIT_PATH指定它的位置。

## 说明文档

- [项目记录](docs/project-notes.md)
- [代码怎么分工](docs/architecture.md)
- [接口函数说明](docs/api-reference.md)
- [目前完成到哪里](docs/project-status-and-next-tasks.md)
- [网站上线说明](docs/website-release-2026-10-14.md)

开发过程中使用了AI辅助。提交前仍需核对代码、接口说明和测试结果。详细操作记录留在本地，仓库里只保留常用说明。
