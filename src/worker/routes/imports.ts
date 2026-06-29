import { Hono } from "hono";
import { importCheckSchema, importMemoSchema } from "../../shared/schemas";
import type { AppEnv } from "../bindings";
import { HttpError } from "../http";
import { getOwnedMemo } from "../memo-data";
import { requireWrite } from "../middleware";
import { extractTags } from "../tags";
import { validateJson } from "../validation";

export const importRoutes = new Hono<AppEnv>();
importRoutes.use("/import/*", requireWrite);

importRoutes.post("/import/check", validateJson(importCheckSchema), async (c) => {
  const sourceKeys = [...new Set(c.req.valid("json").sourceKeys)];
  const placeholders = sourceKeys.map(() => "?").join(",");
  const rows = await c.env.DB.prepare(
    `SELECT source_key AS sourceKey, memo_id AS memoId FROM memo_imports WHERE user_id = ? AND source_key IN (${placeholders})`,
  ).bind(c.get("viewer").id, ...sourceKeys).all<{ sourceKey: string; memoId: string }>();
  return c.json({ items: rows.results });
});

importRoutes.post("/import/memos", validateJson(importMemoSchema), async (c) => {
  const viewer = c.get("viewer");
  const input = c.req.valid("json");
  const prior = await c.env.DB.prepare(
    "SELECT memo_id AS memoId FROM memo_imports WHERE user_id = ? AND source_key = ?",
  ).bind(viewer.id, input.sourceKey).first<{ memoId: string }>();
  if (prior) return c.json({ imported: false, memo: await getOwnedMemo(c.env, prior.memoId, viewer.id) });

  const attachmentIds = [...new Set(input.attachmentIds)];
  if (attachmentIds.length !== input.attachmentIds.length) throw new HttpError(400, "INVALID_ATTACHMENTS", "附件 ID 不能重复");
  if (attachmentIds.length > 0) {
    const placeholders = attachmentIds.map(() => "?").join(",");
    const rows = await c.env.DB.prepare(
      `SELECT id FROM attachments WHERE creator_id = ? AND status = 'READY' AND memo_id IS NULL AND id IN (${placeholders})`,
    ).bind(viewer.id, ...attachmentIds).all<{ id: string }>();
    if (rows.results.length !== attachmentIds.length) throw new HttpError(400, "INVALID_ATTACHMENTS", "附件不存在、未上传完成或已被使用");
  }

  const memoId = crypto.randomUUID();
  const memoInsert = attachmentIds.length === 0
    ? c.env.DB.prepare(`
        INSERT INTO memos (id, creator_id, content, visibility, state, pinned, version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(memoId, viewer.id, input.content, input.visibility, input.state, input.pinned ? 1 : 0, input.version, input.createdAt, input.updatedAt)
    : c.env.DB.prepare(`
        INSERT INTO memos (id, creator_id, content, visibility, state, pinned, version, created_at, updated_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE (SELECT COUNT(*) FROM attachments
               WHERE creator_id = ? AND status = 'READY' AND memo_id IS NULL
                 AND id IN (${attachmentIds.map(() => "?").join(",")})) = ?
      `).bind(
        memoId, viewer.id, input.content, input.visibility, input.state, input.pinned ? 1 : 0, input.version, input.createdAt, input.updatedAt,
        viewer.id, ...attachmentIds, attachmentIds.length,
      );
  const statements: D1PreparedStatement[] = [
    memoInsert,
    c.env.DB.prepare("INSERT INTO memo_imports (id, user_id, source_key, memo_id, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), viewer.id, input.sourceKey, memoId, Date.now()),
  ];
  for (const tag of extractTags(input.content)) {
    statements.push(c.env.DB.prepare("INSERT INTO memo_tags (memo_id, normalized, display) VALUES (?, ?, ?)").bind(memoId, tag.normalized, tag.display));
  }
  for (const attachmentId of attachmentIds) {
    statements.push(c.env.DB.prepare(`
      UPDATE attachments SET memo_id = ?, updated_at = ?
      WHERE id = ? AND creator_id = ? AND memo_id IS NULL AND status = 'READY'
    `).bind(memoId, input.updatedAt, attachmentId, viewer.id));
  }

  try {
    await c.env.DB.batch(statements);
  } catch (error) {
    const raced = await c.env.DB.prepare(
      "SELECT memo_id AS memoId FROM memo_imports WHERE user_id = ? AND source_key = ?",
    ).bind(viewer.id, input.sourceKey).first<{ memoId: string }>();
    if (raced) return c.json({ imported: false, memo: await getOwnedMemo(c.env, raced.memoId, viewer.id) });
    if (attachmentIds.length > 0) {
      const placeholders = attachmentIds.map(() => "?").join(",");
      const remaining = await c.env.DB.prepare(
        `SELECT COUNT(*) AS count FROM attachments WHERE creator_id = ? AND status = 'READY' AND memo_id IS NULL AND id IN (${placeholders})`,
      ).bind(viewer.id, ...attachmentIds).first<number>("count");
      if (Number(remaining ?? 0) !== attachmentIds.length) {
        throw new HttpError(400, "INVALID_ATTACHMENTS", "附件状态已变化，请重新开始此条导入");
      }
    }
    throw error;
  }
  return c.json({ imported: true, memo: await getOwnedMemo(c.env, memoId, viewer.id) }, 201);
});
