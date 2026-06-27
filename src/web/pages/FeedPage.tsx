import { useInfiniteQuery } from "@tanstack/react-query";
import { Inbox, LoaderCircle, Search, UsersRound, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { listFeed } from "../api";
import { MemoCard } from "../components/MemoCard";
import { useSession } from "../session";

export function FeedPage() {
  const { viewer } = useSession();
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [visibility, setVisibility] = useState("");
  const memos = useInfiniteQuery({
    queryKey: ["feed", query, tag, visibility],
    queryFn: ({ pageParam }) => listFeed({ q: query || undefined, tag: tag || undefined, visibility: visibility || undefined, cursor: pageParam }),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = memos.data?.pages.flatMap((page) => page.items) ?? [];
  function search(event: FormEvent) { event.preventDefault(); setQuery(searchInput.trim()); }

  return (
    <div className="page-column">
      <header className="page-header"><div><span className="eyebrow">实例成员</span><h1>成员动态</h1><p>查看成员共享和公开发布的 Memo。</p></div><UsersRound className="page-header-icon" /></header>
      <section className="filter-bar">
        <form className="search-box" onSubmit={search}><Search size={17} /><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="搜索成员内容…" /><button type="submit" className="sr-only">搜索</button></form>
        <select className="filter-select" value={visibility} onChange={(event) => setVisibility(event.target.value)}><option value="">全部共享内容</option><option value="MEMBERS">实例成员</option><option value="PUBLIC">公开</option></select>
        {tag && <button className="filter-chip" onClick={() => setTag("")}>#{tag}<X size={13} /></button>}
        {query && <button className="filter-chip" onClick={() => { setQuery(""); setSearchInput(""); }}>“{query}”<X size={13} /></button>}
      </section>
      {memos.isPending ? <div className="loading-panel"><LoaderCircle className="animate-spin" />加载中</div> : memos.isError ? <div className="form-error">{memos.error.message}</div> : items.length === 0 ? (
        <div className="empty-state"><Inbox /><h2>还没有共享内容</h2><p>成员发布为“实例成员”或“公开”的 Memo 会出现在这里。</p></div>
      ) : <div className="memo-list">{items.map((memo) => <MemoCard key={memo.id} memo={memo} editable={memo.author.id === viewer.id} onTag={setTag} />)}</div>}
      {memos.hasNextPage && <button className="button button-secondary load-more" disabled={memos.isFetchingNextPage} onClick={() => { void memos.fetchNextPage(); }}>{memos.isFetchingNextPage ? "加载中…" : "加载更多"}</button>}
    </div>
  );
}
