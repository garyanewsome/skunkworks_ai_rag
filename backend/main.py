import os
import uuid
from difflib import SequenceMatcher
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from embeddings import encode_texts, embedding_dim
from rag_store import (
    PROMPT_TRACE_KINDS,
    get_connection,
    get_prompt_trace,
    init_schema,
    insert_prompt_trace,
    list_books,
    list_prompt_traces,
    list_prompt_traces_for_similarity_match,
    list_videos,
    search_similar,
    search_similar_books,
    search_similar_global,
    search_similar_multi,
    widen_retrieval_query_for_multi_video,
)
from video_catalog import load_video_titles

_BACKEND_ROOT = Path(__file__).resolve().parent
_REPO_ROOT = _BACKEND_ROOT.parent
load_dotenv(_BACKEND_ROOT / ".env")


@asynccontextmanager
async def lifespan(app: FastAPI):
    with get_connection() as conn:
        init_schema(conn, embedding_dim())
    yield


app = FastAPI(title="Skunkworks AI RAG API", lifespan=lifespan)

# Configure CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Change this to specific origins in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "message": "Backend is up and running!"}


class VideoItem(BaseModel):
    video_id: str
    chunk_count: int
    title: str | None = Field(
        default=None,
        description="YouTube title from video_meta table, else lectures_physics/video_titles.json.",
    )


class VideosListResponse(BaseModel):
    videos: list[VideoItem]


@app.get("/api/videos", response_model=VideosListResponse)
def get_videos():
    """List lecture videos that have ingested transcript chunks (distinct video_id from DB)."""
    file_titles = load_video_titles(_REPO_ROOT)
    with get_connection() as conn:
        rows = list_videos(conn)
    out: list[VideoItem] = []
    for r in rows:
        vid = str(r["video_id"])
        db_title = r.get("title")
        if db_title is not None and str(db_title).strip():
            t = str(db_title).strip()
        else:
            t = file_titles.get(vid)
        out.append(
            VideoItem(
                video_id=vid,
                chunk_count=int(r["chunk_count"]),
                title=t,
            )
        )
    return VideosListResponse(videos=out)


class RagQuery(BaseModel):
    query: str = Field(..., min_length=1)
    video_id: str | None = Field(
        default=None,
        description="Restrict search to this YouTube id; omit to search all ingested videos.",
    )
    video_ids: list[str] | None = Field(
        default=None,
        description="Restrict search to these YouTube ids (e.g. multi-part same topic). Overrides video_id when set.",
    )
    top_k: int = Field(5, ge=1, le=50)


class RagHit(BaseModel):
    video_id: str
    chunk_index: int
    content: str
    start_ms: int | None
    end_ms: int | None
    distance: float
    similarity: float


class RagQueryResponse(BaseModel):
    filter_video_id: str | None = Field(
        default=None,
        description="Echo of request filter; None when multi-id or global.",
    )
    filter_video_ids: list[str] | None = Field(
        default=None,
        description="Echo when search was restricted to multiple ids.",
    )
    hits: list[RagHit]


def _rows_to_hits(raw: list[dict]) -> list[RagHit]:
    out: list[RagHit] = []
    for row in raw:
        d = float(row["distance"])
        out.append(
            RagHit(
                video_id=str(row["video_id"]),
                chunk_index=int(row["chunk_index"]),
                content=row["content"],
                start_ms=row["start_ms"],
                end_ms=row["end_ms"],
                distance=d,
                similarity=float(1.0 - d),
            )
        )
    return out


def _fallback_summary(raw: list[dict]) -> str:
    if not raw:
        return (
            "No matching transcript chunks found. "
            "Run ingest_transcript.py after starting Postgres."
        )
    lines = [
        "AI summary is unavailable (set ANTHROPIC_API_KEY for Claude). "
        "Below are excerpts from the closest transcript matches:"
    ]
    for i, row in enumerate(raw[:5]):
        d = float(row["distance"])
        sim = 1.0 - d
        vid = str(row["video_id"])
        body = str(row["content"]).strip()
        if len(body) > 500:
            body = body[:500] + "…"
        lines.append(
            f"\n--- Match {i + 1} · video {vid} (similarity {sim:.2f}) ---\n{body}"
        )
    return "\n".join(lines)


def _http_exc_detail(exc: HTTPException) -> str:
    d = exc.detail
    if isinstance(d, str):
        return d
    if isinstance(d, list):
        parts: list[str] = []
        for item in d:
            if isinstance(item, dict):
                parts.append(str(item.get("msg", item)))
            else:
                parts.append(str(item))
        return "; ".join(parts)
    return str(d)


def _preview_for_trace(kind: str, req: dict[str, Any]) -> str:
    q = ""
    if kind in ("lecture_rag", "book_rag", "rag_query"):
        q = str(req.get("query") or "")
    elif kind == "visualize":
        q = str(req.get("prompt") or "")
    elif kind == "grader":
        aq = str(req.get("assignment_questions") or "").strip()
        ss = str(req.get("student_submission") or "").strip()
        q = f"{aq[:180]} · {ss[:180]}".strip(" ·")
    elif kind == "office_hours":
        msgs = req.get("messages")
        if isinstance(msgs, list):
            for m in reversed(msgs):
                if isinstance(m, dict) and str(m.get("role")) == "user":
                    q = str(m.get("content") or "")
                    break
    q = q.replace("\n", " ").strip()
    return q[:400] if len(q) > 400 else q


def _save_prompt_trace(
    kind: str,
    request: dict[str, Any],
    response: Any | None,
    error: str | None,
) -> None:
    preview = _preview_for_trace(kind, request)
    try:
        with get_connection() as conn:
            insert_prompt_trace(
                conn,
                kind=kind,
                preview=preview,
                request=request,
                response=response,
                error=error,
            )
    except Exception:
        pass


class RagAnswerBody(BaseModel):
    query: str = Field(..., min_length=1)
    video_id: str | None = Field(
        default=None,
        description="Restrict search to this YouTube id; omit or null to search all videos.",
    )
    video_ids: list[str] | None = Field(
        default=None,
        description="Restrict search to these ids (multi-part same topic). Overrides video_id when non-empty.",
    )
    top_k: int = Field(12, ge=1, le=50)


class GraderRequest(BaseModel):
    assignment_questions: str = Field(..., min_length=1)
    student_submission: str = Field(..., min_length=1)
    subject_context: str | None = Field(
        default=None,
        description="Optional course name, discipline, or level (e.g. 'Junior Thermodynamics').",
    )
    rubric_or_instructions: str | None = Field(
        default=None,
        description="Optional rubric, point breakdown, or grading notes from the instructor.",
    )


class GraderResponse(BaseModel):
    numeric_score: float
    letter_grade: str
    summary_line: str
    detailed_feedback: str
    used_llm: bool


class OfficeHoursMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=48000)


class OfficeHoursBody(BaseModel):
    messages: list[OfficeHoursMessage] = Field(..., min_length=1, max_length=48)
    video_id: str | None = Field(
        default=None,
        description="Single lecture YouTube id; omit with video_ids or for all lectures.",
    )
    video_ids: list[str] | None = Field(
        default=None,
        description="Multiple ids (e.g. same topic); overrides single video_id when set.",
    )
    include_books: bool = Field(
        True,
        description="Also retrieve PDF book chunks for this turn (course textbooks).",
    )
    lecture_top_k: int = Field(10, ge=1, le=40)
    book_top_k: int = Field(8, ge=0, le=24)


class OfficeHoursResponse(BaseModel):
    reply: str


class RagAnswerResponse(BaseModel):
    summary: str
    filter_video_id: str | None = Field(
        default=None,
        description="Echo of single-video filter; None when multi-id or global.",
    )
    filter_video_ids: list[str] | None = Field(
        default=None,
        description="Echo when search used multiple video ids.",
    )
    hits: list[RagHit]
    used_llm: bool


class BookItem(BaseModel):
    id: str
    slug: str
    title: str
    page_count: int | None = None
    chunk_count: int = 0


class BooksListResponse(BaseModel):
    books: list[BookItem]


class BookHit(BaseModel):
    book_id: str
    slug: str
    book_title: str
    chunk_index: int
    content: str
    start_page: int
    end_page: int
    distance: float
    similarity: float


class BookAnswerBody(BaseModel):
    query: str = Field(..., min_length=1)
    book_id: str | None = Field(
        default=None,
        description="UUID of one ingested book; omit to search all books.",
    )
    top_k: int = Field(10, ge=1, le=50)


class BookAnswerResponse(BaseModel):
    summary: str
    filter_book_id: str | None = Field(
        default=None,
        description="Echo when search was scoped to one book.",
    )
    hits: list[BookHit]
    used_llm: bool


def _parse_optional_book_id(raw: str | None) -> str | None:
    if raw is None:
        return None
    s = raw.strip()
    if not s:
        return None
    try:
        uuid.UUID(s)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid book_id (expected UUID): {s}") from e
    return s


def _rows_to_book_hits(raw: list[dict]) -> list[BookHit]:
    out: list[BookHit] = []
    for row in raw:
        d = float(row["distance"])
        out.append(
            BookHit(
                book_id=str(row["book_id"]),
                slug=str(row["slug"]),
                book_title=str(row["book_title"]),
                chunk_index=int(row["chunk_index"]),
                content=row["content"],
                start_page=int(row["start_page"]),
                end_page=int(row["end_page"]),
                distance=d,
                similarity=float(1.0 - d),
            )
        )
    return out


def _fallback_book_summary(raw: list[dict]) -> str:
    if not raw:
        return (
            "No matching book chunks found. "
            "Ingest PDFs with: python ingest_book_pdf.py path/to/book.pdf"
        )
    lines = [
        "AI summary needs ANTHROPIC_API_KEY. Closest PDF excerpts:",
    ]
    for i, row in enumerate(raw[:5]):
        d = float(row["distance"])
        sim = 1.0 - d
        title = str(row.get("book_title") or row.get("slug"))
        sp, ep = int(row["start_page"]), int(row["end_page"])
        pages = f"p. {sp}" if sp == ep else f"pp. {sp}–{ep}"
        body = str(row["content"]).strip()
        if len(body) > 500:
            body = body[:500] + "…"
        lines.append(f"\n--- Match {i + 1} · {title} · {pages} (similarity {sim:.2f}) ---\n{body}")
    return "\n".join(lines)


def _normalize_video_ids(raw: list[str] | None) -> list[str] | None:
    if not raw:
        return None
    seen: dict[str, None] = {}
    for x in raw:
        if not isinstance(x, str):
            continue
        s = x.strip()
        if s:
            seen[s] = None
    out = list(seen.keys())
    if len(out) > 120:
        raise HTTPException(status_code=400, detail="video_ids: at most 120 entries")
    return out or None


def _normalize_prompt_for_similarity(s: str) -> str:
    return " ".join(s.lower().split())


def _prompt_similarity_ratio(a: str, b: str) -> float:
    na = _normalize_prompt_for_similarity(a)
    nb = _normalize_prompt_for_similarity(b)
    if not na and not nb:
        return 1.0
    if not na or not nb:
        return 0.0
    return float(SequenceMatcher(None, na, nb).ratio())


def _video_scope_key_from_req(req: dict[str, Any]) -> tuple[str, tuple[str, ...]]:
    raw_ids = req.get("video_ids")
    ids: list[str] = []
    if isinstance(raw_ids, list):
        for x in raw_ids:
            if isinstance(x, str) and x.strip():
                ids.append(x.strip())
    if ids:
        return ("multi", tuple(sorted(set(ids))))
    vid = req.get("video_id")
    if isinstance(vid, str) and vid.strip():
        return ("single", (vid.strip(),))
    return ("global", ())


def _lecture_rag_trace_matches_request(stored: dict[str, Any], incoming: dict[str, Any]) -> bool:
    if _video_scope_key_from_req(stored) != _video_scope_key_from_req(incoming):
        return False
    try:
        ts = int(stored["top_k"]) if stored.get("top_k") is not None else 12
        ti = int(incoming["top_k"]) if incoming.get("top_k") is not None else 12
    except (TypeError, ValueError):
        return False
    return ts == ti


def _norm_domain_hint_json(v: Any) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def _visualize_trace_matches_request(stored: dict[str, Any], incoming: dict[str, Any]) -> bool:
    if bool(stored.get("animation")) != bool(incoming.get("animation")):
        return False
    sm = str(stored.get("visual_mode") or "default")
    im = str(incoming.get("visual_mode") or "default")
    if sm != im:
        return False
    if _norm_domain_hint_json(stored.get("domain_hint")) != _norm_domain_hint_json(incoming.get("domain_hint")):
        return False
    return True


class PromptTraceListItem(BaseModel):
    id: int
    kind: str
    preview: str
    has_error: bool
    created_at: datetime


class PromptTraceListResponse(BaseModel):
    items: list[PromptTraceListItem]


class PromptTraceDetail(BaseModel):
    id: int
    kind: str
    preview: str
    has_error: bool
    created_at: datetime
    request: dict[str, Any]
    response: Any | None = None
    error: str | None = None


class HistoryMatchRequest(BaseModel):
    """Find a recent successful trace with compatible scope/options and similar prompt text."""

    kind: Literal["lecture_rag", "visualize"]
    request: dict[str, Any]
    min_similarity: float = Field(
        0.92,
        ge=0.5,
        le=1.0,
        description="Minimum difflib ratio on normalized text (whitespace-insensitive, case-insensitive).",
    )


class HistoryMatchResponse(BaseModel):
    hit: bool
    trace_id: int | None = None
    similarity: float | None = None
    response: Any | None = Field(default=None, description="Saved response_json when hit is true.")


@app.get("/api/history", response_model=PromptTraceListResponse)
def list_prompt_history(
    kind: str | None = None,
    limit: int = 50,
    offset: int = 0,
):
    if kind is not None and kind not in PROMPT_TRACE_KINDS:
        raise HTTPException(
            status_code=400,
            detail=f"kind must be one of: {', '.join(sorted(PROMPT_TRACE_KINDS))}",
        )
    lim = max(1, min(limit, 200))
    off = max(0, offset)
    with get_connection() as conn:
        rows = list_prompt_traces(conn, kind=kind or None, limit=lim, offset=off)
    items = [
        PromptTraceListItem(
            id=int(r["id"]),
            kind=str(r["kind"]),
            preview=str(r.get("preview") or ""),
            has_error=bool(r.get("has_error")),
            created_at=r["created_at"],
        )
        for r in rows
    ]
    return PromptTraceListResponse(items=items)


@app.get("/api/history/{trace_id}", response_model=PromptTraceDetail)
def get_prompt_history(trace_id: int):
    with get_connection() as conn:
        row = get_prompt_trace(conn, trace_id)
    if not row:
        raise HTTPException(status_code=404, detail="Trace not found")
    err = row.get("error_text")
    req = row["request_json"]
    if not isinstance(req, dict):
        req = {}
    return PromptTraceDetail(
        id=int(row["id"]),
        kind=str(row["kind"]),
        preview=str(row.get("preview") or ""),
        has_error=err is not None,
        created_at=row["created_at"],
        request=req,
        response=row.get("response_json"),
        error=str(err) if err is not None else None,
    )


@app.post("/api/history/match", response_model=HistoryMatchResponse)
def match_prompt_history(body: HistoryMatchRequest):
    """Return cached response when a recent trace matches kind, options, and prompt similarity."""
    incoming = body.request
    min_sim = float(body.min_similarity)

    if body.kind == "lecture_rag":
        q_in = str(incoming.get("query") or "").strip()
        if not q_in:
            return HistoryMatchResponse(hit=False)

        def row_ok(req: dict[str, Any]) -> bool:
            return _lecture_rag_trace_matches_request(req, incoming)

        text_key = "query"
    else:
        q_in = str(incoming.get("prompt") or "").strip()
        if not q_in:
            return HistoryMatchResponse(hit=False)

        def row_ok(req: dict[str, Any]) -> bool:
            return _visualize_trace_matches_request(req, incoming)

        text_key = "prompt"

    with get_connection() as conn:
        rows = list_prompt_traces_for_similarity_match(conn, kind=body.kind, limit=160)

    for row in rows:
        req = row.get("request_json")
        if not isinstance(req, dict):
            continue
        if not row_ok(req):
            continue
        q_stored = str(req.get(text_key) or "").strip()
        sim = _prompt_similarity_ratio(q_in, q_stored)
        if sim >= min_sim:
            return HistoryMatchResponse(
                hit=True,
                trace_id=int(row["id"]),
                similarity=round(sim, 4),
                response=row.get("response_json"),
            )
    return HistoryMatchResponse(hit=False)


@app.post("/api/rag/answer", response_model=RagAnswerResponse)
def rag_answer(body: RagAnswerBody):
    """Retrieve transcript chunks and produce an answer (Claude if configured)."""
    req = body.model_dump(mode="json")
    try:
        q = body.query.strip()
        if not q:
            raise HTTPException(status_code=400, detail="query is empty")

        ids = _normalize_video_ids(body.video_ids)
        filter_vid = (body.video_id or "").strip() or None
        if ids:
            filter_vid = None

        rq = widen_retrieval_query_for_multi_video(q, len(ids)) if ids else q
        qvec = encode_texts([rq])[0]
        with get_connection() as conn:
            if ids:
                raw = search_similar_multi(conn, ids, qvec, top_k=body.top_k)
            elif filter_vid:
                raw = search_similar(conn, filter_vid, qvec, top_k=body.top_k)
            else:
                raw = search_similar_global(conn, qvec, top_k=body.top_k)

        if not raw:
            raise HTTPException(
                status_code=404,
                detail=(
                    f"No transcript chunks for video_ids={ids!r}. Run ingest_transcript.py first."
                    if ids
                    else (
                        f"No transcript chunks for video_id={filter_vid!r}. Run ingest_transcript.py first."
                        if filter_vid
                        else "No transcript chunks in the database. Run ingest_transcript.py first."
                    )
                ),
            )

        used_llm = bool(os.environ.get("ANTHROPIC_API_KEY"))
        if used_llm:
            try:
                from lecture_rag_agent import run_rag_agent

                model = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6")
                summary, hits_raw = run_rag_agent(
                    q,
                    video_id=filter_vid,
                    video_ids=ids,
                    top_k=body.top_k,
                    model=model,
                    max_tokens=2048,
                )
            except Exception as e:
                raise HTTPException(
                    status_code=502,
                    detail=f"LLM answer failed: {e!s}",
                ) from e
        else:
            summary = _fallback_summary(raw)
            hits_raw = raw

        resp = RagAnswerResponse(
            summary=summary,
            filter_video_id=filter_vid,
            filter_video_ids=ids,
            hits=_rows_to_hits(hits_raw),
            used_llm=used_llm,
        )
        _save_prompt_trace("lecture_rag", req, resp.model_dump(mode="json"), None)
        return resp
    except HTTPException as e:
        _save_prompt_trace("lecture_rag", req, None, _http_exc_detail(e))
        raise
    except Exception as e:
        _save_prompt_trace("lecture_rag", req, None, str(e))
        raise


@app.get("/api/books", response_model=BooksListResponse)
def get_books():
    """List ingested PDF books (see ingest_book_pdf.py)."""
    with get_connection() as conn:
        rows = list_books(conn)
    books = [
        BookItem(
            id=str(r["id"]),
            slug=str(r["slug"]),
            title=str(r["title"]),
            page_count=r.get("page_count"),
            chunk_count=int(r.get("chunk_count") or 0),
        )
        for r in rows
    ]
    return BooksListResponse(books=books)


@app.post("/api/books/answer", response_model=BookAnswerResponse)
def books_answer(body: BookAnswerBody):
    """Retrieve PDF-derived book chunks (page-aware) and answer with Claude if configured."""
    req = body.model_dump(mode="json")
    try:
        q = body.query.strip()
        if not q:
            raise HTTPException(status_code=400, detail="query is empty")

        bid = _parse_optional_book_id(body.book_id)
        qvec = encode_texts([q])[0]
        with get_connection() as conn:
            raw = search_similar_books(conn, bid, qvec, top_k=body.top_k)

        if not raw:
            raise HTTPException(
                status_code=404,
                detail=(
                    f"No book chunks for book_id={bid!r}. Run ingest_book_pdf.py first."
                    if bid
                    else "No book chunks in the database. Run ingest_book_pdf.py on your PDFs first."
                ),
            )

        used_llm = bool(os.environ.get("ANTHROPIC_API_KEY"))
        if used_llm:
            try:
                from book_rag_agent import run_book_rag_agent

                model = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6")
                summary, hits_raw = run_book_rag_agent(
                    q,
                    book_id=bid,
                    top_k=body.top_k,
                    model=model,
                    max_tokens=4096,
                )
            except Exception as e:
                raise HTTPException(
                    status_code=502,
                    detail=f"LLM answer failed: {e!s}",
                ) from e
        else:
            summary = _fallback_book_summary(raw)
            hits_raw = raw

        resp = BookAnswerResponse(
            summary=summary,
            filter_book_id=bid,
            hits=_rows_to_book_hits(hits_raw),
            used_llm=used_llm,
        )
        _save_prompt_trace("book_rag", req, resp.model_dump(mode="json"), None)
        return resp
    except HTTPException as e:
        _save_prompt_trace("book_rag", req, None, _http_exc_detail(e))
        raise
    except Exception as e:
        _save_prompt_trace("book_rag", req, None, str(e))
        raise


class VisualizeSceneRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=8000)
    domain_hint: str | None = Field(
        default=None,
        max_length=500,
        description="Optional subject e.g. organic chemistry, mechanics.",
    )
    animation: bool = Field(
        False,
        description="If true, return multi-frame mechanism data for timeline playback.",
    )
    visual_mode: Literal["default", "realism", "polygon_only"] = Field(
        "default",
        description="default: vectors + optional Wikipedia refs; realism: encyclopedia images only; polygon_only: polygon shapes only.",
    )


@app.post("/api/visualize/scene")
def visualize_scene(body: VisualizeSceneRequest):
    """Generate interactive canvas scene (nodes + bonds) from a natural-language prompt.

    Model resolution: ``ANTHROPIC_MODEL_VISUALIZE`` if set, else ``ANTHROPIC_MODEL``, else ``claude-sonnet-4-6``.
    """
    req = body.model_dump(mode="json")
    if not os.environ.get("ANTHROPIC_API_KEY"):
        _save_prompt_trace("visualize", req, None, "Visualization requires ANTHROPIC_API_KEY.")
        raise HTTPException(
            status_code=503,
            detail="Visualization requires ANTHROPIC_API_KEY.",
        )
    try:
        from visualize_agent import AnimatedVisualizeScene, run_visualize_scene

        model = os.environ.get(
            "ANTHROPIC_MODEL_VISUALIZE",
            os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6"),
        )
        max_tok = 8192 * 10
        scene = run_visualize_scene(
            prompt=body.prompt,
            domain_hint=body.domain_hint,
            model=model,
            max_tokens=max_tok,
            animation=body.animation,
            visual_mode=body.visual_mode,
        )
        if isinstance(scene, AnimatedVisualizeScene):
            payload = {
                "plan": scene.plan,
                "title": scene.title,
                "caption": scene.caption,
                "nodes": None,
                "edges": None,
                "frames": [
                    {
                        "step_label": fr.step_label,
                        "step_detail": fr.step_detail,
                        "nodes": [n.model_dump() for n in fr.nodes],
                        "edges": [e.model_dump() for e in fr.edges],
                        "shapes": [s.model_dump() for s in fr.shapes],
                    }
                    for fr in scene.frames
                ],
                "used_llm": True,
            }
        else:
            payload = {
                "plan": scene.plan,
                "title": scene.title,
                "caption": scene.caption,
                "nodes": [n.model_dump() for n in scene.nodes],
                "edges": [e.model_dump() for e in scene.edges],
                "shapes": [s.model_dump() for s in scene.shapes],
                "frames": None,
                "used_llm": True,
            }
        enc = jsonable_encoder(payload)
        if isinstance(enc, dict):
            _save_prompt_trace("visualize", req, enc, None)
        else:
            _save_prompt_trace("visualize", req, {"payload": enc}, None)
        return payload
    except HTTPException as e:
        _save_prompt_trace("visualize", req, None, _http_exc_detail(e))
        raise
    except ValueError as e:
        _save_prompt_trace("visualize", req, None, str(e))
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        _save_prompt_trace("visualize", req, None, str(e))
        raise HTTPException(status_code=502, detail=f"Visualization failed: {e!s}") from e


@app.post("/api/grader/grade", response_model=GraderResponse)
def grade_homework(body: GraderRequest):
    """Grade homework using Claude with a generic university rubric (A–F / 0–100)."""
    req = body.model_dump(mode="json")
    if not os.environ.get("ANTHROPIC_API_KEY"):
        _save_prompt_trace(
            "grader",
            req,
            None,
            "Grading requires ANTHROPIC_API_KEY (same as lecture answers).",
        )
        raise HTTPException(
            status_code=503,
            detail="Grading requires ANTHROPIC_API_KEY (same as lecture answers).",
        )
    try:
        from rubric_grader_agent import run_rubric_grader

        model = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6")
        result = run_rubric_grader(
            assignment_questions=body.assignment_questions,
            student_submission=body.student_submission,
            subject_context=body.subject_context,
            rubric_or_instructions=body.rubric_or_instructions,
            model=model,
            max_tokens=8192,
        )
        resp = GraderResponse(
            numeric_score=result.numeric_score,
            letter_grade=result.letter_grade,
            summary_line=result.summary_line,
            detailed_feedback=result.detailed_feedback,
            used_llm=True,
        )
        _save_prompt_trace("grader", req, resp.model_dump(mode="json"), None)
        return resp
    except HTTPException as e:
        _save_prompt_trace("grader", req, None, _http_exc_detail(e))
        raise
    except ValueError as e:
        _save_prompt_trace("grader", req, None, str(e))
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        _save_prompt_trace("grader", req, None, str(e))
        raise HTTPException(status_code=502, detail=f"Grading failed: {e!s}") from e


@app.post("/api/rag/query", response_model=RagQueryResponse)
async def rag_query(body: RagQuery):
    req = body.model_dump(mode="json")
    try:
        q = body.query.strip()
        if not q:
            raise HTTPException(status_code=400, detail="query is empty")
        ids = _normalize_video_ids(body.video_ids)
        filter_vid = (body.video_id or "").strip() or None
        if ids:
            filter_vid = None
        rq = widen_retrieval_query_for_multi_video(q, len(ids)) if ids else q
        qvec = encode_texts([rq])[0]
        with get_connection() as conn:
            if ids:
                raw = search_similar_multi(conn, ids, qvec, top_k=body.top_k)
            elif filter_vid:
                raw = search_similar(conn, filter_vid, qvec, top_k=body.top_k)
            else:
                raw = search_similar_global(conn, qvec, top_k=body.top_k)
        resp = RagQueryResponse(
            filter_video_id=filter_vid,
            filter_video_ids=ids,
            hits=_rows_to_hits(raw),
        )
        _save_prompt_trace("rag_query", req, resp.model_dump(mode="json"), None)
        return resp
    except HTTPException as e:
        _save_prompt_trace("rag_query", req, None, _http_exc_detail(e))
        raise
    except Exception as e:
        _save_prompt_trace("rag_query", req, None, str(e))
        raise


@app.post("/api/office-hours/chat", response_model=OfficeHoursResponse)
def office_hours_chat(body: OfficeHoursBody):
    """Multi-turn professor persona with lecture (+ optional book) RAG per student message."""
    req = body.model_dump(mode="json")
    if not os.environ.get("ANTHROPIC_API_KEY"):
        detail = "Office Hours requires ANTHROPIC_API_KEY."
        _save_prompt_trace("office_hours", req, None, detail)
        raise HTTPException(status_code=503, detail=detail)
    try:
        msgs = [{"role": m.role, "content": m.content.strip()} for m in body.messages]
        if not msgs:
            raise HTTPException(status_code=400, detail="messages is empty")
        if msgs[0]["role"] != "user":
            raise HTTPException(
                status_code=400,
                detail="Conversation must start with a user message.",
            )
        for i, m in enumerate(msgs):
            expected: Literal["user", "assistant"] = "user" if i % 2 == 0 else "assistant"
            if m["role"] != expected:
                raise HTTPException(
                    status_code=400,
                    detail="messages must strictly alternate user and assistant.",
                )
        ids = _normalize_video_ids(body.video_ids)
        vid = (body.video_id or "").strip() or None
        if ids:
            vid = None
        model = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6")
        from office_hours_agent import run_office_hours_turn

        reply = run_office_hours_turn(
            msgs,
            video_id=vid,
            video_ids=ids,
            include_books=body.include_books,
            lecture_top_k=body.lecture_top_k,
            book_top_k=body.book_top_k,
            model=model,
            max_tokens=4096,
        )
        resp = OfficeHoursResponse(reply=reply)
        _save_prompt_trace("office_hours", req, resp.model_dump(mode="json"), None)
        return resp
    except ValueError as e:
        _save_prompt_trace("office_hours", req, None, str(e))
        raise HTTPException(status_code=400, detail=str(e)) from e
    except HTTPException as e:
        _save_prompt_trace("office_hours", req, None, _http_exc_detail(e))
        raise
    except Exception as e:
        _save_prompt_trace("office_hours", req, None, str(e))
        raise HTTPException(status_code=502, detail=f"Office Hours failed: {e!s}") from e
