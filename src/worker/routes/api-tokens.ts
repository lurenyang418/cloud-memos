import { Hono } from "hono";
import { createApiTokenSchema } from "../../shared/schemas";
import type { ApiScope, ApiTokenSummary } from "../../shared/types";
import type { AppEnv } from "../bindings";
import { createToken, hashToken } from "../crypto";
import { requireSession } from "../middleware";
import { validateJson } from "../validation";

interface ApiTokenRow extends Omit<ApiTokenSummary, "scopes"> {
  scopes: string;
}

function serialize(row: ApiTokenRow): ApiTokenSummary {
  return { ...row, scopes: JSON.parse(row.scopes) as ApiScope[] };
}

export const apiTokenRoutes = new Hono<AppEnv>();
apiTokenRoutes.use("/api-tokens", requireSession);
apiTokenRoutes.use("/api-tokens/*", requireSession);

apiTokenRoutes.get("/api-tokens", async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT id, name, token_prefix AS tokenPrefix, scopes, expires_at AS expiresAt,
           last_used_at AS lastUsedAt, revoked_at AS revokedAt, created_at AS createdAt
    FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC
  `).bind(c.get("viewer").id).all<ApiTokenRow>();
  return c.json({ items: rows.results.map(serialize) });
});

apiTokenRoutes.post("/api-tokens", validateJson(createApiTokenSchema), async (c) => {
  const input = c.req.valid("json");
  const prefix = createToken(6);
  const token = `cm_pat_${prefix}_${createToken(32)}`;
  const scopes: ApiScope[] = input.mode === "read-write" ? ["memos:read", "memos:write"] : ["memos:read"];
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  const expiresAt = createdAt + input.expiresInDays * 24 * 60 * 60 * 1000;
  await c.env.DB.prepare(`
    INSERT INTO api_tokens (id, user_id, name, token_prefix, token_hash, scopes, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, c.get("viewer").id, input.name, prefix, await hashToken(token), JSON.stringify(scopes), expiresAt, createdAt).run();
  return c.json({ token, item: { id, name: input.name, tokenPrefix: prefix, scopes, expiresAt, lastUsedAt: null, revokedAt: null, createdAt } }, 201);
});

apiTokenRoutes.delete("/api-tokens/:id", async (c) => {
  await c.env.DB.prepare(
    "UPDATE api_tokens SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ? AND user_id = ?",
  ).bind(Date.now(), c.req.param("id"), c.get("viewer").id).run();
  return c.body(null, 204);
});
