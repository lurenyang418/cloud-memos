# 生产发布清单

## 代码与供应链

- [ ] `pnpm install --frozen-lockfile` 成功。
- [ ] `pnpm check` 通过。
- [ ] `pnpm test:e2e` 通过。
- [ ] `pnpm audit --prod` 无未接受的高危漏洞。
- [ ] 构建产物不包含 `.dev.vars`、`.env` 或测试 secret。
- [ ] 发布 tag 匹配 `vMAJOR.MINOR.PATCH`，且对应提交属于 `main`。

## Cloudflare 资源

- [ ] 确认正确 account 和 Wrangler 4.x。
- [ ] production D1/R2 名称和 ID 与 `wrangler.jsonc` 一致。
- [ ] R2 bucket 无公开访问策略。
- [ ] production secrets 已交互式设置且保存在密码管理器。
- [ ] GitHub `production` Environment 的 Cloudflare Token 与 account ID 有效。
- [ ] migration 已先在 staging 验证。

## 数据保护

- [ ] 记录发布前 Worker version。
- [ ] 记录 D1 Time Travel bookmark 或确认新空库状态。
- [ ] Time Travel 恢复流程已在 staging 定期演练；已知 FTS5 schema 不支持 `d1 export`。
- [ ] 明确 R2 独立备份/保留策略。

## 发布与验收

- [ ] 应用 production migration。
- [ ] 部署 production Worker。
- [ ] 匿名公开首页、登录、初始化、邀请和权限矩阵通过。
- [ ] Memo 创建/编辑/置顶/归档、搜索、附件通过。
- [ ] 5xx、日志、CPU、D1 和 R2 指标正常。
- [ ] 回滚命令和上一个 version ID 已记录。
