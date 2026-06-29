const errorResponse = {
  description: "Error",
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
};

const bearerOrCookie = [{ bearerAuth: [] }, { cookieAuth: [] }];
const jsonBody = (schema: Record<string, unknown>) => ({
  required: true,
  content: { "application/json": { schema } },
});

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Cloud Memos API",
    version: "0.1.0",
    description: "Personal Memo, attachment, export and import API. API token management requires a browser session.",
  },
  servers: [{ url: "/", description: "Current instance" }],
  tags: [
    { name: "Memos" }, { name: "Attachments" }, { name: "Import" }, { name: "API tokens" }, { name: "Public" },
  ],
  paths: {
    "/api/v1/session": {
      get: { summary: "Get current viewer and instance state", responses: { "200": { description: "Session state" }, "401": errorResponse } },
    },
    "/api/v1/memos": {
      get: {
        tags: ["Memos"], summary: "List the current user's memos", security: bearerOrCookie,
        parameters: ["cursor", "tag", "visibility", "state", "q", "limit"].map((name) => ({ name, in: "query", schema: name === "limit" ? { type: "integer", minimum: 1, maximum: 50 } : { type: "string" } })),
        responses: { "200": { description: "Memo page", content: { "application/json": { schema: { $ref: "#/components/schemas/MemoPage" } } } }, "401": errorResponse, "403": errorResponse },
      },
      post: {
        tags: ["Memos"], summary: "Create a memo", security: bearerOrCookie,
        requestBody: jsonBody({ type: "object", required: ["content"], properties: { content: { type: "string", maxLength: 100000 }, visibility: { $ref: "#/components/schemas/Visibility" }, attachmentIds: { type: "array", maxItems: 20, items: { type: "string", format: "uuid" } } } }),
        responses: { "201": { description: "Created memo", content: { "application/json": { schema: { $ref: "#/components/schemas/Memo" } } } }, "401": errorResponse, "403": errorResponse },
      },
    },
    "/api/v1/memos/{id}": {
      get: { tags: ["Memos"], summary: "Get an accessible memo", security: [...bearerOrCookie, {}], parameters: [{ $ref: "#/components/parameters/Id" }], responses: { "200": { description: "Memo", content: { "application/json": { schema: { $ref: "#/components/schemas/Memo" } } } }, "404": errorResponse } },
      patch: {
        tags: ["Memos"], summary: "Update an owned memo", security: bearerOrCookie, parameters: [{ $ref: "#/components/parameters/Id" }],
        requestBody: jsonBody({ type: "object", required: ["version"], properties: { content: { type: "string" }, visibility: { $ref: "#/components/schemas/Visibility" }, state: { $ref: "#/components/schemas/State" }, pinned: { type: "boolean" }, version: { type: "integer", minimum: 1 } } }),
        responses: { "200": { description: "Updated memo" }, "409": errorResponse },
      },
      delete: { tags: ["Memos"], summary: "Delete an owned memo", security: bearerOrCookie, parameters: [{ $ref: "#/components/parameters/Id" }], responses: { "204": { description: "Deleted" }, "404": errorResponse } },
    },
    "/api/v1/feed": {
      get: { tags: ["Memos"], summary: "List member-visible feed", security: bearerOrCookie, responses: { "200": { description: "Memo page" }, "401": errorResponse } },
    },
    "/api/v1/attachments": {
      post: {
        tags: ["Attachments"], summary: "Create pending attachment metadata", security: bearerOrCookie,
        requestBody: jsonBody({ type: "object", required: ["filename", "contentType", "size"], properties: { filename: { type: "string", maxLength: 255 }, contentType: { type: "string" }, size: { type: "integer", minimum: 1 } } }),
        responses: { "201": { description: "Pending attachment and uploadUrl" }, "413": errorResponse },
      },
    },
    "/api/v1/attachments/{id}/content": {
      get: { tags: ["Attachments"], summary: "Download an accessible attachment", security: [...bearerOrCookie, {}], parameters: [{ $ref: "#/components/parameters/Id" }], responses: { "200": { description: "Attachment bytes" }, "304": { description: "Not modified" }, "404": errorResponse } },
      put: {
        tags: ["Attachments"], summary: "Upload pending attachment bytes", description: "Set Content-Length to exactly the size declared when creating metadata.", security: bearerOrCookie,
        parameters: [{ $ref: "#/components/parameters/Id" }], requestBody: { required: true, content: { "application/octet-stream": { schema: { type: "string", contentEncoding: "binary" } } } },
        responses: { "200": { description: "Upload complete" }, "400": errorResponse, "409": errorResponse },
      },
    },
    "/api/v1/attachments/{id}": {
      delete: { tags: ["Attachments"], summary: "Delete an attachment", security: bearerOrCookie, parameters: [{ $ref: "#/components/parameters/Id" }], responses: { "204": { description: "Deletion scheduled" }, "404": errorResponse } },
    },
    "/api/v1/import/check": {
      post: {
        tags: ["Import"], summary: "Check idempotency keys", security: bearerOrCookie,
        requestBody: jsonBody({ type: "object", required: ["sourceKeys"], properties: { sourceKeys: { type: "array", minItems: 1, maxItems: 100, items: { type: "string", example: "export-uuid:memo-uuid" } } } }),
        responses: { "200": { description: "Previously imported source keys" } },
      },
    },
    "/api/v1/import/memos": {
      post: {
        tags: ["Import"], summary: "Import one memo idempotently", security: bearerOrCookie,
        requestBody: jsonBody({ $ref: "#/components/schemas/ImportMemo" }),
        responses: { "200": { description: "Existing imported memo" }, "201": { description: "New imported memo" }, "400": errorResponse },
      },
    },
    "/api/v1/api-tokens": {
      get: { tags: ["API tokens"], summary: "List API tokens", description: "Browser session only.", security: [{ cookieAuth: [] }], responses: { "200": { description: "Token summaries; never includes token hashes or secret values" } } },
      post: {
        tags: ["API tokens"], summary: "Create an API token", description: "Browser session only. The plaintext token is returned once.", security: [{ cookieAuth: [] }],
        requestBody: jsonBody({ type: "object", required: ["name", "mode"], properties: { name: { type: "string", minLength: 1, maxLength: 60 }, mode: { type: "string", enum: ["read-only", "read-write"] }, expiresInDays: { type: "integer", minimum: 1, maximum: 365, default: 365 } } }),
        responses: { "201": { description: "Token and summary" } },
      },
    },
    "/api/v1/api-tokens/{id}": {
      delete: { tags: ["API tokens"], summary: "Revoke an API token", description: "Browser session only and idempotent.", security: [{ cookieAuth: [] }], parameters: [{ $ref: "#/components/parameters/Id" }], responses: { "204": { description: "Revoked or already absent" } } },
    },
    "/api/v1/public/memos": {
      get: { tags: ["Public"], summary: "List public memos", security: [], responses: { "200": { description: "Public memo page" } } },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "cm_pat" },
      cookieAuth: { type: "apiKey", in: "cookie", name: "better-auth.session_token" },
    },
    parameters: { Id: { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } } },
    schemas: {
      Visibility: { type: "string", enum: ["PRIVATE", "MEMBERS", "PUBLIC"] },
      State: { type: "string", enum: ["ACTIVE", "ARCHIVED"] },
      Attachment: { type: "object", required: ["id", "filename", "contentType", "size", "status", "url"], properties: { id: { type: "string", format: "uuid" }, filename: { type: "string" }, contentType: { type: "string" }, size: { type: "integer" }, status: { type: "string", enum: ["PENDING", "READY"] }, url: { type: "string" } } },
      Author: { type: "object", required: ["id", "name", "username"], properties: { id: { type: "string" }, name: { type: "string" }, username: { type: "string" }, image: { type: ["string", "null"] } } },
      Memo: { type: "object", required: ["id", "content", "visibility", "state", "pinned", "version", "createdAt", "updatedAt", "author", "tags", "attachments"], properties: { id: { type: "string", format: "uuid" }, content: { type: "string" }, visibility: { $ref: "#/components/schemas/Visibility" }, state: { $ref: "#/components/schemas/State" }, pinned: { type: "boolean" }, version: { type: "integer" }, createdAt: { type: "integer" }, updatedAt: { type: "integer" }, author: { $ref: "#/components/schemas/Author" }, tags: { type: "array", items: { type: "string" } }, attachments: { type: "array", items: { $ref: "#/components/schemas/Attachment" } } } },
      MemoPage: { type: "object", required: ["items", "nextCursor"], properties: { items: { type: "array", items: { $ref: "#/components/schemas/Memo" } }, nextCursor: { type: ["string", "null"] } } },
      Error: { type: "object", required: ["error"], properties: { error: { type: "object", required: ["code", "message"], properties: { code: { type: "string" }, message: { type: "string" }, details: {} } } } },
      ImportMemo: {
        type: "object", required: ["sourceKey", "content", "visibility", "state", "pinned", "version", "createdAt", "updatedAt", "attachmentIds"],
        properties: { sourceKey: { type: "string" }, content: { type: "string", maxLength: 100000 }, visibility: { $ref: "#/components/schemas/Visibility" }, state: { $ref: "#/components/schemas/State" }, pinned: { type: "boolean" }, version: { type: "integer", minimum: 1 }, createdAt: { type: "integer" }, updatedAt: { type: "integer" }, attachmentIds: { type: "array", maxItems: 20, items: { type: "string", format: "uuid" } } },
      },
    },
  },
} as const;
