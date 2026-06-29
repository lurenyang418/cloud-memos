import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clipboard, KeyRound, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { ApiTokenSummary } from "../../shared/types";
import { api } from "../api";
import { Field, FormError, Input } from "./Form";

interface CreatedToken { token: string; item: ApiTokenSummary }

function date(value: number): string {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(value);
}

export function ApiTokenSettings() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"read-only" | "read-write">("read-only");
  const [expiresInDays, setExpiresInDays] = useState(365);
  const [plaintext, setPlaintext] = useState("");
  const [copied, setCopied] = useState(false);
  const tokens = useQuery({
    queryKey: ["api-tokens"],
    queryFn: () => api<{ items: ApiTokenSummary[] }>("/api/v1/api-tokens"),
  });
  const create = useMutation({
    mutationFn: () => api<CreatedToken>("/api/v1/api-tokens", { method: "POST", body: JSON.stringify({ name, mode, expiresInDays }) }),
    onSuccess: (result) => {
      setPlaintext(result.token); setName(""); setCopied(false);
      void queryClient.invalidateQueries({ queryKey: ["api-tokens"] });
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api<void>(`/api/v1/api-tokens/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["api-tokens"] }),
  });
  function submit(event: FormEvent) { event.preventDefault(); create.mutate(); }
  async function copy() {
    await navigator.clipboard.writeText(plaintext);
    setCopied(true);
  }

  return (
    <section className="settings-card token-card">
      <div className="settings-icon"><KeyRound /></div>
      <div className="settings-content">
        <h2>API 令牌</h2>
        <p>供 CLI 或自动化脚本访问 Memo。令牌最长有效一年，可随时撤销。</p>
        <form className="token-form" onSubmit={submit}>
          <Field label="名称"><Input required maxLength={60} placeholder="例如：本机 CLI" value={name} onChange={(event) => setName(event.target.value)} /></Field>
          <Field label="权限">
            <select className="input" value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
              <option value="read-only">只读</option><option value="read-write">读写</option>
            </select>
          </Field>
          <Field label="有效天数">
            <Input type="number" required min={1} max={365} value={expiresInDays} onChange={(event) => setExpiresInDays(Number(event.target.value))} />
          </Field>
          <button className="button button-secondary token-create" type="submit" disabled={create.isPending}>{create.isPending ? "正在创建…" : "创建令牌"}</button>
          {create.error && <div className="token-form-error"><FormError error={create.error.message} /></div>}
        </form>
        {plaintext && <div className="token-secret" role="status"><strong>请立即复制，关闭后无法再次查看</strong><code>{plaintext}</code><button className="button button-secondary" type="button" onClick={() => { void copy(); }}>{copied ? <Check size={15} /> : <Clipboard size={15} />}{copied ? "已复制" : "复制令牌"}</button></div>}
        <div className="token-list">
          <div className="token-list-heading"><strong>已创建令牌</strong>{tokens.data && <span>{tokens.data.items.length}</span>}</div>
          {tokens.isLoading && <span className="export-status">正在读取令牌…</span>}
          {tokens.error && <FormError error={tokens.error.message} />}
          {tokens.data?.items.map((token) => {
            const inactive = token.revokedAt !== null || token.expiresAt <= Date.now();
            const status = inactive ? (token.revokedAt ? "已撤销" : "已过期") : "有效";
            return <div className={`token-row${inactive ? " token-row-inactive" : ""}`} key={token.id}><div><div className="token-row-title"><strong>{token.name}</strong><span className="token-scope">{token.scopes.includes("memos:write") ? "读写" : "只读"}</span><span className={`token-status${inactive ? " token-status-muted" : ""}`}>{status}</span></div><div className="token-meta"><code>cm_pat_{token.tokenPrefix}_…</code><span>{date(token.expiresAt)} 到期</span>{token.lastUsedAt && <span>最近使用 {date(token.lastUsedAt)}</span>}</div></div>{!inactive && <button className="button token-revoke" type="button" disabled={revoke.isPending} onClick={() => revoke.mutate(token.id)}><Trash2 size={14} />撤销</button>}</div>;
          })}
          {tokens.data?.items.length === 0 && <span className="export-status">尚未创建 API 令牌。</span>}
        </div>
      </div>
    </section>
  );
}
