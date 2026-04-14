/**
 * PageEditor – canvas-based single-page editor.
 *
 * Layers:
 *   bgCanvas   – PDF page rendered once by pdfjs
 *   editCanvas – transparent overlay redrawn on every state change
 *   textarea   – floats over canvas while typing a text element
 *
 * Coordinate note:
 *   Canvas pixels = PDF points × RENDER_SCALE
 *   TextEl.y is the text BASELINE in canvas pixels (matches canvas fillText).
 *   fromPdf elements store originalBbox in raw PDF points for backend redaction.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { applyEdits, getPageElements, noTextRenderURL } from "../api/pdf";

// ── Types ──────────────────────────────────────────────────────────────────────

type Tool = "select" | "text" | "rect" | "circle" | "line";

/** Bounding box in raw PDF points (used to redact original content). */
type PdfBbox = { x: number; y: number; w: number; h: number };

export type TextEl = {
  type: "text"; id: string;
  x: number; y: number;          // canvas pixels; y = BASELINE
  text: string; fontSize: number; color: string;
  fromPdf?: boolean;             // came from existing PDF content
  modified?: boolean;            // fromPdf element that user edited
  deleted?: boolean;             // fromPdf element marked for redaction (white-out)
  originalBbox?: PdfBbox;        // PDF-point bbox for redaction
};
export type RectEl   = { type: "rect";   id: string; x: number; y: number; w: number; h: number; stroke: string; fill: string | null; strokeWidth: number; };
export type CircleEl = { type: "circle"; id: string; x: number; y: number; w: number; h: number; stroke: string; fill: string | null; strokeWidth: number; };
export type LineEl   = { type: "line";   id: string; x1: number; y1: number; x2: number; y2: number; stroke: string; strokeWidth: number; };
export type El = TextEl | RectEl | CircleEl | LineEl;

function uid() { return Math.random().toString(36).slice(2, 9); }

// ── Canvas helpers ─────────────────────────────────────────────────────────────

function getPos(canvas: HTMLCanvasElement, e: MouseEvent) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (canvas.width / r.width),
    y: (e.clientY - r.top)  * (canvas.height / r.height),
  };
}

function hitTest(el: El, x: number, y: number, ctx: CanvasRenderingContext2D): boolean {
  const M = 6;
  if (el.type === "text") {
    if (el.deleted) return false;
    ctx.font = `${el.fontSize}px ${CJK_FONT}`;
    const w = ctx.measureText(el.text).width;
    // el.y is baseline; text top ≈ el.y - fontSize
    return x >= el.x - M && x <= el.x + w + M && y >= el.y - el.fontSize - M && y <= el.y + M;
  }
  if (el.type === "rect" || el.type === "circle") {
    return x >= el.x - M && x <= el.x + el.w + M && y >= el.y - M && y <= el.y + el.h + M;
  }
  if (el.type === "line") {
    const dx = el.x2 - el.x1, dy = el.y2 - el.y1;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(x - el.x1, y - el.y1) < M * 2;
    const t = Math.max(0, Math.min(1, ((x - el.x1) * dx + (y - el.y1) * dy) / len2));
    return Math.hypot(x - el.x1 - t * dx, y - el.y1 - t * dy) < M * 2;
  }
  return false;
}

function drawEl(ctx: CanvasRenderingContext2D, el: El, selected: boolean) {
  // Skip deleted elements — they are tracked for backend redaction but not rendered
  if (el.type === "text" && el.deleted) return;

  ctx.save();

  if (el.type === "text") {
    ctx.font = `${el.fontSize}px ${CJK_FONT}`;
    ctx.fillStyle = el.color;
    ctx.fillText(el.text, el.x, el.y);

    if (selected) {
      const w = ctx.measureText(el.text).width;
      ctx.strokeStyle = "#2563eb"; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
      ctx.strokeRect(el.x - 3, el.y - el.fontSize - 3, w + 6, el.fontSize + 8);
    }
  }

  if (el.type === "rect") {
    ctx.lineWidth = el.strokeWidth; ctx.strokeStyle = el.stroke;
    if (el.fill) { ctx.fillStyle = el.fill; ctx.fillRect(el.x, el.y, el.w, el.h); }
    ctx.strokeRect(el.x, el.y, el.w, el.h);
    if (selected) drawHandles(ctx, el.x, el.y, el.w, el.h);
  }

  if (el.type === "circle") {
    ctx.lineWidth = el.strokeWidth; ctx.strokeStyle = el.stroke;
    ctx.beginPath();
    ctx.ellipse(el.x + el.w / 2, el.y + el.h / 2, Math.abs(el.w / 2), Math.abs(el.h / 2), 0, 0, Math.PI * 2);
    if (el.fill) { ctx.fillStyle = el.fill; ctx.fill(); }
    ctx.stroke();
    if (selected) drawHandles(ctx, el.x, el.y, el.w, el.h);
  }

  if (el.type === "line") {
    ctx.lineWidth = el.strokeWidth; ctx.strokeStyle = el.stroke;
    ctx.beginPath(); ctx.moveTo(el.x1, el.y1); ctx.lineTo(el.x2, el.y2); ctx.stroke();
    if (selected) { drawDot(ctx, el.x1, el.y1); drawDot(ctx, el.x2, el.y2); }
  }

  ctx.restore();
}

function drawHandles(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.strokeStyle = "#2563eb"; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
  ctx.strokeRect(x, y, w, h); ctx.setLineDash([]);
  [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(([cx, cy]) => drawDot(ctx, cx, cy));
}

function drawDot(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = "#2563eb"; ctx.setLineDash([]);
  ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
}

function drawPreview(ctx: CanvasRenderingContext2D, tool: Tool, start: {x:number;y:number}, cur: {x:number;y:number}, props: {stroke:string;fill:string|null;strokeWidth:number}) {
  ctx.save();
  ctx.strokeStyle = props.stroke; ctx.lineWidth = props.strokeWidth; ctx.setLineDash([5, 4]);
  const x = Math.min(start.x, cur.x), y = Math.min(start.y, cur.y);
  const w = Math.abs(cur.x - start.x),  h = Math.abs(cur.y - start.y);
  if (tool === "rect") {
    if (props.fill) { ctx.fillStyle = props.fill; ctx.fillRect(x, y, w, h); }
    ctx.strokeRect(x, y, w, h);
  }
  if (tool === "circle") {
    ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    if (props.fill) { ctx.fillStyle = props.fill; ctx.fill(); }
    ctx.stroke();
  }
  if (tool === "line") { ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(cur.x, cur.y); ctx.stroke(); }
  ctx.restore();
}

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  fileId: string;
  pageIndex: number;
  totalPages: number;
  /** Called after a successful save so the parent can update its fileId/pageCount.
   *  The editor stays open — it does NOT navigate away. */
  onSave: (fileId: string, pageCount: number) => void;
  onClose: () => void;
}

const RENDER_SCALE = 1.8;

// State for the floating textarea (new text OR editing existing)
type TextBoxState = {
  canvasX: number;
  canvasY: number;       // top-left of the textarea in canvas pixels
  editingId?: string;    // set when editing an existing TextEl
  initialText?: string;
};

// CJK-aware font stack for canvas rendering
const CJK_FONT = '"Hiragino Kaku Gothic ProN", "Hiragino Sans", "Yu Gothic", "MS PGothic", "Noto Sans JP", "Noto Sans CJK JP", sans-serif';

export function PageEditor({ fileId, pageIndex: initPage, totalPages, onSave, onClose }: Props) {
  const bgRef   = useRef<HTMLCanvasElement>(null);
  const editRef = useRef<HTMLCanvasElement>(null);

  const [pageIndex, setPageIndex]     = useState(initPage);
  // currentFileId may change after each save without closing the editor
  const [currentFileId, setCurrentFileId] = useState(fileId);

  const [elements, setElements] = useState<El[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("select");

  const drawingRef  = useRef<{ start: {x:number;y:number}; cur: {x:number;y:number} } | null>(null);
  const draggingRef = useRef<{ id: string; ox: number; oy: number } | null>(null);

  const [textBox, setTextBox] = useState<TextBoxState | null>(null);
  const [textInputValue, setTextInputValue] = useState("");  // controlled textarea value
  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  // Refs mirror state so native event handlers always see the current values
  // (mousedown fires before blur, so we can't rely on React state being fresh)
  const textBoxRef      = useRef<TextBoxState | null>(null);
  const textInputRef    = useRef("");           // mirrors textInputValue for sync reads
  const fontSizeRef     = useRef(16);
  const textColorRef    = useRef("#000000");

  // New-element drawing properties — must be declared BEFORE the useEffects
  // that reference them in dependency arrays (TDZ rule).
  const [fontSize,    setFontSize]    = useState(16);
  const [textColor,   setTextColor]   = useState("#000000");
  const [stroke,      setStroke]      = useState("#000000");
  const [fill,        setFill]        = useState("#ffffff");
  const [noFill,      setNoFill]      = useState(true);
  const [strokeWidth, setStrokeWidth] = useState(2);

  // Keep refs in sync with state so native event handlers always see fresh values
  useEffect(() => { textBoxRef.current = textBox; if (!textBox) { setTextInputValue(""); textInputRef.current = ""; } }, [textBox]);
  useEffect(() => { fontSizeRef.current = fontSize; }, [fontSize]);
  useEffect(() => { textColorRef.current = textColor; }, [textColor]);

  const pdfScaleRef = useRef(RENDER_SCALE);
  const [busy, setBusy]           = useState(false);
  const [loadingPage, setLoading] = useState(true);
  const [savedToast, setSavedToast] = useState(false);

  const selected = elements.find((e) => e.id === selectedId) ?? null;

  // ── Render edit canvas ───────────────────────────────────────────────────────

  const renderEdit = useCallback(() => {
    const canvas = editRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const el of elements) drawEl(ctx, el, el.id === selectedId);
    if (drawingRef.current && (tool === "rect" || tool === "circle" || tool === "line")) {
      drawPreview(ctx, tool, drawingRef.current.start, drawingRef.current.cur, { stroke, fill: noFill ? null : fill, strokeWidth });
    }
  }, [elements, selectedId, tool, stroke, fill, noFill, strokeWidth]);

  useEffect(() => { renderEdit(); }, [renderEdit]);

  // ── Load PDF page ────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setElements([]);
    setSelectedId(null);
    setTextBox(null);

    async function load() {
      // 1. Load the no-text background image from backend
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = noTextRenderURL(currentFileId, pageIndex, RENDER_SCALE);
      });
      if (cancelled) return;

      const bg = bgRef.current!;
      const ed = editRef.current!;
      bg.width = ed.width = img.naturalWidth;
      bg.height = ed.height = img.naturalHeight;
      bg.getContext("2d")!.drawImage(img, 0, 0);
      pdfScaleRef.current = RENDER_SCALE;
      setLoading(false);

      // 2. Load existing text elements from PDF
      try {
        const data = await getPageElements(currentFileId, pageIndex);
        if (cancelled) return;
        const s = RENDER_SCALE;
        const els: El[] = data.elements.map((e: any) => ({
          type:         "text" as const,
          id:           uid(),
          x:            e.x * s,
          y:            (e.y + e.h) * s,   // baseline = bottom of bbox
          text:         e.text,
          fontSize:     Math.max(e.h * s, 8),
          color:        e.color ?? "#000000",
          fromPdf:      true,
          originalBbox: { x: e.x, y: e.y, w: e.w, h: e.h },
        }));
        setElements(els);
      } catch (_) { /* non-fatal — editor still works for new additions */ }
    }
    load();
    return () => { cancelled = true; };
  }, [currentFileId, pageIndex]);

  // ── Delete element ───────────────────────────────────────────────────────────

  const deleteElement = (id: string) => {
    setElements((prev) => prev.map((el) => {
      if (el.id !== id) return el;
      if (el.type === "text" && el.fromPdf) return { ...el, deleted: true };
      return null;
    }).filter(Boolean) as El[]);
  };

  // ── Keyboard: Delete selected ────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId && !textBox) {
        deleteElement(selectedId);
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId, textBox]);

  // ── Commit text input ────────────────────────────────────────────────────────
  // Declared BEFORE onMouseDown so it can appear in its dependency array
  // without hitting the Temporal Dead Zone.
  // Uses refs so it can be called safely from native event handlers (mousedown)
  // where React state is stale.

  const commitTextFromRefs = useCallback(() => {
    const tb = textBoxRef.current;
    if (!tb) return;

    const value = textInputRef.current;
    textBoxRef.current = null;
    setTextBox(null);

    if (tb.editingId) {
      if (value.trim()) {
        setElements((prev) => prev.map((el) => {
          if (el.id !== tb.editingId || el.type !== "text") return el;
          // Mark modified so handleApply knows to redact+replace this element
          return { ...el, text: value, modified: true };
        }));
      }
    } else {
      if (value.trim()) {
        setElements((prev) => [...prev, {
          type: "text", id: uid(),
          x: tb.canvasX,
          y: tb.canvasY + fontSizeRef.current,
          text: value, fontSize: fontSizeRef.current, color: textColorRef.current,
        }]);
      }
    }
  }, []);  // no deps — reads everything through refs

  // Thin wrapper used by the textarea's own React event handlers
  const commitText = commitTextFromRefs;

  // ── Mouse handlers (React synthetic events — no add/removeEventListener needed) ──

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.detail === 2) return; // handled by onDoubleClick

    // If a text box is open, commit it first; user must click again to place new text
    if (textBoxRef.current) {
      commitTextFromRefs();
      return;
    }

    const canvas = editRef.current!;
    const pt = getPos(canvas, e.nativeEvent);

    if (tool === "select") {
      const ctx = canvas.getContext("2d")!;
      const hit = [...elements].reverse().find((el) => hitTest(el, pt.x, pt.y, ctx));
      if (hit) {
        setSelectedId(hit.id);
        const base = hit.type === "line" ? { x: hit.x1, y: hit.y1 } : { x: hit.x, y: hit.y };
        draggingRef.current = { id: hit.id, ox: pt.x - base.x, oy: pt.y - base.y };
      } else {
        setSelectedId(null);
      }
      return;
    }

    if (tool === "text") {
      const tb: TextBoxState = { canvasX: pt.x, canvasY: pt.y - fontSize };
      textBoxRef.current = tb;
      textInputRef.current = "";
      setTextInputValue("");
      setTextBox(tb);
      return;
    }

    drawingRef.current = { start: pt, cur: pt };
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = editRef.current!;
    const pt = getPos(canvas, e.nativeEvent);
    const ctx = canvas.getContext("2d")!;

    const hit = [...elements].reverse().find(
      (el) => el.type === "text" && hitTest(el, pt.x, pt.y, ctx)
    );
    if (hit && hit.type === "text") {
      setSelectedId(hit.id);
      const tb: TextBoxState = {
        canvasX:     hit.x,
        canvasY:     hit.y - hit.fontSize,
        editingId:   hit.id,
        initialText: hit.text,
      };
      textBoxRef.current = tb;
      textInputRef.current = hit.text;
      setTextInputValue(hit.text);
      setTextBox(tb);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = editRef.current!;
    const pt = getPos(canvas, e.nativeEvent);

    if (draggingRef.current) {
      const { id, ox, oy } = draggingRef.current;
      setElements((prev) => prev.map((el) => {
        if (el.id !== id) return el;
        if (el.type === "line") {
          const dx = pt.x - ox - el.x1, dy = pt.y - oy - el.y1;
          return { ...el, x1: pt.x - ox, y1: pt.y - oy, x2: el.x2 + dx, y2: el.y2 + dy };
        }
        return { ...el, x: pt.x - ox, y: pt.y - oy };
      }));
      return;
    }

    if (drawingRef.current) {
      drawingRef.current.cur = pt;
      renderEdit();
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    draggingRef.current = null;
    if (!drawingRef.current) return;
    const { start, cur } = drawingRef.current;
    drawingRef.current = null;

    const x = Math.min(start.x, cur.x), y = Math.min(start.y, cur.y);
    const w = Math.abs(cur.x - start.x),  h = Math.abs(cur.y - start.y);
    const effectiveFill = noFill ? null : fill;

    if (tool === "rect"   && (w > 4 || h > 4)) setElements((p) => [...p, { type: "rect",   id: uid(), x, y, w, h, stroke, fill: effectiveFill, strokeWidth }]);
    if (tool === "circle" && (w > 4 || h > 4)) setElements((p) => [...p, { type: "circle", id: uid(), x, y, w, h, stroke, fill: effectiveFill, strokeWidth }]);
    if (tool === "line" && Math.hypot(cur.x - start.x, cur.y - start.y) > 4)
      setElements((p) => [...p, { type: "line", id: uid(), x1: start.x, y1: start.y, x2: cur.x, y2: cur.y, stroke, strokeWidth }]);

    renderEdit();
  };

  useEffect(() => {
    if (textBox && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [textBox]);

  // ── Apply edits to PDF ───────────────────────────────────────────────────────

  const handleApply = async () => {
    setBusy(true);
    try {
      const s = pdfScaleRef.current;
      const edits: object[] = [];

      for (const el of elements) {
        if (el.type === "text") {
          if (el.deleted && el.fromPdf && el.originalBbox) {
            // Pure redact — remove text, no replacement
            edits.push({
              type: "redact",
              rect: el.originalBbox,
            });
          } else if (!el.deleted && el.fromPdf && el.originalBbox) {
            // Only send a redact+replace if the element was actually moved or its text edited.
            // Compare current position to original bbox position (scaled) and check text.
            const origX = el.originalBbox.x * s;
            const origY = (el.originalBbox.y + el.originalBbox.h) * s;
            const wasMoved  = Math.abs(el.x - origX) > 2 || Math.abs(el.y - origY) > 2;
            const wasEdited = !!el.modified;
            if (!wasMoved && !wasEdited) continue; // untouched — leave PDF as-is

            edits.push({
              type:     "redact",
              rect:     el.originalBbox,
              newText:  el.text,
              newX:     el.x / s,
              newY:     el.y / s,
              fontSize: el.fontSize / s,
              color:    el.color,
            });
          } else if (!el.deleted) {
            // Newly added text element
            edits.push({
              type:     "text",
              x:        el.x / s,
              y:        el.y / s,
              text:     el.text,
              fontSize: el.fontSize / s,
              color:    el.color,
            });
          }
        } else if (el.type === "rect") {
          edits.push({ type: "rect", x: el.x/s, y: el.y/s, w: el.w/s, h: el.h/s, stroke: el.stroke, fill: el.fill, strokeWidth: el.strokeWidth });
        } else if (el.type === "circle") {
          edits.push({ type: "circle", x: el.x/s, y: el.y/s, w: el.w/s, h: el.h/s, stroke: el.stroke, fill: el.fill, strokeWidth: el.strokeWidth });
        } else if (el.type === "line") {
          edits.push({ type: "line", x1: el.x1/s, y1: el.y1/s, x2: el.x2/s, y2: el.y2/s, stroke: el.stroke, strokeWidth: el.strokeWidth });
        }
      }

      const res = await applyEdits(currentFileId, pageIndex, edits);

      // ── Stay in editor: update internal fileId (triggers page reload) ──────
      setCurrentFileId(res.file_id);
      // Notify parent so its download / grid reflects the new file
      onSave(res.file_id, res.page_count);

      // Show "Saved!" toast for 2 s
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2000);
    } catch (err) {
      alert(String(err));
    } finally {
      setBusy(false);
    }
  };

  // ── Update selected element properties ───────────────────────────────────────

  function updateSelected(patch: Partial<El>) {
    setElements((prev) => prev.map((el) => el.id === selectedId ? { ...el, ...patch } as El : el));
  }

  // ── Textarea screen position ─────────────────────────────────────────────────

  function canvasToScreen(cx: number, cy: number) {
    const canvas = editRef.current;
    if (!canvas) return { left: 0, top: 0 };
    const r = canvas.getBoundingClientRect();
    return { left: cx * (r.width / canvas.width), top: cy * (r.height / canvas.height) };
  }

  const tbPos = textBox ? canvasToScreen(textBox.canvasX, textBox.canvasY) : null;

  // Effective font size displayed in textarea (canvas px → screen px)
  const screenFontSize = editRef.current
    ? fontSize * (editRef.current.getBoundingClientRect().width / editRef.current.width)
    : fontSize;

  // ── Cursor ───────────────────────────────────────────────────────────────────

  const cursorMap: Record<Tool, string> = {
    select: "default", text: "text", rect: "crosshair", circle: "crosshair", line: "crosshair",
  };

  // ── Tool definitions ─────────────────────────────────────────────────────────

  const TOOLS: { id: Tool; label: string; icon: string; hint: string }[] = [
    { id: "select", label: "Select",    icon: "↖", hint: "Click to select.\nDrag to move.\nDouble-click text to edit.\nDelete key removes." },
    { id: "text",   label: "Text",      icon: "T",  hint: "Click to place new text.\nDouble-click existing text to edit it." },
    { id: "rect",   label: "Rectangle", icon: "▭", hint: "Drag to draw a rectangle." },
    { id: "circle", label: "Ellipse",   icon: "◯", hint: "Drag to draw an ellipse." },
    { id: "line",   label: "Line",      icon: "/",  hint: "Drag to draw a line." },
  ];

  const activeTool = TOOLS.find((t) => t.id === tool)!;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="editor-root">
      {/* ── Top bar ── */}
      <div className="editor-topbar">
        <button className="btn secondary small" onClick={onClose}>← Back</button>
        <span className="editor-title">
          Editing page {pageIndex + 1} of {totalPages}
          {" · "}<span style={{ color: "#6b7280", fontSize: "0.8em" }}>Double-click any text to edit it</span>
        </span>
        <div className="editor-page-nav">
          <button className="btn secondary small" disabled={pageIndex === 0} onClick={() => setPageIndex((p) => p - 1)}>‹ Prev</button>
          <button className="btn secondary small" disabled={pageIndex === totalPages - 1} onClick={() => setPageIndex((p) => p + 1)}>Next ›</button>
        </div>
        {savedToast && (
          <span className="saved-toast">✓ Saved</span>
        )}
        <button className="btn primary small" disabled={busy} onClick={handleApply}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="editor-body">
        {/* ── Left tool palette ── */}
        <div className="tool-palette">
          {TOOLS.map((t) => (
            <button key={t.id} className={`tool-btn ${tool === t.id ? "active" : ""}`} title={t.hint}
              onClick={() => { setTool(t.id); setTextBox(null); }}>
              <span className="tool-icon">{t.icon}</span>
              <span className="tool-label">{t.label}</span>
            </button>
          ))}
          <div className="tool-divider" />
          <div className="tool-hint">{activeTool.hint}</div>
        </div>

        {/* ── Canvas area ── */}
        <div className="canvas-scroll">
          {loadingPage && <div className="canvas-loading">Rendering page…</div>}
          <div className="canvas-wrap" style={{ opacity: loadingPage ? 0 : 1 }}>
            <canvas ref={bgRef}   className="bg-canvas" />
            <canvas
              ref={editRef}
              className="edit-canvas"
              style={{ cursor: cursorMap[tool] }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onDoubleClick={handleDoubleClick}
            />
            {textBox && tbPos && (
              <textarea
                key={`${textBox.canvasX}-${textBox.canvasY}`}
                ref={textareaRef}
                className="floating-textarea"
                autoFocus
                value={textInputValue}
                style={{
                  left:     tbPos.left,
                  top:      tbPos.top,
                  fontSize: `${screenFontSize}px`,
                  color:    textBox.editingId
                    ? (elements.find((e) => e.id === textBox.editingId) as TextEl | undefined)?.color ?? textColor
                    : textColor,
                  minWidth: "160px",
                }}
                rows={1}
                onChange={(e) => {
                  textInputRef.current = e.target.value;
                  setTextInputValue(e.target.value);
                }}
                onBlur={commitText}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitText(); }
                  if (e.key === "Escape") { textBoxRef.current = null; setTextBox(null); }
                }}
              />
            )}
          </div>
        </div>

        {/* ── Right properties panel ── */}
        <div className="props-panel">
          <h3 className="props-title">Properties</h3>

          {/* Text properties */}
          {(tool === "text" || selected?.type === "text") && (
            <div className="prop-group">
              <label>Font size (px)</label>
              <input type="number" min={6} max={200}
                value={selected?.type === "text" ? Math.round(selected.fontSize) : fontSize}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (selected?.type === "text") updateSelected({ fontSize: v });
                  else setFontSize(v);
                }} />
              <label>Color</label>
              <input type="color"
                value={selected?.type === "text" ? selected.color : textColor}
                onChange={(e) => {
                  if (selected?.type === "text") updateSelected({ color: e.target.value });
                  else setTextColor(e.target.value);
                }} />
              {selected?.type === "text" && (
                <p className="props-hint" style={{ color: "#f59e0b" }}>
                  Double-click the text on the canvas to edit its content.
                </p>
              )}
            </div>
          )}

          {/* Shape properties */}
          {(tool === "rect" || tool === "circle" || tool === "line" ||
            (selected && (selected.type === "rect" || selected.type === "circle" || selected.type === "line"))) && (
            <div className="prop-group">
              <label>Stroke color</label>
              <input type="color"
                value={(selected && "stroke" in selected) ? selected.stroke : stroke}
                onChange={(e) => { if (selected && "stroke" in selected) updateSelected({ stroke: e.target.value } as Partial<El>); else setStroke(e.target.value); }} />
              <label>Stroke width</label>
              <input type="number" min={1} max={20}
                value={(selected && "strokeWidth" in selected) ? selected.strokeWidth : strokeWidth}
                onChange={(e) => { const v = Number(e.target.value); if (selected && "strokeWidth" in selected) updateSelected({ strokeWidth: v } as Partial<El>); else setStrokeWidth(v); }} />
              {tool !== "line" && selected?.type !== "line" && (<>
                <label>Fill</label>
                <div className="fill-row">
                  <input type="checkbox"
                    checked={selected ? !("fill" in selected && selected.fill) : noFill}
                    onChange={(e) => { if (selected && "fill" in selected) updateSelected({ fill: e.target.checked ? null : fill } as Partial<El>); else setNoFill(e.target.checked); }} />
                  <span>No fill</span>
                </div>
                {(!noFill || (selected && "fill" in selected && selected.fill)) && (
                  <input type="color"
                    value={(selected && "fill" in selected && selected.fill) ? selected.fill : fill}
                    onChange={(e) => { if (selected && "fill" in selected) updateSelected({ fill: e.target.value } as Partial<El>); else setFill(e.target.value); }} />
                )}
              </>)}
            </div>
          )}

          {selected && (
            <div className="prop-group">
              <button className="btn danger small"
                onClick={() => { deleteElement(selectedId!); setSelectedId(null); }}>
                Delete element
              </button>
            </div>
          )}

          {!selected && tool === "select" && (
            <p className="props-hint">Click to select an element. Double-click any text to edit it.</p>
          )}

        </div>
      </div>
    </div>
  );
}
