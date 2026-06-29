import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, KeyRound, Link2, Settings2, Shield, UserX } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "../api";
import { Field, FormError, Input, SubmitButton } from "../components/Form";

interface AdminUser { id: string; name: string; email: string; username: string; role: "ADMIN" | "USER"; status: "ACTIVE" | "SUSPENDED"; createdAt: string }
interface Invitation { id: string; email: string; expiresAt: number; acceptedAt: number | null; createdAt: number }
interface InstanceSettings { appName: string; contactLabel: string; contactUrl: string }

function InstanceSettingsForm({ initial }: { initial: InstanceSettings }) {
  const [appName, setAppName] = useState(initial.appName);
  const [contactLabel, setContactLabel] = useState(initial.contactLabel);
  const [contactUrl, setContactUrl] = useState(initial.contactUrl);
  const [saved, setSaved] = useState(false);
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: () => api<InstanceSettings>("/api/v1/admin/settings", { method: "PATCH", body: JSON.stringify({ appName, contactLabel, contactUrl }) }),
    onSuccess: async (result) => {
      setSaved(true);
      queryClient.setQueryData(["admin-settings"], result);
      await queryClient.invalidateQueries({ queryKey: ["session"] });
    },
  });
  function submit(event: FormEvent) { event.preventDefault(); setSaved(false); save.mutate(); }
  return <form className="form-stack" onSubmit={submit}>
    <Field label="网站名称" hint="显示在导航栏、登录页和浏览器标题中"><Input required maxLength={40} value={appName} onChange={(event) => setAppName(event.target.value)} /></Field>
    <div className="form-grid">
      <Field label="按钮文字" hint="例如：申请加入、联系站长"><Input required maxLength={30} value={contactLabel} onChange={(event) => setContactLabel(event.target.value)} /></Field>
      <Field label="联系链接" hint="支持 https: 或 mailto:；留空则隐藏按钮"><Input maxLength={500} placeholder="mailto:owner@example.com" value={contactUrl} onChange={(event) => setContactUrl(event.target.value)} /></Field>
    </div>
    <FormError error={save.error?.message} />
    {saved && <div className="success-panel" role="status">实例设置已更新。</div>}
    <SubmitButton pending={save.isPending}>保存实例设置</SubmitButton>
  </form>;
}

export function AdminPage() {
  const [now] = useState(() => Date.now());
  const [email, setEmail] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");
  const [copied, setCopied] = useState(false);
  const queryClient = useQueryClient();
  const users = useQuery({ queryKey: ["admin-users"], queryFn: () => api<{ items: AdminUser[] }>("/api/v1/admin/users") });
  const invitations = useQuery({ queryKey: ["admin-invitations"], queryFn: () => api<{ items: Invitation[] }>("/api/v1/admin/invitations") });
  const settings = useQuery({ queryKey: ["admin-settings"], queryFn: () => api<InstanceSettings>("/api/v1/admin/settings") });
  const invite = useMutation({
    mutationFn: () => api<{ url: string }>("/api/v1/admin/invitations", { method: "POST", body: JSON.stringify({ email }) }),
    onSuccess: async (result) => { setGeneratedLink(result.url); setEmail(""); await queryClient.invalidateQueries({ queryKey: ["admin-invitations"] }); },
  });
  const status = useMutation({ mutationFn: ({ id, next }: { id: string; next: string }) => api(`/api/v1/admin/users/${id}`, { method: "PATCH", body: JSON.stringify({ status: next }) }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-users"] }) });
  const recovery = useMutation({ mutationFn: (id: string) => api<{ url: string }>(`/api/v1/admin/users/${id}/recovery`, { method: "POST" }), onSuccess: (result) => setGeneratedLink(result.url) });
  function submit(event: FormEvent) { event.preventDefault(); invite.mutate(); }
  async function copy() { await navigator.clipboard.writeText(generatedLink); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }
  return (
    <div className="page-column wide-page">
      <header className="page-header"><div><span className="eyebrow">实例管理</span><h1>成员与邀请</h1><p>控制谁可以进入这个实例，并生成账号恢复链接。</p></div></header>
      <section className="admin-grid">
        <div className="panel"><div className="panel-heading"><Link2 /><div><h2>邀请新成员</h2><p>链接 7 天有效且只能使用一次。</p></div></div><form className="form-stack" onSubmit={submit}><Field label="成员邮箱"><Input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></Field><FormError error={invite.error?.message} /><SubmitButton pending={invite.isPending}>生成邀请链接</SubmitButton></form></div>
        <div className="panel"><div className="panel-heading"><Shield /><div><h2>安全链接</h2><p>邀请或恢复链接只会显示一次。</p></div></div>{generatedLink ? <div className="generated-link"><code>{generatedLink}</code><button className="button button-secondary" onClick={() => { void copy(); }}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "已复制" : "复制"}</button></div> : <div className="placeholder-panel">生成的链接会显示在这里</div>}</div>
      </section>
      <section className="panel"><div className="panel-heading"><Settings2 /><div><h2>实例设置</h2><p>修改网站名称和匿名首页的联系入口；不会公开管理员登录邮箱。</p></div></div>{settings.isPending ? <div className="loading-panel"><span>加载中</span></div> : settings.isError ? <FormError error={settings.error.message} /> : <InstanceSettingsForm key={`${settings.data.appName}:${settings.data.contactLabel}:${settings.data.contactUrl}`} initial={settings.data} />}</section>
      <section className="panel"><div className="panel-heading"><Shield /><div><h2>成员</h2><p>{users.data?.items.length ?? 0} 个账号</p></div></div>{users.isError && <FormError error={users.error.message} />}<div className="table-wrap"><table><thead><tr><th>成员</th><th>角色</th><th>状态</th><th className="text-right">操作</th></tr></thead><tbody>{users.data?.items.map((user) => <tr key={user.id}><td><strong>{user.name}</strong><small>{user.email} · @{user.username}</small></td><td><span className="status-badge">{user.role}</span></td><td><span className={`status-badge ${user.status === "ACTIVE" ? "status-ok" : "status-warn"}`}>{user.status}</span></td><td><div className="table-actions"><button className="icon-button" title="生成恢复链接" onClick={() => recovery.mutate(user.id)}><KeyRound size={16} /></button>{user.role !== "ADMIN" && <button className="icon-button" title={user.status === "ACTIVE" ? "停用" : "启用"} onClick={() => status.mutate({ id: user.id, next: user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" })}><UserX size={16} /></button>}</div></td></tr>)}</tbody></table></div></section>
      <section className="panel"><div className="panel-heading"><Link2 /><div><h2>邀请记录</h2><p>已接受和等待中的邀请。</p></div></div><div className="table-wrap"><table><thead><tr><th>邮箱</th><th>创建时间</th><th>状态</th></tr></thead><tbody>{invitations.data?.items.map((item) => <tr key={item.id}><td>{item.email}</td><td>{new Date(item.createdAt).toLocaleString("zh-CN")}</td><td><span className={`status-badge ${item.acceptedAt ? "status-ok" : ""}`}>{item.acceptedAt ? "已接受" : now > item.expiresAt ? "已过期" : "等待中"}</span></td></tr>)}</tbody></table></div></section>
    </div>
  );
}
