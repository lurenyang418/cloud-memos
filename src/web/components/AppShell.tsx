import { Archive, LogOut, NotebookPen, Settings, Shield, UserRound, UsersRound } from "lucide-react";
import type { PropsWithChildren } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useSession } from "../session";
import { useQueryClient } from "@tanstack/react-query";

function navClass({ isActive }: { isActive: boolean }) {
  return `nav-link ${isActive ? "nav-link-active" : ""}`;
}

export function AppShell({ children }: PropsWithChildren) {
  const { viewer, appName } = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  async function signOut() {
    await api("/api/auth/sign-out", { method: "POST" });
    await queryClient.invalidateQueries({ queryKey: ["session"] });
    await navigate("/login");
  }

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <div>
          <NavLink to="/" className="brand"><span className="brand-mark">M</span><span>{appName}</span></NavLink>
          <nav className="nav-stack" aria-label="主要导航">
            <NavLink to="/" end className={navClass}><NotebookPen size={18} />我的记录</NavLink>
            <NavLink to="/feed" className={navClass}><UsersRound size={18} />成员动态</NavLink>
            <NavLink to="/archive" className={navClass}><Archive size={18} />归档</NavLink>
            <NavLink to={`/u/${viewer.username}`} className={navClass}><UserRound size={18} />公开主页</NavLink>
            <NavLink to="/settings" className={navClass}><Settings size={18} />设置</NavLink>
            {viewer.role === "ADMIN" && <NavLink to="/admin" className={navClass}><Shield size={18} />管理</NavLink>}
          </nav>
        </div>
        <div className="account-card">
          <div className="avatar">{viewer.name.slice(0, 1).toUpperCase()}</div>
          <div className="min-w-0 flex-1"><strong className="block truncate">{viewer.name}</strong><span className="block truncate text-xs text-stone-500">@{viewer.username}</span></div>
          <button className="icon-button" onClick={() => { void signOut(); }} title="退出登录"><LogOut size={17} /></button>
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}
