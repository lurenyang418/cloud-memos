# 安全策略

## 报告漏洞

此仓库初期为私有仓库。请通过 GitHub 仓库的 Security Advisory 私下报告安全问题；不要创建公开 Issue，也不要附带真实用户数据或 secret。

报告应包含受影响版本、复现步骤、影响范围、必要的最小日志和建议修复。请先移除 Cookie、邮箱、token、R2 object key 等敏感信息。

## 支持范围

仅最新 `main` 和当前 production 部署接受安全修复。依赖漏洞通过 `pnpm audit --prod`、Dependabot 和人工升级处理。

## Secret 规则

- production/staging secrets 只存放在 Cloudflare Worker Secrets 或受控密码管理器。
- `.dev.vars`、备份、导出数据库和恢复 token 不得提交。
- 怀疑泄露时立即轮换 secret、撤销会话、检查 Workers 日志，并记录事件时间线。

完整响应步骤见 [docs/OPERATIONS.md](./docs/OPERATIONS.md)。
