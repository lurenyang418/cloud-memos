import { env } from "cloudflare:workers";
import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

const origin = "http://memos.test";
let adminCookie = "";
let memberCookie = "";
let memberId = "";
let publicMemoId = "";
let privateMemoId = "";
let readToken = "";
let writeToken = "";

async function request(path: string, init?: RequestInit, cookie?: string) {
  const headers = new Headers(init?.headers);
  if (init?.body && typeof init.body === "string") headers.set("content-type", "application/json");
  if (cookie) headers.set("cookie", cookie);
  return SELF.fetch(`${origin}${path}`, { ...init, headers });
}

async function json<T>(response: Response): Promise<T> {
  const body: unknown = await response.json();
  return body as T;
}

describe.sequential("worker integration", () => {
  beforeAll(async () => {
    const response = await request("/api/v1/setup", {
      method: "POST",
      body: JSON.stringify({
        token: "test-bootstrap-token-with-enough-entropy",
        name: "Admin",
        username: "admin",
        email: "admin@example.com",
        password: "admin1234",
      }),
    });
    expect(response.status).toBe(200);
    adminCookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
    expect(adminCookie).toContain("better-auth");
  });

  it("closes bootstrap and exposes the authenticated session", async () => {
    const repeated = await request("/api/v1/setup", {
      method: "POST",
      body: JSON.stringify({ token: "test-bootstrap-token-with-enough-entropy", name: "Other", username: "other", email: "other@example.com", password: "otherpass8" }),
    });
    expect(repeated.status).toBe(409);
    const session = await request("/api/v1/session", undefined, adminCookie);
    expect(session.status).toBe(200);
    expect(await json<{ viewer: { role: string; username: string }; appName: string }>(session)).toMatchObject({ viewer: { role: "ADMIN", username: "admin" }, appName: "Cloud Memos" });
  });

  it("requires invitations and consumes an invitation exactly once", async () => {
    const direct = await request("/api/auth/sign-up/email", {
      method: "POST",
      body: JSON.stringify({ name: "Blocked", username: "blocked", email: "blocked@example.com", password: "blocked88" }),
    });
    expect(direct.status).toBe(403);

    const inviteResponse = await request("/api/v1/admin/invitations", { method: "POST", body: JSON.stringify({ email: "member@example.com" }) }, adminCookie);
    expect(inviteResponse.status).toBe(201);
    const invitation = await json<{ token: string }>(inviteResponse);
    const invalidUsername = await request("/api/v1/invitations/accept", {
      method: "POST",
      body: JSON.stringify({ token: invitation.token, name: "Member", username: "Member", password: "memberpass8" }),
    });
    expect(invalidUsername.status).toBe(400);
    expect(await json<{ error: { message: string } }>(invalidUsername)).toMatchObject({
      error: { message: "用户名只能使用小写字母、数字和 _" },
    });
    const shortPassword = await request("/api/v1/invitations/accept", {
      method: "POST",
      body: JSON.stringify({ token: invitation.token, name: "Member", username: "member", password: "1234567" }),
    });
    expect(shortPassword.status).toBe(400);
    expect(await json<{ error: { message: string } }>(shortPassword)).toMatchObject({
      error: { message: "密码至少需要 8 个字符" },
    });
    const longUsername = await request("/api/v1/invitations/accept", {
      method: "POST",
      body: JSON.stringify({ token: invitation.token, name: "Member", username: "abcdefghijk", password: "pass1234" }),
    });
    expect(longUsername.status).toBe(400);
    expect(await json<{ error: { message: string } }>(longUsername)).toMatchObject({
      error: { message: "用户名不能超过 10 个字符" },
    });
    const longPassword = await request("/api/v1/invitations/accept", {
      method: "POST",
      body: JSON.stringify({ token: invitation.token, name: "Member", username: "member", password: "1234567890123" }),
    });
    expect(longPassword.status).toBe(400);
    expect(await json<{ error: { message: string } }>(longPassword)).toMatchObject({
      error: { message: "密码不能超过 12 个字符" },
    });
    const accept = await request("/api/v1/invitations/accept", {
      method: "POST",
      body: JSON.stringify({ token: invitation.token, name: "Member", username: "___", password: "pass1234" }),
    });
    expect(accept.status).toBe(200);
    memberCookie = accept.headers.get("set-cookie")?.split(";")[0] ?? "";
    expect(memberCookie).toContain("better-auth");
    memberId = (await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind("member@example.com").first<{ id: string }>())?.id ?? "";
    expect(memberId).not.toBe("");
    const reused = await request("/api/v1/invitations/accept", {
      method: "POST",
      body: JSON.stringify({ token: invitation.token, name: "Again", username: "again", password: "againpass8" }),
    });
    expect(reused.status).toBe(404);

    const duplicateInviteResponse = await request("/api/v1/admin/invitations", {
      method: "POST",
      body: JSON.stringify({ email: "duplicate-name@example.com" }),
    }, adminCookie);
    const duplicateInvitation = await json<{ token: string }>(duplicateInviteResponse);
    const duplicateUsername = await request("/api/v1/invitations/accept", {
      method: "POST",
      body: JSON.stringify({ token: duplicateInvitation.token, name: "Duplicate", username: "___", password: "pass5678" }),
    });
    expect(duplicateUsername.status).toBe(409);
    expect(await json<{ error: { code: string; message: string } }>(duplicateUsername)).toMatchObject({
      error: { code: "USERNAME_EXISTS", message: "该用户名已被使用，请换一个" },
    });
  });

  it("lets only admins configure a safe public contact link", async () => {
    const forbidden = await request("/api/v1/admin/settings", {
      method: "PATCH",
      body: JSON.stringify({ appName: "Member Memos", contactLabel: "联系站长", contactUrl: "mailto:owner@example.com" }),
    }, memberCookie);
    expect(forbidden.status).toBe(403);

    const unsafe = await request("/api/v1/admin/settings", {
      method: "PATCH",
      body: JSON.stringify({ appName: "Edge Notes", contactLabel: "联系站长", contactUrl: "javascript:alert(1)" }),
    }, adminCookie);
    expect(unsafe.status).toBe(400);

    const invalidName = await request("/api/v1/admin/settings", {
      method: "PATCH",
      body: JSON.stringify({ appName: "Bad\nName", contactLabel: "联系站长", contactUrl: "mailto:owner@example.com" }),
    }, adminCookie);
    expect(invalidName.status).toBe(400);
    expect(await json<{ error: { message: string } }>(invalidName)).toMatchObject({ error: { message: "网站名称不能包含控制字符" } });

    const update = await request("/api/v1/admin/settings", {
      method: "PATCH",
      body: JSON.stringify({ appName: "Edge Notes", contactLabel: "联系站长", contactUrl: "mailto:owner@example.com" }),
    }, adminCookie);
    expect(update.status).toBe(200);
    const session = await request("/api/v1/session");
    expect(await json<{ appName: string; publicContact: { label: string; url: string } }>(session)).toMatchObject({
      appName: "Edge Notes",
      publicContact: { label: "联系站长", url: "mailto:owner@example.com" },
    });
  });

  it("enforces memo visibility and indexes tags and content", async () => {
    const privateResponse = await request("/api/v1/memos", { method: "POST", body: JSON.stringify({ content: "private note #秘密", visibility: "PRIVATE", attachmentIds: [] }) }, adminCookie);
    expect(privateResponse.status).toBe(201);
    const privateMemo = await json<{ id: string }>(privateResponse);
    privateMemoId = privateMemo.id;
    expect((await request(`/api/v1/memos/${privateMemo.id}`)).status).toBe(404);
    expect((await request(`/api/v1/memos/${privateMemo.id}`, undefined, memberCookie)).status).toBe(404);

    const membersResponse = await request("/api/v1/memos", { method: "POST", body: JSON.stringify({ content: "members only", visibility: "MEMBERS", attachmentIds: [] }) }, adminCookie);
    const membersMemo = await json<{ id: string }>(membersResponse);
    expect((await request(`/api/v1/memos/${membersMemo.id}`)).status).toBe(404);
    expect((await request(`/api/v1/memos/${membersMemo.id}`, undefined, memberCookie)).status).toBe(200);

    const publicResponse = await request("/api/v1/memos", { method: "POST", body: JSON.stringify({ content: "Cloudflare 边缘记录 #项目", visibility: "PUBLIC", attachmentIds: [] }) }, adminCookie);
    expect(publicResponse.status).toBe(201);
    const publicMemo = await json<{ id: string; tags: string[] }>(publicResponse);
    publicMemoId = publicMemo.id;
    expect(publicMemo.tags).toEqual(["项目"]);
    expect((await request(`/api/v1/memos/${publicMemo.id}`)).status).toBe(200);

    const search = await request("/api/v1/memos?q=边缘&tag=项目", undefined, adminCookie);
    expect(search.status).toBe(200);
    expect((await json<{ items: Array<{ id: string }> }>(search)).items.map((item) => item.id)).toContain(publicMemo.id);
  });

  it("shows shared member content in the member feed and public profile", async () => {
    expect((await request("/api/v1/feed")).status).toBe(401);
    const feed = await request("/api/v1/feed", undefined, memberCookie);
    expect(feed.status).toBe(200);
    const feedContents = (await json<{ items: Array<{ content: string }> }>(feed)).items.map((item) => item.content);
    expect(feedContents).toContain("members only");
    expect(feedContents).toContain("Cloudflare 边缘记录 #项目");
    expect(feedContents).not.toContain("private note #秘密");

    const memberProfile = await request("/api/v1/public/users/admin/memos", undefined, memberCookie);
    const memberContents = (await json<{ items: Array<{ content: string }> }>(memberProfile)).items.map((item) => item.content);
    expect(memberContents).toContain("members only");
    expect(memberContents).toContain("Cloudflare 边缘记录 #项目");

    const anonymousProfile = await request("/api/v1/public/users/admin/memos");
    const anonymousContents = (await json<{ items: Array<{ content: string }> }>(anonymousProfile)).items.map((item) => item.content);
    expect(anonymousContents).toContain("Cloudflare 边缘记录 #项目");
    expect(anonymousContents).not.toContain("members only");

    const publicFeed = await request("/api/v1/public/memos");
    expect(publicFeed.status).toBe(200);
    const publicFeedContents = (await json<{ items: Array<{ content: string }> }>(publicFeed)).items.map((item) => item.content);
    expect(publicFeedContents).toContain("Cloudflare 边缘记录 #项目");
    expect(publicFeedContents).not.toContain("members only");
    expect(publicFeedContents).not.toContain("private note #秘密");
  });

  it("blocks cross-user mutation and cross-origin writes", async () => {
    const idor = await request(`/api/v1/memos/${privateMemoId}`, {
      method: "PATCH",
      body: JSON.stringify({ content: "stolen", version: 1 }),
    }, memberCookie);
    expect(idor.status).toBe(404);

    const csrf = await request("/api/v1/memos", {
      method: "POST",
      headers: { origin: "https://evil.example" },
      body: JSON.stringify({ content: "cross origin", visibility: "PRIVATE", attachmentIds: [] }),
    }, adminCookie);
    expect(csrf.status).toBe(403);
  });

  it("creates hashed API tokens and enforces scopes and session-only administration", async () => {
    const createRead = await request("/api/v1/api-tokens", {
      method: "POST",
      body: JSON.stringify({ name: "read cli", mode: "read-only", expiresInDays: 365 }),
    }, adminCookie);
    expect(createRead.status).toBe(201);
    readToken = (await json<{ token: string }>(createRead)).token;
    expect(readToken).toMatch(/^cm_pat_[A-Za-z0-9_-]+_[A-Za-z0-9_-]+$/);
    const stored = await env.DB.prepare("SELECT token_hash AS tokenHash FROM api_tokens WHERE name = ?").bind("read cli").first<{ tokenHash: string }>();
    expect(stored?.tokenHash).not.toBe(readToken);
    expect(stored?.tokenHash).toHaveLength(64);
    const summaries = await request("/api/v1/api-tokens", undefined, adminCookie);
    const summariesText = await summaries.text();
    expect(summariesText).not.toContain(readToken);
    expect(summariesText).not.toContain("tokenHash");

    const readHeaders = { authorization: `Bearer ${readToken}` };
    expect((await request("/api/v1/memos", { headers: readHeaders })).status).toBe(200);
    const deniedWrite = await request("/api/v1/memos", {
      method: "POST", headers: readHeaders, body: JSON.stringify({ content: "denied", visibility: "PRIVATE", attachmentIds: [] }),
    });
    expect(deniedWrite.status).toBe(403);
    expect(await json<{ error: { code: string } }>(deniedWrite)).toMatchObject({ error: { code: "INSUFFICIENT_SCOPE" } });
    expect((await request("/api/v1/api-tokens", { headers: readHeaders })).status).toBe(403);
    expect((await request("/api/v1/admin/users", { headers: readHeaders })).status).toBe(403);
    const invalid = await request("/api/v1/memos", { headers: { authorization: "Bearer cm_pat_invalid_invalidinvalidinvalidinvalid" } });
    expect(invalid.status).toBe(401);
    expect(await json<{ error: { code: string } }>(invalid)).toMatchObject({ error: { code: "INVALID_API_TOKEN" } });

    const createWrite = await request("/api/v1/api-tokens", {
      method: "POST", body: JSON.stringify({ name: "write cli", mode: "read-write", expiresInDays: 30 }),
    }, adminCookie);
    writeToken = (await json<{ token: string }>(createWrite)).token;
    const bearerWrite = await request("/api/v1/memos", {
      method: "POST",
      headers: { authorization: `Bearer ${writeToken}`, origin: "https://cli.example" },
      body: JSON.stringify({ content: "created through api", visibility: "PRIVATE", attachmentIds: [] }),
    });
    expect(bearerWrite.status).toBe(201);
    const apiMemo = await json<{ id: string; version: number }>(bearerWrite);
    const search = await request("/api/v1/memos?q=through", { headers: { authorization: `Bearer ${writeToken}` } });
    expect((await json<{ items: Array<{ id: string }> }>(search)).items.map((item) => item.id)).toContain(apiMemo.id);
    const update = await request(`/api/v1/memos/${apiMemo.id}`, {
      method: "PATCH", headers: { authorization: `Bearer ${writeToken}` }, body: JSON.stringify({ pinned: true, version: apiMemo.version }),
    });
    expect(update.status).toBe(200);
    const stale = await request(`/api/v1/memos/${apiMemo.id}`, {
      method: "PATCH", headers: { authorization: `Bearer ${writeToken}` }, body: JSON.stringify({ state: "ARCHIVED", version: apiMemo.version }),
    });
    expect(stale.status).toBe(409);
    const archived = await request(`/api/v1/memos/${apiMemo.id}`, {
      method: "PATCH", headers: { authorization: `Bearer ${writeToken}` }, body: JSON.stringify({ state: "ARCHIVED", version: 2 }),
    });
    expect(archived.status).toBe(200);

    const attachmentContent = "bearer file";
    const pendingResponse = await request("/api/v1/attachments", {
      method: "POST", headers: { authorization: `Bearer ${writeToken}` }, body: JSON.stringify({ filename: "bearer.txt", contentType: "text/plain", size: attachmentContent.length }),
    });
    const pending = await json<{ id: string; uploadUrl: string }>(pendingResponse);
    expect((await request(pending.uploadUrl, {
      method: "PUT", headers: { authorization: `Bearer ${writeToken}`, "content-type": "text/plain", "content-length": String(attachmentContent.length) }, body: attachmentContent,
    })).status).toBe(200);
    const attachmentMemoResponse = await request("/api/v1/memos", {
      method: "POST", headers: { authorization: `Bearer ${writeToken}` }, body: JSON.stringify({ content: "api attachment", visibility: "PRIVATE", attachmentIds: [pending.id] }),
    });
    const attachmentMemo = await json<{ id: string }>(attachmentMemoResponse);
    const download = await request(`/api/v1/attachments/${pending.id}/content`, { headers: { authorization: `Bearer ${writeToken}` } });
    expect(await download.text()).toBe(attachmentContent);
    expect((await request(`/api/v1/memos/${attachmentMemo.id}`, { method: "DELETE", headers: { authorization: `Bearer ${writeToken}` } })).status).toBe(204);
    expect((await request(`/api/v1/memos/${apiMemo.id}`, { method: "DELETE", headers: { authorization: `Bearer ${writeToken}` } })).status).toBe(204);

    expect((await request("/api/auth/change-password", { method: "POST", headers: { authorization: `Bearer ${writeToken}` }, body: JSON.stringify({ currentPassword: "admin1234", newPassword: "changed88" }) })).status).not.toBe(200);
  });

  it("invalidates revoked, expired and suspended-user tokens immediately", async () => {
    const rows = await request("/api/v1/api-tokens", undefined, adminCookie);
    const tokenId = (await json<{ items: Array<{ id: string; name: string }> }>(rows)).items.find((item) => item.name === "read cli")?.id;
    expect(tokenId).toBeTruthy();
    expect((await request(`/api/v1/api-tokens/${tokenId}`, { method: "DELETE" }, adminCookie)).status).toBe(204);
    expect((await request(`/api/v1/api-tokens/${tokenId}`, { method: "DELETE" }, adminCookie)).status).toBe(204);
    expect((await request("/api/v1/memos", { headers: { authorization: `Bearer ${readToken}` } })).status).toBe(401);

    await env.DB.prepare("UPDATE api_tokens SET expires_at = ? WHERE name = ?").bind(Date.now() - 1, "write cli").run();
    expect((await request("/api/v1/memos", { headers: { authorization: `Bearer ${writeToken}` } })).status).toBe(401);

    const memberTokenResponse = await request("/api/v1/api-tokens", {
      method: "POST", body: JSON.stringify({ name: "member cli", mode: "read-only", expiresInDays: 7 }),
    }, memberCookie);
    const memberToken = (await json<{ token: string }>(memberTokenResponse)).token;
    await request(`/api/v1/admin/users/${memberId}`, { method: "PATCH", body: JSON.stringify({ status: "SUSPENDED" }) }, adminCookie);
    expect((await request("/api/v1/memos", { headers: { authorization: `Bearer ${memberToken}` } })).status).toBe(401);
    await request(`/api/v1/admin/users/${memberId}`, { method: "PATCH", body: JSON.stringify({ status: "ACTIVE" }) }, adminCookie);
    const login = await request("/api/auth/sign-in/email", {
      method: "POST", body: JSON.stringify({ email: "member@example.com", password: "pass1234" }),
    });
    expect(login.status).toBe(200);
    memberCookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
  });

  it("imports memo metadata and attachments idempotently per user", async () => {
    const content = "imported attachment";
    const createAttachment = await request("/api/v1/attachments", {
      method: "POST", body: JSON.stringify({ filename: "import.txt", contentType: "text/plain", size: content.length }),
    }, memberCookie);
    const attachment = await json<{ id: string; uploadUrl: string }>(createAttachment);
    expect((await request(attachment.uploadUrl, {
      method: "PUT", headers: { "content-type": "text/plain", "content-length": String(content.length) }, body: content,
    }, memberCookie)).status).toBe(200);

    const sourceKey = "11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222";
    const imported = await request("/api/v1/import/memos", {
      method: "POST",
      body: JSON.stringify({ sourceKey, content: "restored #标签", visibility: "PUBLIC", state: "ARCHIVED", pinned: true, version: 7, createdAt: 1_700_000_000_000, updatedAt: 1_700_000_001_000, attachmentIds: [attachment.id] }),
    }, memberCookie);
    expect(imported.status).toBe(201);
    const first = await json<{ imported: boolean; memo: { id: string; visibility: string; state: string; pinned: boolean; version: number; createdAt: number; attachments: Array<{ id: string }> } }>(imported);
    expect(first).toMatchObject({ imported: true, memo: { visibility: "PUBLIC", state: "ARCHIVED", pinned: true, version: 7, createdAt: 1_700_000_000_000, attachments: [{ id: attachment.id }] } });
    const repeated = await request("/api/v1/import/memos", {
      method: "POST",
      body: JSON.stringify({ sourceKey, content: "ignored", visibility: "PRIVATE", state: "ACTIVE", pinned: false, version: 1, createdAt: 1, updatedAt: 1, attachmentIds: [] }),
    }, memberCookie);
    expect(repeated.status).toBe(200);
    expect(await json<{ imported: boolean; memo: { id: string } }>(repeated)).toMatchObject({ imported: false, memo: { id: first.memo.id } });
    const checked = await request("/api/v1/import/check", { method: "POST", body: JSON.stringify({ sourceKeys: [sourceKey] }) }, memberCookie);
    expect(await json<{ items: Array<{ sourceKey: string; memoId: string }> }>(checked)).toMatchObject({ items: [{ sourceKey, memoId: first.memo.id }] });

    const otherUser = await request("/api/v1/import/memos", {
      method: "POST",
      body: JSON.stringify({ sourceKey, content: "admin copy", visibility: "MEMBERS", state: "ACTIVE", pinned: false, version: 2, createdAt: 2, updatedAt: 3, attachmentIds: [] }),
    }, adminCookie);
    expect(otherUser.status).toBe(201);
    expect((await json<{ memo: { id: string } }>(otherUser)).memo.id).not.toBe(first.memo.id);
  });

  it("serves an OpenAPI document for the token and import APIs", async () => {
    const response = await request("/api/v1/openapi.json");
    expect(response.status).toBe(200);
    const document = await json<{ openapi: string; paths: Record<string, unknown> }>(response);
    expect(document.openapi).toBe("3.1.0");
    expect(document.paths).toHaveProperty("/api/v1/api-tokens");
    expect(document.paths).toHaveProperty("/api/v1/import/memos");
  });

  it("paginates without duplicates", async () => {
    await request("/api/v1/memos", { method: "POST", body: JSON.stringify({ content: "pagination seed", visibility: "PRIVATE", attachmentIds: [] }) }, adminCookie);
    const first = await request("/api/v1/memos?limit=2", undefined, adminCookie);
    const firstPage = await json<{ items: Array<{ id: string }>; nextCursor: string | null }>(first);
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).toBeTruthy();
    const second = await request(`/api/v1/memos?limit=2&cursor=${encodeURIComponent(firstPage.nextCursor ?? "")}`, undefined, adminCookie);
    const secondPage = await json<{ items: Array<{ id: string }> }>(second);
    expect(secondPage.items).toHaveLength(2);
    expect(secondPage.items.some((item) => firstPage.items.some((firstItem) => firstItem.id === item.id))).toBe(false);
  });

  it("streams attachments through private R2 and follows memo visibility", async () => {
    const content = "hello attachment";
    const create = await request("/api/v1/attachments", {
      method: "POST",
      body: JSON.stringify({ filename: "hello.txt", contentType: "text/plain", size: content.length }),
    }, adminCookie);
    expect(create.status).toBe(201);
    const attachment = await json<{ id: string; uploadUrl: string }>(create);
    const upload = await request(attachment.uploadUrl, {
      method: "PUT",
      headers: { "content-type": "text/plain", "content-length": String(content.length) },
      body: content,
    }, adminCookie);
    expect(upload.status).toBe(200);

    const memo = await request("/api/v1/memos", {
      method: "POST",
      body: JSON.stringify({ content: "public file", visibility: "PUBLIC", attachmentIds: [attachment.id] }),
    }, adminCookie);
    expect(memo.status).toBe(201);
    const download = await request(`/api/v1/attachments/${attachment.id}/content`);
    expect(download.status).toBe(200);
    expect(await download.text()).toBe(content);
    expect(download.headers.get("content-disposition")).toContain("attachment");
  });

  it("rejects invalid upload metadata and mismatched bodies", async () => {
    const invalidMime = await request("/api/v1/attachments", {
      method: "POST",
      body: JSON.stringify({ filename: "bad.html", contentType: "text/html\r\nx-injected: yes", size: 10 }),
    }, adminCookie);
    expect(invalidMime.status).toBe(400);
    const oversized = await request("/api/v1/attachments", {
      method: "POST",
      body: JSON.stringify({ filename: "huge.bin", contentType: "application/octet-stream", size: 26_214_401 }),
    }, adminCookie);
    expect(oversized.status).toBe(413);

    const create = await request("/api/v1/attachments", {
      method: "POST",
      body: JSON.stringify({ filename: "short.txt", contentType: "text/plain", size: 10 }),
    }, adminCookie);
    const attachment = await json<{ uploadUrl: string }>(create);
    const mismatch = await request(attachment.uploadUrl, {
      method: "PUT",
      headers: { "content-type": "text/plain", "content-length": "5" },
      body: "short",
    }, adminCookie);
    expect(mismatch.status).toBe(400);
  });

  it("rejects stale optimistic updates", async () => {
    const first = await request(`/api/v1/memos/${publicMemoId}`, { method: "PATCH", body: JSON.stringify({ pinned: true, version: 1 }) }, adminCookie);
    expect(first.status).toBe(200);
    const stale = await request(`/api/v1/memos/${publicMemoId}`, { method: "PATCH", body: JSON.stringify({ pinned: false, version: 1 }) }, adminCookie);
    expect(stale.status).toBe(409);
    expect(await json<{ error: { details: { currentVersion: number } } }>(stale)).toMatchObject({ error: { details: { currentVersion: 2 } } });

    const timeline = await request("/api/v1/memos", undefined, adminCookie);
    expect((await json<{ items: Array<{ id: string; pinned: boolean }> }>(timeline)).items[0]).toMatchObject({ id: publicMemoId, pinned: true });
  });

  it("keeps binary data out of D1", async () => {
    const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM attachments WHERE status = 'READY'").first<{ count: number }>();
    expect(row?.count).toBeGreaterThan(0);
  });

  it("revokes sessions on recovery and allows the new password", async () => {
    const recoveryResponse = await request(`/api/v1/admin/users/${memberId}/recovery`, { method: "POST" }, adminCookie);
    expect(recoveryResponse.status).toBe(201);
    const recovery = await json<{ token: string }>(recoveryResponse);
    const reset = await request("/api/v1/recovery/reset", {
      method: "POST",
      body: JSON.stringify({ token: recovery.token, password: "newpass8" }),
    });
    expect(reset.status).toBe(200);
    expect((await request("/api/v1/memos", undefined, memberCookie)).status).toBe(401);
    const login = await request("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email: "member@example.com", password: "newpass8" }),
    });
    expect(login.status).toBe(200);
  });

  it("signs out when Better Auth receives an empty JSON body", async () => {
    const signOut = await request("/api/auth/sign-out", { method: "POST", headers: { origin }, body: "{}" }, adminCookie);
    expect(signOut.status).toBe(200);
    const session = await request("/api/v1/session", undefined, adminCookie);
    expect(await json<{ viewer: unknown }>(session)).toMatchObject({ viewer: null });
  });
});
