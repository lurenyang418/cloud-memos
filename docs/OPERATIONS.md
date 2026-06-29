# 运维与灾难恢复

## 日常检查

- Workers：5xx、CPU 超限、启动时间、异常日志和请求量。
- D1：查询失败、数据库大小、migration 状态和 Time Travel 可用性。
- R2：上传/下载失败、对象数量、失败删除和存储增长。
- Cron：每天 03:17 UTC 的清理执行结果。

## 恢复点与备份

```bash
pnpm exec wrangler d1 time-travel info cloud-memos --env="" --json
```

把返回的 bookmark 与发布 tag、Worker version 一起记录。当前数据库使用 FTS5 virtual table，Wrangler 的 `d1 export` 不支持该 schema；不要把会失败的导出命令写入自动化备份。用户可以用设置页 ZIP 导出个人 Memo 和附件，运维侧仍需为 R2 配置独立复制或保留策略。

## 恢复演练

1. 在 staging 记录恢复前 Time Travel bookmark，并确认没有需要保留的测试写入。
2. 写入可验证的测试数据后，将 staging 恢复到该 bookmark。
3. 检查 migration 表、用户数、Memo 数、FTS 查询和设置表。
4. 对 staging Worker 执行只读 smoke test。
5. 记录耗时和结果；不要在 production 首次尝试恢复流程。

## Secret 轮换

- `BOOTSTRAP_ADMIN_TOKEN`：初始化后可删除；重建空库时重新设置。
- `BETTER_AUTH_SECRET`：轮换会使现有签名/会话失效，应安排维护窗口并通知用户重新登录。
- GitHub/Cloudflare token：最小权限、定期轮换，泄露后立即撤销。

个人 API token 不属于 Worker Secret，由用户在设置页自行创建和撤销。若怀疑泄露，应立即撤销对应 token；停用账号会即时阻止该账号的全部 token。数据库中仅保存 SHA-256 哈希，无法恢复明文。

## 事件响应

1. 限制写入或回滚有问题的 Worker version。
2. 保存脱敏日志、version ID、migration 状态和事件时间线。
3. 轮换受影响 secret，必要时删除 sessions。
4. 从已验证备份或 Time Travel 恢复。
5. 完成根因分析，增加自动化测试和监控。

## 数据删除

删除 Memo 会异步清理 R2 对象；失败对象由 Cron 重试。执行用户级数据删除前，应先实现并验证覆盖 D1 关联记录与 R2 对象的专用流程。
