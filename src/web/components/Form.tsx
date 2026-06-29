import { forwardRef, type InputHTMLAttributes, type PropsWithChildren, type ReactNode, type TextareaHTMLAttributes } from "react";

export function Field({ label, hint, children }: PropsWithChildren<{ label: string; hint?: string }>) {
  return <label className="field"><span className="field-label">{label}</span>{children}{hint && <span className="field-hint">{hint}</span>}</label>;
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...inputProps } = props;
  return <input className={`input ${className}`.trim()} {...inputProps} />;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(props, ref) {
  const { className = "", ...textareaProps } = props;
  return <textarea ref={ref} className={`textarea ${className}`.trim()} {...textareaProps} />;
});

export function SubmitButton({ pending, children }: PropsWithChildren<{ pending?: boolean }>) {
  return <button className="button button-primary w-full" type="submit" disabled={pending}>{pending ? "请稍候…" : children}</button>;
}

export function FormError({ error }: { error: ReactNode }) {
  return error ? <div className="form-error" role="alert">{error}</div> : null;
}
