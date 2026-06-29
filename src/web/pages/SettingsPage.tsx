import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, KeyRound, LogOut, UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, signOutSession } from "../api";
import { useSession } from "../session";
import { Field, FormError, Input, SubmitButton } from "../components/Form";
import { ApiTokenSettings } from "../components/ApiTokenSettings";
import { ContentTransferSettings } from "../components/ContentTransferSettings";

export function SettingsPage() {
  const { viewer } = useSession();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const password = useMutation({
    mutationFn: () => api("/api/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword, revokeOtherSessions: true }) }),
    onSuccess: () => { setCurrentPassword(""); setNewPassword(""); },
  });
  const signOut = async () => { await signOutSession(); await queryClient.invalidateQueries({ queryKey: ["session"] }); await navigate("/login"); };
  function submit(event: FormEvent) { event.preventDefault(); password.mutate(); }
  return (
    <div className="page-column narrow-page">
      <header className="page-header"><div><span className="eyebrow">账号</span><h1>设置</h1><p>管理你的公开身份和登录安全。</p></div></header>
      <section className="settings-card compact-settings-card"><div className="settings-icon"><UserRound /></div><div className="settings-content profile-settings"><div><h2>{viewer.name}</h2><p>{viewer.email} · @{viewer.username}</p></div><Link className="button button-secondary" to={`/u/${viewer.username}`}>查看公开主页<ExternalLink size={15} /></Link></div></section>
      <section className="settings-card compact-settings-card"><div className="settings-icon"><KeyRound /></div><div className="settings-content"><h2>修改密码</h2><p>更新后将退出其他设备上的会话。</p><form className="password-form" onSubmit={submit}><Field label="当前密码"><Input type="password" autoComplete="current-password" required minLength={8} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></Field><Field label="新密码（8–12 位）"><Input type="password" autoComplete="new-password" required minLength={8} maxLength={12} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></Field><SubmitButton pending={password.isPending}>保存新密码</SubmitButton><div className="password-feedback"><FormError error={password.error?.message} />{password.isSuccess && <div className="success-panel">密码已更新。</div>}</div></form></div></section>
      <ContentTransferSettings viewer={viewer} />
      <ApiTokenSettings />
      <button className="button button-danger self-start" onClick={() => { void signOut(); }}><LogOut size={16} />退出登录</button>
    </div>
  );
}
