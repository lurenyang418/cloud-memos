import { describe, expect, it } from "vitest";
import type { Memo } from "../src/shared/types";
import { memoMarkdownPath, safeExportName } from "../src/web/export";
import { parseImportManifest, validateImportFileIndex } from "../src/web/import";

const memo: Memo = {
  id: "11111111-1111-4111-8111-111111111111",
  content: "# 原始 Markdown",
  visibility: "PRIVATE",
  state: "ACTIVE",
  pinned: false,
  version: 1,
  createdAt: Date.UTC(2026, 5, 28, 1, 2, 3),
  updatedAt: Date.UTC(2026, 5, 28, 1, 2, 3),
  author: { id: "user", name: "User", username: "user", image: null },
  tags: [],
  attachments: [],
};

describe("memo export paths", () => {
  it("uses a stable date and id for Markdown files", () => {
    expect(memoMarkdownPath(memo)).toBe("memos/2026-06-28-11111111-1111-4111-8111-111111111111.md");
  });

  it("prevents attachment names from escaping the ZIP directory", () => {
    expect(safeExportName("../../private\\note.txt")).toBe("_.._private_note.txt");
    expect(safeExportName("..." )).toBe("attachment");
  });
});

describe("formatVersion 1 import manifest", () => {
  const current = {
    formatVersion: 1,
    exportId: "33333333-3333-4333-8333-333333333333",
    exportedAt: "2026-06-28T01:02:03.000Z",
    owner: { id: "owner", name: "Owner", username: "owner", email: "owner@example.com" },
    memos: [{
      id: memo.id,
      markdownPath: memoMarkdownPath(memo),
      visibility: "PRIVATE",
      state: "ACTIVE",
      pinned: false,
      version: 1,
      createdAt: "2026-06-28T01:02:03.000Z",
      updatedAt: "2026-06-28T01:02:03.000Z",
      tags: [],
      attachments: [],
    }],
  };

  it("accepts the current v1 shape with exportId", () => {
    expect(parseImportManifest(current).exportId).toBe(current.exportId);
  });

  it("rejects old v1 exports without exportId", () => {
    const oldV1: Partial<typeof current> = { ...current };
    delete oldV1.exportId;
    expect(() => parseImportManifest(oldV1)).toThrow("旧版 formatVersion 1 导出包不受支持");
  });

  it("rejects unsafe archive paths in the manifest", () => {
    expect(() => parseImportManifest({ ...current, memos: [{ ...current.memos[0], markdownPath: "../escape.md" }] })).toThrow("ZIP 路径不安全");
  });

  it("rejects missing, undeclared, duplicate and size-mismatched files", () => {
    const manifest = parseImportManifest({
      ...current,
      memos: [{ ...current.memos[0], attachments: [{ id: "44444444-4444-4444-8444-444444444444", path: "attachments/a/file.txt", filename: "file.txt", contentType: "text/plain", size: 4 }] }],
    });
    const markdown = { path: current.memos[0].markdownPath, size: 10 };
    const attachment = { path: "attachments/a/file.txt", size: 4 };
    expect(() => validateImportFileIndex(manifest, [{ path: "manifest.json", size: 100 }, markdown])).toThrow("ZIP 缺少清单声明的文件");
    expect(() => validateImportFileIndex(manifest, [{ path: "manifest.json", size: 100 }, markdown, attachment, { path: "extra.txt", size: 1 }])).toThrow("清单未声明");
    expect(() => validateImportFileIndex(manifest, [{ path: "manifest.json", size: 100 }, markdown, attachment, attachment])).toThrow("重复文件");
    expect(() => validateImportFileIndex(manifest, [{ path: "manifest.json", size: 100 }, markdown, { ...attachment, size: 3 }])).toThrow("附件大小与清单不一致");
  });
});
