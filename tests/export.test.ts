import { describe, expect, it } from "vitest";
import type { Memo } from "../src/shared/types";
import { memoMarkdownPath, safeExportName } from "../src/web/export";

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
