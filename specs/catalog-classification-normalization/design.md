# 分类重构设计

2026-10-09：负责人确认直接重构，随后明确要求连接腾讯云数据库修改并测试；授权分类结构、目录及接口适配，不授权删除原测试商品或修改商品价格/库存。

- 保留 products/categories/product_specs 与结构化 SKU 表；新增 product_classifications，以 product_id 为主键及外键，四种系列和合法剪型使用枚举及配对 CHECK 约束，增加系列+剪型+商品ID和剪型+商品ID索引。不新增四张商品表。
- migration013独立于012，不重复创建012字段，也不自动导入猜测分类。普通和结构化保存共用分类输入规则和同一事务写入。目录通过既有四个明确系列根目录及剪型标签核对，不从商品名称猜测。
- CATALOG_CLASSIFICATION_ENABLED 独立于 STRUCTURED_CHECKOUT_ENABLED，默认关闭；实库迁移完成并验收后已启用。开启时启动检查表存在；公共/后台使用LEFT JOIN保留未归类商品无筛选读取及详情，指定系列/剪型时只读明确归类商品，不自动猜测、隐藏或删除原测试商品。
- 接口主路径不变；管理端 POST/PUT 增加 series/toolGroup，同时保留 params 中文分类字段作为现有客户端别名。冲突拒绝。返回 series/tool_group/classification_source；两端优先使用 normalized 分类，不被旧参数或商品名称覆盖。
- 管理员和公共列表均传递系列/剪型及分页。非法筛选值返回空结果，不忽略后返回全量。未迁移时普通参数JSON路径也能执行筛选，与支付开关无关。旧管理云函数不支持系列筛选时明确报错，不伪装成功。
- 本地演练脚本仍只允许localhost专用空schema。云端实施先创建严格命名、确认不存在的合成演练表，验证DDL/外键/CHECK/索引后仅删除本次自建表；真实商品保存及HTTP集成测试包在事务与SAVEPOINT内，最终全部回滚，不复制生产数据。
- 实库发现 warranty_months INT NOT NULL DEFAULT 12 与配件可不填质保冲突，014改为NULL DEFAULT NULL，仅变更约束，已有值不改。发货原因/说明与规格卡片图为空时在仓储层转为空字符串，不生成业务承诺。
- 外键类型、InnoDB索引及约束依据 [MySQL官方文档](https://dev.mysql.com/doc/refman/8.0/en/create-table-foreign-keys.html)。预检要求 MySQL8、CHECK可执行版本及 products.id BIGINT UNSIGNED主键/InnoDB。

本次仅启用分类开关并发布6个分类相关API文件；既有管理端中文params分类别名可继续保存，无需静态同步发布。未修改权限、交易开关、线上商品价格或库存；本地其他价格/订单/媒体变更仍未发布。
