"""FastAPI routes for PDF operations."""

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel

from middleware.auth import get_current_user
from services import pdf_ops

router = APIRouter(prefix="/api/pdf", tags=["pdf"])

# Shorthand dependency for protected routes
_auth = Depends(get_current_user)


# ── Upload ─────────────────────────────────────────────────────────────────────

@router.post("/upload")
async def upload_pdf(
    file: UploadFile = File(...),
    _user: dict = _auth,
):
    if file.content_type != "application/pdf":
        raise HTTPException(400, "Only PDF files are accepted")
    data = await file.read()
    file_id = pdf_ops.save_upload(data)
    count = pdf_ops.page_count(file_id)
    return {"file_id": file_id, "page_count": count, "filename": file.filename}


# ── Preview (public – used as <img src> in the browser) ───────────────────────

@router.get("/preview/{file_id}/{page}")
def get_page_preview(file_id: str, page: int):
    try:
        png = pdf_ops.render_page_thumbnail(file_id, page)
    except Exception as e:
        raise HTTPException(404, str(e))
    return Response(content=png, media_type="image/png")


# ── Merge ──────────────────────────────────────────────────────────────────────

class MergeRequest(BaseModel):
    file_ids: list[str]


@router.post("/merge")
def merge(req: MergeRequest, _user: dict = _auth):
    out_id = pdf_ops.merge_pdfs(req.file_ids)
    count = pdf_ops.page_count(out_id)
    return {"file_id": out_id, "page_count": count}


# ── Split ──────────────────────────────────────────────────────────────────────

class SplitRange(BaseModel):
    start: int
    end: int


class SplitRequest(BaseModel):
    file_id: str
    ranges: list[SplitRange]


@router.post("/split")
def split(req: SplitRequest, _user: dict = _auth):
    range_tuples = [(r.start, r.end) for r in req.ranges]
    out_ids = pdf_ops.split_pdf(req.file_id, range_tuples)
    return {"file_ids": out_ids}


# ── Rotate ─────────────────────────────────────────────────────────────────────

class RotateRequest(BaseModel):
    file_id: str
    rotations: dict[int, int]  # {page_index: degrees}


@router.post("/rotate")
def rotate(req: RotateRequest, _user: dict = _auth):
    out_id = pdf_ops.rotate_pages(req.file_id, req.rotations)
    count = pdf_ops.page_count(out_id)
    return {"file_id": out_id, "page_count": count}


# ── Reorder ────────────────────────────────────────────────────────────────────

class ReorderRequest(BaseModel):
    file_id: str
    order: list[int]


@router.post("/reorder")
def reorder(req: ReorderRequest, _user: dict = _auth):
    out_id = pdf_ops.reorder_pages(req.file_id, req.order)
    count = pdf_ops.page_count(out_id)
    return {"file_id": out_id, "page_count": count}


# ── Delete pages ───────────────────────────────────────────────────────────────

class DeleteRequest(BaseModel):
    file_id: str
    keep: list[int]


@router.post("/delete-pages")
def delete_pages(req: DeleteRequest, _user: dict = _auth):
    out_id = pdf_ops.delete_pages(req.file_id, req.keep)
    count = pdf_ops.page_count(out_id)
    return {"file_id": out_id, "page_count": count}


# ── Watermark ──────────────────────────────────────────────────────────────────

class WatermarkRequest(BaseModel):
    file_id: str
    text: str
    opacity: float = 0.3
    font_size: int = 48


@router.post("/watermark")
def watermark(req: WatermarkRequest, _user: dict = _auth):
    out_id = pdf_ops.add_watermark(req.file_id, req.text, req.opacity, req.font_size)
    count = pdf_ops.page_count(out_id)
    return {"file_id": out_id, "page_count": count}


# ── Download (public – used as <a href> download link) ────────────────────────

@router.get("/download/{file_id}")
def download(file_id: str):
    path = pdf_ops.tmp_path(file_id)
    if not path.exists():
        raise HTTPException(404, "File not found")
    return FileResponse(str(path), media_type="application/pdf", filename="edited.pdf")


# ── Render without text (public – used as <img src> in editor) ────────────────

@router.get("/render-notext/{file_id}/{page}")
async def render_no_text(file_id: str, page: int, scale: float = 1.8):
    try:
        data = pdf_ops.render_page_no_text(file_id, page, scale)
    except Exception:
        # Fall back to normal rendering so the editor still loads
        try:
            data = pdf_ops.render_page_thumbnail(file_id, page, dpi=int(72 * scale))
        except Exception as e:
            raise HTTPException(404, str(e))
    return Response(content=data, media_type="image/png")


# ── Page elements (for editor) ─────────────────────────────────────────────────

@router.get("/elements/{file_id}/{page}")
def get_elements(file_id: str, page: int, _user: dict = _auth):
    try:
        return pdf_ops.get_page_elements(file_id, page)
    except Exception as e:
        raise HTTPException(400, str(e))


# ── Apply in-page edits ────────────────────────────────────────────────────────

class ApplyEditsRequest(BaseModel):
    file_id: str
    page_index: int
    edits: list[dict]


@router.post("/apply-edits")
def apply_edits(req: ApplyEditsRequest, _user: dict = _auth):
    try:
        out_id, count = pdf_ops.apply_page_edits(req.file_id, req.page_index, req.edits)
        return {"file_id": out_id, "page_count": count}
    except Exception as e:
        raise HTTPException(400, str(e))
