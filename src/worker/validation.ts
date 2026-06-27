import { zValidator } from "@hono/zod-validator";
import type { Context } from "hono";
import type { ZodType } from "zod";

function validationHook(result: { success: boolean; error?: unknown }, c: Context) {
  if (!result.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "请求参数无效", details: result.error } }, 400);
  }
}

export function validateJson<T extends ZodType>(schema: T) {
  return zValidator("json", schema, validationHook);
}

export function validateQuery<T extends ZodType>(schema: T) {
  return zValidator("query", schema, validationHook);
}
