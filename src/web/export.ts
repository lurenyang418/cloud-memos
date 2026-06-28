import type { Memo, Viewer } from "../shared/types";
import { listMemos } from "./api";

const exportPageSize = 50;

export type ExportProgress = (message: string) => void;

function isoDate(value: number): string {
  return new Date(value).toISOString();
}

export function safeExportName(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .replace(/[\\/\p{Cc}]/gu, "_")
    .replace(/^\.+/, "")
    .trim();
  return normalized || "attachment";
}

export function memoMarkdownPath(memo: Memo): string {
  return `memos/${isoDate(memo.createdAt).slice(0, 10)}-${memo.id}.md`;
}

function attachmentExportPath(memo: Memo, attachment: Memo["attachments"][number]): string {
  return `attachments/${memo.id}/${attachment.id}-${safeExportName(attachment.filename)}`;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function downloadMemoMarkdown(memo: Memo): void {
  const filename = memoMarkdownPath(memo).split("/").at(-1) ?? `${memo.id}.md`;
  triggerDownload(new Blob([memo.content], { type: "text/markdown;charset=utf-8" }), filename);
}

async function collectMemos(state: "ACTIVE" | "ARCHIVED", onProgress: ExportProgress): Promise<Memo[]> {
  const items: Memo[] = [];
  let cursor: string | undefined;
  do {
    const page = await listMemos({ state, cursor, limit: exportPageSize });
    items.push(...page.items);
    cursor = page.nextCursor ?? undefined;
    onProgress(`正在读取 Memo… 已读取 ${items.length} 条${state === "ARCHIVED" ? "归档" : "活跃"}内容`);
  } while (cursor);
  return items;
}

export async function downloadAllMemos(viewer: Viewer, onProgress: ExportProgress): Promise<void> {
  onProgress("正在读取 Memo…");
  const active = await collectMemos("ACTIVE", onProgress);
  const archived = await collectMemos("ARCHIVED", onProgress);
  const memos = [...active, ...archived];
  const exportedAt = new Date();
  const attachmentCount = memos.reduce((count, memo) => count + memo.attachments.length, 0);

  const manifest = {
    formatVersion: 1,
    exportedAt: exportedAt.toISOString(),
    owner: {
      id: viewer.id,
      name: viewer.name,
      username: viewer.username,
      email: viewer.email,
    },
    memos: memos.map((memo) => ({
      id: memo.id,
      markdownPath: memoMarkdownPath(memo),
      visibility: memo.visibility,
      state: memo.state,
      pinned: memo.pinned,
      version: memo.version,
      createdAt: isoDate(memo.createdAt),
      updatedAt: isoDate(memo.updatedAt),
      tags: memo.tags,
      attachments: memo.attachments.map((attachment) => ({
        id: attachment.id,
        path: attachmentExportPath(memo, attachment),
        filename: attachment.filename,
        contentType: attachment.contentType,
        size: attachment.size,
      })),
    })),
  };

  async function* files() {
    yield {
      name: "README.txt",
      input: "Cloud Memos export\n\nMemo files contain the original Markdown source without added front matter. Metadata is stored in manifest.json.\n",
      lastModified: exportedAt,
    };
    yield {
      name: "manifest.json",
      input: JSON.stringify(manifest, null, 2),
      lastModified: exportedAt,
    };
    for (const memo of memos) {
      yield { name: memoMarkdownPath(memo), input: memo.content, lastModified: new Date(memo.updatedAt) };
      for (const attachment of memo.attachments) {
        onProgress(`正在打包附件… ${attachment.filename}`);
        const response = await fetch(attachment.url, { credentials: "same-origin" });
        if (!response.ok) throw new Error(`附件“${attachment.filename}”下载失败 (${response.status})`);
        yield {
          name: attachmentExportPath(memo, attachment),
          input: response,
          size: attachment.size,
          lastModified: new Date(memo.updatedAt),
        };
      }
    }
  }

  onProgress(`正在生成 ZIP… ${memos.length} 条 Memo，${attachmentCount} 个附件`);
  const { downloadZip } = await import("client-zip");
  const archive = await downloadZip(files(), { buffersAreUTF8: true }).blob();
  triggerDownload(archive, `cloud-memos-${viewer.username}-${exportedAt.toISOString().slice(0, 10)}.zip`);
  onProgress(`已导出 ${memos.length} 条 Memo 和 ${attachmentCount} 个附件`);
}
