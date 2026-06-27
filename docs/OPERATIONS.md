# 运维与灾难恢复

## 日常检查

- Workers：5xx、CPU 超限、启动时间、异常日志和请求量。
- D1：查询失败、数据库大小、migration 状态和 Time Travel 可用性。
- R2：上传/下载失败、对象数量、失败删除和存储增长。
- Cron：每天 03:17 UTC 的清理执行结果。

## 备份

```bash
mkdir -p backups
pnpm exec wrangler d1 export cloud-memos --remote --output backups/cloud-memos.sql
```

`backups/` 已被 Git 忽略。备份应加密后保存到独立位置，并设置保留期限。D1 导出不包含 R2 对象。

## 恢复演练

1. 创建临时 D1 数据库。
2. 导入 production 导出文件。
3. 检查 migration 表、用户数、Memo 数、FTS 查询和设置表。
4. 将临时 Worker 绑定到恢复库执行只读 smoke test。
5. 记录耗时和结果后删除临时资源。

## Secret 轮换

- `BOOTSTRAP_ADMIN_TOKEN`：初始化后可删除；重建空库时重新设置。
- `BETTER_AUTH_SECRET`：轮换会使现有签名/会话失效，应安排维护窗口并通知用户重新登录。
- GitHub/Cloudflare token：最小权限、定期轮换，泄露后立即撤销。

## 事件响应

1. 限制写入或回滚有问题的 Worker version。
2. 保存脱敏日志、version ID、migration 状态和事件时间线。
3. 轮换受影响 secret，必要时删除 sessions。
4. 从已验证备份或 Time Travel 恢复。
5. 完成根因分析，增加自动化测试和监控。

## 数据删除

删除 Memo 会异步清理 R2 对象；失败对象由 Cron 重试。执行用户级数据删除前，应先实现并验证覆盖 D1 关联记录与 R2 对象的专用流程。
