import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor } from "../src/worker/cursor";
import { hashPassword, hashToken, verifyPassword } from "../src/worker/crypto";
import { extractTags, normalizeTag } from "../src/worker/tags";

describe("domain helpers", () => {
  it("extracts and normalizes multilingual tags while ignoring code and URLs", () => {
    expect(extractTags("记录 #项目/一号 和 #Cloud_Flare `#ignored` https://x.test/#skip")).toEqual([
      { display: "项目/一号", normalized: "项目/一号" },
      { display: "Cloud_Flare", normalized: "cloud_flare" },
    ]);
    expect(normalizeTag("Ｃｌｏｕｄ")).toBe("cloud");
  });

  it("round-trips timeline cursors and rejects malformed input", () => {
    const cursor = { pinned: true, createdAt: 1_725_000_000_000, id: "memo-id" };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
    expect(decodeCursor("not-a-cursor")).toBeNull();
  });

  it("hashes passwords and tokens without storing plaintext", async () => {
    const password = "correct horse battery staple";
    const hash = await hashPassword(password);
    expect(hash).not.toContain(password);
    expect(hash).toMatch(/^scrypt-v1\$32768\$8\$3\$/);
    await expect(verifyPassword({ password, hash })).resolves.toBe(true);
    await expect(verifyPassword({ password: "wrong password", hash })).resolves.toBe(false);
    await expect(verifyPassword({ password, hash: "scrypt-v1$1$1$1$bad$bad" })).resolves.toBe(false);
    await expect(hashToken("secret")).resolves.toMatch(/^[a-f0-9]{64}$/);
  });
});
