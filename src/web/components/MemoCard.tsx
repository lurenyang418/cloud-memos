import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Copy, Download, FileDown, Pencil, Pin, PinOff, Trash2, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { Memo, MemoVisibility } from "../../shared/types";
import { ApiError, api, formatBytes, getMemo } from "../api";
import { FormError, Textarea } from "./Form";
import { downloadMemoMarkdown } from "../export";
import { Markdown } from "./Markdown";
import { VisibilityBadge, VisibilitySelect } from "./VisibilitySelect";

const memoDateFormatter = new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
function formatDate(value: number) { return memoDateFormatter.format(value); }

export function MemoCard({ memo, editable = false, onTag }: { memo: Memo; editable?: boolean; onTag?: (tag: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(memo.content);
  const [visibility, setVisibility] = useState<MemoVisibility>(memo.visibility);
  const [version, setVersion] = useState(memo.version);
  const [conflictMessage, setConflictMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!editing && memo.version >= version) {
      setContent(memo.content);
      setVersion(memo.version);
    }
  }, [editing, memo.content, memo.version, version]);
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["memos"] }),
      queryClient.invalidateQueries({ queryKey: ["feed"] }),
      queryClient.invalidateQueries({ queryKey: ["memo", memo.id] }),
      queryClient.invalidateQueries({ queryKey: ["public-memos"] }),
    ]);
  };
  const update = useMutation({
    mutationFn: (patch: Record<string, unknown>) => api<Memo>(`/api/v1/memos/${memo.id}`, { method: "PATCH", body: JSON.stringify({ ...patch, version: editing ? version : memo.version }) }),
    onMutate: () => setConflictMessage(""),
    onSuccess: async (updated) => {
      setVersion(updated.version);
      setContent(updated.content);
      setVisibility(updated.visibility);
      setEditing(false);
      await invalidate();
    },
    onError: async (error) => {
      if (!(error instanceof ApiError) || error.code !== "VERSION_CONFLICT") return;
      const currentVersion = typeof error.details === "object" && error.details !== null && "currentVersion" in error.details
        ? Number(error.details.currentVersion)
        : NaN;
      if (Number.isSafeInteger(currentVersion) && currentVersion > 0) setVersion(currentVersion);
      else {
        const latest = await getMemo(memo.id);
        setVersion(latest.version);
      }
      setConflictMessage("这条 Memo 刚刚在其他位置更新。已同步最新版本，你的编辑内容仍然保留；确认后可再次保存。");
      await invalidate();
    },
  });
  const remove = useMutation({ mutationFn: () => api(`/api/v1/memos/${memo.id}`, { method: "DELETE" }), onSuccess: invalidate });

  function startEditing() {
    setContent(memo.content);
    setVisibility(memo.visibility);
    setVersion(memo.version);
    setConflictMessage("");
    update.reset();
    setEditing(true);
  }

  function submitEdit(event: FormEvent) { event.preventDefault(); update.mutate({ content, visibility }); }
  async function copyLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/m/${memo.id}`);
    setCopied(true); window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <article className={`memo-card ${memo.pinned ? "memo-pinned" : ""}`}>
      <header className="memo-header">
        <Link to={`/u/${memo.author.username}`} className="memo-author"><span className="avatar avatar-small">{memo.author.name.slice(0, 1).toUpperCase()}</span><span><strong>{memo.author.name}</strong><small>@{memo.author.username}</small></span></Link>
        <div className="memo-meta"><VisibilityBadge visibility={memo.visibility} /><Link to={`/m/${memo.id}`}>{formatDate(memo.createdAt)}</Link>{memo.pinned && <span className="meta-item accent"><Pin size={13} />置顶</span>}</div>
      </header>
      {editing ? (
        <form className="edit-form" onSubmit={submitEdit}>
          <Textarea value={content} required maxLength={100_000} onChange={(event) => setContent(event.target.value)} />
          {conflictMessage && <div className="conflict-notice" role="status">{conflictMessage}</div>}
          <FormError error={update.error instanceof ApiError && update.error.code === "VERSION_CONFLICT" ? null : update.error?.message} />
          <div className="flex items-center justify-between"><VisibilitySelect value={visibility} onChange={setVisibility} /><div className="flex gap-2"><button className="button button-ghost" type="button" onClick={() => setEditing(false)}>取消</button><button className="button button-primary" disabled={update.isPending}>保存</button></div></div>
        </form>
      ) : <Markdown>{content}</Markdown>}
      {memo.attachments.length > 0 && <div className="attachments-grid">{memo.attachments.map((attachment) => attachment.contentType.startsWith("image/") && attachment.contentType !== "image/svg+xml" ? (
        <a key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer" className="image-attachment"><img src={attachment.url} alt={attachment.filename} loading="lazy" /><span>{attachment.filename}</span></a>
      ) : (
        <a key={attachment.id} className="file-attachment" href={attachment.url}><Download size={18} /><span><strong>{attachment.filename}</strong><small>{formatBytes(attachment.size)}</small></span></a>
      ))}</div>}
      {memo.tags.length > 0 && <div className="tag-list">{memo.tags.map((tag) => <button key={tag} type="button" onClick={() => onTag?.(tag)}>#{tag}</button>)}</div>}
      <footer className="memo-actions">
        <button className="action-button" type="button" onClick={() => { void copyLink(); }}><Copy size={15} />{copied ? "已复制" : "分享"}</button>
        <button className="action-button" type="button" onClick={() => downloadMemoMarkdown({ ...memo, content })}><FileDown size={15} />导出 Markdown</button>
        {editable && <>
          <button className="action-button" type="button" onClick={startEditing}><Pencil size={15} />编辑</button>
          <button className="action-button" type="button" disabled={update.isPending} onClick={() => update.mutate({ pinned: !memo.pinned })}>{memo.pinned ? <PinOff size={15} /> : <Pin size={15} />}{memo.pinned ? "取消置顶" : "置顶"}</button>
          <button className="action-button" type="button" disabled={update.isPending} onClick={() => update.mutate({ state: memo.state === "ARCHIVED" ? "ACTIVE" : "ARCHIVED" })}>{memo.state === "ARCHIVED" ? <ArchiveRestore size={15} /> : <Archive size={15} />}{memo.state === "ARCHIVED" ? "恢复" : "归档"}</button>
          <Dialog.Root>
            <Dialog.Trigger asChild><button className="action-button danger" type="button"><Trash2 size={15} />删除</button></Dialog.Trigger>
            <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content"><Dialog.Close className="dialog-close"><X size={18} /></Dialog.Close><Dialog.Title>永久删除这条 Memo？</Dialog.Title><Dialog.Description>内容及其附件将被删除，此操作无法撤销。</Dialog.Description><FormError error={remove.error?.message} /><div className="dialog-actions"><Dialog.Close className="button button-ghost">取消</Dialog.Close><button className="button button-danger" disabled={remove.isPending} onClick={() => remove.mutate()}>确认删除</button></div></Dialog.Content></Dialog.Portal>
          </Dialog.Root>
        </>}
      </footer>
    </article>
  );
}
