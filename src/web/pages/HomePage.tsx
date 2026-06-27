import { useInfiniteQuery } from "@tanstack/react-query";
import { Archive, Inbox, LoaderCircle, Search, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { listMemos } from "../api";
import { Composer } from "../components/Composer";
import { MemoCard } from "../components/MemoCard";

export function HomePage({ archived = false }: { archived?: boolean }) {
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [visibility, setVisibility] = useState("");
  const memos = useInfiniteQuery({
    queryKey: ["memos", archived ? "ARCHIVED" : "ACTIVE", query, tag, visibility],
    queryFn: ({ pageParam }) => listMemos({ state: archived ? "ARCHIVED" : "ACTIVE", q: query || undefined, tag: tag || undefined, visibility: visibility || undefined, cursor: pageParam }),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = memos.data?.pages.flatMap((page) => page.items) ?? [];
  function search(event: FormEvent) { event.preventDefault(); setQuery(searchInput.trim()); }
  return (
    <div className="page-column">
      <header className="page-header"><div><span className="eyebrow">{archived ? "稍后再看" : "个人时间线"}</span><h1>{archived ? "归档" : "我的记录"}</h1><p>{archived ? "这里的内容不会出现在日常时间线中。" : "快速写下，然后继续前进。"}</p></div></header>
      {!archived && <Composer />}
      <section className="filter-bar">
        <form className="search-box" onSubmit={search}><Search size={17} /><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="搜索内容…" /><button type="submit" className="sr-only">搜索</button></form>
        <select className="filter-select" value={visibility} onChange={(event) => setVisibility(event.target.value)}><option value="">全部可见性</option><option value="PRIVATE">仅自己</option><option value="MEMBERS">实例成员</option><option value="PUBLIC">公开</option></select>
        {tag && <button className="filter-chip" onClick={() => setTag("")}>#{tag}<X size={13} /></button>}
        {query && <button className="filter-chip" onClick={() => { setQuery(""); setSearchInput(""); }}>“{query}”<X size={13} /></button>}
      </section>
      {memos.isPending ? <div className="loading-panel"><LoaderCircle className="animate-spin" />加载中</div> : memos.isError ? <div className="form-error">{memos.error.message}</div> : items.length === 0 ? (
        <div className="empty-state">{archived ? <Archive /> : <Inbox />}<h2>{archived ? "还没有归档内容" : "时间线还是空的"}</h2><p>{query || tag ? "换个筛选条件试试。" : archived ? "归档的 Memo 会出现在这里。" : "在上方写下第一条 Memo。"}</p></div>
      ) : <div className="memo-list">{items.map((memo) => <MemoCard key={memo.id} memo={memo} editable onTag={setTag} />)}</div>}
      {memos.hasNextPage && <button className="button button-secondary load-more" disabled={memos.isFetchingNextPage} onClick={() => { void memos.fetchNextPage(); }}>{memos.isFetchingNextPage ? "加载中…" : "加载更多"}</button>}
    </div>
  );
}
