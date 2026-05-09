"""Extract text from PDFs (native text + optional OCR) and chunk with page-aware spans."""

from __future__ import annotations

import bisect
import hashlib
import io
import re
from pathlib import Path
from typing import Any

BOOK_CHUNK_SIZE = 1500
BOOK_CHUNK_OVERLAP = 150

_MIN_CHARS_FOR_NATIVE_TEXT = 48


def _ocr_page(page: Any) -> str:
    try:
        import fitz  # PyMuPDF
        import pytesseract
        from PIL import Image
    except ImportError:
        return ""

    try:
        pix = page.get_pixmap(matrix=fitz.Matrix(2.0, 2.0), alpha=False)
        img = Image.open(io.BytesIO(pix.tobytes("png")))
        return (pytesseract.image_to_string(img) or "").strip()
    except Exception:
        return ""


def extract_pdf_pages(path: Path) -> list[tuple[int, str]]:
    """Return (1-based page_number, text) per PDF page."""
    import fitz

    doc = fitz.open(path)
    try:
        out: list[tuple[int, str]] = []
        for i in range(len(doc)):
            page = doc[i]
            text = (page.get_text("text") or "").strip()
            if len(text) < _MIN_CHARS_FOR_NATIVE_TEXT:
                ocr = _ocr_page(page)
                if len(ocr) >= len(text):
                    text = ocr
            out.append((i + 1, text))
        return out
    finally:
        doc.close()


def chunk_pdf_text(
    pages: list[tuple[int, str]],
    *,
    chunk_size: int = BOOK_CHUNK_SIZE,
    overlap: int = BOOK_CHUNK_OVERLAP,
) -> list[dict[str, Any]]:
    """Character chunks with sliding overlap; each chunk carries start_page / end_page (PDF)."""
    if overlap >= chunk_size:
        overlap = max(0, chunk_size // 10)
    step = max(1, chunk_size - overlap)

    offsets: list[int] = []
    page_nums: list[int] = []
    pieces: list[str] = []
    pos = 0
    for pnum, txt in pages:
        offsets.append(pos)
        page_nums.append(pnum)
        pieces.append(txt)
        pos += len(txt)
    full = "".join(pieces)
    if not full.strip():
        return []

    def page_for_char(idx: int) -> int:
        idx = max(0, min(idx, len(full) - 1)) if full else 0
        j = bisect.bisect_right(offsets, idx) - 1
        j = max(0, min(j, len(page_nums) - 1))
        return page_nums[j]

    chunks: list[dict[str, Any]] = []
    start = 0
    while start < len(full):
        end = min(start + chunk_size, len(full))
        body = full[start:end]
        if body.strip():
            sp = page_for_char(start)
            ep = page_for_char(end - 1)
            chunks.append(
                {
                    "content": body,
                    "start_page": sp,
                    "end_page": ep,
                }
            )
        if end >= len(full):
            break
        start += step
    return chunks


def slug_from_path(path: Path, explicit: str | None = None) -> str:
    if explicit:
        s = explicit.strip().lower().replace(" ", "-")
        s = re.sub(r"[^a-z0-9_-]+", "", s)
        return s[:96] or "book"
    stem = path.stem.lower().replace(" ", "-")
    stem = re.sub(r"[^a-z0-9_-]+", "", stem)[:60]
    h = hashlib.sha256(str(path.resolve()).encode()).hexdigest()[:12]
    return f"{stem}-{h}"[:96]
