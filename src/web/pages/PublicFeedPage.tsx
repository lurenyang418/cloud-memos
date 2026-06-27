import { useInfiniteQuery } from "@tanstack/react-query";
import { ArrowRight, Inbox, LoaderCircle, LogIn, Search, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { PublicContact } from "../../shared/types";
import { listPublicMemos } from "../api";
import { MemoCard } from "../components/MemoCard";

export function PublicFeedPage({ appName, contact }: { appName: string; contact: PublicContact | null }) {
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const memos = useInfiniteQuery({
    queryKey: ["public-feed", query, tag],
    queryFn: ({ pageParam }) => listPublicMemos({ q: query || undefined, tag: tag || undefined, cursor: pageParam }),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = memos.data?.pages.flatMap((page) => page.items) ?? [];
  function search(event: FormEvent) { event.preventDefault(); setQuery(searchInput.trim()); }

  return (
    <main className="public-page">
      <header className="public-nav">
        <Link className="brand" to="/"><span className="brand-mark">M</span>{appName}</Link>
        <div className="public-nav-actions">
          {contact && <a className="button button-secondary" href={contact.url} target={contact.url.startsWith("https:") ? "_blank" : undefined} rel="noreferrer"><ArrowRight size={16} />{contact.label}</a>}
          <Link className="button button-primary" to="/login"><LogIn size={16} />登录</Link>
        </div>
      </header>
      <div className="public-column public-feed-column">
        <section className="public-feed-hero">
          <h1>公开动态</h1>
          <p>成员公开发布的记录 · 本站采用邀请制{contact ? `，如需加入可点击“${contact.label}”` : ""}</p>
        </section>
        <section className="filter-bar">
          <form className="search-box" onSubmit={search}><Search size={17} /><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="搜索公开内容…" /><button type="submit" className="sr-only">搜索</button></form>
          {tag && <button className="filter-chip" onClick={() => setTag("")}>#{tag}<X size={13} /></button>}
          {query && <button className="filter-chip" onClick={() => { setQuery(""); setSearchInput(""); }}>“{query}”<X size={13} /></button>}
        </section>
        {memos.isPending ? <div className="loading-panel"><LoaderCircle className="animate-spin" />加载中</div> : memos.isError ? <div className="form-error">{memos.error.message}</div> : items.length === 0 ? (
          <div className="empty-state"><Inbox /><h2>还没有公开内容</h2><p>成员发布为“公开”的 Memo 会出现在这里。</p></div>
        ) : <div className="memo-list">{items.map((memo) => <MemoCard key={memo.id} memo={memo} onTag={setTag} />)}</div>}
        {memos.hasNextPage && <button className="button button-secondary load-more" disabled={memos.isFetchingNextPage} onClick={() => { void memos.fetchNextPage(); }}>{memos.isFetchingNextPage ? "加载中…" : "加载更多"}</button>}
      </div>
    </main>
  );
}
