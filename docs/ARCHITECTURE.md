# 架构说明

## 部署拓扑

```text
Browser
  └─ Cloudflare Worker
       ├─ Workers Static Assets: React SPA
       ├─ Hono API + Better Auth
       ├─ D1: users, sessions, API token hashes, memos, import keys, FTS5, settings
       └─ R2: private attachment objects
```

一个 Cloudflare 账号运行一个实例。staging 和 production 使用完全独立的 Worker、D1、R2 与 secrets。

## 请求边界

- `/api/auth/*`：Better Auth 会话和邮箱密码认证。
- `/api/v1/*`：业务 API。Cookie 写请求执行同源校验；Bearer 内容请求执行 token 与 scope 校验。
- `/api/v1/public/*`：仅返回 ACTIVE 用户的 ACTIVE/PUBLIC 内容。
- 其他路径：由 Static Assets 提供 React SPA fallback。

## 数据与一致性

- D1 是业务元数据真源，时间使用 UTC 毫秒整数。
- Memo 使用递增 `version` 做乐观并发控制。
- FTS5 trigger 同步内容索引；中文查询额外使用受权限约束的 `instr()` 回退。
- R2 只保存二进制，D1 保存 object key 和状态。上传采用 PENDING → READY 状态机。
- Cron 清理过期 token、限流记录和未完成/失败删除的附件。
- API token 只保存 SHA-256 哈希；`last_used_at` 最多每小时异步写入一次。
- ZIP 使用 `${exportId}:${sourceMemoId}` 作为用户级幂等键。Memo、tag、附件关联和幂等记录通过 D1 batch 原子写入。

## 权限矩阵

| 内容 | 作者 | ACTIVE 成员 | 匿名 |
| --- | --- | --- | --- |
| PRIVATE | 读写 | 不可见 | 不可见 |
| MEMBERS | 读写 | 只读 | 不可见 |
| PUBLIC | 读写 | 只读 | 只读 |
| ARCHIVED | 读写 | 不可见 | 不可见 |

附件访问继承关联 Memo 的权限。未关联附件只允许创建者操作。

## 安全设计

- 邀请制注册；首位管理员由一次性 bootstrap token 创建。
- Secure、HttpOnly、SameSite Cookie，会话与账号停用联动。
- 个人 API token 分为只读和读写 scope；令牌管理与所有管理类接口仍只接受 Cookie 会话。
- 版本化 scrypt 密码哈希，恢复密码后撤销现有会话。
- Markdown 禁止原始 HTML，并使用 rehype-sanitize。
- HTML/SVG 等主动附件强制下载；图片类型受控内联。
- 管理员邮箱默认不公开，匿名联系入口由管理员显式配置。
- ZIP 在浏览器中逐项读取，并拒绝路径穿越、重复/缺失/未声明文件和超限内容；服务端再次校验所有权和大小。
