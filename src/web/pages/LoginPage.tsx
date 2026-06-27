import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { AuthCard } from "../components/AuthCard";
import { Field, FormError, Input, SubmitButton } from "../components/Form";

export function LoginPage({ appName }: { appName: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const mutation = useMutation({
    mutationFn: () => api("/api/auth/sign-in/email", { method: "POST", body: JSON.stringify({ email, password, rememberMe: true }) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      const state = location.state as { from?: string } | null;
      await navigate(state?.from ?? "/", { replace: true });
    },
  });
  function submit(event: FormEvent) { event.preventDefault(); mutation.mutate(); }
  return (
    <AuthCard appName={appName} eyebrow="欢迎回来" title="继续记录" subtitle="你的想法仍在原处等你。" footer={<span>账号由实例管理员邀请创建</span>}>
      <form className="form-stack" onSubmit={submit}>
        <Field label="邮箱"><Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="密码"><Input type="password" autoComplete="current-password" required minLength={12} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <FormError error={mutation.error?.message} />
        <SubmitButton pending={mutation.isPending}>登录</SubmitButton>
      </form>
    </AuthCard>
  );
}
