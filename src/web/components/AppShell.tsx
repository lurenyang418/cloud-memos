import { Archive, LogOut, NotebookPen, PanelLeftClose, PanelLeftOpen, Settings, Shield, UserRound, UsersRound } from "lucide-react";
import { useState, type PropsWithChildren } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { signOutSession } from "../api";
import { useSession } from "../session";
import { useQueryClient } from "@tanstack/react-query";

function navClass({ isActive }: { isActive: boolean }) {
  return `nav-link ${isActive ? "nav-link-active" : ""}`;
}

export function AppShell({ children }: PropsWithChildren) {
  const { viewer, appName } = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => {
    try { return window.localStorage.getItem("cloud-memos:sidebar-collapsed") === "true"; }
    catch { return false; }
  });

  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current;
      try { window.localStorage.setItem("cloud-memos:sidebar-collapsed", String(next)); } catch { /* Storage may be unavailable. */ }
      return next;
    });
  }

  async function signOut() {
    await signOutSession();
    await queryClient.invalidateQueries({ queryKey: ["session"] });
    await navigate("/login");
  }

  return (
    <div className={`app-frame ${collapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar" id="app-sidebar">
        <button className="sidebar-toggle" type="button" onClick={toggleSidebar} aria-controls="app-sidebar" aria-expanded={!collapsed} aria-label={collapsed ? "展开侧边栏" : "折叠侧边栏"} title={collapsed ? "展开侧边栏" : "折叠侧边栏"}>{collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}</button>
        <div>
          <NavLink to="/" className="brand"><span className="brand-mark">M</span><span className="brand-label">{appName}</span></NavLink>
          <nav className="nav-stack" aria-label="主要导航">
            <NavLink to="/" end className={navClass} title="我的记录"><NotebookPen size={18} /><span className="nav-link-label">我的记录</span></NavLink>
            <NavLink to="/feed" className={navClass} title="成员动态"><UsersRound size={18} /><span className="nav-link-label">成员动态</span></NavLink>
            <NavLink to="/archive" className={navClass} title="归档"><Archive size={18} /><span className="nav-link-label">归档</span></NavLink>
            <NavLink to={`/u/${viewer.username}`} className={navClass} title="公开主页"><UserRound size={18} /><span className="nav-link-label">公开主页</span></NavLink>
            <NavLink to="/settings" className={navClass} title="设置"><Settings size={18} /><span className="nav-link-label">设置</span></NavLink>
            {viewer.role === "ADMIN" && <NavLink to="/admin" className={navClass} title="管理"><Shield size={18} /><span className="nav-link-label">管理</span></NavLink>}
          </nav>
        </div>
        <div className="account-card">
          <div className="avatar">{viewer.name.slice(0, 1).toUpperCase()}</div>
          <div className="account-details min-w-0 flex-1"><strong className="block truncate">{viewer.name}</strong><span className="block truncate text-xs text-stone-500">@{viewer.username}</span></div>
          <button className="icon-button" onClick={() => { void signOut(); }} title="退出登录"><LogOut size={17} /></button>
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}
