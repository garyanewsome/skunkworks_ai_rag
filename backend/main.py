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
)

_BACKEND_ROOT = Path(__file__).resolve().parent
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


class VideosListResponse(BaseModel):
    videos: list[VideoItem]


@app.get("/api/videos", response_model=VideosListResponse)
def get_videos():
    """List lecture videos that have ingested transcript chunks (distinct video_id from DB)."""
    with get_connection() as conn:
        rows = list_videos(conn)
    return VideosListResponse(
        videos=[
            VideoItem(video_id=str(r["video_id"]), chunk_count=int(r["chunk_count"]))
            for r in rows
        ]
    )


class RagQuery(BaseModel):
    query: str = Field(..., min_length=1)
    video_id: str | None = Field(
        default=None,
        description="Restrict search to this YouTube id; omit to search all ingested videos.",
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
        description="Echo of request filter; None means global search.",
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
    top_k: int = Field(12, ge=1, le=50)


class RagAnswerResponse(BaseModel):
    summary: str
    filter_video_id: str | None = Field(
        default=None,
        description="Echo of request filter; None means results span all videos.",
    )
    hits: list[RagHit]
    used_llm: bool


@app.post("/api/rag/answer", response_model=RagAnswerResponse)
def rag_answer(body: RagAnswerBody):
    """Retrieve transcript chunks and produce an answer (Claude if configured)."""
    q = body.query.strip()
    if not q:
        raise HTTPException(status_code=400, detail="query is empty")

    filter_vid = (body.video_id or "").strip() or None

    qvec = encode_texts([q])[0]
    with get_connection() as conn:
        if filter_vid:
            raw = search_similar(conn, filter_vid, qvec, top_k=body.top_k)
        else:
            raw = search_similar_global(conn, qvec, top_k=body.top_k)

    if not raw:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No transcript chunks for video_id={filter_vid!r}. Run ingest_transcript.py first."
                if filter_vid
                else "No transcript chunks in the database. Run ingest_transcript.py first."
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
        hits=_rows_to_hits(hits_raw),
        used_llm=used_llm,
    )


@app.post("/api/rag/query", response_model=RagQueryResponse)
async def rag_query(body: RagQuery):
    q = body.query.strip()
    if not q:
        raise HTTPException(status_code=400, detail="query is empty")
    filter_vid = (body.video_id or "").strip() or None
    qvec = encode_texts([q])[0]
    with get_connection() as conn:
        if filter_vid:
            raw = search_similar(conn, filter_vid, qvec, top_k=body.top_k)
        else:
            raw = search_similar_global(conn, qvec, top_k=body.top_k)
    return RagQueryResponse(filter_video_id=filter_vid, hits=_rows_to_hits(raw))
