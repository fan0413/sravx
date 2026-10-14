# SRAVX 宠物美容工具商城

这是一个宠物美容剪刀相关的电商项目，包含官网、微信小程序和管理后台。三个端使用同一套后端，方便管理商品和订单。

官网：https://sravxpet.com/

## 主要功能

- 官网可以浏览剪刀展示、查看商品和选择规格。
- 小程序包含商品、收货地址、订单、优惠券和售后等页面。
- 管理端可以编辑商品、分类、价格和图片，也可以处理订单和售后。
- 商品按Basic、Pro、Master和配件分类，价格以规格为准，列表显示最低规格价格。
- 图片放在私有COS中，后端提供临时图片地址。

官网已经上线。网页登录和完整网页支付还没有完成验收；本地演示图片不代表可下单商品，请不要为了演示进行真实付款。

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

前端读真实商品时需要后端可访问。后端不能仅靠安装依赖就连接生产数据库，不要复制线上账号或密钥到仓库。

## 测试

2026-10-14检查：后端175项、前端101项、管理端10项测试通过。三端相关构建通过；管理端仍有文件体积较大的提示。官网也检查了鼠标拖动、手机布局、商品图片和详情刷新。

这些是当日测试结果，不代表已经测试所有场景。

安装管理端依赖后，还可以运行node scripts/check-project-docs.cjs，检查文档链接和接口函数名称。Windows如果git不在环境变量中，可以通过SRAVX_GIT_PATH指定它的位置。

## 说明文档

- [项目介绍](docs/project-showcase.md)
- [代码怎么分工](docs/architecture.md)
- [接口函数说明](docs/api-reference.md)
- [目前完成到哪里](docs/project-status-and-next-tasks.md)
- [网站上线说明](docs/website-release-2026-10-14.md)

项目开发使用了AI辅助。这里记录实际做过的功能，不编造用户量、销售额或个人经历。开发指令、沟通和详细操作记录仅在本地保留，不放在GitHub当前文件列表中。早期提交历史没有重写。
