import { Hono } from "hono";
import { createMemoSchema, listMemosSchema, updateMemoSchema } from "../../shared/schemas";
import type { CursorPage, Memo } from "../../shared/types";
import type { AppEnv } from "../bindings";
import { decodeCursor, encodeCursor } from "../cursor";
import { HttpError } from "../http";
import { getMemoById, getOwnedMemo, hydrateMemos, memoSelect, type MemoRow } from "../memo-data";
import { optionalViewer, requireUser, requireWrite } from "../middleware";
import { extractTags, normalizeTag } from "../tags";
import { validateJson, validateQuery } from "../validation";

export const memoRoutes = new Hono<AppEnv>();

function buildFtsQuery(query: string): string {
  return query
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `"${word.replaceAll('"', '""')}"*`)
    .join(" AND ");
}

memoRoutes.get("/memos", requireUser, validateQuery(listMemosSchema), async (c) => {
  const viewer = c.get("viewer");
  const input = c.req.valid("query");
  const cursor = decodeCursor(input.cursor);
  if (input.cursor && !cursor) throw new HttpError(400, "INVALID_CURSOR", "分页游标无效");

  const conditions = ["m.creator_id = ?", "m.state = ?"];
  const values: Array<string | number> = [viewer.id, input.state];
  if (input.visibility) {
    conditions.push("m.visibility = ?");
    values.push(input.visibility);
  }
  if (input.tag) {
    conditions.push("EXISTS (SELECT 1 FROM memo_tags mt WHERE mt.memo_id = m.id AND mt.normalized = ?)");
    values.push(normalizeTag(input.tag));
  }
  if (input.q) {
    conditions.push("(m.rowid IN (SELECT rowid FROM memos_fts WHERE memos_fts MATCH ?) OR instr(lower(m.content), lower(?)) > 0)");
    values.push(buildFtsQuery(input.q), input.q);
  }
  if (cursor) {
    const pinned = cursor.pinned ? 1 : 0;
    conditions.push("(m.pinned < ? OR (m.pinned = ? AND (m.created_at < ? OR (m.created_at = ? AND m.id < ?))))");
    values.push(pinned, pinned, cursor.createdAt, cursor.createdAt, cursor.id);
  }
  values.push(input.limit + 1);
  const result = await c.env.DB.prepare(`${memoSelect} WHERE ${conditions.join(" AND ")} ORDER BY m.pinned DESC, m.created_at DESC, m.id DESC LIMIT ?`)
    .bind(...values)
    .all<MemoRow>();
  const pageRows = result.results.slice(0, input.limit);
  const items = await hydrateMemos(c.env, pageRows);
  const last = pageRows.at(-1);
  const response: CursorPage<Memo> = {
    items,
    nextCursor: result.results.length > input.limit && last ? encodeCursor({ pinned: Boolean(last.pinned), createdAt: last.createdAt, id: last.id }) : null,
  };
  return c.json(response);
});

memoRoutes.get("/feed", requireUser, validateQuery(listMemosSchema), async (c) => {
  const input = c.req.valid("query");
  const cursor = decodeCursor(input.cursor);
  if (input.cursor && !cursor) throw new HttpError(400, "INVALID_CURSOR", "分页游标无效");

  const conditions = ["m.state = 'ACTIVE'", "m.visibility IN ('MEMBERS', 'PUBLIC')", "u.status = 'ACTIVE'"];
  const values: Array<string | number> = [];
  if (input.visibility) {
    conditions.push("m.visibility = ?");
    values.push(input.visibility);
  }
  if (input.tag) {
    conditions.push("EXISTS (SELECT 1 FROM memo_tags mt WHERE mt.memo_id = m.id AND mt.normalized = ?)");
    values.push(normalizeTag(input.tag));
  }
  if (input.q) {
    conditions.push("(m.rowid IN (SELECT rowid FROM memos_fts WHERE memos_fts MATCH ?) OR instr(lower(m.content), lower(?)) > 0)");
    values.push(buildFtsQuery(input.q), input.q);
  }
  if (cursor) {
    const pinned = cursor.pinned ? 1 : 0;
    conditions.push("(m.pinned < ? OR (m.pinned = ? AND (m.created_at < ? OR (m.created_at = ? AND m.id < ?))))");
    values.push(pinned, pinned, cursor.createdAt, cursor.createdAt, cursor.id);
  }
  values.push(input.limit + 1);
  const result = await c.env.DB.prepare(`${memoSelect} WHERE ${conditions.join(" AND ")} ORDER BY m.pinned DESC, m.created_at DESC, m.id DESC LIMIT ?`)
    .bind(...values)
    .all<MemoRow>();
  const pageRows = result.results.slice(0, input.limit);
  const last = pageRows.at(-1);
  const response: CursorPage<Memo> = {
    items: await hydrateMemos(c.env, pageRows),
    nextCursor: result.results.length > input.limit && last ? encodeCursor({ pinned: Boolean(last.pinned), createdAt: last.createdAt, id: last.id }) : null,
  };
  return c.json(response);
});

memoRoutes.post("/memos", requireWrite, validateJson(createMemoSchema), async (c) => {
  const viewer = c.get("viewer");
  const input = c.req.valid("json");
  if (input.attachmentIds.length > 0) {
    const placeholders = input.attachmentIds.map(() => "?").join(",");
    const result = await c.env.DB.prepare(
      `SELECT id FROM attachments WHERE creator_id = ? AND status = 'READY' AND memo_id IS NULL AND id IN (${placeholders})`,
    ).bind(viewer.id, ...input.attachmentIds).all<{ id: string }>();
    if (result.results.length !== input.attachmentIds.length) {
      throw new HttpError(400, "INVALID_ATTACHMENTS", "附件不存在、未上传完成或已被使用");
    }
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare("INSERT INTO memos (id, creator_id, content, visibility, state, pinned, version, created_at, updated_at) VALUES (?, ?, ?, ?, 'ACTIVE', 0, 1, ?, ?)")
      .bind(id, viewer.id, input.content, input.visibility, now, now),
  ];
  for (const tag of extractTags(input.content)) {
    statements.push(c.env.DB.prepare("INSERT INTO memo_tags (memo_id, normalized, display) VALUES (?, ?, ?)").bind(id, tag.normalized, tag.display));
  }
  for (const attachmentId of input.attachmentIds) {
    statements.push(c.env.DB.prepare("UPDATE attachments SET memo_id = ?, updated_at = ? WHERE id = ? AND creator_id = ? AND memo_id IS NULL AND status = 'READY'")
      .bind(id, now, attachmentId, viewer.id));
  }
  await c.env.DB.batch(statements);
  return c.json(await getOwnedMemo(c.env, id, viewer.id), 201);
});

memoRoutes.get("/memos/:id", async (c) => {
  const viewer = await optionalViewer(c);
  return c.json(await getMemoById(c.env, c.req.param("id"), viewer?.status === "ACTIVE" ? viewer.id : null));
});

memoRoutes.patch("/memos/:id", requireWrite, validateJson(updateMemoSchema), async (c) => {
  const viewer = c.get("viewer");
  const input = c.req.valid("json");
  const assignments: string[] = [];
  const values: Array<string | number> = [];
  if (input.content !== undefined) { assignments.push("content = ?"); values.push(input.content); }
  if (input.visibility !== undefined) { assignments.push("visibility = ?"); values.push(input.visibility); }
  if (input.state !== undefined) { assignments.push("state = ?"); values.push(input.state); }
  if (input.pinned !== undefined) { assignments.push("pinned = ?"); values.push(input.pinned ? 1 : 0); }
  assignments.push("updated_at = ?", "version = version + 1");
  values.push(Date.now(), c.req.param("id"), viewer.id, input.version);
  const result = await c.env.DB.prepare(
    `UPDATE memos SET ${assignments.join(", ")} WHERE id = ? AND creator_id = ? AND version = ?`,
  ).bind(...values).run();
  // D1 includes rows changed by FTS triggers in meta.changes, so a successful
  // memo update can report more than one changed row. Only zero means the
  // optimistic version predicate did not match.
  if (result.meta.changes === 0) {
    const exists = await c.env.DB.prepare("SELECT version FROM memos WHERE id = ? AND creator_id = ?")
      .bind(c.req.param("id"), viewer.id).first<{ version: number }>();
    if (exists) throw new HttpError(409, "VERSION_CONFLICT", "Memo 已在其他位置更新", { currentVersion: exists.version });
    throw new HttpError(404, "MEMO_NOT_FOUND", "Memo 不存在");
  }
  if (input.content !== undefined) {
    const tagStatements: D1PreparedStatement[] = [
      c.env.DB.prepare("DELETE FROM memo_tags WHERE memo_id = ?").bind(c.req.param("id")),
      ...extractTags(input.content).map((tag) => c.env.DB.prepare("INSERT INTO memo_tags (memo_id, normalized, display) VALUES (?, ?, ?)")
        .bind(c.req.param("id"), tag.normalized, tag.display)),
    ];
    await c.env.DB.batch(tagStatements);
  }
  return c.json(await getOwnedMemo(c.env, c.req.param("id"), viewer.id));
});

memoRoutes.delete("/memos/:id", requireWrite, async (c) => {
  const viewer = c.get("viewer");
  const memoId = c.req.param("id");
  const attachmentResult = await c.env.DB.prepare(
    "SELECT id, object_key AS objectKey FROM attachments WHERE memo_id = ? AND creator_id = ?",
  ).bind(memoId, viewer.id).all<{ id: string; objectKey: string }>();
  const results = await c.env.DB.batch([
    c.env.DB.prepare("UPDATE attachments SET status = 'DELETING', updated_at = ? WHERE memo_id = ? AND creator_id = ?")
      .bind(Date.now(), memoId, viewer.id),
    c.env.DB.prepare("DELETE FROM memos WHERE id = ? AND creator_id = ?").bind(memoId, viewer.id),
  ]);
  // FTS and foreign-key work can be included in D1's change count.
  if (results[1].meta.changes === 0) throw new HttpError(404, "MEMO_NOT_FOUND", "Memo 不存在");

  if (attachmentResult.results.length > 0) {
    c.executionCtx.waitUntil((async () => {
      try {
        await c.env.ATTACHMENTS.delete(attachmentResult.results.map((item) => item.objectKey));
        const placeholders = attachmentResult.results.map(() => "?").join(",");
        await c.env.DB.prepare(`DELETE FROM attachments WHERE id IN (${placeholders})`).bind(...attachmentResult.results.map((item) => item.id)).run();
      } catch (error) {
        console.error(JSON.stringify({ message: "attachment cleanup failed", memoId, error: error instanceof Error ? error.message : String(error) }));
      }
    })());
  }
  return c.body(null, 204);
});
