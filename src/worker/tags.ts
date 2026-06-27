export interface ParsedTag {
  normalized: string;
  display: string;
}

export function normalizeTag(tag: string): string {
  return tag.normalize("NFKC").toLocaleLowerCase();
}

export function extractTags(markdown: string): ParsedTag[] {
  const withoutCode = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]+`/g, " ")
    .replace(/https?:\/\/\S+/gi, " ");
  const tags = new Map<string, string>();
  const pattern = /(^|[\s([{>])#([\p{L}\p{N}_][\p{L}\p{N}_\-/]{0,79})/gu;
  for (const match of withoutCode.matchAll(pattern)) {
    const display = match[2];
    if (!display) continue;
    const normalized = normalizeTag(display);
    if (!tags.has(normalized)) tags.set(normalized, display);
  }
  return Array.from(tags, ([normalized, display]) => ({ normalized, display }));
}
