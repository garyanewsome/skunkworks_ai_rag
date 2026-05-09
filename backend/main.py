import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from embeddings import encode_texts, embedding_dim
from rag_store import (
    get_connection,
    init_schema,
    list_videos,
    search_similar,
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


@app.post("/api/rag/answer", response_model=RagAnswerResponse)
def rag_answer(body: RagAnswerBody):
    """Retrieve transcript chunks and produce an answer (Claude if configured)."""
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

    return RagAnswerResponse(
        summary=summary,
        filter_video_id=filter_vid,
        filter_video_ids=ids,
        hits=_rows_to_hits(hits_raw),
        used_llm=used_llm,
    )


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


@app.post("/api/visualize/scene")
def visualize_scene(body: VisualizeSceneRequest):
    """Generate interactive canvas scene (nodes + bonds) from a natural-language prompt."""
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise HTTPException(
            status_code=503,
            detail="Visualization requires ANTHROPIC_API_KEY.",
        )
    try:
        from visualize_agent import AnimatedVisualizeScene, run_visualize_scene

        model = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6")
        max_tok = 8192 if body.animation else 4096
        scene = run_visualize_scene(
            prompt=body.prompt,
            domain_hint=body.domain_hint,
            model=model,
            max_tokens=max_tok,
            animation=body.animation,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Visualization failed: {e!s}") from e

    if isinstance(scene, AnimatedVisualizeScene):
        return {
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

    return {
        "title": scene.title,
        "caption": scene.caption,
        "nodes": [n.model_dump() for n in scene.nodes],
        "edges": [e.model_dump() for e in scene.edges],
        "shapes": [s.model_dump() for s in scene.shapes],
        "frames": None,
        "used_llm": True,
    }


@app.post("/api/grader/grade", response_model=GraderResponse)
def grade_homework(body: GraderRequest):
    """Grade homework using Claude with a generic university rubric (A–F / 0–100)."""
    if not os.environ.get("ANTHROPIC_API_KEY"):
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
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Grading failed: {e!s}") from e

    return GraderResponse(
        numeric_score=result.numeric_score,
        letter_grade=result.letter_grade,
        summary_line=result.summary_line,
        detailed_feedback=result.detailed_feedback,
        used_llm=True,
    )


@app.post("/api/rag/query", response_model=RagQueryResponse)
async def rag_query(body: RagQuery):
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
    return RagQueryResponse(
        filter_video_id=filter_vid,
        filter_video_ids=ids,
        hits=_rows_to_hits(raw),
    )
