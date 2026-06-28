import { and, eq, gt, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { invitations, recoveryTokens, users } from "../../db/schema";
import { inviteAcceptSchema, resetPasswordSchema, setupSchema } from "../../shared/schemas";
import type { AppEnv } from "../bindings";
import { createAuth } from "../auth";
import { hashPassword, hashToken, timingSafeStringEqual } from "../crypto";
import { HttpError } from "../http";
import { optionalViewer } from "../middleware";
import { getPublicContact } from "../settings";
import { validateJson } from "../validation";

export const authRoutes = new Hono<AppEnv>();

authRoutes.get("/session", async (c) => {
  const [viewer, count, publicContact] = await Promise.all([
    optionalViewer(c),
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM users").first<{ count: number }>("count"),
    getPublicContact(c.env),
  ]);
  return c.json({ viewer, setupRequired: Number(count ?? 0) === 0, appName: c.env.APP_NAME, publicContact });
});

authRoutes.post("/setup", validateJson(setupSchema), async (c) => {
  const body = c.req.valid("json");
  const existing = await c.env.DB.prepare("SELECT id FROM users LIMIT 1").first();
  if (existing) throw new HttpError(409, "ALREADY_INITIALIZED", "实例已经初始化");
  if (!await timingSafeStringEqual(body.token, c.env.BOOTSTRAP_ADMIN_TOKEN)) {
    throw new HttpError(403, "INVALID_BOOTSTRAP_TOKEN", "初始化令牌无效");
  }

  const headers = new Headers(c.req.raw.headers);
  headers.set("x-bootstrap-token", body.token);
  const auth = createAuth(c.env, c.req.url, c.executionCtx);
  const response = await auth.api.signUpEmail({
    body: { name: body.name, username: body.username, email: body.email, password: body.password },
    headers,
    asResponse: true,
  });
  if (response.ok) {
    await c.env.DB.prepare("UPDATE users SET role = 'ADMIN' WHERE email = ?").bind(body.email.toLowerCase()).run();
  }
  return response;
});

authRoutes.get("/invitations/:token", async (c) => {
  const db = drizzle(c.env.DB);
  const row = await db
    .select({ email: invitations.email, expiresAt: invitations.expiresAt })
    .from(invitations)
    .where(and(
      eq(invitations.tokenHash, await hashToken(c.req.param("token"))),
      isNull(invitations.acceptedAt),
      gt(invitations.expiresAt, Date.now()),
    ))
    .limit(1);
  if (!row[0]) throw new HttpError(404, "INVALID_INVITATION", "邀请无效或已过期");
  return c.json(row[0]);
});

authRoutes.post("/invitations/accept", validateJson(inviteAcceptSchema), async (c) => {
  const body = c.req.valid("json");
  const db = drizzle(c.env.DB);
  const invitation = await db
    .select({ email: invitations.email })
    .from(invitations)
    .where(and(
      eq(invitations.tokenHash, await hashToken(body.token)),
      isNull(invitations.acceptedAt),
      gt(invitations.expiresAt, Date.now()),
    ))
    .limit(1);
  if (!invitation[0]) throw new HttpError(404, "INVALID_INVITATION", "邀请无效或已过期");
  const existingUsername = await db.select({ id: users.id }).from(users).where(eq(users.username, body.username)).limit(1);
  if (existingUsername[0]) throw new HttpError(409, "USERNAME_EXISTS", "该用户名已被使用，请换一个");

  const headers = new Headers(c.req.raw.headers);
  headers.set("x-invite-token", body.token);
  const auth = createAuth(c.env, c.req.url, c.executionCtx);
  return auth.api.signUpEmail({
    body: { name: body.name, username: body.username, email: invitation[0].email, password: body.password },
    headers,
    asResponse: true,
  });
});

authRoutes.get("/recovery/:token", async (c) => {
  const db = drizzle(c.env.DB);
  const row = await db
    .select({ email: users.email, expiresAt: recoveryTokens.expiresAt })
    .from(recoveryTokens)
    .innerJoin(users, eq(users.id, recoveryTokens.userId))
    .where(and(
      eq(recoveryTokens.tokenHash, await hashToken(c.req.param("token"))),
      isNull(recoveryTokens.usedAt),
      gt(recoveryTokens.expiresAt, Date.now()),
    ))
    .limit(1);
  if (!row[0]) throw new HttpError(404, "INVALID_RECOVERY_TOKEN", "恢复链接无效或已过期");
  return c.json(row[0]);
});

authRoutes.post("/recovery/reset", validateJson(resetPasswordSchema), async (c) => {
  const body = c.req.valid("json");
  const db = drizzle(c.env.DB);
  const tokenHash = await hashToken(body.token);
  const token = await db
    .select({ id: recoveryTokens.id, userId: recoveryTokens.userId })
    .from(recoveryTokens)
    .where(and(eq(recoveryTokens.tokenHash, tokenHash), isNull(recoveryTokens.usedAt), gt(recoveryTokens.expiresAt, Date.now())))
    .limit(1);
  if (!token[0]) throw new HttpError(404, "INVALID_RECOVERY_TOKEN", "恢复链接无效或已过期");

  const claimed = await db
    .update(recoveryTokens)
    .set({ usedAt: Date.now() })
    .where(and(eq(recoveryTokens.id, token[0].id), isNull(recoveryTokens.usedAt)));
  if (claimed.meta.changes !== 1) throw new HttpError(409, "RECOVERY_TOKEN_USED", "恢复链接已使用");

  const password = await hashPassword(body.password);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE accounts SET password = ?, updated_at = ? WHERE user_id = ? AND provider_id = 'credential'")
      .bind(password, Date.now(), token[0].userId),
    c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(token[0].userId),
  ]);
  return c.json({ success: true });
});
