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

## Tag 自动发布

GitHub `production` Environment 保存以下 CI 凭证：

- Secret `CLOUDFLARE_API_TOKEN`：限定当前 Cloudflare account，至少包含 Workers Scripts Edit 和 D1 Edit。
- Variable `CLOUDFLARE_ACCOUNT_ID`：目标 Cloudflare account ID。

生产 Worker 的 `BETTER_AUTH_SECRET` 只保存在 Cloudflare，不复制到 GitHub。发布前先将 staging 验收通过的提交合并到 `main`，再创建标准 SemVer tag：

```bash
git switch main
git pull --ff-only
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin v0.1.0
```

`.github/workflows/release.yml` 会确认 tag 匹配 `vMAJOR.MINOR.PATCH` 且提交属于 `main`，随后执行完整检查、E2E、依赖审计、production migration、Worker 部署和线上 smoke test。production Environment 应只允许 `v*` tag；需要人工发布门禁时，在该 Environment 配置 required reviewer。

自动 migration 要求数据库变更保持向后兼容，使上一 Worker version 在代码回滚后仍能运行。不要为修复失败发布而复用或移动已有 tag，应修复后发布新的 patch tag。

## 常规发布

1. 记录当前 Worker version 和 D1 Time Travel bookmark。
2. 查看待应用 migration，确认是否向后兼容。
3. 运行 `pnpm check` 与 `pnpm test:e2e`。
4. 先迁移 staging 并验收，再迁移 production。
5. 部署 production，执行匿名、登录、创建 Memo、附件和权限 smoke test。

## 回滚

- 仅代码问题：使用 `wrangler versions list` 查找上一个版本，然后 `wrangler rollback <VERSION_ID>`。
- 向后兼容 migration：先回滚 Worker，保留新增表/列。
- 数据破坏：停止写流量，使用发布前记录的 D1 Time Travel bookmark 恢复；不要在流量开放时覆盖数据库。当前 FTS5 schema 不支持 `d1 export`。
- R2 数据不包含在 D1 备份中，必须按独立策略恢复。

详细检查项见 [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md)。
