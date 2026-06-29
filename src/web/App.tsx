import { useQuery } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { getSession, type SessionResponse } from "./api";
import { AppShell } from "./components/AppShell";
import { AdminPage } from "./pages/AdminPage";
import { FeedPage } from "./pages/FeedPage";
import { HomePage } from "./pages/HomePage";
import { InvitePage } from "./pages/InvitePage";
import { LoginPage } from "./pages/LoginPage";
import { MemoPage } from "./pages/MemoPage";
import { PublicProfilePage } from "./pages/PublicProfilePage";
import { PublicFeedPage } from "./pages/PublicFeedPage";
import { RecoveryPage } from "./pages/RecoveryPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SetupPage } from "./pages/SetupPage";
import { SessionContext } from "./session";

function LoadingScreen() {
  return <div className="grid min-h-screen place-items-center text-stone-500"><LoaderCircle className="animate-spin" size={28} /></div>;
}

function ProtectedRoutes({ session }: { session: SessionResponse }) {
  const location = useLocation();
  if (!session.viewer) {
    if (location.pathname === "/") return <PublicFeedPage appName={session.appName} contact={session.publicContact} />;
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return (
    <SessionContext.Provider value={{ ...session, viewer: session.viewer }}>
      <AppShell>
        <Routes>
          <Route index element={<HomePage />} />
          <Route path="feed" element={<FeedPage />} />
          <Route path="archive" element={<HomePage archived />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="admin" element={session.viewer.role === "ADMIN" ? <AdminPage /> : <Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </SessionContext.Provider>
  );
}

export function App() {
  const sessionQuery = useQuery({ queryKey: ["session"], queryFn: getSession });
  const appName = sessionQuery.data?.appName;
  useEffect(() => {
    if (appName) document.title = appName;
  }, [appName]);
  if (sessionQuery.isPending) return <LoadingScreen />;
  if (sessionQuery.isError) return <div className="error-screen">无法连接服务：{sessionQuery.error.message}</div>;
  const session = sessionQuery.data;

  return (
    <Routes>
      <Route path="/setup" element={session.setupRequired ? <SetupPage appName={session.appName} /> : <Navigate to="/" replace />} />
      <Route path="/login" element={session.viewer ? <Navigate to="/" replace /> : session.setupRequired ? <Navigate to="/setup" replace /> : <LoginPage appName={session.appName} />} />
      <Route path="/invite/:token" element={<InvitePage appName={session.appName} />} />
      <Route path="/recover/:token" element={<RecoveryPage appName={session.appName} />} />
      <Route path="/u/:username" element={<PublicProfilePage viewer={session.viewer} appName={session.appName} />} />
      <Route path="/m/:id" element={<MemoPage viewer={session.viewer} appName={session.appName} />} />
      <Route path="/*" element={<ProtectedRoutes session={session} />} />
    </Routes>
  );
}
