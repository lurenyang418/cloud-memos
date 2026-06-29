import type { BlobWriter, Entry, TextWriter } from "@zip.js/zip.js";
import { z } from "zod";
import type { Memo, MemoState, MemoVisibility } from "../shared/types";
import { api } from "./api";

const safePath = z.string().min(1).refine((path) => (
  !path.startsWith("/") && !path.includes("\\") && !path.split("/").includes("..") && !path.split("/").includes("")
), "ZIP 路径不安全");
const timestamp = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, "时间必须是 UTC ISO 8601 格式").refine(
  (value) => Number.isSafeInteger(Date.parse(value)) && Date.parse(value) >= 0,
  "时间格式无效",
);
const filename = z.string().trim().min(1).max(255).refine(
  (value) => Array.from(value).every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127),
  "附件文件名无效",
);
const contentType = z.string().trim().min(1).max(255).regex(/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i, "附件 MIME 类型无效");

const manifestSchema = z.object({
  formatVersion: z.literal(1),
  exportId: z.string().uuid(),
  exportedAt: timestamp,
  owner: z.object({ id: z.string(), name: z.string(), username: z.string(), email: z.string() }).strict(),
  memos: z.array(z.object({
    id: z.string().uuid(),
    markdownPath: safePath,
    visibility: z.enum(["PRIVATE", "MEMBERS", "PUBLIC"]),
    state: z.enum(["ACTIVE", "ARCHIVED"]),
    pinned: z.boolean(),
    version: z.number().int().positive(),
    createdAt: timestamp,
    updatedAt: timestamp,
    tags: z.array(z.string()),
    attachments: z.array(z.object({
      id: z.string().uuid(), path: safePath, filename, contentType, size: z.number().int().positive().max(25 * 1024 * 1024),
    }).strict()).max(20),
  }).strict()).max(100_000),
}).strict();

export type ImportProgress = (message: string) => void;
export type ImportManifest = z.infer<typeof manifestSchema>;

function fail(message: string): never {
  throw new Error(message);
}

function fileEntries(entries: Entry[]): Map<string, Extract<Entry, { directory: false }>> {
  const result = new Map<string, Extract<Entry, { directory: false }>>();
  for (const entry of entries) {
    if (entry.filename.startsWith("/") || entry.filename.includes("\\") || entry.filename.split("/").includes("..")) fail(`ZIP 包含不安全路径：${entry.filename}`);
    if (entry.directory) continue;
    if (result.has(entry.filename)) fail(`ZIP 包含重复文件：${entry.filename}`);
    result.set(entry.filename, entry);
  }
  return result;
}

export function validateImportFileIndex(manifest: ImportManifest, entries: Array<{ path: string; size: number }>): void {
  const files = new Map<string, number>();
  for (const entry of entries) {
    if (entry.path.startsWith("/") || entry.path.includes("\\") || entry.path.split("/").includes("..")) fail(`ZIP 包含不安全路径：${entry.path}`);
    if (files.has(entry.path)) fail(`ZIP 包含重复文件：${entry.path}`);
    files.set(entry.path, entry.size);
  }
  const declared = new Set(["manifest.json", "README.txt"]);
  const sourceKeys = new Set<string>();
  for (const memo of manifest.memos) {
    const sourceKey = `${manifest.exportId}:${memo.id}`;
    if (sourceKeys.has(sourceKey)) fail(`清单包含重复 Memo：${memo.id}`);
    sourceKeys.add(sourceKey);
    if (declared.has(memo.markdownPath)) fail(`清单包含重复路径：${memo.markdownPath}`);
    declared.add(memo.markdownPath);
    const createdAt = Date.parse(memo.createdAt);
    const updatedAt = Date.parse(memo.updatedAt);
    if (updatedAt < createdAt) fail(`Memo ${memo.id} 的更新时间早于创建时间`);
    for (const attachment of memo.attachments) {
      if (declared.has(attachment.path)) fail(`清单包含重复路径：${attachment.path}`);
      declared.add(attachment.path);
      const size = files.get(attachment.path);
      if (size !== undefined && size !== attachment.size) fail(`附件大小与清单不一致：${attachment.filename}`);
    }
  }
  for (const path of declared) {
    if (path === "README.txt") continue;
    if (!files.has(path)) fail(`ZIP 缺少清单声明的文件：${path}`);
  }
  for (const path of files.keys()) {
    if (!declared.has(path)) fail(`ZIP 包含清单未声明的文件：${path}`);
  }
}

export function parseImportManifest(value: unknown): ImportManifest {
  const result = manifestSchema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    if (issue?.path[0] === "exportId") fail("此 ZIP 缺少有效 exportId；旧版 formatVersion 1 导出包不受支持，请重新导出");
    fail(`导出清单无效：${issue?.message ?? "未知错误"}`);
  }
  return result.data;
}

async function readManifest(files: Map<string, Extract<Entry, { directory: false }>>, TextWriterClass: typeof TextWriter): Promise<ImportManifest> {
  const entry = files.get("manifest.json") ?? fail("ZIP 缺少 manifest.json");
  if (entry.uncompressedSize > 2 * 1024 * 1024) fail("manifest.json 过大");
  let parsed: unknown;
  try { parsed = JSON.parse(await entry.getData(new TextWriterClass())); }
  catch { fail("manifest.json 不是有效的 JSON"); }
  return parseImportManifest(parsed);
}

interface PendingUpload { id: string; uploadUrl: string }

async function uploadAttachment(entry: Extract<Entry, { directory: false }>, item: ImportManifest["memos"][number]["attachments"][number], BlobWriterClass: typeof BlobWriter): Promise<string> {
  const blob = await entry.getData(new BlobWriterClass(item.contentType));
  if (blob.size !== item.size) fail(`附件读取不完整：${item.filename}`);
  const pending = await api<PendingUpload>("/api/v1/attachments", {
    method: "POST",
    body: JSON.stringify({ filename: item.filename, contentType: item.contentType, size: item.size }),
  });
  await api(pending.uploadUrl, { method: "PUT", headers: { "content-type": item.contentType }, body: blob });
  return pending.id;
}

export async function importMemosZip(file: File, onProgress: ImportProgress): Promise<{ imported: number; skipped: number }> {
  onProgress("正在检查 ZIP…");
  const { BlobReader, BlobWriter, TextWriter, ZipReader } = await import("@zip.js/zip.js");
  const reader = new ZipReader(new BlobReader(file));
  try {
    const files = fileEntries(await reader.getEntries());
    const manifest = await readManifest(files, TextWriter);
    validateImportFileIndex(manifest, [...files].map(([path, entry]) => ({ path, size: entry.uncompressedSize })));
    onProgress(`清单校验完成，共 ${manifest.memos.length} 条 Memo`);
    const sourceKeys = manifest.memos.map((memo) => `${manifest.exportId}:${memo.id}`);
    const existing = new Set<string>();
    for (let index = 0; index < sourceKeys.length; index += 100) {
      const batch = sourceKeys.slice(index, index + 100);
      if (batch.length === 0) continue;
      const checked = await api<{ items: Array<{ sourceKey: string; memoId: string }> }>("/api/v1/import/check", {
        method: "POST", body: JSON.stringify({ sourceKeys: batch }),
      });
      checked.items.forEach((item) => existing.add(item.sourceKey));
    }

    let imported = 0;
    let skipped = 0;
    for (const [index, memo] of manifest.memos.entries()) {
      const sourceKey = `${manifest.exportId}:${memo.id}`;
      if (existing.has(sourceKey)) {
        skipped += 1;
        onProgress(`已处理 ${index + 1}/${manifest.memos.length}，跳过已导入内容`);
        continue;
      }
      const markdownEntry = files.get(memo.markdownPath) ?? fail(`ZIP 缺少 ${memo.markdownPath}`);
      if (markdownEntry.uncompressedSize > 400_000) fail(`Memo 文件过大：${memo.markdownPath}`);
      const content = await markdownEntry.getData(new TextWriter());
      if (content.length < 1 || content.length > 100_000) fail(`Memo 内容长度无效：${memo.markdownPath}`);
      const attachmentIds: string[] = [];
      for (const attachment of memo.attachments) {
        onProgress(`正在上传附件 ${attachment.filename}（Memo ${index + 1}/${manifest.memos.length}）`);
        const entry = files.get(attachment.path) ?? fail(`ZIP 缺少 ${attachment.path}`);
        attachmentIds.push(await uploadAttachment(entry, attachment, BlobWriter));
      }
      const result = await api<{ imported: boolean; memo: Memo }>("/api/v1/import/memos", {
        method: "POST",
        body: JSON.stringify({
          sourceKey, content, visibility: memo.visibility as MemoVisibility, state: memo.state as MemoState,
          pinned: memo.pinned, version: memo.version, createdAt: Date.parse(memo.createdAt), updatedAt: Date.parse(memo.updatedAt), attachmentIds,
        }),
      });
      if (result.imported) imported += 1;
      else skipped += 1;
      onProgress(`已处理 ${index + 1}/${manifest.memos.length}`);
    }
    return { imported, skipped };
  } finally {
    await reader.close();
  }
}
