import { useInfiniteQuery } from "@tanstack/react-query";
import { ArrowLeft, Inbox, LoaderCircle } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import type { CursorPage, Memo, Viewer } from "../../shared/types";
import { api } from "../api";
import { MemoCard } from "../components/MemoCard";

interface PublicPage extends CursorPage<Memo> {
  profile: { id: string; name: string; username: string; image: string | null };
}

export function PublicProfilePage({ viewer, appName }: { viewer: Viewer | null; appName: string }) {
  const { username = "" } = useParams();
  const query = useInfiniteQuery({
    queryKey: ["public-memos", username, Boolean(viewer)],
    queryFn: ({ pageParam }) => api<PublicPage>(`/api/v1/public/users/${username}/memos?${new URLSearchParams(pageParam ? { cursor: pageParam } : {})}`),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(username), retry: false,
  });
  const profile = query.data?.pages[0]?.profile;
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <main className="public-page">
      <header className="public-nav"><Link className="brand" to="/"><span className="brand-mark">M</span>{appName}</Link><Link className="button button-ghost" to={viewer ? "/" : "/login"}><ArrowLeft size={16} />{viewer ? "返回应用" : "登录"}</Link></header>
      <div className="public-column">
        {query.isPending ? <div className="loading-panel"><LoaderCircle className="animate-spin" />加载中</div> : query.isError ? <div className="empty-state"><h1>无法打开主页</h1><p>{query.error.message}</p></div> : <>
          <section className="profile-hero"><div className="avatar avatar-hero">{profile?.name.slice(0, 1).toUpperCase()}</div><div><span className="eyebrow">公开主页</span><h1>{profile?.name}</h1><p>@{profile?.username}{viewer ? " · 你可以看到成员内容" : ""}</p></div></section>
          {items.length === 0 ? <div className="empty-state"><Inbox /><h2>暂无公开内容</h2></div> : <div className="memo-list">{items.map((memo) => <MemoCard key={memo.id} memo={memo} editable={memo.author.id === viewer?.id} />)}</div>}
          {query.hasNextPage && <button className="button button-secondary load-more" disabled={query.isFetchingNextPage} onClick={() => { void query.fetchNextPage(); }}>加载更多</button>}
        </>}
      </div>
    </main>
  );
}
