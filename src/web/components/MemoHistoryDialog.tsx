import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import type { Memo, MemoVersion } from "../../shared/types";
import { api } from "../api";
import { FormError } from "./Form";

const formatter = new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" });

export function MemoHistoryDialog({ memo }: { memo: Memo }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const history = useQuery({
    queryKey: ["memo-versions", memo.id],
    queryFn: () => api<{ items: MemoVersion[] }>(`/api/v1/memos/${memo.id}/versions`),
    enabled: open,
  });
  const restore = useMutation({
    mutationFn: (targetVersion: number) => api<Memo>(`/api/v1/memos/${memo.id}/versions/${targetVersion}/restore`, { method: "POST", body: JSON.stringify({ version: memo.version }) }),
    onSuccess: async () => {
      setOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["memos"] }),
        queryClient.invalidateQueries({ queryKey: ["memo", memo.id] }),
        queryClient.invalidateQueries({ queryKey: ["memo-versions", memo.id] }),
        queryClient.invalidateQueries({ queryKey: ["feed"] }),
        queryClient.invalidateQueries({ queryKey: ["public-memos"] }),
      ]);
    },
  });
  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger asChild><button className="action-button" type="button"><History size={15} />历史</button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content history-dialog">
      <Dialog.Close className="dialog-close"><X size={18} /></Dialog.Close>
      <Dialog.Title>版本历史</Dialog.Title>
      <Dialog.Description>每次编辑前会保存一个版本，可恢复正文、可见性和归档状态。</Dialog.Description>
      <FormError error={history.error?.message ?? restore.error?.message} />
      {history.isPending ? <div className="loading-panel">加载中</div> : history.data?.items.length ? <div className="history-list">{history.data.items.map((item) => <div className="history-item" key={item.id}>
        <div><strong>版本 {item.version}</strong><span>{formatter.format(item.createdAt)}</span></div>
        <pre>{item.content}</pre>
        <button className="button button-secondary" type="button" disabled={restore.isPending} onClick={() => restore.mutate(item.version)}><RotateCcw size={14} />恢复此版本</button>
      </div>)}</div> : <div className="placeholder-panel">编辑后，旧版本会显示在这里</div>}
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}
