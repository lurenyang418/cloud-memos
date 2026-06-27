import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { AuthCard } from "../components/AuthCard";
import { Field, FormError, Input, SubmitButton } from "../components/Form";

export function SetupPage({ appName }: { appName: string }) {
  const [form, setForm] = useState({ token: "", name: "", username: "", email: "", password: "" });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: () => api("/api/v1/setup", { method: "POST", body: JSON.stringify(form) }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["session"] }); await navigate("/", { replace: true }); },
  });
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm((value) => ({ ...value, [key]: event.target.value }));
  function submit(event: FormEvent) { event.preventDefault(); mutation.mutate(); }
  return (
    <AuthCard appName={appName} eyebrow="首次启动" title="创建实例管理员" subtitle="初始化成功后，此入口将永久关闭。">
      <form className="form-stack" onSubmit={submit}>
        <Field label="初始化令牌" hint="部署时设置的 BOOTSTRAP_ADMIN_TOKEN"><Input type="password" required minLength={16} value={form.token} onChange={set("token")} /></Field>
        <div className="form-grid"><Field label="显示名称"><Input required maxLength={80} value={form.name} onChange={set("name")} /></Field><Field label="用户名"><Input required pattern="[a-z0-9][a-z0-9_-]*[a-z0-9]" minLength={3} maxLength={32} value={form.username} onChange={set("username")} /></Field></div>
        <Field label="邮箱"><Input type="email" required value={form.email} onChange={set("email")} /></Field>
        <Field label="密码" hint="至少 12 个字符"><Input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={form.password} onChange={set("password")} /></Field>
        <FormError error={mutation.error?.message} /><SubmitButton pending={mutation.isPending}>初始化实例</SubmitButton>
      </form>
    </AuthCard>
  );
}
