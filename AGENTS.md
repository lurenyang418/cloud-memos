# AGENTS.md

本文件面向在此仓库工作的编码 Agent，适用于整个仓库。

## 项目目标

Cloud Memos 是单实例、多用户的 Cloudflare 原生 Markdown 记录应用。前端静态资源和 Hono API 由同一个 Worker 发布；D1 保存关系数据和 FTS5 索引，R2 保存私有附件。

## 开始工作前

1. 阅读 `README.md`、`docs/ARCHITECTURE.md` 和与任务相关的 `docs/` 文件。
2. 检查工作区现有改动，不覆盖不属于当前任务的文件。
3. 复制 `.dev.vars.example` 为 `.dev.vars`；绝不打印或提交真实 secret。
4. 使用仓库声明的 Node.js 24+、pnpm 11 和 Wrangler 4。

## 常用命令

```bash
pnpm install --frozen-lockfile
pnpm db:migrate:local
pnpm dev
pnpm check
pnpm test:e2e
pnpm audit --prod
```

`pnpm check` 包含类型生成、类型检查、lint、Workers Vitest 和生产构建；浏览器行为变化还必须运行 `pnpm test:e2e`。

## 目录职责

- `src/web/`：React UI、路由、查询缓存和浏览器交互。
- `src/worker/`：Hono API、认证、权限和 Cloudflare bindings。
- `src/db/schema.ts`：Drizzle 数据模型。
- `src/shared/`：前后端共享类型和 Zod schema。
- `migrations/`：只能追加的 D1 SQL migration。
- `tests/integration.test.ts`：在 workerd 中验证 D1、R2、认证和权限。
- `tests/e2e/`：真实 Chromium 用户流程。

## 不可破坏的安全约束

- `PRIVATE` 仅作者可读；`MEMBERS` 仅 ACTIVE 登录用户可读；`PUBLIC` 才能匿名访问。
- 归档 Memo 只允许作者读取。
- 附件 bucket 始终私有，下载必须重新执行 Memo 权限判断。
- 所有写接口必须保留 Origin/CSRF、会话、所有权和 Zod 校验。
- 邀请、恢复、初始化 token 必须使用密码学随机数并以哈希或 Worker Secret 保存。
- 密码继续使用版本化 scrypt；改变参数或格式时必须提供升级方案和远程 Workers 验证。
- 不把请求状态存放在模块级可变变量中；所有 Promise 必须 await、return 或交给 `ctx.waitUntil()`。

## 数据库规则

- 修改 schema 时同时新增 migration；禁止修改已发布 migration。
- migration 必须先在本地和 staging 验证，再应用 production。
- 不使用 schema push；不在应用启动时自动迁移。
- D1 `meta.changes` 可能包含 trigger 变更；乐观锁只在主 UPDATE 未命中时报告冲突。

## UI 与查询缓存

- UI 文案使用简体中文，保持移动端 390px 无横向溢出。
- Memo 变化后要失效 `memos`、`feed`、`public-feed`、`public-memos` 和单 Memo 中相关查询。
- 并发冲突不得丢弃草稿；同步最新 version 后允许用户确认重试。

## Cloudflare 与发布边界

- 使用 bindings 访问 D1/R2，不从 Worker 内调用 Cloudflare REST API。
- `wrangler.jsonc` 是非敏感配置真源；更新后运行 `pnpm cf-typegen`。
- 未经用户明确授权，不创建/删除远程资源、不应用 production migration、不设置 secret、不部署 production。
- staging 与 production 使用独立 D1、R2、Worker 和 secrets。
- 发布顺序和回滚步骤以 `docs/DEPLOYMENT.md`、`docs/RELEASE_CHECKLIST.md` 为准。

## 完成标准

- 变更有对应的单元、集成或 E2E 测试。
- `pnpm check` 通过；涉及用户流程时 `pnpm test:e2e` 通过。
- 文档与实际命令、路由、migration 保持一致。
- 最终说明列出行为变化、验证结果、部署状态和剩余人工步骤。
