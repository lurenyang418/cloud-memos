import { relations } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
    image: text("image"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    username: text("username").notNull(),
    role: text("role", { enum: ["ADMIN", "USER"] }).notNull().default("USER"),
    status: text("status", { enum: ["ACTIVE", "SUSPENDED"] }).notNull().default("ACTIVE"),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email), uniqueIndex("users_username_unique").on(table.username)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [uniqueIndex("sessions_token_unique").on(table.token), index("sessions_user_id_idx").on(table.userId)],
);

export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("accounts_user_id_idx").on(table.userId)],
);

export const verifications = sqliteTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)],
);

export const rateLimits = sqliteTable("rate_limits", {
  id: text("id").primaryKey(),
  key: text("key").notNull(),
  count: integer("count").notNull(),
  lastRequest: integer("last_request").notNull(),
}, (table) => [uniqueIndex("rate_limits_key_unique").on(table.key)]);

export const instanceSettings = sqliteTable("instance_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const invitations = sqliteTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    invitedBy: text("invited_by").notNull().references(() => users.id),
    expiresAt: integer("expires_at").notNull(),
    acceptedAt: integer("accepted_at"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [uniqueIndex("invitations_token_hash_unique").on(table.tokenHash), index("invitations_email_idx").on(table.email)],
);

export const recoveryTokens = sqliteTable(
  "recovery_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: integer("expires_at").notNull(),
    usedAt: integer("used_at"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [uniqueIndex("recovery_token_hash_unique").on(table.tokenHash)],
);

export const apiTokens = sqliteTable(
  "api_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenPrefix: text("token_prefix").notNull(),
    tokenHash: text("token_hash").notNull(),
    scopes: text("scopes").notNull(),
    expiresAt: integer("expires_at").notNull(),
    lastUsedAt: integer("last_used_at"),
    revokedAt: integer("revoked_at"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [uniqueIndex("api_tokens_token_hash_unique").on(table.tokenHash), index("api_tokens_user_created_idx").on(table.userId, table.createdAt)],
);

export const memos = sqliteTable(
  "memos",
  {
    id: text("id").primaryKey(),
    creatorId: text("creator_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    visibility: text("visibility", { enum: ["PRIVATE", "MEMBERS", "PUBLIC"] }).notNull().default("PRIVATE"),
    state: text("state", { enum: ["ACTIVE", "ARCHIVED"] }).notNull().default("ACTIVE"),
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    version: integer("version").notNull().default(1),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    deletedAt: integer("deleted_at"),
  },
  (table) => [
    index("memos_creator_timeline_idx").on(table.creatorId, table.state, table.pinned, table.createdAt),
    index("memos_creator_deleted_idx").on(table.creatorId, table.deletedAt, table.createdAt),
    index("memos_visibility_idx").on(table.visibility, table.state, table.createdAt),
  ],
);

export const memoVersions = sqliteTable(
  "memo_versions",
  {
    id: text("id").primaryKey(),
    memoId: text("memo_id").notNull().references(() => memos.id, { onDelete: "cascade" }),
    creatorId: text("creator_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    visibility: text("visibility", { enum: ["PRIVATE", "MEMBERS", "PUBLIC"] }).notNull(),
    state: text("state", { enum: ["ACTIVE", "ARCHIVED"] }).notNull(),
    pinned: integer("pinned", { mode: "boolean" }).notNull(),
    version: integer("version").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [uniqueIndex("memo_versions_memo_version_unique").on(table.memoId, table.version), index("memo_versions_memo_created_idx").on(table.memoId, table.createdAt)],
);

export const memoTags = sqliteTable(
  "memo_tags",
  {
    memoId: text("memo_id").notNull().references(() => memos.id, { onDelete: "cascade" }),
    normalized: text("normalized").notNull(),
    display: text("display").notNull(),
  },
  (table) => [primaryKey({ columns: [table.memoId, table.normalized] }), index("memo_tags_normalized_idx").on(table.normalized)],
);

export const attachments = sqliteTable(
  "attachments",
  {
    id: text("id").primaryKey(),
    creatorId: text("creator_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    memoId: text("memo_id").references(() => memos.id, { onDelete: "set null" }),
    objectKey: text("object_key").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    etag: text("etag"),
    status: text("status", { enum: ["PENDING", "READY", "DELETING"] }).notNull().default("PENDING"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [index("attachments_creator_idx").on(table.creatorId), index("attachments_memo_idx").on(table.memoId), uniqueIndex("attachments_object_key_unique").on(table.objectKey)],
);

export const memoImports = sqliteTable(
  "memo_imports",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    sourceKey: text("source_key").notNull(),
    memoId: text("memo_id").notNull().references(() => memos.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [uniqueIndex("memo_imports_user_source_unique").on(table.userId, table.sourceKey), uniqueIndex("memo_imports_memo_unique").on(table.memoId)],
);

export const userRelations = relations(users, ({ many }) => ({ memos: many(memos), sessions: many(sessions) }));
export const memoRelations = relations(memos, ({ one, many }) => ({
  author: one(users, { fields: [memos.creatorId], references: [users.id] }),
  tags: many(memoTags),
  attachments: many(attachments),
}));
export const memoTagRelations = relations(memoTags, ({ one }) => ({ memo: one(memos, { fields: [memoTags.memoId], references: [memos.id] }) }));
export const attachmentRelations = relations(attachments, ({ one }) => ({
  memo: one(memos, { fields: [attachments.memoId], references: [memos.id] }),
  creator: one(users, { fields: [attachments.creatorId], references: [users.id] }),
}));

export const schema = { users, sessions, accounts, verifications, rateLimits, instanceSettings, invitations, recoveryTokens, apiTokens, memos, memoVersions, memoTags, attachments, memoImports };
