---
layout: home
title: 文档
titleTemplate: Cloud Memos

hero:
  name: Cloud Memos
  text: 把 Markdown 留在自己的 Cloudflare 上
  tagline: 单实例、多用户的轻量记录应用。一个 Worker 同时提供 React 界面与 Hono API，D1 保存关系数据，R2 安全保存私有附件。
  actions:
    - theme: brand
      text: 部署自己的实例
      link: /DEPLOYMENT
    - theme: alt
      text: 浏览 HTTP API
      link: /API
    - theme: alt
      text: 查看 GitHub
      link: https://github.com/lurenyang418/cloud-memos

features:
  - icon: ✍️
    title: Markdown 优先
    details: 支持 GFM 表格、任务列表、代码块、标签、全文搜索、版本历史和本地草稿。
  - icon: 🔐
    title: 权限边界清晰
    details: PRIVATE、MEMBERS、PUBLIC 三档可见性，附件访问始终重新执行关联 Memo 的权限判断。
  - icon: ☁️
    title: Cloudflare 原生
    details: Worker、D1 与 R2 组成完整部署单元，无需单独维护传统服务器或公开附件 bucket。
  - icon: 🔌
    title: 面向自动化
    details: 个人 API Token 提供只读和读写 scope，可安全接入 CLI、脚本与其他客户端。
---

## 从哪里开始

| 如果你想…… | 推荐阅读 |
| --- | --- |
| 了解应用如何组织 | [架构说明](./ARCHITECTURE.md) |
| 部署第一个实例 | [部署指南](./DEPLOYMENT.md) |
| 编写 CLI 或自动化 | [HTTP API](./API.md) |
| 建立备份与恢复流程 | [运维与灾难恢复](./OPERATIONS.md) |
| 准备生产发布 | [生产发布清单](./RELEASE_CHECKLIST.md) |

## 本地启动

```bash
pnpm install
cp .dev.vars.example .dev.vars
pnpm cf-typegen
pnpm db:migrate:local
pnpm dev
```

打开 `http://localhost:5173/setup`，使用本地 `.dev.vars` 中的初始化令牌创建首位管理员。真实 secret 不应写入仓库或文档。

::: tip 一个版本，一个部署单元
前端静态资源与 API 由同一个 Worker 发布。应用代码通过 Cloudflare bindings 访问 D1 和 R2，不需要在 Worker 内调用 Cloudflare REST API。
:::
