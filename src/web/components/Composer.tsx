import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FilePlus2, Paperclip, Send, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Memo, MemoVisibility } from "../../shared/types";
import { api, formatBytes } from "../api";
import { useSession } from "../session";
import { FormError, Textarea } from "./Form";
import { VisibilitySelect } from "./VisibilitySelect";

interface PendingUpload {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  status: "PENDING";
  uploadUrl: string;
}

export function Composer() {
  const { viewer } = useSession();
  const draftKey = `cloud-memos:draft:${viewer.id}:new`;
  const [content, setContent] = useState(() => localStorage.getItem(draftKey) ?? "");
  const [visibility, setVisibility] = useState<MemoVisibility>("PRIVATE");
  const [files, setFiles] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (content) localStorage.setItem(draftKey, content);
      else localStorage.removeItem(draftKey);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [content, draftKey]);

  const mutation = useMutation({
    mutationFn: async () => {
      const attachmentIds: string[] = [];
      for (const file of files) {
        const pending = await api<PendingUpload>("/api/v1/attachments", {
          method: "POST",
          body: JSON.stringify({ filename: file.name, contentType: file.type || "application/octet-stream", size: file.size }),
        });
        await api(pending.uploadUrl, { method: "PUT", headers: { "content-type": file.type || "application/octet-stream" }, body: file });
        attachmentIds.push(pending.id);
      }
      return api<Memo>("/api/v1/memos", { method: "POST", body: JSON.stringify({ content, visibility, attachmentIds }) });
    },
    onSuccess: () => {
      setContent(""); setFiles([]); localStorage.removeItem(draftKey);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["memos"] }),
        queryClient.invalidateQueries({ queryKey: ["feed"] }),
        queryClient.invalidateQueries({ queryKey: ["public-memos"] }),
      ]);
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (content.trim()) mutation.mutate();
  }

  function addFiles(next: FileList | null) {
    if (!next) return;
    setFiles((current) => [...current, ...Array.from(next)].slice(0, 20));
    if (fileInput.current) fileInput.current.value = "";
  }

  return (
    <form className="composer" onSubmit={submit}>
      <Textarea
        className="composer-input"
        aria-label="写一条 Memo"
        placeholder="此刻在想什么？支持 Markdown 和 #标签"
        value={content}
        maxLength={100_000}
        onChange={(event) => setContent(event.target.value)}
      />
      {files.length > 0 && <div className="upload-list">{files.map((file, index) => (
        <div className="upload-chip" key={`${file.name}-${index}`}><Paperclip size={14} /><span>{file.name}</span><small>{formatBytes(file.size)}</small><button type="button" onClick={() => setFiles((items) => items.filter((_, itemIndex) => itemIndex !== index))}><X size={13} /></button></div>
      ))}</div>}
      <FormError error={mutation.error?.message} />
      <div className="composer-toolbar">
        <div className="flex items-center gap-2">
          <VisibilitySelect value={visibility} onChange={setVisibility} />
          <input ref={fileInput} type="file" className="sr-only" multiple onChange={(event) => addFiles(event.target.files)} />
          <button type="button" className="button button-ghost" onClick={() => fileInput.current?.click()}><FilePlus2 size={16} />附件</button>
        </div>
        <button className="button button-primary" type="submit" disabled={!content.trim() || mutation.isPending}><Send size={16} />{mutation.isPending ? "发布中…" : "发布"}</button>
      </div>
    </form>
  );
}
