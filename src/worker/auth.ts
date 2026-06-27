import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { and, eq, gt, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";
import { accounts, invitations, rateLimits, sessions, users, verifications } from "../db/schema";
import type { AppBindings } from "./bindings";
import { hashPassword, hashToken, timingSafeStringEqual, verifyPassword } from "./crypto";

interface WaitUntilContext {
  waitUntil(promise: Promise<unknown>): void;
}

export function createAuth(env: AppBindings, requestUrl: string, executionContext?: WaitUntilContext) {
  const origin = new URL(requestUrl).origin;
  const db = drizzle(env.DB);

  return betterAuth({
    appName: env.APP_NAME,
    baseURL: origin,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [origin],
    database: drizzleAdapter(db, {
      provider: "sqlite",
      transaction: false,
      schema: {
        user: users,
        session: sessions,
        account: accounts,
        verification: verifications,
        rateLimit: rateLimits,
      },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      autoSignIn: true,
      password: { hash: hashPassword, verify: verifyPassword },
    },
    user: {
      additionalFields: {
        username: { type: "string", required: true, input: true },
        role: { type: "string", required: true, defaultValue: "USER", input: false },
        status: { type: "string", required: true, defaultValue: "ACTIVE", input: false },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 20,
      customRules: {
        "/sign-in/email": { window: 60, max: 8 },
        "/sign-up/email": { window: 60, max: 5 },
      },
    },
    advanced: {
      useSecureCookies: origin.startsWith("https://"),
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"] },
      ...(executionContext
        ? { backgroundTasks: { handler: (promise: Promise<unknown>) => executionContext.waitUntil(promise) } }
        : {}),
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-up/email") return;
        const bootstrapToken = ctx.headers?.get("x-bootstrap-token");
        if (bootstrapToken) {
          const existing = await db.select({ id: users.id }).from(users).limit(1);
          if (existing.length === 0 && await timingSafeStringEqual(bootstrapToken, env.BOOTSTRAP_ADMIN_TOKEN)) return;
        }

        const inviteToken = ctx.headers?.get("x-invite-token");
        const parsedBody = z.object({ email: z.string() }).safeParse(ctx.body as unknown);
        const email = parsedBody.success ? parsedBody.data.email.toLowerCase() : "";
        if (!inviteToken || !email) throw new APIError("FORBIDDEN", { message: "需要有效邀请" });
        const invitation = await db
          .select({ id: invitations.id })
          .from(invitations)
          .where(and(
            eq(invitations.tokenHash, await hashToken(inviteToken)),
            eq(invitations.email, email),
            isNull(invitations.acceptedAt),
            gt(invitations.expiresAt, Date.now()),
          ))
          .limit(1);
        if (invitation.length === 0) throw new APIError("FORBIDDEN", { message: "邀请无效或已过期" });
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-up/email" || !ctx.context.newSession) return;
        const inviteToken = ctx.headers?.get("x-invite-token");
        if (!inviteToken) return;
        await db
          .update(invitations)
          .set({ acceptedAt: Date.now() })
          .where(and(eq(invitations.tokenHash, await hashToken(inviteToken)), isNull(invitations.acceptedAt)));
      }),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
