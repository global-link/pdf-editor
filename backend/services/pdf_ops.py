"""Core PDF operations using pypdf and reportlab."""

import io
import os
import platform
import re
import uuid
from pathlib import Path
from typing import Optional

from PIL import Image
from pypdf import PdfReader, PdfWriter
from reportlab.lib.colors import Color
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

TMP_DIR = Path(__file__).parent.parent / "tmp"
TMP_DIR.mkdir(exist_ok=True)


def save_upload(data: bytes, suffix: str = ".pdf") -> str:
    """Save raw bytes to a temp file, return file_id."""
    file_id = uuid.uuid4().hex
    path = TMP_DIR / f"{file_id}{suffix}"
    path.write_bytes(data)
    return file_id


def tmp_path(file_id: str, suffix: str = ".pdf") -> Path:
    return TMP_DIR / f"{file_id}{suffix}"


def page_count(file_id: str) -> int:
    reader = PdfReader(str(tmp_path(file_id)))
    return len(reader.pages)


def render_page_thumbnail(file_id: str, page_index: int, dpi: int = 120) -> bytes:
    """Render a PDF page to PNG bytes using PyMuPDF (no Poppler needed)."""
    import fitz

    doc = fitz.open(str(tmp_path(file_id)))
    page = doc[page_index]
    zoom = dpi / 72          # 72 pt = 1 inch; scale to target DPI
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    png_bytes = pix.tobytes("png")
    doc.close()
    return png_bytes


def merge_pdfs(file_ids: list[str]) -> str:
    """Merge multiple PDFs (by file_id) into one. Returns new file_id."""
    writer = PdfWriter()
    for fid in file_ids:
        reader = PdfReader(str(tmp_path(fid)))
        for page in reader.pages:
            writer.add_page(page)
    out_id = uuid.uuid4().hex
    out_path = TMP_DIR / f"{out_id}.pdf"
    with open(out_path, "wb") as f:
        writer.write(f)
    return out_id


def split_pdf(file_id: str, ranges: list[tuple[int, int]]) -> list[str]:
    """Split a PDF into multiple files by page ranges (0-indexed, inclusive).
    Returns list of new file_ids."""
    reader = PdfReader(str(tmp_path(file_id)))
    result_ids = []
    for start, end in ranges:
        writer = PdfWriter()
        for i in range(start, end + 1):
            writer.add_page(reader.pages[i])
        out_id = uuid.uuid4().hex
        out_path = TMP_DIR / f"{out_id}.pdf"
        with open(out_path, "wb") as f:
            writer.write(f)
        result_ids.append(out_id)
    return result_ids


def rotate_pages(file_id: str, rotations: dict[int, int]) -> str:
    """Rotate specific pages. rotations = {page_index: degrees}.
    Returns new file_id."""
    reader = PdfReader(str(tmp_path(file_id)))
    writer = PdfWriter()
    for i, page in enumerate(reader.pages):
        if i in rotations:
            page.rotate(rotations[i])
        writer.add_page(page)
    out_id = uuid.uuid4().hex
    out_path = TMP_DIR / f"{out_id}.pdf"
    with open(out_path, "wb") as f:
        writer.write(f)
    return out_id


def reorder_pages(file_id: str, order: list[int]) -> str:
    """Reorder pages. order = list of original 0-based page indices in desired order.
    Returns new file_id."""
    reader = PdfReader(str(tmp_path(file_id)))
    writer = PdfWriter()
    for i in order:
        writer.add_page(reader.pages[i])
    out_id = uuid.uuid4().hex
    out_path = TMP_DIR / f"{out_id}.pdf"
    with open(out_path, "wb") as f:
        writer.write(f)
    return out_id


def delete_pages(file_id: str, keep: list[int]) -> str:
    """Keep only the specified 0-based page indices. Returns new file_id."""
    return reorder_pages(file_id, keep)


def _has_cjk(text: str) -> bool:
    """Return True if text contains CJK / Japanese / Korean characters."""
    return bool(re.search(r"[\u2E80-\u9FFF\uF900-\uFAFF\u3400-\u4DBF\uAC00-\uD7AF\u3000-\u303F]", text))


def _find_cjk_font() -> str | None:
    """Locate a Unicode/CJK-capable font file on the current OS."""
    system = platform.system()
    candidates: list[str] = []

    if system == "Darwin":  # macOS
        candidates = [
            "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc",
            "/System/Library/Fonts/Hiragino Sans GB.ttc",
            "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        ]
    elif system == "Linux":
        candidates = [
            "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
            "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
            "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc",
        ]
    elif system == "Windows":
        candidates = [
            r"C:\Windows\Fonts\meiryo.ttc",
            r"C:\Windows\Fonts\msgothic.ttc",
            r"C:\Windows\Fonts\malgun.ttf",
        ]

    for p in candidates:
        if Path(p).exists():
            return p
    return None


def _hex_to_rgb(color: str | None) -> tuple[float, float, float] | None:
    """Convert '#rrggbb' to (r,g,b) floats 0-1. Returns None for null/transparent."""
    if not color or color.lower() in ("transparent", "none", ""):
        return None
    h = color.lstrip("#")
    if len(h) != 6:
        return (0, 0, 0)
    return tuple(int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))  # type: ignore[return-value]


def render_page_no_text(file_id: str, page_index: int, scale: float = 1.8) -> bytes:
    """Render a page with all text stripped, keeping graphics/images intact.

    Strategy: render the full page first, then render again with each text block
    painted over using the background colour sampled from behind that block.
    This preserves coloured backgrounds (dark headers etc.) with no white boxes.
    """
    import fitz

    doc = fitz.open(str(tmp_path(file_id)))
    tmp = fitz.open()
    tmp.insert_pdf(doc, from_page=page_index, to_page=page_index)
    doc.close()
    page = tmp[0]

    # --- Pass 1: full render (text + graphics) at low res to sample bg colours ---
    sample_scale = 0.5          # low res is fine for colour sampling
    sample_mat   = fitz.Matrix(sample_scale, sample_scale)
    sample_pix   = page.get_pixmap(matrix=sample_mat, alpha=False)

    # --- Collect all text block rects ---
    text_rects = [fitz.Rect(b[:4]) for b in page.get_text("blocks") if b[6] == 0]

    # For each text block, draw a filled rect using the median bg colour sampled
    # from the rendered image so that the background shows through naturally.
    for rect in text_rects:
        # Sample pixels from OUTSIDE the text rect to get the true background colour.
        W, H = sample_pix.width, sample_pix.height
        px0 = int(rect.x0 * sample_scale)
        py0 = int(rect.y0 * sample_scale)
        px1 = int(rect.x1 * sample_scale)
        py1 = int(rect.y1 * sample_scale)
        bg_samples: list[tuple[int, int, int]] = []
        if py0 - 2 >= 0:
            for sx in range(max(0, px0), min(W, px1 + 1), max(1, (px1 - px0) // 8 + 1)):
                bg_samples.append(sample_pix.pixel(sx, py0 - 2))
        if py1 + 2 < H:
            for sx in range(max(0, px0), min(W, px1 + 1), max(1, (px1 - px0) // 8 + 1)):
                bg_samples.append(sample_pix.pixel(sx, py1 + 2))
        if px0 - 2 >= 0:
            for sy in range(max(0, py0), min(H, py1 + 1), max(1, (py1 - py0) // 8 + 1)):
                bg_samples.append(sample_pix.pixel(px0 - 2, sy))
        if px1 + 2 < W:
            for sy in range(max(0, py0), min(H, py1 + 1), max(1, (py1 - py0) // 8 + 1)):
                bg_samples.append(sample_pix.pixel(px1 + 2, sy))
        if not bg_samples:
            for sx, sy in [(px0, py0), (px1, py0), (px0, py1), (px1, py1)]:
                bg_samples.append(sample_pix.pixel(max(0, min(sx, W-1)), max(0, min(sy, H-1))))
        bg_samples.sort()
        mid = bg_samples[len(bg_samples) // 2]
        fill_color = (mid[0] / 255, mid[1] / 255, mid[2] / 255)
        # Draw a solid rectangle over the text block in the PDF
        padded = fitz.Rect(rect.x0 - 1, rect.y0 - 1, rect.x1 + 1, rect.y1 + 1)
        page.draw_rect(padded, color=fill_color, fill=fill_color, width=0)

    # --- Pass 2: render the modified page (text now hidden under colour rects) ---
    mat = fitz.Matrix(scale, scale)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    result = pix.tobytes("png")
    tmp.close()
    return result


def get_page_elements(file_id: str, page_index: int) -> dict:
    """Extract text spans and their bounding boxes from a page using PyMuPDF."""
    import fitz  # pymupdf

    doc = fitz.open(str(tmp_path(file_id)))
    page = doc[page_index]
    page_rect = page.rect

    elements = []
    blocks = page.get_text("dict")["blocks"]
    for block in blocks:
        if block.get("type") != 0:  # 0 = text block
            continue
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                if not span["text"].strip():
                    continue
                bbox = span["bbox"]  # (x0, y0, x1, y1) in PDF points
                # color is packed int RGB
                c = span.get("color", 0)
                r = ((c >> 16) & 0xFF) / 255
                g = ((c >> 8) & 0xFF) / 255
                b = (c & 0xFF) / 255
                elements.append({
                    "type": "text",
                    "x": bbox[0],
                    "y": bbox[1],
                    "w": bbox[2] - bbox[0],
                    "h": bbox[3] - bbox[1],
                    "text": span["text"],
                    "fontSize": span["size"],
                    "color": f"#{int(r*255):02x}{int(g*255):02x}{int(b*255):02x}",
                    "fromPdf": True,
                })
    doc.close()
    return {
        "elements": elements,
        "pageWidth": page_rect.width,
        "pageHeight": page_rect.height,
    }


def _insert_unicode_text(page, x: float, y: float, text: str, fontsize: float, color: tuple) -> None:
    """Insert text using a CJK-capable font when the text contains CJK characters."""
    import fitz

    fontfile = None
    fontname = "helv"

    if _has_cjk(text):
        cjk_path = _find_cjk_font()
        if cjk_path:
            fontfile = cjk_path
            fontname = "cjkfont"

    page.insert_text(
        fitz.Point(x, y),
        text,
        fontsize=fontsize,
        fontfile=fontfile,
        fontname=fontname,
        color=color,
    )


def apply_page_edits(file_id: str, page_index: int, edits: list[dict]) -> tuple[str, int]:
    """Apply a list of element edits to a single page using PyMuPDF.

    Edit types (coords in PDF points):
      text   – add new text
      rect   – draw rectangle
      circle – draw ellipse
      line   – draw line
      redact – white-out original area then optionally insert replacement text
               (used when existing PDF text is modified by the user)

    Returns (new_file_id, page_count).
    """
    import fitz

    doc = fitz.open(str(tmp_path(file_id)))
    page = doc[page_index]

    # ── Phase 1: apply redactions first so new text can be drawn on top ──────
    has_redactions = any(e.get("type") == "redact" for e in edits)
    if has_redactions:
        # Render a low-res snapshot of the current page to sample background colours.
        # This lets us fill each redacted area with the colour that was *behind* the
        # original text, so no white rectangle is left behind on coloured backgrounds.
        sample_scale = 0.5
        sample_mat   = fitz.Matrix(sample_scale, sample_scale)
        sample_pix   = page.get_pixmap(matrix=sample_mat, alpha=False)

        for edit in edits:
            if edit.get("type") == "redact":
                r    = edit["rect"]
                rect = fitz.Rect(r["x"], r["y"], r["x"] + r["w"], r["y"] + r["h"])
                # Sample pixels from OUTSIDE the text rect to get the true background
                # colour (centre pixels hit text glyphs and give a wrong result).
                W, H = sample_pix.width, sample_pix.height
                px0 = int(rect.x0 * sample_scale)
                py0 = int(rect.y0 * sample_scale)
                px1 = int(rect.x1 * sample_scale)
                py1 = int(rect.y1 * sample_scale)
                samples: list[tuple[int, int, int]] = []
                # Strip just above the rect
                if py0 - 2 >= 0:
                    for sx in range(max(0, px0), min(W, px1 + 1), max(1, (px1 - px0) // 8 + 1)):
                        samples.append(sample_pix.pixel(sx, py0 - 2))
                # Strip just below the rect
                if py1 + 2 < H:
                    for sx in range(max(0, px0), min(W, px1 + 1), max(1, (px1 - px0) // 8 + 1)):
                        samples.append(sample_pix.pixel(sx, py1 + 2))
                # Strip just left of the rect
                if px0 - 2 >= 0:
                    for sy in range(max(0, py0), min(H, py1 + 1), max(1, (py1 - py0) // 8 + 1)):
                        samples.append(sample_pix.pixel(px0 - 2, sy))
                # Strip just right of the rect
                if px1 + 2 < W:
                    for sy in range(max(0, py0), min(H, py1 + 1), max(1, (py1 - py0) // 8 + 1)):
                        samples.append(sample_pix.pixel(px1 + 2, sy))
                # Fallback: corners inside the rect (text rarely reaches exact corners)
                if not samples:
                    for sx, sy in [(px0, py0), (px1, py0), (px0, py1), (px1, py1)]:
                        sx = max(0, min(sx, W - 1))
                        sy = max(0, min(sy, H - 1))
                        samples.append(sample_pix.pixel(sx, sy))
                # Use median channel values to suppress outlier text-pixel colours
                samples.sort()
                mid = samples[len(samples) // 2]
                fill_color = (mid[0] / 255, mid[1] / 255, mid[2] / 255)
                page.add_redact_annot(rect, fill=fill_color)
        page.apply_redactions(images=0, graphics=0)

    # ── Phase 2: add all new / replacement content ────────────────────────────
    for edit in edits:
        t = edit.get("type")

        if t == "text":
            _insert_unicode_text(
                page, edit["x"], edit["y"],
                edit["text"], edit.get("fontSize", 12),
                _hex_to_rgb(edit.get("color", "#000000")) or (0, 0, 0),
            )

        elif t == "redact":
            # Insert replacement text at the new position if provided, otherwise original baseline
            if edit.get("newText"):
                r = edit["rect"]
                if edit.get("newX") is not None and edit.get("newY") is not None:
                    ins_x = edit["newX"]
                    ins_y = edit["newY"]
                else:
                    ins_x = r["x"]
                    ins_y = r["y"] + r["h"]
                _insert_unicode_text(
                    page, ins_x, ins_y,
                    edit["newText"], edit.get("fontSize", 12),
                    _hex_to_rgb(edit.get("color", "#000000")) or (0, 0, 0),
                )

        elif t == "rect":
            stroke = _hex_to_rgb(edit.get("stroke", "#000000")) or (0, 0, 0)
            fill = _hex_to_rgb(edit.get("fill"))
            rect = fitz.Rect(edit["x"], edit["y"], edit["x"] + edit["w"], edit["y"] + edit["h"])
            page.draw_rect(rect, color=stroke, fill=fill, width=edit.get("strokeWidth", 1))

        elif t == "circle":
            stroke = _hex_to_rgb(edit.get("stroke", "#000000")) or (0, 0, 0)
            fill = _hex_to_rgb(edit.get("fill"))
            rect = fitz.Rect(edit["x"], edit["y"], edit["x"] + edit["w"], edit["y"] + edit["h"])
            page.draw_oval(rect, color=stroke, fill=fill, width=edit.get("strokeWidth", 1))

        elif t == "line":
            stroke = _hex_to_rgb(edit.get("stroke", "#000000")) or (0, 0, 0)
            page.draw_line(
                fitz.Point(edit["x1"], edit["y1"]),
                fitz.Point(edit["x2"], edit["y2"]),
                color=stroke,
                width=edit.get("strokeWidth", 1),
            )

    out_id = uuid.uuid4().hex
    out_path = TMP_DIR / f"{out_id}.pdf"
    doc.save(str(out_path))
    n = len(doc)
    doc.close()
    return out_id, n


def add_watermark(file_id: str, text: str, opacity: float = 0.3, font_size: int = 48) -> str:
    """Overlay diagonal text watermark on every page. Returns new file_id."""
    # Build watermark PDF in memory
    wm_buf = io.BytesIO()
    c = canvas.Canvas(wm_buf, pagesize=letter)
    width, height = letter
    c.saveState()
    c.setFillColor(Color(0.5, 0.5, 0.5, alpha=opacity))
    c.setFont("Helvetica-Bold", font_size)
    c.translate(width / 2, height / 2)
    c.rotate(45)
    c.drawCentredString(0, 0, text)
    c.restoreState()
    c.save()
    wm_buf.seek(0)

    wm_reader = PdfReader(wm_buf)
    watermark_page = wm_reader.pages[0]

    reader = PdfReader(str(tmp_path(file_id)))
    writer = PdfWriter()
    for page in reader.pages:
        page.merge_page(watermark_page)
        writer.add_page(page)

    out_id = uuid.uuid4().hex
    out_path = TMP_DIR / f"{out_id}.pdf"
    with open(out_path, "wb") as f:
        writer.write(f)
    return out_id
