import { Hono } from "hono";
import { createAttachmentSchema } from "../../shared/schemas";
import type { AppEnv } from "../bindings";
import { HttpError } from "../http";
import { optionalViewer, requireWrite } from "../middleware";
import { validateJson } from "../validation";

interface AttachmentAccessRow {
  id: string;
  creatorId: string;
  memoId: string | null;
  objectKey: string;
  filename: string;
  contentType: string;
  size: number;
  status: "PENDING" | "READY" | "DELETING";
  memoCreatorId: string | null;
  memoVisibility: "PRIVATE" | "MEMBERS" | "PUBLIC" | null;
  memoState: "ACTIVE" | "ARCHIVED" | null;
}

async function attachmentRow(c: Parameters<typeof optionalViewer>[0], id: string): Promise<AttachmentAccessRow | null> {
  return c.env.DB.prepare(`
    SELECT a.id, a.creator_id AS creatorId, a.memo_id AS memoId, a.object_key AS objectKey,
           a.filename, a.content_type AS contentType, a.size, a.status,
           m.creator_id AS memoCreatorId, m.visibility AS memoVisibility, m.state AS memoState
    FROM attachments a LEFT JOIN memos m ON m.id = a.memo_id WHERE a.id = ?
  `).bind(id).first<AttachmentAccessRow>();
}

function canReadAttachment(row: AttachmentAccessRow, viewerId: string | null): boolean {
  if (row.status !== "READY") return false;
  if (!row.memoId) return row.creatorId === viewerId;
  if (row.memoCreatorId === viewerId) return true;
  if (row.memoState !== "ACTIVE") return false;
  if (row.memoVisibility === "PUBLIC") return true;
  return row.memoVisibility === "MEMBERS" && viewerId !== null;
}

export const attachmentRoutes = new Hono<AppEnv>();

attachmentRoutes.post("/attachments", requireWrite, validateJson(createAttachmentSchema), async (c) => {
  const input = c.req.valid("json");
  const maxBytes = Number(c.env.ATTACHMENT_MAX_BYTES);
  if (input.size > maxBytes) throw new HttpError(413, "ATTACHMENT_TOO_LARGE", `附件不能超过 ${Math.floor(maxBytes / 1024 / 1024)} MiB`);
  const id = crypto.randomUUID();
  const objectKey = `${c.get("viewer").id}/${id}`;
  const now = Date.now();
  await c.env.DB.prepare(`
    INSERT INTO attachments (id, creator_id, object_key, filename, content_type, size, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
  `).bind(id, c.get("viewer").id, objectKey, input.filename, input.contentType, input.size, now, now).run();
  return c.json({ id, filename: input.filename, contentType: input.contentType, size: input.size, status: "PENDING", uploadUrl: `/api/v1/attachments/${id}/content` }, 201);
});

attachmentRoutes.put("/attachments/:id/content", requireWrite, async (c) => {
  const attachmentId = c.req.param("id");
  if (!attachmentId) throw new HttpError(400, "INVALID_ATTACHMENT_ID", "附件 ID 无效");
  const row = await attachmentRow(c, attachmentId);
  if (!row || row.creatorId !== c.get("viewer").id) throw new HttpError(404, "ATTACHMENT_NOT_FOUND", "附件不存在");
  if (row.status !== "PENDING") throw new HttpError(409, "ATTACHMENT_NOT_PENDING", "附件已经上传或正在删除");
  const contentLength = Number(c.req.header("content-length"));
  if (!Number.isSafeInteger(contentLength) || contentLength !== row.size) throw new HttpError(400, "INVALID_CONTENT_LENGTH", "上传大小与声明不一致");
  if (!c.req.raw.body) throw new HttpError(400, "EMPTY_UPLOAD", "上传内容为空");
  const object = await c.env.ATTACHMENTS.put(row.objectKey, c.req.raw.body, {
    httpMetadata: { contentType: row.contentType, contentDisposition: `attachment; filename="${row.filename.replace(/["\r\n]/g, "")}"` },
    customMetadata: { creatorId: row.creatorId, attachmentId: row.id },
  });
  if (!object || object.size !== row.size) {
    await c.env.ATTACHMENTS.delete(row.objectKey);
    throw new HttpError(400, "UPLOAD_SIZE_MISMATCH", "上传内容不完整");
  }
  await c.env.DB.prepare("UPDATE attachments SET status = 'READY', etag = ?, updated_at = ? WHERE id = ? AND status = 'PENDING'")
    .bind(object.etag, Date.now(), row.id).run();
  return c.json({ id: row.id, status: "READY" });
});

attachmentRoutes.get("/attachments/:id/content", async (c) => {
  const attachmentId = c.req.param("id");
  if (!attachmentId) throw new HttpError(400, "INVALID_ATTACHMENT_ID", "附件 ID 无效");
  const [row, viewer] = await Promise.all([attachmentRow(c, attachmentId), optionalViewer(c)]);
  if (!row || !canReadAttachment(row, viewer?.status === "ACTIVE" ? viewer.id : null)) throw new HttpError(404, "ATTACHMENT_NOT_FOUND", "附件不存在或无权访问");
  const object = await c.env.ATTACHMENTS.get(row.objectKey, { onlyIf: c.req.raw.headers });
  if (!object) throw new HttpError(404, "ATTACHMENT_NOT_FOUND", "附件内容不存在");
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, no-store");
  headers.set("x-content-type-options", "nosniff");
  const safeInline = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]);
  headers.set("content-disposition", `${safeInline.has(row.contentType) ? "inline" : "attachment"}; filename="${row.filename.replace(/["\r\n]/g, "")}"`);
  if (!("body" in object)) return new Response(null, { status: 304, headers });
  return new Response(object.body, { headers });
});

attachmentRoutes.delete("/attachments/:id", requireWrite, async (c) => {
  const attachmentId = c.req.param("id");
  if (!attachmentId) throw new HttpError(400, "INVALID_ATTACHMENT_ID", "附件 ID 无效");
  const row = await attachmentRow(c, attachmentId);
  if (!row || row.creatorId !== c.get("viewer").id) throw new HttpError(404, "ATTACHMENT_NOT_FOUND", "附件不存在");
  await c.env.DB.prepare("UPDATE attachments SET status = 'DELETING', memo_id = NULL, updated_at = ? WHERE id = ?").bind(Date.now(), row.id).run();
  c.executionCtx.waitUntil((async () => {
    try {
      await c.env.ATTACHMENTS.delete(row.objectKey);
      await c.env.DB.prepare("DELETE FROM attachments WHERE id = ? AND status = 'DELETING'").bind(row.id).run();
    } catch (error) {
      console.error(JSON.stringify({ message: "attachment delete failed", attachmentId: row.id, error: error instanceof Error ? error.message : String(error) }));
    }
  })());
  return c.body(null, 204);
});
