# 服务器网络暴露面复核

- 时间：2026-09-10（Asia/Shanghai）
- 方式：服务器只读检查监听端口、UFW、systemd 状态、Nginx 有效配置及本机健康接口。

## 结果

| 项目 | 结果 |
|---|---|
| API 监听 | 仅 `127.0.0.1:3000`，未绑定公网地址 |
| MySQL 公网监听 | 未发现数据库端口监听 |
| 防火墙 | UFW 启用，仅允许 SSH、HTTP、HTTPS |
| API 服务 | `sravx-api.service` 为 active；本机 `/health` 返回 HTTP 200 |
| Nginx | 运行中；`api.sravxpet.com` 当前固定返回 HTTP 503，尚未配置 `proxy_pass` 到迁移 API |

## 结论

新 API 尚未接受公网流量。HTTP/HTTPS 的存在用于域名和证书维护，不等同于新 API 已发布。后续必须在 HTTPS、限流、访问日志、外部健康检查和回滚预案完成并获负责人确认后，才可修改 Nginx 路由或 DNS。
