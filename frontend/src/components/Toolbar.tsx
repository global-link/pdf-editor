import { useState } from "react";
import { downloadURL } from "../api/pdf";

interface Props {
  fileId: string;
  selectedCount: number;
  totalPages: number;
  onDeleteSelected: () => void;
  onApplyRotations: () => void;
  onApplyReorder: () => void;
  onAddWatermark: (text: string) => void;
  onAddMoreFiles: () => void;
  busy: boolean;
  hasRotations: boolean;
  hasReorder: boolean;
}

export function Toolbar({
  fileId, selectedCount, totalPages,
  onDeleteSelected, onApplyRotations, onApplyReorder,
  onAddWatermark, onAddMoreFiles, busy, hasRotations, hasReorder,
}: Props) {
  const [wmText, setWmText] = useState("");
  const [showWm, setShowWm] = useState(false);

  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <span className="page-info">{totalPages} page{totalPages !== 1 ? "s" : ""}</span>
        {selectedCount > 0 && (
          <button className="btn danger" onClick={onDeleteSelected} disabled={busy}>
            Delete {selectedCount} page{selectedCount !== 1 ? "s" : ""}
          </button>
        )}
        {hasRotations && (
          <button className="btn" onClick={onApplyRotations} disabled={busy}>
            Apply Rotations
          </button>
        )}
        {hasReorder && (
          <button className="btn" onClick={onApplyReorder} disabled={busy}>
            Apply Reorder
          </button>
        )}
      </div>

      <div className="toolbar-right">
        <button className="btn secondary" onClick={onAddMoreFiles} disabled={busy}>
          + Add PDF
        </button>

        <button className="btn secondary" onClick={() => setShowWm((v) => !v)} disabled={busy}>
          Watermark
        </button>

        <a className="btn primary" href={downloadURL(fileId)} download="edited.pdf">
          Download
        </a>
      </div>

      {showWm && (
        <div className="wm-bar">
          <input
            value={wmText}
            onChange={(e) => setWmText(e.target.value)}
            placeholder="Watermark text…"
          />
          <button
            className="btn"
            disabled={!wmText.trim() || busy}
            onClick={() => { onAddWatermark(wmText.trim()); setShowWm(false); setWmText(""); }}
          >
            Apply
          </button>
          <button className="btn secondary" onClick={() => setShowWm(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}
