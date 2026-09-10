# COS 存储架构（待实施）

更新：2026-09-09。适用范围：`sravx-1419382340` 上海私有 COS 桶。

## 已确认的迁移边界

- CloudBase 源对象（含历史商品图片）保留为只读参考，不复制到目标 COS。
- 后续商品由负责人重新上传；旧 `cloud://` 文件 ID 不进入新商品记录。
- 源对象仍须在退役 CloudBase 前完成一次只读清单盘点，以满足迁移计划的退役门槛；该盘点不等于复制文件。

## 对象命名

所有新对象使用不可预测 UUID 文件名；数据库只存对象键，不存永久 URL，也不存 COS 密钥。

| 用途 | 对象键格式 | 说明 |
|---|---|---|
| 商品封面 | `products/{productId}/cover/{uuid}.{ext}` | 每个商品一张当前封面。 |
| 商品轮播 | `products/{productId}/gallery/{uuid}.{ext}` | 保持数据库数组顺序。 |
| 商品详情 | `products/{productId}/detail/{uuid}.{ext}` | 按详情展示顺序保存。 |
| 商品规格图 | `products/{productId}/specs/{uuid}.{ext}` | 规格或规格卡片通过字段区分。 |
| 积分商品 | `points-products/{productId}/{kind}/{uuid}.{ext}` | `kind` 使用 `cover`、`gallery`、`detail` 或 `specs`。 |
| 首页轮播 | `banners/{bannerId}/{uuid}.{ext}` | 不与商品目录混用。 |
| 剪刀批次/卡片 | `scissors/{scissorsId}/{kind}/{uuid}.{ext}` | 仅存展示图片，不存订单或用户文件。 |
| 上传暂存 | `staging/{uploadId}/{uuid}.{ext}` | 未确认绑定业务记录前的临时对象。 |

`productId`、`bannerId` 等业务 ID 应在 API 创建记录后再使用。前端先把文件上传到 `staging`，API 校验并绑定成功后由后台移动或重写到正式键；因此不会出现以商品名、手机号或订单号作为文件路径的情况。

## 访问流程

1. 管理端向 API 申请上传许可，API 校验后台登录与 RBAC 权限、文件类型、大小和业务归属。
2. API 仅签发单对象、单用途、短有效期的 COS 上传 URL；浏览器不持有 COS 长期凭据。
3. 上传完成后，管理端调用 API 确认；API 对对象执行 `HEAD` 校验 MIME、大小和对象键，再把对象键写入 MySQL。
4. 小程序/管理端读取图片时，经 API 获取短时读取 URL。MySQL 返回对象键，客户端不能自行拼接永久 COS 地址。
5. 删除或替换图片时，先由 API 在数据库解除引用，再把对象键加入后台清理队列；不允许客户端直接删除 COS 对象。

## 权限、生命周期与约束

| 项目 | 目标规则 |
|---|---|
| 桶访问权限 | 维持私有读写；不启用公共读。 |
| 服务器身份 | 仅服务器专用 CAM 子用户可在此桶对象范围执行上传、读取、检查和受控删除。 |
| 管理端身份 | 只能调用业务 API；不配置 COS SecretId/SecretKey。 |
| 文件校验 | 第一阶段只允许 `jpg`、`jpeg`、`png`、`webp`；拒绝 SVG、HTML、脚本和未知 MIME。尺寸、单文件大小与像素上限由 API 配置后执行。 |
| 暂存清理 | `staging/` 对象 7 天后自动过期；正式对象不按生命周期自动删除。 |
| 替换策略 | 使用新 UUID 键，禁止覆盖旧对象，避免 CDN/客户端缓存与版本混乱。 |
| 审计 | 记录操作者 ID、对象键、用途、大小、哈希/ETag、绑定时间；不记录签名 URL、密钥或图片内容。 |

## 现有代码适配范围

旧管理端直接使用 CloudBase `uploadFile`、`getTempFileURL` 和 `cloud://` 文件 ID；商品已使用封面、轮播、详情、规格图与规格卡片图，轮播图也使用独立图片字段。迁移实现必须统一替换为上述 API 签名上传和对象键模型，不能混用 `cloud://` 与 COS 对象键。

## 放行条件

实施前需完成：后台 RBAC/API 设计、上传类型和大小规则确认、短期 URL 时长确认、对象删除队列与审计日志设计。任何 COS 权限、生命周期或 CORS 的生产配置变更，须在实施前取得负责人确认。
