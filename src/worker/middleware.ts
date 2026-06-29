import type { Context, Next } from "hono";
import type { ApiScope, Viewer } from "../shared/types";
import type { AppEnv } from "./bindings";
import { createAuth } from "./auth";
import { hashToken } from "./crypto";
import { HttpError } from "./http";

interface ApiTokenRow extends Viewer {
  tokenId: string;
  scopesJson: string;
  lastUsedAt: number | null;
}

function parseScopes(value: string): ApiScope[] | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.some((scope) => scope !== "memos:read" && scope !== "memos:write")) return null;
    return [...new Set(parsed)] as ApiScope[];
  } catch {
    return null;
  }
}

function hasScope(scopes: ApiScope[], required: ApiScope): boolean {
  return scopes.includes(required) || (required === "memos:read" && scopes.includes("memos:write"));
}

async function bearerViewer(c: Context<AppEnv>, authorization: string): Promise<Viewer> {
  const match = /^Bearer (cm_pat_[A-Za-z0-9_-]{6,32}_[A-Za-z0-9_-]{20,})$/.exec(authorization);
  if (!match) throw new HttpError(401, "INVALID_API_TOKEN", "API 令牌无效");
  const now = Date.now();
  const row = await c.env.DB.prepare(`
    SELECT t.id AS tokenId, t.scopes AS scopesJson, t.last_used_at AS lastUsedAt,
           u.id, u.name, u.email, u.username, u.role, u.status
    FROM api_tokens t INNER JOIN users u ON u.id = t.user_id
    WHERE t.token_hash = ? AND t.revoked_at IS NULL AND t.expires_at > ?
  `).bind(await hashToken(match[1]), now).first<ApiTokenRow>();
  const scopes = row ? parseScopes(row.scopesJson) : null;
  if (!row || !scopes || row.status !== "ACTIVE" || (row.role !== "ADMIN" && row.role !== "USER")) {
    throw new HttpError(401, "INVALID_API_TOKEN", "API 令牌无效、已过期或已撤销");
  }
  if (!hasScope(scopes, "memos:read")) throw new HttpError(403, "INSUFFICIENT_SCOPE", "API 令牌缺少 memos:read 权限");

  c.set("authType", "API_TOKEN");
  c.set("scopes", scopes);
  const viewer: Viewer = { id: row.id, name: row.name, email: row.email, username: row.username, role: row.role, status: row.status };
  c.set("viewer", viewer);
  if (row.lastUsedAt === null || row.lastUsedAt <= now - 60 * 60 * 1000) {
    c.executionCtx.waitUntil(c.env.DB.prepare(
      "UPDATE api_tokens SET last_used_at = ? WHERE id = ? AND (last_used_at IS NULL OR last_used_at <= ?)",
    ).bind(now, row.tokenId, now - 60 * 60 * 1000).run()
      .then(() => undefined)
      .catch((error) => console.error(JSON.stringify({ message: "api token usage update failed", tokenId: row.tokenId, error: error instanceof Error ? error.message : String(error) }))));
  }
  return viewer;
}

export async function optionalViewer(c: Context<AppEnv>): Promise<Viewer | null> {
  const authorization = c.req.header("authorization");
  if (authorization !== undefined) return bearerViewer(c, authorization);

  const auth = createAuth(c.env, c.req.url, c.executionCtx);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return null;
  const user = session.user;
  if (
    (user.role !== "ADMIN" && user.role !== "USER") ||
    (user.status !== "ACTIVE" && user.status !== "SUSPENDED") ||
    typeof user.username !== "string"
  ) return null;
  const viewer = {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    role: user.role,
    status: user.status,
  } as Viewer;
  c.set("viewer", viewer);
  c.set("authType", "SESSION");
  c.set("scopes", []);
  return viewer;
}

function requireScope(scope: ApiScope) {
  return async (c: Context<AppEnv>, next: Next) => {
    const viewer = await optionalViewer(c);
    if (!viewer) throw new HttpError(401, "UNAUTHENTICATED", "请先登录");
    if (viewer.status !== "ACTIVE") throw new HttpError(403, "ACCOUNT_SUSPENDED", "账号已停用");
    if (c.get("authType") === "API_TOKEN" && !hasScope(c.get("scopes"), scope)) {
      throw new HttpError(403, "INSUFFICIENT_SCOPE", `API 令牌缺少 ${scope} 权限`);
    }
    await next();
  };
}

export const requireUser = requireScope("memos:read");
export const requireWrite = requireScope("memos:write");

export async function requireSession(c: Context<AppEnv>, next: Next) {
  const viewer = await optionalViewer(c);
  if (!viewer) throw new HttpError(401, "UNAUTHENTICATED", "请先登录");
  if (c.get("authType") !== "SESSION") throw new HttpError(403, "SESSION_REQUIRED", "此操作需要网页登录会话");
  if (viewer.status !== "ACTIVE") throw new HttpError(403, "ACCOUNT_SUSPENDED", "账号已停用");
  await next();
}

export async function requireAdmin(c: Context<AppEnv>, next: Next) {
  const viewer = await optionalViewer(c);
  if (!viewer) throw new HttpError(401, "UNAUTHENTICATED", "请先登录");
  if (c.get("authType") !== "SESSION" || viewer.status !== "ACTIVE" || viewer.role !== "ADMIN") {
    throw new HttpError(403, "FORBIDDEN", "需要管理员网页登录会话");
  }
  await next();
}

export async function enforceSameOrigin(c: Context<AppEnv>, next: Next) {
  if (["GET", "HEAD", "OPTIONS"].includes(c.req.method)) return next();
  if (c.req.header("authorization")?.startsWith("Bearer ")) return next();
  const origin = c.req.header("origin");
  if (origin && origin !== new URL(c.req.url).origin) throw new HttpError(403, "INVALID_ORIGIN", "请求来源无效");
  await next();
}
