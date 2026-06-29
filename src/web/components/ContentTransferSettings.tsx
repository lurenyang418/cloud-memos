import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, FolderDown, LoaderCircle, RotateCcw, Upload } from "lucide-react";
import { useRef, useState } from "react";
import type { Viewer } from "../../shared/types";
import { downloadAllMemos } from "../export";
import { importMemosZip } from "../import";
import { FormError } from "./Form";

type TransferMode = "export" | "import";

export function ContentTransferSettings({ viewer }: { viewer: Viewer }) {
  const input = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<TransferMode>("export");
  const [file, setFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function resetStatus(nextMode: TransferMode) {
    setMode(nextMode);
    setMessage("");
    setError("");
  }

  async function exportAll() {
    setRunning(true); setError(""); setMessage("正在读取 Memo…");
    try { await downloadAllMemos(viewer, setMessage); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "导出失败"); }
    finally { setRunning(false); }
  }

  async function importFile(selected: File) {
    setRunning(true); setError(""); setMessage("正在准备导入…");
    try {
      const result = await importMemosZip(selected, setMessage);
      setMessage(`导入完成：新增 ${result.imported} 条，跳过 ${result.skipped} 条。`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["memos"] }),
        queryClient.invalidateQueries({ queryKey: ["feed"] }),
        queryClient.invalidateQueries({ queryKey: ["public-memos"] }),
      ]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "导入失败");
      setMessage("导入中断；修复问题后可重试，已完成的 Memo 会自动跳过。");
    } finally { setRunning(false); }
  }

  function choose(next: File | null) {
    if (!next) return;
    setFile(next);
    void importFile(next);
    if (input.current) input.current.value = "";
  }

  return (
    <section className="settings-card transfer-card">
      <div className="settings-icon"><ArrowLeftRight /></div>
      <div className="settings-content">
        <h2>内容迁移</h2>
        <p>导出完整备份，或从本实例生成的 ZIP 恢复内容。</p>
        <div className="transfer-tabs" role="tablist" aria-label="内容迁移方式">
          <button type="button" role="tab" aria-selected={mode === "export"} className={mode === "export" ? "active" : ""} onClick={() => resetStatus("export")}><FolderDown size={15} />导出</button>
          <button type="button" role="tab" aria-selected={mode === "import"} className={mode === "import" ? "active" : ""} onClick={() => resetStatus("import")}><Upload size={15} />导入</button>
        </div>
        <div className="transfer-panel" role="tabpanel">
          {mode === "export" ? <>
            <div><strong>导出全部内容</strong><p>包含活跃及归档 Memo 的原始 Markdown、元数据和附件。</p></div>
            <button className="button button-secondary" type="button" disabled={running} onClick={() => { void exportAll(); }}>{running ? <LoaderCircle className="animate-spin" size={15} /> : <FolderDown size={15} />}{running ? "正在导出…" : "导出 ZIP"}</button>
          </> : <>
            <div><strong>从 ZIP 导入</strong><p>保留可见性、归档、置顶、时间和附件；重复内容自动跳过。</p></div>
            <input ref={input} className="sr-only" type="file" accept=".zip,application/zip" onChange={(event) => choose(event.target.files?.[0] ?? null)} />
            <div className="transfer-actions">
              <button className="button button-secondary" type="button" disabled={running} onClick={() => input.current?.click()}>{running ? <LoaderCircle className="animate-spin" size={15} /> : <Upload size={15} />}{running ? "正在导入…" : "选择 ZIP"}</button>
              {file && error && <button className="button button-ghost" type="button" disabled={running} onClick={() => { void importFile(file); }}><RotateCcw size={15} />重试</button>}
            </div>
          </>}
        </div>
        {mode === "import" && file && <div className="export-status">文件：{file.name}</div>}
        {message && <div className="export-status" role="status">{message}</div>}
        <FormError error={error} />
      </div>
    </section>
  );
}
