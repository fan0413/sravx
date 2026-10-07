# UniApp 微信开发者工具恢复记录（2026-09-23）

## 问题

微信开发者工具重复出现 `subPackages` 未定义及模拟器启动失败。日志确认工具会恢复历史临时项目目录，导致并非当前构建产物的配置被读取。

## 已实施修复

- 开发者工具入口固定为 `E:\sravxapp\sravx\dist\build\mp-weixin`，该目录直接包含 `app.json`。
- 构建后写入唯一项目配置，`miniprogramRoot` 为空字符串；移除源码根目录的项目配置，避免开发者工具对构建路径进行二次拼接。
- 每个小程序构建命令均执行 `scripts/verify-wechat-build.mjs`，检查页面清单和 `subPackages` 字段。
- 使用开发者工具自带 CLI 重置 FileUtils，并清理固定入口的文件、编译和会话缓存；未触及登录授权缓存。
- 旧临时项目缓存仅作本地备份，没有保留为可导入项目。

## 验证结果

- `build:mp-weixin:target-orders-rehearsal` 构建成功。
- 构建产物含 24 个页面，`subPackages` 为有效空数组。
- 唯一构建入口含有效 AppID、项目配置和 24 个页面。
- 商品详情页已从模板移除顶部“售价”区块；构建产物不含该区块。
- 无商品图片的测试商品不再回退到未打包的本地 Logo，改为显示“暂无商品图片”占位。
- 已删除原生 `custom-tab-bar` 目录及 `pages.json` 的原生 `tabBar` 配置。首页、购物袋、订单、我的四个主页面统一使用 Vue 组件 `components/SravxTabBar.vue`；首页使用授权品牌图案裁切的透明 PNG，购物袋、订单、我的保留 Lucide 的 `shopping-bag`、`clipboard-list`、`user-round` SVG 源文件并生成透明 PNG。微信小程序运行时只引用 PNG；构建校验脚本会显式复制全部导航图片，避免构建器遗漏 `static` 目录而出现空白图标。许可说明保存在 UniApp 项目的 `THIRD_PARTY_NOTICES.md`。
- 首页图标引用必须与其他导航图标一样通过数据字段传入。静态 `src` 会被构建器改写到未复制的 `assets/` 路径；已改为 `/static/navigation/sravx-mark.png` 的运行时路径，并纳入同一构建资源校验。
- “我的”页已改为 Vue 自绘顶栏，替换微信原生导航栏的首页按钮为可点击的 SRAVX 图案。礼品卡兑换、地址管理、合作咨询、在线客服改用 Lucide 的 `gift`、`map-pin`、`message-circle`、`headphones` SVG 源文件生成的 PNG；构建校验会复制其运行时资源。
- 后续视觉验收取消“我的”页左上角的品牌返回入口及跳转行为；“我的”和“购物袋”均使用无左侧操作项的 Vue 自绘顶栏，避免微信原生首页按钮在不同入口栈下出现。底部首页标记调整为与其他导航图标相近的占位大小与较低视觉强度。

## 操作约束

后续在微信开发者工具中只导入 `E:\sravxapp\sravx\dist\build\mp-weixin`；不得重新导入源码根目录或 `unpackage\dist\dev\mp-weixin`。若开发者工具再次自动恢复其他历史项目，应关闭该项目后从固定入口重新打开，而不是修改当前小程序配置。
## 17:53 调试补充

- 已重新执行 `build:mp-weixin:target-orders-rehearsal`，固定入口的 `app.json` 和首页脚本更新时间一致。
- 线上 `GET /api/v1/catalog/home`、商品列表与分类接口均返回成功；首页接口含 4 件测试商品，空白首页不能归因于目标目录没有数据。
- 源码未调用 `wx.closeSocket`、`uni.closeSocket` 或 `SocketTask.close`。开发者工具报出的 `closeSocket ... 1006` 来自其 AppService 运行时将异常关闭码作为主动关闭码处理，属于工具日志通道问题。
- 已重置固定入口的 FileUtils，并清理文件、编译、网络和会话缓存；未清理认证或本地业务数据，随后重新打开唯一入口。
