import type { Context, Next } from "hono";
import type { AppEnv } from "./bindings";
import { createAuth } from "./auth";
import { HttpError } from "./http";

export async function optionalViewer(c: Context<AppEnv>) {
  const auth = createAuth(c.env, c.req.url, c.executionCtx);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return null;
  const user = session.user;
  if (
    (user.role !== "ADMIN" && user.role !== "USER") ||
    (user.status !== "ACTIVE" && user.status !== "SUSPENDED") ||
    typeof user.username !== "string"
  ) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    role: user.role,
    status: user.status,
  } as const;
}

export async function requireUser(c: Context<AppEnv>, next: Next) {
  const viewer = await optionalViewer(c);
  if (!viewer) throw new HttpError(401, "UNAUTHENTICATED", "请先登录");
  if (viewer.status !== "ACTIVE") throw new HttpError(403, "ACCOUNT_SUSPENDED", "账号已停用");
  c.set("viewer", viewer);
  await next();
}

export async function requireAdmin(c: Context<AppEnv>, next: Next) {
  const viewer = await optionalViewer(c);
  if (!viewer) throw new HttpError(401, "UNAUTHENTICATED", "请先登录");
  if (viewer.status !== "ACTIVE" || viewer.role !== "ADMIN") throw new HttpError(403, "FORBIDDEN", "需要管理员权限");
  c.set("viewer", viewer);
  await next();
}

export async function enforceSameOrigin(c: Context<AppEnv>, next: Next) {
  if (["GET", "HEAD", "OPTIONS"].includes(c.req.method)) return next();
  const origin = c.req.header("origin");
  if (origin && origin !== new URL(c.req.url).origin) throw new HttpError(403, "INVALID_ORIGIN", "请求来源无效");
  await next();
}
