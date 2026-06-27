# 贡献指南

## 开发流程

1. 从 `main` 创建短生命周期分支。
2. 运行 `pnpm install --frozen-lockfile` 和 `pnpm db:migrate:local`。
3. 小步提交，migration、实现、测试和文档保持同步。
4. 提交前运行 `pnpm check`；UI 或完整流程变化再运行 `pnpm test:e2e`。
5. PR 描述应包含动机、行为变化、风险、验证方法和 migration/回滚说明。

## 提交约定

建议使用 Conventional Commits：

```text
feat: add public member feed
fix: handle D1 trigger change counts
docs: document production recovery
```

## 数据库变更

- 只新增 migration，不重写已发布文件。
- SQL 必须兼容 Cloudflare D1 SQLite。
- 先本地、再 staging、最后 production。
- 破坏性变更必须提供分阶段上线和恢复方案。

## 安全问题

不要在公开 Issue 中提交漏洞细节、token、用户数据或生产日志。请遵循 [SECURITY.md](./SECURITY.md)。
