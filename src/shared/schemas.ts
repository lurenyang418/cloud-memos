import { z } from "zod";
import { memoStates, memoVisibilities } from "./types";

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "用户名至少需要 3 个字符")
  .max(10, "用户名不能超过 10 个字符")
  .regex(/^[a-z0-9_]+$/, "用户名只能使用小写字母、数字和 _");

export const setupSchema = z.object({
  token: z.string().min(16),
  name: z.string().trim().min(1).max(80),
  username: usernameSchema,
  email: z.string().email().max(254),
  password: z.string().min(8, "密码至少需要 8 个字符").max(12, "密码不能超过 12 个字符"),
});

export const inviteAcceptSchema = z.object({
  token: z.string().min(32),
  name: z.string().trim().min(1).max(80),
  username: usernameSchema,
  password: z.string().min(8, "密码至少需要 8 个字符").max(12, "密码不能超过 12 个字符"),
});

export const createMemoSchema = z.object({
  content: z.string().trim().min(1).max(100_000),
  visibility: z.enum(memoVisibilities).default("PRIVATE"),
  attachmentIds: z.array(z.string().uuid()).max(20).default([]),
});

export const updateMemoSchema = z
  .object({
    content: z.string().trim().min(1).max(100_000).optional(),
    visibility: z.enum(memoVisibilities).optional(),
    state: z.enum(memoStates).optional(),
    pinned: z.boolean().optional(),
    version: z.number().int().positive(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== "version"), "没有可更新字段");

export const listMemosSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  tag: z.string().trim().max(80).optional(),
  visibility: z.enum(memoVisibilities).optional(),
  state: z.enum(memoStates).default("ACTIVE"),
  q: z.string().trim().min(1).max(100).optional(),
});

export const createInvitationSchema = z.object({
  email: z.string().email().max(254),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(32),
  password: z.string().min(8, "密码至少需要 8 个字符").max(12, "密码不能超过 12 个字符"),
});

export const updateUserStatusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]),
});

export const updateInstanceSettingsSchema = z.object({
  contactLabel: z.string().trim().min(1).max(30),
  contactUrl: z.string().trim().max(500).refine((value) => {
    if (value === "") return true;
    try {
      return ["https:", "mailto:"].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }, "联系链接必须为空，或使用 https: / mailto: 地址"),
});

export const createAttachmentSchema = z.object({
  filename: z.string().trim().min(1).max(255).refine(
    (value) => Array.from(value).every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127),
    "文件名包含无效字符",
  ),
  contentType: z.string().trim().min(1).max(255).regex(/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i, "MIME 类型无效"),
  size: z.number().int().positive(),
});
