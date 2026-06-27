# 部署指南

## 环境

| 环境 | Worker | D1 | R2 |
| --- | --- | --- | --- |
| local | Vite/workerd | `.wrangler/state` | `.wrangler/state` |
| staging | `cloud-memos-staging` | `cloud-memos-staging` | `cloud-memos-attachments-staging` |
| production | `cloud-memos` | `cloud-memos` | `cloud-memos-attachments` |

production 默认使用 `workers.dev`。配置自定义域名时优先使用 Worker Custom Domain，并在发布清单中记录 DNS 和回滚方式。

## 前置条件

- Node.js 24+、pnpm 11、Wrangler 4。
- 已执行 `pnpm exec wrangler login`，并确认目标 Cloudflare account。
- production D1/R2 已创建，`wrangler.jsonc` 中的 `database_id` 与名称匹配。
- `BETTER_AUTH_SECRET` 和 `BOOTSTRAP_ADMIN_TOKEN` 已在密码管理器中保存。

## 首次 production 发布

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test:e2e
pnpm exec wrangler secret put BETTER_AUTH_SECRET
pnpm exec wrangler secret put BOOTSTRAP_ADMIN_TOKEN
pnpm db:migrate:production
pnpm deploy:production
```

访问 production `/setup` 创建首位管理员。成功后确认 `/api/v1/session` 返回 `setupRequired: false`，并删除或轮换 bootstrap secret。

## 常规发布

1. 记录当前 Worker version 和 D1 Time Travel bookmark。
2. 查看待应用 migration，确认是否向后兼容。
3. 运行 `pnpm check` 与 `pnpm test:e2e`。
4. 先迁移 staging 并验收，再迁移 production。
5. 部署 production，执行匿名、登录、创建 Memo、附件和权限 smoke test。

## 回滚

- 仅代码问题：使用 `wrangler versions list` 查找上一个版本，然后 `wrangler rollback <VERSION_ID>`。
- 向后兼容 migration：先回滚 Worker，保留新增表/列。
- 数据破坏：停止写流量，使用 D1 Time Travel 或已验证导出恢复；不要在流量开放时覆盖数据库。
- R2 数据不包含在 D1 备份中，必须按独立策略恢复。

详细检查项见 [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md)。
