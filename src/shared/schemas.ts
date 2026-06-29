import { z } from "zod";
import { memoStates, memoVisibilities } from "./types";

const importSourceKeySchema = z.string().refine((value) => {
  const [exportId, memoId, extra] = value.split(":");
  return extra === undefined && z.string().uuid().safeParse(exportId).success && z.string().uuid().safeParse(memoId).success;
}, "来源标识无效");

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
  deleted: z.enum(["true"]).optional(),
});

export const restoreMemoVersionSchema = z.object({ version: z.number().int().positive() });

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
  appName: z.string().trim().min(1, "网站名称不能为空").max(40, "网站名称不能超过 40 个字符").refine(
    (value) => Array.from(value).every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127),
    "网站名称不能包含控制字符",
  ),
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

export const createApiTokenSchema = z.object({
  name: z.string().trim().min(1, "令牌名称不能为空").max(60, "令牌名称不能超过 60 个字符"),
  mode: z.enum(["read-only", "read-write"]),
  expiresInDays: z.number().int().min(1).max(365).default(365),
});

export const importCheckSchema = z.object({
  sourceKeys: z.array(importSourceKeySchema).min(1).max(100),
});

export const importMemoSchema = z.object({
  sourceKey: importSourceKeySchema,
  content: z.string().min(1).max(100_000),
  visibility: z.enum(memoVisibilities),
  state: z.enum(memoStates),
  pinned: z.boolean(),
  version: z.number().int().positive(),
  createdAt: z.number().int().nonnegative().safe(),
  updatedAt: z.number().int().nonnegative().safe(),
  attachmentIds: z.array(z.string().uuid()).max(20),
}).refine((value) => value.updatedAt >= value.createdAt, {
  message: "更新时间不能早于创建时间",
  path: ["updatedAt"],
});
