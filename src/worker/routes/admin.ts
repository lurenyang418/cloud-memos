import { and, desc, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { invitations, recoveryTokens, users } from "../../db/schema";
import { createInvitationSchema, updateInstanceSettingsSchema, updateUserStatusSchema } from "../../shared/schemas";
import type { AppEnv } from "../bindings";
import { createToken, hashToken } from "../crypto";
import { HttpError } from "../http";
import { requireAdmin } from "../middleware";
import { getPublicContact, savePublicContact } from "../settings";
import { validateJson } from "../validation";

export const adminRoutes = new Hono<AppEnv>();
adminRoutes.use("*", requireAdmin);

adminRoutes.get("/settings", async (c) => {
  const contact = await getPublicContact(c.env);
  return c.json({ contactLabel: contact?.label ?? "申请加入", contactUrl: contact?.url ?? "" });
});

adminRoutes.patch("/settings", validateJson(updateInstanceSettingsSchema), async (c) => {
  const input = c.req.valid("json");
  await savePublicContact(c.env, input);
  return c.json({ contactLabel: input.contactLabel, contactUrl: input.contactUrl });
});

adminRoutes.get("/users", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, username: users.username, role: users.role, status: users.status, createdAt: users.createdAt })
    .from(users)
    .orderBy(desc(users.createdAt));
  return c.json({ items: rows });
});

adminRoutes.patch("/users/:id", validateJson(updateUserStatusSchema), async (c) => {
  const viewer = c.get("viewer");
  const userId = c.req.param("id");
  if (viewer.id === userId) throw new HttpError(400, "CANNOT_SUSPEND_SELF", "不能停用自己的账号");
  const db = drizzle(c.env.DB);
  const result = await db.update(users).set({ status: c.req.valid("json").status, updatedAt: new Date() }).where(eq(users.id, userId));
  if (result.meta.changes !== 1) throw new HttpError(404, "USER_NOT_FOUND", "用户不存在");
  if (c.req.valid("json").status === "SUSPENDED") {
    await c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId).run();
  }
  return c.json({ success: true });
});

adminRoutes.get("/invitations", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db
    .select({ id: invitations.id, email: invitations.email, expiresAt: invitations.expiresAt, acceptedAt: invitations.acceptedAt, createdAt: invitations.createdAt })
    .from(invitations)
    .orderBy(desc(invitations.createdAt));
  return c.json({ items: rows });
});

adminRoutes.post("/invitations", validateJson(createInvitationSchema), async (c) => {
  const db = drizzle(c.env.DB);
  const email = c.req.valid("json").email.toLowerCase();
  const existingUser = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existingUser[0]) throw new HttpError(409, "USER_EXISTS", "该邮箱已经注册");

  const token = createToken();
  const now = Date.now();
  await db.insert(invitations).values({
    id: crypto.randomUUID(),
    email,
    tokenHash: await hashToken(token),
    invitedBy: c.get("viewer").id,
    expiresAt: now + 7 * 24 * 60 * 60 * 1000,
    createdAt: now,
  });
  return c.json({ token, url: `${new URL(c.req.url).origin}/invite/${token}`, expiresAt: now + 7 * 24 * 60 * 60 * 1000 }, 201);
});

adminRoutes.delete("/invitations/:id", async (c) => {
  const db = drizzle(c.env.DB);
  const result = await db.delete(invitations).where(and(eq(invitations.id, c.req.param("id")), isNull(invitations.acceptedAt)));
  if (result.meta.changes !== 1) throw new HttpError(404, "INVITATION_NOT_FOUND", "未使用的邀请不存在");
  return c.body(null, 204);
});

adminRoutes.post("/users/:id/recovery", async (c) => {
  const db = drizzle(c.env.DB);
  const user = await db.select({ id: users.id }).from(users).where(eq(users.id, c.req.param("id"))).limit(1);
  if (!user[0]) throw new HttpError(404, "USER_NOT_FOUND", "用户不存在");
  const token = createToken();
  const now = Date.now();
  await db.insert(recoveryTokens).values({
    id: crypto.randomUUID(),
    userId: user[0].id,
    tokenHash: await hashToken(token),
    expiresAt: now + 60 * 60 * 1000,
    createdAt: now,
  });
  return c.json({ token, url: `${new URL(c.req.url).origin}/recover/${token}`, expiresAt: now + 60 * 60 * 1000 }, 201);
});
