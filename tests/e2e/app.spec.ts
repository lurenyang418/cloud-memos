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
  password: "e2e-admin-password",
};

test("initializes, captures a memo, filters by tag, and opens its public page", async ({ page }) => {
  const session = await page.request.get("/api/v1/session");
  const state = await session.json() as { setupRequired: boolean };

  if (state.setupRequired) {
    await page.goto("/setup");
    await page.getByLabel("初始化令牌").fill(bootstrapToken);
    await page.getByLabel("显示名称").fill("E2E Admin");
    await page.getByLabel("用户名").fill("e2e-admin");
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

  await page.getByRole("button", { name: tagName }).click();
  await expect(page.getByRole("button", { name: tagName })).toBeVisible();
  await page.getByRole("link", { name: "公开主页" }).click();
  await expect(page.getByRole("heading", { name: "E2E Admin" })).toBeVisible();
  await expect(page.getByText(content, { exact: false })).toBeVisible();
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
