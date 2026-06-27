export interface TimelineCursor {
  pinned: boolean;
  createdAt: number;
  id: string;
}

export function encodeCursor(cursor: TimelineCursor): string {
  return btoa(JSON.stringify(cursor)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function decodeCursor(value: string | undefined): TimelineCursor | null {
  if (!value) return null;
  try {
    const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const parsed: unknown = JSON.parse(atob(base64));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "pinned" in parsed &&
      "createdAt" in parsed &&
      "id" in parsed &&
      typeof parsed.pinned === "boolean" &&
      typeof parsed.createdAt === "number" &&
      Number.isSafeInteger(parsed.createdAt) &&
      typeof parsed.id === "string"
    ) {
      return { pinned: parsed.pinned, createdAt: parsed.createdAt, id: parsed.id };
    }
  } catch {
    // Invalid cursors are handled as a client error by the caller.
  }
  return null;
}
