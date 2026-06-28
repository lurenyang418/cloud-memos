import { useState } from "react";
import { Field, Input } from "./Form";

const usernamePattern = "[a-z0-9_]+";

function usernameError(value: string): string | null {
  if (!value) return "请输入用户名";
  if (value.length < 3) return "用户名至少需要 3 个字符";
  if (value.length > 10) return "用户名不能超过 10 个字符";
  if (!new RegExp(`^${usernamePattern}$`).test(value)) return "只能使用小写字母、数字和 _";
  return null;
}

export function UsernameField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [touched, setTouched] = useState(false);
  const error = touched ? usernameError(value) : null;

  return (
    <Field label="用户名" hint="3–10 位；仅限 a–z、数字和 _。大写自动转为小写。">
      <Input
        name="username"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        minLength={3}
        maxLength={10}
        pattern={usernamePattern}
        title="请输入 3–10 个字符，只能使用小写字母、数字和 _"
        value={value}
        aria-invalid={Boolean(error)}
        onBlur={() => setTouched(true)}
        onInvalid={(event) => {
          setTouched(true);
          event.currentTarget.setCustomValidity(usernameError(event.currentTarget.value) ?? "");
        }}
        onChange={(event) => {
          event.currentTarget.setCustomValidity("");
          onChange(event.currentTarget.value.toLowerCase());
        }}
      />
      {error && <span className="field-error" role="alert">{error}</span>}
    </Field>
  );
}
