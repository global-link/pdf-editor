import { useRef, useState } from "react";
import { PDFUploader } from "./components/PDFUploader";
import { PageGrid } from "./components/PageGrid";
import type { PageState } from "./components/PageGrid";
import { Toolbar } from "./components/Toolbar";
import { PageEditor } from "./components/PageEditor";
import {
  addWatermark, deletePages, mergePDFs,
  reorderPages, rotatePages, uploadPDF,
} from "./api/pdf";
import "./App.css";

interface DocState {
  fileId: string;
  pageCount: number;
  filename: string;
}

export default function App() {
  const [doc, setDoc] = useState<DocState | null>(null);
  const [pages, setPages] = useState<PageState[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [editingPage, setEditingPage] = useState<number | null>(null);
  const extraInputRef = useRef<HTMLInputElement>(null);

  // ── helpers ────────────────────────────────────────────────────────────────

  const initPages = (pageCount: number): PageState[] =>
    Array.from({ length: pageCount }, (_, i) => ({ originalIndex: i, rotation: 0 }));

  const withBusy = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e) { alert(String(e)); } finally { setBusy(false); }
  };

  // ── upload ─────────────────────────────────────────────────────────────────

  const handleUploaded = (fileId: string, pageCount: number, filename: string) => {
    setDoc({ fileId, pageCount, filename });
    setPages(initPages(pageCount));
    setSelected(new Set());
  };

  // ── delete selected ────────────────────────────────────────────────────────

  const handleDeleteSelected = () =>
    withBusy(async () => {
      if (!doc) return;
      const keep = pages
        .filter((p) => !selected.has(p.originalIndex))
        .map((p) => p.originalIndex);
      const res = await deletePages(doc.fileId, keep);
      setDoc({ ...doc, fileId: res.file_id, pageCount: res.page_count });
      setPages(initPages(res.page_count));
      setSelected(new Set());
    });

  // ── apply rotations ────────────────────────────────────────────────────────

  const hasRotations = pages.some((p) => p.rotation !== 0);

  const handleApplyRotations = () =>
    withBusy(async () => {
      if (!doc) return;
      const rotations: Record<number, number> = {};
      pages.forEach((p) => { if (p.rotation !== 0) rotations[p.originalIndex] = p.rotation; });
      const res = await rotatePages(doc.fileId, rotations);
      setDoc({ ...doc, fileId: res.file_id, pageCount: res.page_count });
      setPages(initPages(res.page_count));
    });

  // ── apply reorder ──────────────────────────────────────────────────────────

  const currentOrder = pages.map((p) => p.originalIndex);
  const hasReorder = currentOrder.some((v, i) => v !== i);

  const handleApplyReorder = () =>
    withBusy(async () => {
      if (!doc) return;
      const order = pages.map((p) => p.originalIndex);
      const res = await reorderPages(doc.fileId, order);
      setDoc({ ...doc, fileId: res.file_id, pageCount: res.page_count });
      setPages(initPages(res.page_count));
    });

  // ── watermark ──────────────────────────────────────────────────────────────

  const handleWatermark = (text: string) =>
    withBusy(async () => {
      if (!doc) return;
      const res = await addWatermark(doc.fileId, text);
      setDoc({ ...doc, fileId: res.file_id, pageCount: res.page_count });
      setPages(initPages(res.page_count));
    });

  // ── add more PDFs ──────────────────────────────────────────────────────────

  const handleAddMoreFiles = () => extraInputRef.current?.click();

  const handleExtraFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !doc) return;
    setBusy(true);
    try {
      const uploaded = await uploadPDF(file);
      const res = await mergePDFs([doc.fileId, uploaded.file_id]);
      setDoc({ ...doc, fileId: res.file_id, pageCount: res.page_count });
      setPages(initPages(res.page_count));
    } catch (err) {
      alert(String(err));
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  // ── editor save callback (editor stays open) ──────────────────────────────

  const handleEditorSave = (fileId: string, pageCount: number) => {
    if (!doc) return;
    // Update the parent doc so the grid + download reflect the latest file,
    // but do NOT close the editor (setEditingPage stays as-is).
    setDoc({ ...doc, fileId, pageCount });
    setPages(initPages(pageCount));
  };

  // ── render ─────────────────────────────────────────────────────────────────

  // Full-screen editor overlay
  if (doc && editingPage !== null) {
    return (
      <PageEditor
        fileId={doc.fileId}
        pageIndex={editingPage}
        totalPages={doc.pageCount}
        onSave={handleEditorSave}
        onClose={() => setEditingPage(null)}
      />
    );
  }

  return (
    <div className="app">
      <header className="header">
        <h1>PDF Editor</h1>
        {doc && <span className="filename">{doc.filename}</span>}
        {doc && (
          <button
            className="btn secondary small"
            onClick={() => { setDoc(null); setPages([]); setSelected(new Set()); }}
          >
            Close
          </button>
        )}
      </header>

      {!doc ? (
        <div className="center">
          <PDFUploader onUploaded={handleUploaded} loading={busy} />
        </div>
      ) : (
        <>
          <Toolbar
            fileId={doc.fileId}
            selectedCount={selected.size}
            totalPages={doc.pageCount}
            onDeleteSelected={handleDeleteSelected}
            onApplyRotations={handleApplyRotations}
            onApplyReorder={handleApplyReorder}
            onAddWatermark={handleWatermark}
            onAddMoreFiles={handleAddMoreFiles}
            busy={busy}
            hasRotations={hasRotations}
            hasReorder={hasReorder}
          />
          {busy && <div className="busy-bar">Processing…</div>}
          <PageGrid
            fileId={doc.fileId}
            pages={pages}
            selected={selected}
            onPagesChange={setPages}
            onSelectionChange={setSelected}
            onRotationChange={setPages}
            onEditPage={(pageIndex) => setEditingPage(pageIndex)}
          />
        </>
      )}

      <input
        ref={extraInputRef}
        type="file"
        accept="application/pdf"
        style={{ display: "none" }}
        onChange={handleExtraFile}
      />
    </div>
  );
}
