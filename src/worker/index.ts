import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import type { AppBindings, AppEnv } from "./bindings";
import { createAuth } from "./auth";
import { errorResponse, HttpError } from "./http";
import { openApiDocument } from "./openapi";
import { enforceSameOrigin } from "./middleware";
import { adminRoutes } from "./routes/admin";
import { apiTokenRoutes } from "./routes/api-tokens";
import { attachmentRoutes } from "./routes/attachments";
import { authRoutes } from "./routes/auth";
import { memoRoutes } from "./routes/memos";
import { importRoutes } from "./routes/imports";
import { publicRoutes } from "./routes/public";

export const app = new Hono<AppEnv>();

app.use("*", secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    imgSrc: ["'self'", "data:", "blob:"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    connectSrc: ["'self'"],
    fontSrc: ["'self'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    frameAncestors: ["'none'"],
  },
  referrerPolicy: "strict-origin-when-cross-origin",
}));

app.use("/api/v1/*", enforceSameOrigin);

app.get("/api/v1/openapi.json", (c) => c.json(openApiDocument));

app.all("/api/auth/*", (c) => createAuth(c.env, c.req.url, c.executionCtx).handler(c.req.raw));
app.route("/api/v1", authRoutes);
app.route("/api/v1", apiTokenRoutes);
app.route("/api/v1", memoRoutes);
app.route("/api/v1", attachmentRoutes);
app.route("/api/v1", importRoutes);
app.route("/api/v1/public", publicRoutes);
app.route("/api/v1/admin", adminRoutes);

app.notFound((c) => {
  if (new URL(c.req.url).pathname.startsWith("/api/")) {
    return c.json({ error: { code: "NOT_FOUND", message: "接口不存在" } }, 404);
  }
  return c.text("Not found", 404);
});

app.onError((error, c) => {
  if (error instanceof HttpError) return errorResponse(c, error);
  console.error(JSON.stringify({
    message: "unhandled request error",
    path: new URL(c.req.url).pathname,
    method: c.req.method,
    error: error instanceof Error ? error.message : String(error),
  }));
  return c.json({ error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } }, 500);
});

async function cleanup(env: AppBindings): Promise<void> {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const trashCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const expiredMemos = await env.DB.prepare("SELECT id FROM memos WHERE deleted_at IS NOT NULL AND deleted_at < ? LIMIT 500")
    .bind(trashCutoff).all<{ id: string }>();
  if (expiredMemos.results.length > 0) {
    const placeholders = expiredMemos.results.map(() => "?").join(",");
    const ids = expiredMemos.results.map((row) => row.id);
    await env.DB.batch([
      env.DB.prepare(`
        UPDATE attachments SET status = 'DELETING', updated_at = ?
        WHERE memo_id IN (${placeholders})
          AND EXISTS (SELECT 1 FROM memos WHERE id = attachments.memo_id AND deleted_at < ?)
      `).bind(Date.now(), ...ids, trashCutoff),
      env.DB.prepare(`DELETE FROM memos WHERE id IN (${placeholders}) AND deleted_at < ?`).bind(...ids, trashCutoff),
    ]);
  }
  const stale = await env.DB.prepare(
    "SELECT id, object_key AS objectKey FROM attachments WHERE status = 'DELETING' OR (memo_id IS NULL AND status IN ('PENDING', 'READY') AND created_at < ?) LIMIT 500",
  ).bind(cutoff).all<{ id: string; objectKey: string }>();
  if (stale.results.length > 0) {
    await env.ATTACHMENTS.delete(stale.results.map((row) => row.objectKey));
    const placeholders = stale.results.map(() => "?").join(",");
    await env.DB.prepare(`DELETE FROM attachments WHERE id IN (${placeholders})`).bind(...stale.results.map((row) => row.id)).run();
  }
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM invitations WHERE expires_at < ? AND accepted_at IS NULL").bind(now),
    env.DB.prepare("DELETE FROM recovery_tokens WHERE expires_at < ? OR used_at IS NOT NULL").bind(now),
    env.DB.prepare("DELETE FROM rate_limits WHERE last_request < ?").bind(now - 24 * 60 * 60 * 1000),
  ]);
}

export default {
  fetch(request, env, ctx) {
    return app.fetch(request, env, ctx);
  },
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(cleanup(env));
  },
} satisfies ExportedHandler<AppBindings>;
