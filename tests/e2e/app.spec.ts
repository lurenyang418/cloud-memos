import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";

function readLocalSecret(name: string): string {
  const path = existsSync(".dev.vars") ? ".dev.vars" : ".dev.vars.example";
  const line = readFileSync(path, "utf8").split(/\r?\n/).find((item) => item.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} is missing from ${path}`);
  const value = line.slice(name.length + 1).trim();
  return value.startsWith('"') ? JSON.parse(value) as string : value;
}

const bootstrapToken = readLocalSecret("BOOTSTRAP_ADMIN_TOKEN");

const admin = {
  email: "e2e-admin@example.com",
  password: "e2epass8",
};

test("initializes, captures a memo, filters by tag, and opens its public page", async ({ page }) => {
  const session = await page.request.get("/api/v1/session");
  const state = await session.json() as { setupRequired: boolean };

  if (state.setupRequired) {
    await page.goto("/setup");
    await page.getByLabel("初始化令牌").fill(bootstrapToken);
    await page.getByLabel("显示名称").fill("E2E Admin");
    await page.getByLabel("用户名").fill("AB-");
    await page.getByLabel("用户名").blur();
    await expect(page.getByText("只能使用小写字母、数字和 _")).toBeVisible();
    const displayNameTop = await page.getByLabel("显示名称").evaluate((element) => element.getBoundingClientRect().top);
    const usernameTop = await page.getByLabel("用户名").evaluate((element) => element.getBoundingClientRect().top);
    expect(Math.abs(displayNameTop - usernameTop)).toBeLessThan(2);
    await page.getByLabel("用户名").fill("E2E_Admin");
    await expect(page.getByLabel("用户名")).toHaveValue("e2e_admin");
    await page.getByLabel("邮箱").fill(admin.email);
    await page.getByLabel("密码").fill(admin.password);
    await page.getByRole("button", { name: "初始化实例" }).click();
  } else {
    await page.goto("/login");
    await page.getByLabel("邮箱").fill(admin.email);
    await page.getByLabel("密码").fill(admin.password);
    await page.getByRole("button", { name: "登录" }).click();
  }

  await expect(page.getByRole("heading", { name: "我的记录" })).toBeVisible();
  const settingsUpdate = await page.request.patch("/api/v1/admin/settings", {
    headers: { origin: "http://127.0.0.1:5173" },
    data: { contactLabel: "申请加入", contactUrl: "mailto:owner@example.com" },
  });
  expect(settingsUpdate.ok()).toBe(true);
  const composerWidth = await page.locator("form.composer").evaluate((element) => element.getBoundingClientRect().width);
  const editorWidth = await page.getByLabel("写一条 Memo").evaluate((element) => element.getBoundingClientRect().width);
  expect(editorWidth / composerWidth).toBeGreaterThan(0.98);
  const draft = `draft ${Date.now()}`;
  await page.getByLabel("写一条 Memo").fill(draft);
  await page.waitForTimeout(350);
  await page.reload();
  await expect(page.getByLabel("写一条 Memo")).toHaveValue(draft);
  await page.getByLabel("写一条 Memo").fill("");
  const runId = Date.now();
  const tagName = `#browser-${runId}`;
  const content = `E2E public memo ${runId} ${tagName}`;
  await page.getByLabel("写一条 Memo").fill(content);
  await page.getByLabel("可见性").click();
  await page.getByRole("option", { name: "公开" }).click();
  await page.getByRole("button", { name: "发布", exact: true }).click();
  await expect(page.getByText(content, { exact: false })).toBeVisible();
  await expect(page.getByLabel("写一条 Memo")).toHaveValue("");

  const sanitizedText = `sanitized memo ${runId}`;
  await page.getByLabel("可见性").click();
  await page.getByRole("option", { name: "仅自己" }).click();
  await page.getByLabel("写一条 Memo").fill(`${sanitizedText} <img src="x" onerror="window.__pwned=1">`);
  await page.getByRole("button", { name: "发布", exact: true }).click();
  await expect(page.getByLabel("写一条 Memo")).toHaveValue("");
  await expect(page.getByText(sanitizedText, { exact: true })).toBeVisible();
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as Window & { __pwned?: number }).__pwned)).toBeUndefined();

  const targetCard = page.locator("article.memo-card").filter({ hasText: content });
  await targetCard.getByRole("button", { name: "置顶", exact: true }).click();
  await expect(page.locator("article.memo-card").first()).toContainText(content);

  const listResponse = await page.request.get("/api/v1/memos");
  const list = await listResponse.json() as { items: Array<{ id: string; content: string; version: number }> };
  const targetMemo = list.items.find((memo) => memo.content === content);
  expect(targetMemo).toBeTruthy();
  const remoteContent = `${content} remote update`;
  let remoteUpdate = await page.request.patch(`/api/v1/memos/${targetMemo!.id}`, {
    headers: { origin: "http://127.0.0.1:5173" },
    data: { content: remoteContent, version: targetMemo!.version },
  });
  if (remoteUpdate.status() === 409) {
    const conflict = await remoteUpdate.json() as { error: { details: { currentVersion: number } } };
    remoteUpdate = await page.request.patch(`/api/v1/memos/${targetMemo!.id}`, {
      headers: { origin: "http://127.0.0.1:5173" },
      data: { content: remoteContent, version: conflict.error.details.currentVersion },
    });
  }
  expect(remoteUpdate.ok(), await remoteUpdate.text()).toBe(true);
  const resolvedContent = `${content} resolved locally`;
  await targetCard.getByRole("button", { name: "编辑", exact: true }).click();
  await targetCard.locator("textarea").fill(resolvedContent);
  await targetCard.getByRole("button", { name: "保存", exact: true }).click();
  await expect(targetCard.getByRole("status")).toContainText("你的编辑内容仍然保留");
  await expect(targetCard.locator("textarea")).toHaveValue(resolvedContent);
  await targetCard.getByRole("button", { name: "保存", exact: true }).click();
  await expect(targetCard).toContainText(resolvedContent);

  const markdownDownloadPromise = page.waitForEvent("download");
  await targetCard.getByRole("button", { name: "导出 Markdown" }).click();
  const markdownDownload = await markdownDownloadPromise;
  const markdownPath = await markdownDownload.path();
  expect(markdownDownload.suggestedFilename()).toMatch(/\.md$/);
  expect(markdownPath && readFileSync(markdownPath, "utf8")).toBe(resolvedContent);

  const attachmentMemo = `attachment export ${runId}`;
  await page.getByLabel("写一条 Memo").fill(attachmentMemo);
  await page.locator('input[type="file"]').setInputFiles({
    name: "export-note.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("portable attachment"),
  });
  await page.getByRole("button", { name: "发布", exact: true }).click();
  await expect(page.getByText(attachmentMemo, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: tagName }).click();
  await expect(page.locator(".filter-chip")).toHaveText(tagName);
  await page.getByRole("link", { name: "公开主页" }).click();
  await expect(page.getByRole("heading", { name: "E2E Admin" })).toBeVisible();
  await expect(page.getByText(content, { exact: false })).toBeVisible();

  await page.getByRole("link", { name: "返回应用" }).click();
  await page.getByRole("link", { name: "设置" }).click();
  const zipDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 ZIP" }).click();
  const zipDownload = await zipDownloadPromise;
  const zipPath = await zipDownload.path();
  expect(zipDownload.suggestedFilename()).toMatch(/^cloud-memos-e2e_admin-\d{4}-\d{2}-\d{2}\.zip$/);
  expect(zipPath).not.toBeNull();
  const zipBytes = readFileSync(zipPath!);
  const zipText = zipBytes.toString("utf8");
  expect(zipBytes.length).toBeGreaterThan(100);
  expect(zipText).toContain("manifest.json");
  expect(zipText).toContain(resolvedContent);
  expect(zipText).toContain("export-note.txt");
  expect(zipText).toContain("portable attachment");

  await page.locator("button.button-danger", { hasText: "退出登录" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "登录" })).toBeVisible();
  const signedOutSession = await page.request.get("/api/v1/session");
  expect(await signedOutSession.json()).toMatchObject({ viewer: null });
});

test("collapses the desktop sidebar and remembers the preference", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(admin.email);
  await page.getByLabel("密码").fill(admin.password);
  await page.getByRole("button", { name: "登录" }).click();
  const frame = page.locator(".app-frame");
  const expandedWidth = await page.locator(".sidebar").evaluate((element) => element.getBoundingClientRect().width);
  expect(expandedWidth).toBeLessThanOrEqual(220);
  const sidebarGap = await page.evaluate(() => {
    const sidebar = document.querySelector(".sidebar")!.getBoundingClientRect();
    const column = document.querySelector(".page-column")!.getBoundingClientRect();
    return column.left - sidebar.right;
  });
  expect(sidebarGap).toBeLessThan(180);
  const layoutOverflows = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(layoutOverflows).toBe(false);
  await page.getByRole("button", { name: "折叠侧边栏" }).click();
  await expect(frame).toHaveClass(/sidebar-collapsed/);
  await expect.poll(() => page.locator(".sidebar").evaluate((element) => element.getBoundingClientRect().width)).toBeLessThan(expandedWidth);
  await page.reload();
  await expect(frame).toHaveClass(/sidebar-collapsed/);
  await page.getByRole("button", { name: "展开侧边栏" }).click();
  await expect(frame).not.toHaveClass(/sidebar-collapsed/);
});

test("keeps the capture flow usable on a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(admin.email);
  await page.getByLabel("密码").fill(admin.password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByLabel("写一条 Memo")).toBeVisible();
  await expect(page.getByRole("link", { name: "我的记录" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test("uses the public feed as the anonymous homepage", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "公开动态" })).toBeVisible();
  await expect(page.getByRole("link", { name: "登录" })).toHaveAttribute("href", "/login");
  await expect(page.getByRole("link", { name: "申请加入" })).toHaveAttribute("href", "mailto:owner@example.com");
  await expect(page.getByText(/E2E public memo/).first()).toBeVisible();
  await expect(page.getByText(/sanitized memo/)).toHaveCount(0);
});
