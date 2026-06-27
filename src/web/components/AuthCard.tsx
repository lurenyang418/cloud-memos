import type { PropsWithChildren, ReactNode } from "react";

export function AuthCard({ appName, eyebrow, title, subtitle, children, footer }: PropsWithChildren<{
  appName: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  footer?: ReactNode;
}>) {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand justify-center"><span className="brand-mark">M</span><span>{appName}</span></div>
        <div className="auth-heading"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{subtitle}</p></div>
        {children}
        {footer && <div className="auth-footer">{footer}</div>}
      </section>
    </main>
  );
}
