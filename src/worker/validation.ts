import { zValidator } from "@hono/zod-validator";
import type { Context } from "hono";
import { ZodError, type ZodType } from "zod";

function validationHook(result: { success: boolean; error?: unknown }, c: Context) {
  if (!result.success) {
    const message = result.error instanceof ZodError ? result.error.issues[0]?.message : undefined;
    return c.json({ error: { code: "VALIDATION_ERROR", message: message ?? "请求参数无效", details: result.error } }, 400);
  }
}

export function validateJson<T extends ZodType>(schema: T) {
  return zValidator("json", schema, validationHook);
}

export function validateQuery<T extends ZodType>(schema: T) {
  return zValidator("query", schema, validationHook);
}
