import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const outputRoot = new URL("../dist", import.meta.url).pathname;

if (existsSync(outputRoot)) {
  for (const entry of readdirSync(outputRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const name of [".dev.vars", ".env"]) {
      const candidate = join(outputRoot, entry.name, name);
      if (existsSync(candidate)) rmSync(candidate);
    }
  }
}
