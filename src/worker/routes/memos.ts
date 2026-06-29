import { Hono } from "hono";
import { createMemoSchema, listMemosSchema, restoreMemoVersionSchema, updateMemoSchema } from "../../shared/schemas";
import type { CursorPage, Memo, MemoVersion, MemoVisibility } from "../../shared/types";
import type { AppBindings, AppEnv } from "../bindings";
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

async function pruneMemoVersions(env: AppBindings, memoId: string): Promise<void> {
  await env.DB.prepare(`
    DELETE FROM memo_versions WHERE memo_id = ? AND id NOT IN (
      SELECT id FROM memo_versions WHERE memo_id = ? ORDER BY version DESC LIMIT 20
    )
  `).bind(memoId, memoId).run();
}

memoRoutes.get("/memos", requireUser, validateQuery(listMemosSchema), async (c) => {
  const viewer = c.get("viewer");
  const input = c.req.valid("query");
  const cursor = decodeCursor(input.cursor);
  if (input.cursor && !cursor) throw new HttpError(400, "INVALID_CURSOR", "分页游标无效");

  const conditions = ["m.creator_id = ?", input.deleted ? "m.deleted_at IS NOT NULL" : "m.deleted_at IS NULL"];
  const values: Array<string | number> = [viewer.id];
  if (!input.deleted) { conditions.push("m.state = ?"); values.push(input.state); }
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

  const conditions = ["m.state = 'ACTIVE'", "m.deleted_at IS NULL", "m.visibility IN ('MEMBERS', 'PUBLIC')", "u.status = 'ACTIVE'"];
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

interface OwnedMemoSnapshot {
  id: string;
  creatorId: string;
  content: string;
  visibility: MemoVisibility;
  state: "ACTIVE" | "ARCHIVED";
  pinned: number;
  version: number;
}

memoRoutes.patch("/memos/:id", requireWrite, validateJson(updateMemoSchema), async (c) => {
  const viewer = c.get("viewer");
  const input = c.req.valid("json");
  const current = await c.env.DB.prepare(`
    SELECT id, creator_id AS creatorId, content, visibility, state, pinned, version
    FROM memos WHERE id = ? AND creator_id = ? AND deleted_at IS NULL
  `).bind(c.req.param("id"), viewer.id).first<OwnedMemoSnapshot>();
  if (!current) throw new HttpError(404, "MEMO_NOT_FOUND", "Memo 不存在");
  if (current.version !== input.version) throw new HttpError(409, "VERSION_CONFLICT", "Memo 已在其他位置更新", { currentVersion: current.version });
  await c.env.DB.prepare(`
    INSERT OR IGNORE INTO memo_versions (id, memo_id, creator_id, content, visibility, state, pinned, version, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), current.id, viewer.id, current.content, current.visibility, current.state, current.pinned, current.version, Date.now()).run();
  const assignments: string[] = [];
  const values: Array<string | number> = [];
  if (input.content !== undefined) { assignments.push("content = ?"); values.push(input.content); }
  if (input.visibility !== undefined) { assignments.push("visibility = ?"); values.push(input.visibility); }
  if (input.state !== undefined) { assignments.push("state = ?"); values.push(input.state); }
  if (input.pinned !== undefined) { assignments.push("pinned = ?"); values.push(input.pinned ? 1 : 0); }
  assignments.push("updated_at = ?", "version = version + 1");
  values.push(Date.now(), c.req.param("id"), viewer.id, input.version);
  const result = await c.env.DB.prepare(
    `UPDATE memos SET ${assignments.join(", ")} WHERE id = ? AND creator_id = ? AND deleted_at IS NULL AND version = ?`,
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
    const updatedVersion = input.version + 1;
    const tagStatements: D1PreparedStatement[] = [
      c.env.DB.prepare("DELETE FROM memo_tags WHERE memo_id = ? AND EXISTS (SELECT 1 FROM memos WHERE id = ? AND version = ? AND content = ?)")
        .bind(current.id, current.id, updatedVersion, input.content),
      ...extractTags(input.content).map((tag) => c.env.DB.prepare(`
        INSERT OR IGNORE INTO memo_tags (memo_id, normalized, display)
        SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM memos WHERE id = ? AND version = ? AND content = ?)
      `).bind(current.id, tag.normalized, tag.display, current.id, updatedVersion, input.content)),
    ];
    await c.env.DB.batch(tagStatements);
  }
  await pruneMemoVersions(c.env, current.id);
  return c.json(await getOwnedMemo(c.env, c.req.param("id"), viewer.id));
});

memoRoutes.get("/memos/:id/versions", requireUser, async (c) => {
  const viewer = c.get("viewer");
  const owned = await c.env.DB.prepare("SELECT id FROM memos WHERE id = ? AND creator_id = ? AND deleted_at IS NULL")
    .bind(c.req.param("id"), viewer.id).first();
  if (!owned) throw new HttpError(404, "MEMO_NOT_FOUND", "Memo 不存在");
  const rows = await c.env.DB.prepare(`
    SELECT id, memo_id AS memoId, content, visibility, state, pinned, version, created_at AS createdAt
    FROM memo_versions WHERE memo_id = ? AND creator_id = ? ORDER BY version DESC LIMIT 20
  `).bind(c.req.param("id"), viewer.id).all<Omit<MemoVersion, "pinned"> & { pinned: number }>();
  return c.json({ items: rows.results.map((row) => ({ ...row, pinned: Boolean(row.pinned) })) });
});

memoRoutes.post("/memos/:id/versions/:targetVersion/restore", requireWrite, validateJson(restoreMemoVersionSchema), async (c) => {
  const viewer = c.get("viewer");
  const current = await c.env.DB.prepare(`
    SELECT id, creator_id AS creatorId, content, visibility, state, pinned, version
    FROM memos WHERE id = ? AND creator_id = ? AND deleted_at IS NULL
  `).bind(c.req.param("id"), viewer.id).first<OwnedMemoSnapshot>();
  if (!current) throw new HttpError(404, "MEMO_NOT_FOUND", "Memo 不存在");
  const expectedVersion = c.req.valid("json").version;
  if (current.version !== expectedVersion) throw new HttpError(409, "VERSION_CONFLICT", "Memo 已在其他位置更新", { currentVersion: current.version });
  const targetVersion = Number(c.req.param("targetVersion"));
  if (!Number.isSafeInteger(targetVersion) || targetVersion < 1) throw new HttpError(400, "INVALID_VERSION", "历史版本无效");
  const target = await c.env.DB.prepare(`
    SELECT content, visibility, state, pinned FROM memo_versions
    WHERE memo_id = ? AND creator_id = ? AND version = ?
  `).bind(current.id, viewer.id, targetVersion).first<{ content: string; visibility: MemoVisibility; state: "ACTIVE" | "ARCHIVED"; pinned: number }>();
  if (!target) throw new HttpError(404, "VERSION_NOT_FOUND", "历史版本不存在");
  const now = Date.now();
  const restoredVersion = current.version + 1;
  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare(`INSERT OR IGNORE INTO memo_versions (id, memo_id, creator_id, content, visibility, state, pinned, version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), current.id, viewer.id, current.content, current.visibility, current.state, current.pinned, current.version, now),
    c.env.DB.prepare("UPDATE memos SET content = ?, visibility = ?, state = ?, pinned = ?, version = version + 1, updated_at = ? WHERE id = ? AND creator_id = ? AND deleted_at IS NULL AND version = ?")
      .bind(target.content, target.visibility, target.state, target.pinned, now, current.id, viewer.id, current.version),
    c.env.DB.prepare("DELETE FROM memo_tags WHERE memo_id = ? AND EXISTS (SELECT 1 FROM memos WHERE id = ? AND version = ? AND content = ?)")
      .bind(current.id, current.id, restoredVersion, target.content),
    ...extractTags(target.content).map((tag) => c.env.DB.prepare(`
      INSERT OR IGNORE INTO memo_tags (memo_id, normalized, display)
      SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM memos WHERE id = ? AND version = ? AND content = ?)
    `).bind(current.id, tag.normalized, tag.display, current.id, restoredVersion, target.content)),
  ];
  const results = await c.env.DB.batch(statements);
  if (results[1].meta.changes === 0) throw new HttpError(409, "VERSION_CONFLICT", "Memo 已在其他位置更新");
  await pruneMemoVersions(c.env, current.id);
  return c.json(await getOwnedMemo(c.env, current.id, viewer.id));
});

memoRoutes.post("/memos/:id/restore", requireWrite, async (c) => {
  const memoId = c.req.param("id");
  if (!memoId) throw new HttpError(400, "INVALID_MEMO_ID", "Memo ID 无效");
  const now = Date.now();
  const result = await c.env.DB.prepare("UPDATE memos SET deleted_at = NULL, updated_at = ?, version = version + 1 WHERE id = ? AND creator_id = ? AND deleted_at >= ?")
    .bind(now, memoId, c.get("viewer").id, now - 30 * 24 * 60 * 60 * 1000).run();
  if (result.meta.changes === 0) throw new HttpError(404, "MEMO_NOT_FOUND", "回收站中没有这条 Memo");
  return c.json(await getOwnedMemo(c.env, memoId, c.get("viewer").id));
});

memoRoutes.delete("/memos/:id/permanent", requireWrite, async (c) => {
  const viewer = c.get("viewer");
  const memoId = c.req.param("id");
  const deletedMemo = await c.env.DB.prepare("SELECT id FROM memos WHERE id = ? AND creator_id = ? AND deleted_at IS NOT NULL")
    .bind(memoId, viewer.id).first();
  if (!deletedMemo) throw new HttpError(404, "MEMO_NOT_FOUND", "回收站中没有这条 Memo");
  const attachmentResult = await c.env.DB.prepare(
    "SELECT id, object_key AS objectKey FROM attachments WHERE memo_id = ? AND creator_id = ?",
  ).bind(memoId, viewer.id).all<{ id: string; objectKey: string }>();
  const results = await c.env.DB.batch([
    c.env.DB.prepare(`
      UPDATE attachments SET status = 'DELETING', updated_at = ?
      WHERE memo_id = ? AND creator_id = ?
        AND EXISTS (SELECT 1 FROM memos WHERE id = ? AND creator_id = ? AND deleted_at IS NOT NULL)
    `).bind(Date.now(), memoId, viewer.id, memoId, viewer.id),
    c.env.DB.prepare("DELETE FROM memos WHERE id = ? AND creator_id = ? AND deleted_at IS NOT NULL").bind(memoId, viewer.id),
  ]);
  // FTS and foreign-key work can be included in D1's change count.
  if (results[1].meta.changes === 0) throw new HttpError(404, "MEMO_NOT_FOUND", "回收站中没有这条 Memo");

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

memoRoutes.delete("/memos/:id", requireWrite, async (c) => {
  const result = await c.env.DB.prepare(`
    UPDATE memos SET deleted_at = ?, updated_at = ?, version = version + 1
    WHERE id = ? AND creator_id = ? AND deleted_at IS NULL
  `).bind(Date.now(), Date.now(), c.req.param("id"), c.get("viewer").id).run();
  if (result.meta.changes === 0) throw new HttpError(404, "MEMO_NOT_FOUND", "Memo 不存在");
  return c.body(null, 204);
});
