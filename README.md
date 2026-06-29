# Cloud Memos

一个以 Memos 使用方式为灵感、完全运行在 Cloudflare 上的多人 Markdown 记录应用。

> 当前项目处于生产发布准备阶段。架构、部署、运维和 Agent 协作约束见文末文档索引。

## 能力

- Markdown、GFM 表格、任务列表、代码块和安全渲染
- 个人时间线、标签、全文搜索、置顶、归档
- 成员动态，集中查看实例成员共享和公开发布的内容
- 匿名公开首页、邀请制登录入口和可配置的“联系站长”链接
- 管理员可修改实例网站名称，导航、登录页和浏览器标题同步更新
- `PRIVATE`、`MEMBERS`、`PUBLIC` 三档可见性
- R2 私有附件和按 Memo 权限动态鉴权
- 可折叠的桌面侧边栏，折叠状态保存在当前浏览器
- 单篇原始 Markdown 下载，以及包含全部个人 Memo、元数据和附件的 ZIP 导出
- ZIP 幂等导入，保留可见性、状态、置顶、时间、版本和附件
- 有作用域、可撤销、默认一年有效期的个人 API 令牌，支持 CLI 和自动化
- 公开用户主页与稳定的 Memo 分享地址
- 管理员邀请制注册、账号停用和一次性恢复链接
- 浏览器本地草稿、响应式界面
- D1 FTS5 搜索、乐观并发控制和 Cron 垃圾清理

## 技术结构

- React、Vite、React Router、TanStack Query、Tailwind CSS、Radix UI
- Hono Worker API
- Better Auth + 版本化 scrypt（N=32768、r=8、p=3）
- Drizzle ORM + Cloudflare D1
- Cloudflare R2
- Workers Static Assets + Cron Trigger

前端静态资源和 API 由一个 Worker 版本统一部署。二进制附件仅保存在 R2，D1 只保存元数据。

## 本地开发

要求 Node.js 24+、pnpm 11 和 Cloudflare Wrangler 4。

```bash
pnpm install
cp .dev.vars.example .dev.vars
pnpm cf-typegen
pnpm db:migrate:local
pnpm dev
```

打开 `http://localhost:5173/setup`，使用 `.dev.vars` 中的 `BOOTSTRAP_ADMIN_TOKEN` 创建首位管理员。初始化成功后，该入口会永久关闭。

初始化后可在“管理 → 公开联系入口”配置匿名首页的申请加入按钮。支持 `https:` 外部表单/社交主页或 `mailto:` 邮件链接；留空时隐藏按钮，系统不会自动公开管理员登录邮箱。

本地 D1 和 R2 数据保存在 `.wrangler/state`。`.dev.vars` 已被 Git 忽略，不要提交真实 secret。

## Cloudflare 资源与部署

登录 Cloudflare 后创建资源：

```bash
pnpm exec wrangler login
pnpm exec wrangler d1 create cloud-memos
pnpm exec wrangler r2 bucket create cloud-memos-attachments
```

配置默认按资源名称绑定 `cloud-memos` 和 `cloud-memos-attachments`。如创建时修改了名称，同时更新 `wrangler.jsonc` 中的 `database_name` 或 `bucket_name`。

通过交互式命令设置生产 secrets：

```bash
pnpm exec wrangler secret put BETTER_AUTH_SECRET
pnpm exec wrangler secret put BOOTSTRAP_ADMIN_TOKEN
```

两个值都应使用密码管理器生成的高熵随机字符串；不要作为 `vars` 写进配置文件。随后执行：

```bash
pnpm check
pnpm exec wrangler d1 migrations apply cloud-memos --remote
pnpm deploy
```

仓库已定义隔离的 `staging` 环境，绑定 `cloud-memos-staging` D1 和 `cloud-memos-attachments-staging` R2：

```bash
pnpm db:migrate:staging
pnpm exec wrangler secret put BETTER_AUTH_SECRET --env staging
pnpm exec wrangler secret put BOOTSTRAP_ADMIN_TOKEN --env staging
pnpm deploy:staging
```

仅在空的 staging 数据库上，可运行一次性远程认证验收。脚本会生成不落盘的随机 secrets，并创建一个不可用于日常登录的临时管理员：

```bash
NODE_USE_ENV_PROXY=1 pnpm smoke:staging https://cloud-memos-staging.lurenyang-003.workers.dev
```

正式使用 staging 前，应清除临时用户，并通过交互式 `secret put --env staging` 设置自己保存的初始化令牌。

首次 production 初始化完成后，后续版本通过 `vMAJOR.MINOR.PATCH` tag 触发 GitHub Actions 发布。发布任务会在 `production` Environment 保护下运行检查、migration、部署和 smoke test；具体配置与回滚方式见 [部署指南](./docs/DEPLOYMENT.md)。

## 数据与权限

- `PRIVATE`：只有作者可读。
- `MEMBERS`：所有处于 ACTIVE 状态的登录用户可读。
- `PUBLIC`：匿名用户可读，并出现在作者的公开主页。
- 已归档 Memo 只有作者可以访问。
- 附件 bucket 必须保持私有；所有下载都经过 `/api/v1/attachments/:id/content` 重新检查权限。
- HTML、SVG 等主动内容强制下载；只有受控图片 MIME 类型允许内联展示。
- 更新 Memo 必须提交当前 `version`，过期写入返回 `409 VERSION_CONFLICT`。

## 内容导出

Memo 正文在 D1 中以原始 Markdown 保存。每张 Memo 卡片都可以直接下载对应的 `.md` 源文件，不会注入 front matter 或改写正文。

登录用户可在设置页生成个人完整 ZIP，也可以将 ZIP 幂等导入另一账号。归档包含活跃与已归档 Memo、R2 附件及 `manifest.json` 元数据；导入保留原可见性、状态、置顶、时间和版本。ZIP 在浏览器中流式读取，附件仍通过现有鉴权接口上传或下载。该功能适合个人迁移，不替代运维层面的 D1 与 R2 备份。

清单保持 `formatVersion: 1`，但要求 `exportId`。缺少该字段的旧 v1 ZIP 不兼容，需从源实例重新导出。

## 主要 API

| 范围 | 路径 |
| --- | --- |
| Better Auth | `/api/auth/*` |
| 实例初始化 | `POST /api/v1/setup` |
| 当前会话 | `GET /api/v1/session` |
| 匿名公开动态 | `GET /api/v1/public/memos` |
| 邀请注册 | `/api/v1/invitations/*` |
| Memo | `/api/v1/memos`、`/api/v1/memos/:id` |
| 附件 | `/api/v1/attachments/*` |
| 导入 | `/api/v1/import/check`、`/api/v1/import/memos` |
| API 令牌（仅 Cookie 会话管理） | `/api/v1/api-tokens` |
| OpenAPI | `/api/v1/openapi.json` |
| 公开主页 | `/api/v1/public/users/:username/memos` |
| 管理 | `/api/v1/admin/*` |

API 校验失败和业务错误统一返回：

```json
{
  "error": {
    "code": "STABLE_ERROR_CODE",
    "message": "可读错误信息"
  }
}
```

列表使用不透明 cursor 分页，默认每页 20 条、最大 50 条。

个人内容 API 支持 `Authorization: Bearer cm_pat_...`。令牌在“设置 → API 令牌”创建，明文只显示一次；用法、作用域和 curl 示例见 [API 文档](./docs/API.md)。

## 测试与质量检查

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

`pnpm test` 使用 Cloudflare Workers Vitest pool，在 workerd 中运行真实 D1、FTS5 和 R2 集成测试。`pnpm test:e2e` 使用独立的 `.wrangler/e2e` 状态目录，不会复用或清理本地开发数据。

完整检查：

```bash
pnpm check
```

## 备份与恢复

生产 migration 前记录 D1 Time Travel bookmark：

```bash
pnpm exec wrangler d1 time-travel info cloud-memos --env="" --json
```

当前 schema 包含 FTS5 virtual table，Wrangler 的 `d1 export` 会拒绝导出，不能把该命令作为备份方案。应记录 Time Travel bookmark，并定期在 staging 演练恢复。R2 对象不属于 D1 恢复范围，需要独立的复制或保留策略；用户级内容可额外使用设置页 ZIP 导出。

恢复前停止写流量，在 staging 验证导出文件后再导入目标 D1。不要把生产备份、`.dev.vars` 或 API token 提交到仓库。

## 运维说明

- Cron 每天清理超过 24 小时未完成的上传、失败删除、过期邀请、恢复 token 和旧限流记录。
- `ATTACHMENT_MAX_BYTES` 默认是 25 MiB，可在 `wrangler.jsonc` 调整。
- Worker 启用了结构化日志和 traces。R2 删除失败会记录 JSON 错误，并由下一次 Cron 重试。
- 更新 `wrangler.jsonc` 后必须重新执行 `pnpm cf-typegen`。

## 项目文档

- [Agent 协作指南](./AGENTS.md)
- [架构说明](./docs/ARCHITECTURE.md)
- [API 与 curl 示例](./docs/API.md)
- [部署指南](./docs/DEPLOYMENT.md)
- [运维与灾难恢复](./docs/OPERATIONS.md)
- [生产发布清单](./docs/RELEASE_CHECKLIST.md)
- [贡献指南](./CONTRIBUTING.md)
- [安全策略](./SECURITY.md)
