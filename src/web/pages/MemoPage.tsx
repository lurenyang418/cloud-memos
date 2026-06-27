import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import type { Viewer } from "../../shared/types";
import { getMemo } from "../api";
import { MemoCard } from "../components/MemoCard";

export function MemoPage({ viewer, appName }: { viewer: Viewer | null; appName: string }) {
  const { id = "" } = useParams();
  const memo = useQuery({ queryKey: ["memo", id], queryFn: () => getMemo(id), enabled: Boolean(id), retry: false });
  return (
    <main className="public-page">
      <header className="public-nav"><Link className="brand" to="/"><span className="brand-mark">M</span>{appName}</Link><Link className="button button-ghost" to={viewer ? "/" : "/login"}><ArrowLeft size={16} />{viewer ? "返回时间线" : "登录"}</Link></header>
      <div className="public-column">
        {memo.isPending ? <div className="loading-panel"><LoaderCircle className="animate-spin" />加载中</div> : memo.isError ? <div className="empty-state"><h1>无法打开 Memo</h1><p>{memo.error.message}</p></div> : <MemoCard memo={memo.data} editable={memo.data.author.id === viewer?.id} />}
      </div>
    </main>
  );
}
