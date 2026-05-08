from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from embeddings import encode_texts, embedding_dim
from rag_store import get_connection, init_schema, search_similar


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


class RagQuery(BaseModel):
    query: str = Field(..., min_length=1)
    video_id: str = "pyX8kQ-JzHI"
    top_k: int = Field(5, ge=1, le=50)


class RagHit(BaseModel):
    chunk_index: int
    content: str
    start_ms: int | None
    end_ms: int | None
    distance: float
    similarity: float


class RagQueryResponse(BaseModel):
    video_id: str
    hits: list[RagHit]


@app.post("/api/rag/query", response_model=RagQueryResponse)
async def rag_query(body: RagQuery):
    q = body.query.strip()
    if not q:
        raise HTTPException(status_code=400, detail="query is empty")
    qvec = encode_texts([q])[0]
    with get_connection() as conn:
        raw = search_similar(conn, body.video_id, qvec, top_k=body.top_k)
    hits: list[RagHit] = []
    for row in raw:
        d = float(row["distance"])
        hits.append(
            RagHit(
                chunk_index=int(row["chunk_index"]),
                content=row["content"],
                start_ms=row["start_ms"],
                end_ms=row["end_ms"],
                distance=d,
                similarity=float(1.0 - d),
            )
        )
    return RagQueryResponse(video_id=body.video_id, hits=hits)
