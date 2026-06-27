import { useMutation, useQuery } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { api } from "../api";
import { AuthCard } from "../components/AuthCard";
import { Field, FormError, Input, SubmitButton } from "../components/Form";

export function RecoveryPage({ appName }: { appName: string }) {
  const { token = "" } = useParams();
  const [password, setPassword] = useState("");
  const info = useQuery({ queryKey: ["recovery", token], queryFn: () => api<{ email: string; expiresAt: number }>(`/api/v1/recovery/${token}`), retry: false, enabled: Boolean(token) });
  const mutation = useMutation({ mutationFn: () => api("/api/v1/recovery/reset", { method: "POST", body: JSON.stringify({ token, password }) }) });
  function submit(event: FormEvent) { event.preventDefault(); mutation.mutate(); }
  if (!token) return <Navigate to="/login" replace />;
  return (
    <AuthCard appName={appName} eyebrow="账号恢复" title="设置新密码" subtitle={info.data ? `正在恢复 ${info.data.email}` : "正在验证恢复链接…"} footer={mutation.isSuccess ? <Link to="/login">返回登录</Link> : undefined}>
      {info.isPending ? <div className="grid place-items-center py-12"><LoaderCircle className="animate-spin text-stone-400" /></div> : info.isError ? <FormError error={info.error.message} /> : mutation.isSuccess ? <div className="success-panel">密码已更新，其他会话均已退出。</div> : (
        <form className="form-stack" onSubmit={submit}>
          <Field label="新密码" hint="至少 12 个字符"><Input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <FormError error={mutation.error?.message} /><SubmitButton pending={mutation.isPending}>更新密码</SubmitButton>
        </form>
      )}
    </AuthCard>
  );
}
