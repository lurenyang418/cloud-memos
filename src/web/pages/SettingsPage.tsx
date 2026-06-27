import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, KeyRound, LogOut, UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useSession } from "../session";
import { Field, FormError, Input, SubmitButton } from "../components/Form";

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
  const signOut = async () => { await api("/api/auth/sign-out", { method: "POST" }); await queryClient.invalidateQueries({ queryKey: ["session"] }); await navigate("/login"); };
  function submit(event: FormEvent) { event.preventDefault(); password.mutate(); }
  return (
    <div className="page-column narrow-page">
      <header className="page-header"><div><span className="eyebrow">账号</span><h1>设置</h1><p>管理你的公开身份和登录安全。</p></div></header>
      <section className="settings-card"><div className="settings-icon"><UserRound /></div><div className="settings-content"><h2>{viewer.name}</h2><p>{viewer.email} · @{viewer.username}</p><Link className="button button-secondary mt-4" to={`/u/${viewer.username}`}>查看公开主页<ExternalLink size={15} /></Link></div></section>
      <section className="settings-card"><div className="settings-icon"><KeyRound /></div><div className="settings-content"><h2>修改密码</h2><p>更新后将退出其他设备上的会话。</p><form className="form-stack mt-5" onSubmit={submit}><Field label="当前密码"><Input type="password" autoComplete="current-password" required minLength={12} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></Field><Field label="新密码"><Input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></Field><FormError error={password.error?.message} />{password.isSuccess && <div className="success-panel">密码已更新。</div>}<SubmitButton pending={password.isPending}>保存新密码</SubmitButton></form></div></section>
      <button className="button button-danger self-start" onClick={() => { void signOut(); }}><LogOut size={16} />退出登录</button>
    </div>
  );
}
