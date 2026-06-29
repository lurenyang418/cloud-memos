# Cloud Memos API

Cloud Memos 提供版本化的 `/api/v1` HTTP API。实例的机器可读 OpenAPI 文档位于：

```text
https://你的实例/api/v1/openapi.json
```

## 创建 API 令牌

登录网页后进入“设置 → API 令牌”。令牌明文只显示一次，格式为：

```text
cm_pat_<prefix>_<secret>
```

可选权限：

- `memos:read`：读取个人 Memo、成员动态、个人资料和允许访问的附件，可用于自行实现导出。
- `memos:write`：包含读取权限，并允许创建、修改、删除 Memo，上传/删除附件和导入。

令牌默认有效 365 天，也可以设置 1–365 天的更短期限。创建、列出和撤销令牌本身只允许网页 Cookie 会话调用；API 令牌不能管理其他令牌、邀请、用户、密码、恢复链接或实例设置。

令牌应放入密码管理器或操作系统凭据存储，不要写入仓库、shell 历史、URL 或日志。

撤销通常直接在设置页完成。如果需要验证管理接口，可把现有网页登录 Cookie 放入临时环境变量；该接口不接受 PAT：

```bash
export CLOUD_MEMOS_URL='https://memos.example.com'
export CLOUD_MEMOS_TOKEN_ID='xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
export CLOUD_MEMOS_SESSION_COOKIE='better-auth.session_token=从浏览器安全存储临时取得的值'
curl --fail-with-body -X DELETE \
  -H "Cookie: $CLOUD_MEMOS_SESSION_COOKIE" \
  -H "Origin: $CLOUD_MEMOS_URL" \
  "$CLOUD_MEMOS_URL/api/v1/api-tokens/$CLOUD_MEMOS_TOKEN_ID"
unset CLOUD_MEMOS_SESSION_COOKIE
```

## curl 环境

```bash
export CLOUD_MEMOS_URL='https://memos.example.com'
export CLOUD_MEMOS_TOKEN='cm_pat_xxxxxx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
```

所有 Bearer 请求使用：

```bash
curl --fail-with-body \
  -H "Authorization: Bearer $CLOUD_MEMOS_TOKEN" \
  "$CLOUD_MEMOS_URL/api/v1/memos"
```

## Memo

列出个人 Memo：

```bash
curl --fail-with-body \
  -H "Authorization: Bearer $CLOUD_MEMOS_TOKEN" \
  "$CLOUD_MEMOS_URL/api/v1/memos?state=ACTIVE&limit=20"
```

响应中的 `nextCursor` 非空时，将它作为下一次请求的 `cursor` 参数。Cursor 是不透明值，不应解析或持久依赖其内部格式。

创建 Memo：

```bash
curl --fail-with-body \
  -X POST \
  -H "Authorization: Bearer $CLOUD_MEMOS_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"content":"来自 CLI 的 **Markdown** #api","visibility":"PRIVATE","attachmentIds":[]}' \
  "$CLOUD_MEMOS_URL/api/v1/memos"
```

修改时必须提交刚读取到的 `version`：

```bash
export MEMO_ID='xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
curl --fail-with-body \
  -X PATCH \
  -H "Authorization: Bearer $CLOUD_MEMOS_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"pinned":true,"version":1}' \
  "$CLOUD_MEMOS_URL/api/v1/memos/$MEMO_ID"
```

若版本过期，接口返回 `409 VERSION_CONFLICT` 和当前版本号。客户端应重新读取内容并由用户决定如何合并。

删除：

```bash
curl --fail-with-body -X DELETE \
  -H "Authorization: Bearer $CLOUD_MEMOS_TOKEN" \
  "$CLOUD_MEMOS_URL/api/v1/memos/$MEMO_ID"
```

## 附件

附件采用两步上传。先声明元数据：

```bash
export FILE='./image.png'
export FILE_SIZE="$(wc -c < "$FILE" | tr -d ' ')"
curl --fail-with-body \
  -X POST \
  -H "Authorization: Bearer $CLOUD_MEMOS_TOKEN" \
  -H 'Content-Type: application/json' \
  --data "{\"filename\":\"image.png\",\"contentType\":\"image/png\",\"size\":$FILE_SIZE}" \
  "$CLOUD_MEMOS_URL/api/v1/attachments"
```

从响应取得 `id` 和 `uploadUrl`，再上传原始字节。请求的 `Content-Length` 必须与声明值完全相同：

```bash
export UPLOAD_URL='/api/v1/attachments/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx/content'
curl --fail-with-body \
  -X PUT \
  -H "Authorization: Bearer $CLOUD_MEMOS_TOKEN" \
  -H 'Content-Type: image/png' \
  --data-binary "@$FILE" \
  "$CLOUD_MEMOS_URL$UPLOAD_URL"
```

最后在创建 Memo 时把附件 `id` 放入 `attachmentIds`。未关联的上传会在超过 24 小时后由定时清理任务移除。

下载附件：

```bash
curl --fail-with-body -L \
  -H "Authorization: Bearer $CLOUD_MEMOS_TOKEN" \
  -o image.png \
  "$CLOUD_MEMOS_URL/api/v1/attachments/$ATTACHMENT_ID/content"
```

## 导入与导出

网页设置页可以直接导出和导入 ZIP。当前 ZIP 清单仍使用 `formatVersion: 1`，但现在强制包含唯一的 `exportId`。缺少该字段的旧 v1 ZIP 会被拒绝，不提供兼容导入；请从源实例重新导出。

完整导出没有单独的服务端端点：客户端通过分页读取个人 Memo，并下载每个附件。这些请求都属于 `memos:read`，CLI 可以用相同方式实现自己的导出格式。

导入使用稳定来源键 `${exportId}:${sourceMemoId}`。先批量检查，单次最多 100 个：

```bash
curl --fail-with-body \
  -X POST \
  -H "Authorization: Bearer $CLOUD_MEMOS_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"sourceKeys":["11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222"]}' \
  "$CLOUD_MEMOS_URL/api/v1/import/check"
```

附件先按上一节上传，然后逐条导入 Memo：

```bash
curl --fail-with-body \
  -X POST \
  -H "Authorization: Bearer $CLOUD_MEMOS_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{
    "sourceKey":"11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222",
    "content":"原始 Markdown",
    "visibility":"PUBLIC",
    "state":"ACTIVE",
    "pinned":false,
    "version":1,
    "createdAt":1767225600000,
    "updatedAt":1767225600000,
    "attachmentIds":[]
  }' \
  "$CLOUD_MEMOS_URL/api/v1/import/memos"
```

同一用户重复提交相同 `sourceKey` 不会创建副本，返回 `200`、`imported: false` 和已存在的 Memo。不同用户的幂等空间相互隔离。

## 错误

错误统一返回：

```json
{
  "error": {
    "code": "INSUFFICIENT_SCOPE",
    "message": "API 令牌缺少 memos:write 权限"
  }
}
```

认证相关状态：

- `401 INVALID_API_TOKEN`：格式错误、未知、过期、撤销或所属用户已停用。
- `403 INSUFFICIENT_SCOPE`：令牌有效，但权限不足。
- `403 SESSION_REQUIRED`：接口只接受网页 Cookie 会话。

不要只根据中文 `message` 编写逻辑；客户端应使用稳定的 `code` 和 HTTP 状态码。
