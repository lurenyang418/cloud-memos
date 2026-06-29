import * as Dialog from "@radix-ui/react-dialog";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Trash2, X } from "lucide-react";
import type { Memo } from "../../shared/types";
import { api, listMemos } from "../api";
import { FormError } from "../components/Form";
import { Markdown } from "../components/Markdown";

const formatter = new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" });

function TrashMemo({ memo }: { memo: Memo }) {
  const queryClient = useQueryClient();
  const refreshTrash = () => queryClient.invalidateQueries({ queryKey: ["trash"] });
  const restore = useMutation({
    mutationFn: () => api(`/api/v1/memos/${memo.id}/restore`, { method: "POST" }),
    onSuccess: async () => {
      await Promise.all([
        refreshTrash(),
        queryClient.invalidateQueries({ queryKey: ["memos"] }),
        queryClient.invalidateQueries({ queryKey: ["feed"] }),
        queryClient.invalidateQueries({ queryKey: ["public-memos"] }),
      ]);
    },
  });
  const remove = useMutation({ mutationFn: () => api(`/api/v1/memos/${memo.id}/permanent`, { method: "DELETE" }), onSuccess: refreshTrash });
  return <article className="memo-card trash-card">
    <header className="trash-card-header"><div><strong>{memo.state === "ARCHIVED" ? "原归档内容" : "原时间线内容"}</strong><span>{memo.deletedAt ? `${formatter.format(memo.deletedAt)} 删除` : "已删除"}</span></div><div className="flex gap-2"><button className="button button-secondary" disabled={restore.isPending} onClick={() => restore.mutate()}><RotateCcw size={14} />恢复</button><Dialog.Root><Dialog.Trigger asChild><button className="button button-ghost danger"><Trash2 size={14} />永久删除</button></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content"><Dialog.Close className="dialog-close"><X size={18} /></Dialog.Close><Dialog.Title>永久删除这条 Memo？</Dialog.Title><Dialog.Description>正文、历史版本及附件都会被删除，无法恢复。</Dialog.Description><FormError error={remove.error?.message} /><div className="dialog-actions"><Dialog.Close className="button button-ghost">取消</Dialog.Close><button className="button button-danger" disabled={remove.isPending} onClick={() => remove.mutate()}>永久删除</button></div></Dialog.Content></Dialog.Portal></Dialog.Root></div></header>
    <Markdown>{memo.content}</Markdown>
  </article>;
}

export function TrashPage() {
  const trash = useInfiniteQuery({
    queryKey: ["trash"],
    queryFn: ({ pageParam }) => listMemos({ deleted: true, cursor: pageParam }),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = trash.data?.pages.flatMap((page) => page.items) ?? [];
  return <div className="page-column">
    <header className="page-header"><div><span className="eyebrow">保留 30 天</span><h1>回收站</h1><p>恢复误删内容，或立即永久删除。</p></div></header>
    {trash.isPending ? <div className="loading-panel">加载中</div> : trash.isError ? <FormError error={trash.error.message} /> : items.length === 0 ? <div className="empty-state"><Trash2 /><h2>回收站为空</h2><p>删除的 Memo 会在这里保留 30 天。</p></div> : <div className="memo-list">{items.map((memo) => <TrashMemo key={memo.id} memo={memo} />)}</div>}
    {trash.hasNextPage && <button className="button button-secondary load-more" onClick={() => { void trash.fetchNextPage(); }}>加载更多</button>}
  </div>;
}
