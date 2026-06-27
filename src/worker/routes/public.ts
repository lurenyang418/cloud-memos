import { Hono } from "hono";
import { listMemosSchema } from "../../shared/schemas";
import type { CursorPage, Memo } from "../../shared/types";
import type { AppEnv } from "../bindings";
import { decodeCursor, encodeCursor } from "../cursor";
import { HttpError } from "../http";
import { hydrateMemos, memoSelect, type MemoRow } from "../memo-data";
import { optionalViewer } from "../middleware";
import { normalizeTag } from "../tags";
import { validateQuery } from "../validation";

export const publicRoutes = new Hono<AppEnv>();

function buildFtsQuery(query: string): string {
  return query
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `"${word.replaceAll('"', '""')}"*`)
    .join(" AND ");
}

publicRoutes.get("/memos", validateQuery(listMemosSchema), async (c) => {
  const input = c.req.valid("query");
  const cursor = decodeCursor(input.cursor);
  if (input.cursor && !cursor) throw new HttpError(400, "INVALID_CURSOR", "分页游标无效");
  if (input.visibility && input.visibility !== "PUBLIC") throw new HttpError(400, "INVALID_VISIBILITY", "公开动态只支持公开内容");

  const conditions = ["m.state = 'ACTIVE'", "m.visibility = 'PUBLIC'", "u.status = 'ACTIVE'"];
  const values: Array<string | number> = [];
  if (input.tag) {
    conditions.push("EXISTS (SELECT 1 FROM memo_tags mt WHERE mt.memo_id = m.id AND mt.normalized = ?)");
    values.push(normalizeTag(input.tag));
  }
  if (input.q) {
    conditions.push("(m.rowid IN (SELECT rowid FROM memos_fts WHERE memos_fts MATCH ?) OR instr(lower(m.content), lower(?)) > 0)");
    values.push(buildFtsQuery(input.q), input.q);
  }
  if (cursor) {
    conditions.push("(m.created_at < ? OR (m.created_at = ? AND m.id < ?))");
    values.push(cursor.createdAt, cursor.createdAt, cursor.id);
  }
  values.push(input.limit + 1);
  const result = await c.env.DB.prepare(`${memoSelect} WHERE ${conditions.join(" AND ")} ORDER BY m.created_at DESC, m.id DESC LIMIT ?`)
    .bind(...values)
    .all<MemoRow>();
  const pageRows = result.results.slice(0, input.limit);
  const last = pageRows.at(-1);
  const response: CursorPage<Memo> = {
    items: await hydrateMemos(c.env, pageRows),
    nextCursor: result.results.length > input.limit && last ? encodeCursor({ pinned: false, createdAt: last.createdAt, id: last.id }) : null,
  };
  return c.json(response);
});

publicRoutes.get("/users/:username/memos", validateQuery(listMemosSchema), async (c) => {
  const viewer = await optionalViewer(c);
  const isMember = viewer?.status === "ACTIVE";
  const input = c.req.valid("query");
  const cursor = decodeCursor(input.cursor);
  if (input.cursor && !cursor) throw new HttpError(400, "INVALID_CURSOR", "分页游标无效");
  const profile = await c.env.DB.prepare("SELECT id, name, username, image FROM users WHERE username = ? AND status = 'ACTIVE'")
    .bind(c.req.param("username")).first<{ id: string; name: string; username: string; image: string | null }>();
  if (!profile) throw new HttpError(404, "USER_NOT_FOUND", "用户不存在");

  const conditions = ["m.creator_id = ?", "m.state = 'ACTIVE'", isMember ? "m.visibility IN ('MEMBERS', 'PUBLIC')" : "m.visibility = 'PUBLIC'"];
  const values: Array<string | number> = [profile.id];
  if (input.visibility && (input.visibility === "PUBLIC" || isMember)) {
    conditions.push("m.visibility = ?");
    values.push(input.visibility);
  }
  if (input.tag) {
    conditions.push("EXISTS (SELECT 1 FROM memo_tags mt WHERE mt.memo_id = m.id AND mt.normalized = ?)");
    values.push(normalizeTag(input.tag));
  }
  if (input.q) {
    conditions.push("instr(lower(m.content), lower(?)) > 0");
    values.push(input.q);
  }
  if (cursor) {
    const pinned = cursor.pinned ? 1 : 0;
    conditions.push("(m.pinned < ? OR (m.pinned = ? AND (m.created_at < ? OR (m.created_at = ? AND m.id < ?))))");
    values.push(pinned, pinned, cursor.createdAt, cursor.createdAt, cursor.id);
  }
  values.push(input.limit + 1);
  const result = await c.env.DB.prepare(`${memoSelect} WHERE ${conditions.join(" AND ")} ORDER BY m.pinned DESC, m.created_at DESC, m.id DESC LIMIT ?`)
    .bind(...values).all<MemoRow>();
  const pageRows = result.results.slice(0, input.limit);
  const last = pageRows.at(-1);
  const response: CursorPage<Memo> & { profile: typeof profile } = {
    profile,
    items: await hydrateMemos(c.env, pageRows),
    nextCursor: result.results.length > input.limit && last ? encodeCursor({ pinned: Boolean(last.pinned), createdAt: last.createdAt, id: last.id }) : null,
  };
  return c.json(response);
});
