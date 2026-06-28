import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { AuthCard } from "../components/AuthCard";
import { Field, FormError, Input, SubmitButton } from "../components/Form";
import { UsernameField } from "../components/UsernameField";

export function InvitePage({ appName }: { appName: string }) {
  const { token = "" } = useParams();
  const [form, setForm] = useState({ name: "", username: "", password: "" });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const invitation = useQuery({
    queryKey: ["invitation", token],
    queryFn: () => api<{ email: string; expiresAt: number }>(`/api/v1/invitations/${token}`),
    retry: false,
    enabled: Boolean(token),
  });
  const mutation = useMutation({
    mutationFn: () => api("/api/v1/invitations/accept", { method: "POST", body: JSON.stringify({ token, ...form }) }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["session"] }); await navigate("/", { replace: true }); },
  });
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm((value) => ({ ...value, [key]: event.target.value }));
  function submit(event: FormEvent) { event.preventDefault(); mutation.mutate(); }
  if (!token) return <Navigate to="/login" replace />;
  return (
    <AuthCard appName={appName} eyebrow="受邀加入" title="创建你的账号" subtitle={invitation.data ? `邀请邮箱：${invitation.data.email}` : "正在验证邀请…"}>
      {invitation.isPending ? <div className="grid place-items-center py-12"><LoaderCircle className="animate-spin text-stone-400" /></div> : invitation.isError ? <FormError error={invitation.error.message} /> : (
        <form className="form-stack" onSubmit={submit}>
          <div className="form-grid"><Field label="显示名称"><Input required maxLength={80} value={form.name} onChange={set("name")} /></Field><UsernameField value={form.username} onChange={(username) => setForm((value) => ({ ...value, username }))} /></div>
          <Field label="密码" hint="8–12 个字符"><Input type="password" autoComplete="new-password" required minLength={8} maxLength={12} value={form.password} onChange={set("password")} /></Field>
          <FormError error={mutation.error?.message} /><SubmitButton pending={mutation.isPending}>接受邀请</SubmitButton>
        </form>
      )}
    </AuthCard>
  );
}
