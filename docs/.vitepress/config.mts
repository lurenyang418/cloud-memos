import { defineConfig } from "vitepress";

const base = process.env.DOCS_BASE ?? "/cloud-memos/";
const siteUrl = "https://lurenyang418.github.io/cloud-memos/";
const description = "Cloudflare 原生、单实例多用户的 Markdown 记录应用";

export default defineConfig({
  lang: "zh-CN",
  title: "Cloud Memos",
  titleTemplate: ":title · Cloud Memos",
  description,
  base,
  cleanUrls: true,
  lastUpdated: true,
  sitemap: {
    hostname: siteUrl,
  },
  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: `${base}favicon.svg` }],
    ["meta", { name: "theme-color", content: "#f7f5ef" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:locale", content: "zh_CN" }],
    ["meta", { property: "og:title", content: "Cloud Memos 文档" }],
    ["meta", { property: "og:description", content: description }],
    ["meta", { property: "og:url", content: siteUrl }],
    ["meta", { property: "og:image", content: `${siteUrl}og.png` }],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
    ["meta", { name: "twitter:title", content: "Cloud Memos 文档" }],
    ["meta", { name: "twitter:description", content: description }],
    ["meta", { name: "twitter:image", content: `${siteUrl}og.png` }],
  ],
  themeConfig: {
    logo: "/favicon.svg",
    siteTitle: "Cloud Memos",
    nav: [
      { text: "概览", link: "/" },
      { text: "架构", link: "/ARCHITECTURE" },
      { text: "API", link: "/API" },
      { text: "部署", link: "/DEPLOYMENT" },
      {
        text: "项目",
        items: [
          { text: "GitHub 仓库", link: "https://github.com/lurenyang418/cloud-memos" },
          { text: "在线应用", link: "https://cloud-memos.lurenyang-003.workers.dev" },
        ],
      },
    ],
    sidebar: [
      {
        text: "开始",
        items: [
          { text: "项目概览", link: "/" },
          { text: "架构说明", link: "/ARCHITECTURE" },
        ],
      },
      {
        text: "使用与集成",
        items: [
          { text: "HTTP API", link: "/API" },
        ],
      },
      {
        text: "部署与运维",
        items: [
          { text: "部署指南", link: "/DEPLOYMENT" },
          { text: "运维与灾难恢复", link: "/OPERATIONS" },
          { text: "生产发布清单", link: "/RELEASE_CHECKLIST" },
        ],
      },
    ],
    socialLinks: [
      { icon: "github", link: "https://github.com/lurenyang418/cloud-memos" },
    ],
    search: {
      provider: "local",
      options: {
        translations: {
          button: {
            buttonText: "搜索文档",
            buttonAriaLabel: "搜索文档",
          },
          modal: {
            noResultsText: "没有找到相关内容",
            resetButtonTitle: "清除查询",
            footer: {
              selectText: "选择",
              navigateText: "切换",
              closeText: "关闭",
            },
          },
        },
      },
    },
    editLink: {
      pattern: "https://github.com/lurenyang418/cloud-memos/edit/main/docs/:path",
      text: "在 GitHub 上编辑此页",
    },
    outline: {
      level: [2, 3],
      label: "本页内容",
    },
    docFooter: {
      prev: "上一页",
      next: "下一页",
    },
    lastUpdated: {
      text: "最后更新",
      formatOptions: {
        dateStyle: "medium",
        timeStyle: "short",
      },
    },
    darkModeSwitchLabel: "外观",
    lightModeSwitchTitle: "切换到浅色模式",
    darkModeSwitchTitle: "切换到深色模式",
    sidebarMenuLabel: "目录",
    returnToTopLabel: "返回顶部",
    langMenuLabel: "切换语言",
    externalLinkIcon: true,
    footer: {
      message: "基于 MIT 许可证发布",
      copyright: "Cloud Memos",
    },
  },
});
