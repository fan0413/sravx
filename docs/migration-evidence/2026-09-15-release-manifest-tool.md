# API 发布制品清单工具（2026-09-15）

新增 `server/scripts/create-release-manifest.mjs`，在本地受控工作树中输出：

- 完整与短 Git 提交号；
- `server/package-lock.json` 与 `server/src/server.js` 的 SHA-256、字节数；
- 清单格式版本和生成时间。

用途是补足服务器 `/opt/sravx-api` 不保留 `.git` 时的部署可追溯性。发布负责人应在部署前生成清单，将其与不可变制品一起保存在受控发布记录中；不得将 `.env`、数据库备份、访问令牌或支付材料写入清单。

本工具只在本地读取版本控制信息和已列出的源码文件，不连接服务器、数据库、对象存储或外部平台。
