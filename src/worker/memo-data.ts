import type { Attachment, Memo, MemoVisibility } from "../shared/types";
import type { AppBindings } from "./bindings";
import { HttpError } from "./http";

export interface MemoRow {
  id: string;
  content: string;
  visibility: MemoVisibility;
  state: "ACTIVE" | "ARCHIVED";
  pinned: number;
  version: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorImage: string | null;
}

interface TagRow {
  memoId: string;
  display: string;
}

interface AttachmentRow {
  id: string;
  memoId: string;
  filename: string;
  contentType: string;
  size: number;
  status: "PENDING" | "READY";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function hydrateMemos(env: AppBindings, rows: MemoRow[]): Promise<Memo[]> {
  if (rows.length === 0) return [];
  const placeholders = rows.map(() => "?").join(",");
  const ids = rows.map((row) => row.id);
  const [tagResult, attachmentResult] = await env.DB.batch([
    env.DB.prepare(`SELECT memo_id AS memoId, display FROM memo_tags WHERE memo_id IN (${placeholders}) ORDER BY display`).bind(...ids),
    env.DB.prepare(`SELECT id, memo_id AS memoId, filename, content_type AS contentType, size, status FROM attachments WHERE memo_id IN (${placeholders}) AND status = 'READY' ORDER BY created_at`).bind(...ids),
  ]);
  const tagRows: TagRow[] = [];
  for (const row of tagResult.results) {
    if (isRecord(row) && typeof row.memoId === "string" && typeof row.display === "string") tagRows.push({ memoId: row.memoId, display: row.display });
  }
  const attachmentRows: AttachmentRow[] = [];
  for (const row of attachmentResult.results) {
    if (
      isRecord(row) &&
      typeof row.id === "string" &&
      typeof row.memoId === "string" &&
      typeof row.filename === "string" &&
      typeof row.contentType === "string" &&
      typeof row.size === "number" &&
      (row.status === "PENDING" || row.status === "READY")
    ) attachmentRows.push({ id: row.id, memoId: row.memoId, filename: row.filename, contentType: row.contentType, size: row.size, status: row.status });
  }
  const tags = tagRows.reduce<Map<string, string[]>>((map, row) => {
    const values = map.get(row.memoId) ?? [];
    values.push(row.display);
    map.set(row.memoId, values);
    return map;
  }, new Map());
  const attachments = attachmentRows.reduce<Map<string, Attachment[]>>((map, row) => {
    const values = map.get(row.memoId) ?? [];
    values.push({
      id: row.id,
      filename: row.filename,
      contentType: row.contentType,
      size: row.size,
      status: row.status,
      url: `/api/v1/attachments/${row.id}/content`,
    });
    map.set(row.memoId, values);
    return map;
  }, new Map());

  return rows.map((row) => ({
    id: row.id,
    content: row.content,
    visibility: row.visibility,
    state: row.state,
    pinned: Boolean(row.pinned),
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    author: { id: row.authorId, name: row.authorName, username: row.authorUsername, image: row.authorImage },
    tags: tags.get(row.id) ?? [],
    attachments: attachments.get(row.id) ?? [],
  }));
}

const memoSelect = `
  SELECT m.id, m.content, m.visibility, m.state, m.pinned, m.version,
         m.created_at AS createdAt, m.updated_at AS updatedAt, m.deleted_at AS deletedAt,
         u.id AS authorId, u.name AS authorName, u.username AS authorUsername, u.image AS authorImage
  FROM memos m
  JOIN users u ON u.id = m.creator_id`;

export async function getMemoById(env: AppBindings, id: string, viewerId: string | null): Promise<Memo> {
  const access = viewerId
    ? "(m.creator_id = ? OR (m.state = 'ACTIVE' AND m.visibility IN ('MEMBERS', 'PUBLIC')))"
    : "(m.state = 'ACTIVE' AND m.visibility = 'PUBLIC')";
  const statement = env.DB.prepare(`${memoSelect} WHERE m.id = ? AND m.deleted_at IS NULL AND ${access}`);
  const row = viewerId
    ? await statement.bind(id, viewerId).first<MemoRow>()
    : await statement.bind(id).first<MemoRow>();
  if (!row) throw new HttpError(404, "MEMO_NOT_FOUND", "Memo 不存在或无权访问");
  return (await hydrateMemos(env, [row]))[0];
}

export async function getOwnedMemo(env: AppBindings, id: string, creatorId: string, includeDeleted = false): Promise<Memo> {
  const row = await env.DB.prepare(`${memoSelect} WHERE m.id = ? AND m.creator_id = ?${includeDeleted ? "" : " AND m.deleted_at IS NULL"}`).bind(id, creatorId).first<MemoRow>();
  if (!row) throw new HttpError(404, "MEMO_NOT_FOUND", "Memo 不存在");
  return (await hydrateMemos(env, [row]))[0];
}

export { memoSelect };
