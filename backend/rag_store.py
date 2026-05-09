"""Postgres + pgvector storage for transcript chunks."""

from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Any, Generator, Sequence

import numpy as np
import psycopg
from pgvector.psycopg import register_vector
from psycopg.rows import dict_row
from psycopg.types.json import Json

DEFAULT_DATABASE_URL = (
    "postgresql://dev_user:dev_password@127.0.0.1:5432/embedding_db"
)


def database_url() -> str:
    return os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL)


def widen_retrieval_query_for_multi_video(question: str, video_count: int) -> str:
    """Bias embeddings toward lecture substance when many videos are in scope.

    Meta prompts (study guide, list all questions, …) often match generic intros
    instead of technical content; expanding the retrieval string improves chunk quality.
    """
    q = question.strip()
    if video_count <= 1:
        return q
    ql = q.lower()
    meta_terms = (
        "study",
        "guide",
        "comprehensive",
        "all the",
        "all transcript",
        "this group",
        "entire",
        "whole course",
        "practice",
        "questions for",
        "quiz",
        "exam",
        "review sheet",
        "list of",
    )
    if not any(t in ql for t in meta_terms):
        return q
    return (
        f"{q}\n\n"
        "Focus retrieval on: main concepts, definitions, theorems, equations, derivations, "
        "worked examples, and technical explanations from the lectures."
    )


@contextmanager
def get_connection() -> Generator[psycopg.Connection, None, None]:
    conn = psycopg.connect(database_url(), autocommit=True)
    try:
        with conn.cursor() as cur:
            cur.execute("CREATE EXTENSION IF NOT EXISTS vector")
        register_vector(conn)
        yield conn
    finally:
        conn.close()


def init_schema(conn: psycopg.Connection, embedding_dim: int) -> None:
    with conn.cursor() as cur:
        cur.execute("CREATE EXTENSION IF NOT EXISTS vector")
        cur.execute(
            f"""
            CREATE TABLE IF NOT EXISTS video_chunks (
                id BIGSERIAL PRIMARY KEY,
                video_id TEXT NOT NULL,
                chunk_index INT NOT NULL,
                content TEXT NOT NULL,
                start_ms INT,
                end_ms INT,
                embedding vector({embedding_dim}) NOT NULL,
                created_at TIMESTAMPTZ DEFAULT now(),
                CONSTRAINT uq_video_chunk UNIQUE (video_id, chunk_index)
            )
            """
        )
        cur.execute(
            """
            CREATE INDEX IF NOT EXISTS video_chunks_embedding_hnsw
            ON video_chunks USING hnsw (embedding vector_cosine_ops)
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS video_meta (
                video_id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                updated_at TIMESTAMPTZ DEFAULT now()
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS book_documents (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                slug TEXT NOT NULL UNIQUE,
                title TEXT NOT NULL,
                source_path TEXT NOT NULL,
                page_count INT,
                created_at TIMESTAMPTZ DEFAULT now(),
                updated_at TIMESTAMPTZ DEFAULT now()
            )
            """
        )
        cur.execute(
            f"""
            CREATE TABLE IF NOT EXISTS book_chunks (
                id BIGSERIAL PRIMARY KEY,
                book_id UUID NOT NULL REFERENCES book_documents(id) ON DELETE CASCADE,
                chunk_index INT NOT NULL,
                content TEXT NOT NULL,
                start_page INT NOT NULL,
                end_page INT NOT NULL,
                embedding vector({embedding_dim}) NOT NULL,
                created_at TIMESTAMPTZ DEFAULT now(),
                CONSTRAINT uq_book_chunk UNIQUE (book_id, chunk_index)
            )
            """
        )
        cur.execute(
            """
            CREATE INDEX IF NOT EXISTS book_chunks_embedding_hnsw
            ON book_chunks USING hnsw (embedding vector_cosine_ops)
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS prompt_traces (
                id BIGSERIAL PRIMARY KEY,
                kind TEXT NOT NULL,
                preview TEXT NOT NULL DEFAULT '',
                request_json JSONB NOT NULL,
                response_json JSONB,
                error_text TEXT,
                created_at TIMESTAMPTZ DEFAULT now()
            )
            """
        )
        cur.execute(
            """
            CREATE INDEX IF NOT EXISTS prompt_traces_created_idx
            ON prompt_traces (created_at DESC)
            """
        )
        cur.execute(
            """
            CREATE INDEX IF NOT EXISTS prompt_traces_kind_idx
            ON prompt_traces (kind)
            """
        )


def upsert_video_title(conn: psycopg.Connection, video_id: str, title: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO video_meta (video_id, title, updated_at)
            VALUES (%s, %s, now())
            ON CONFLICT (video_id) DO UPDATE SET
                title = EXCLUDED.title,
                updated_at = now()
            """,
            (video_id, title),
        )


def upsert_video_titles(conn: psycopg.Connection, titles: dict[str, str]) -> int:
    """Bulk upsert id -> title. Returns number of rows written."""
    n = 0
    for vid, title in titles.items():
        if not title.strip():
            continue
        upsert_video_title(conn, vid.strip(), title.strip())
        n += 1
    return n


def delete_video_chunks(conn: psycopg.Connection, video_id: str) -> None:
    with conn.cursor() as cur:
        cur.execute("DELETE FROM video_chunks WHERE video_id = %s", (video_id,))


def insert_chunks(
    conn: psycopg.Connection,
    video_id: str,
    rows: Sequence[dict[str, Any]],
    embeddings: np.ndarray,
) -> int:
    assert len(rows) == len(embeddings)
    with conn.cursor() as cur:
        for i, (row, vec) in enumerate(zip(rows, embeddings)):
            cur.execute(
                """
                INSERT INTO video_chunks
                    (video_id, chunk_index, content, start_ms, end_ms, embedding)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (video_id, chunk_index) DO UPDATE SET
                    content = EXCLUDED.content,
                    start_ms = EXCLUDED.start_ms,
                    end_ms = EXCLUDED.end_ms,
                    embedding = EXCLUDED.embedding,
                    created_at = now()
                """,
                (
                    video_id,
                    i,
                    row["content"],
                    row.get("start_ms"),
                    row.get("end_ms"),
                    vec,
                ),
            )
    return len(rows)


def search_similar(
    conn: psycopg.Connection,
    video_id: str,
    query_embedding: np.ndarray,
    top_k: int = 5,
) -> list[dict[str, Any]]:
    q = np.asarray(query_embedding, dtype=np.float32).reshape(-1)
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT
                video_id,
                chunk_index,
                content,
                start_ms,
                end_ms,
                (embedding <=> %s::vector) AS distance
            FROM video_chunks
            WHERE video_id = %s
            ORDER BY embedding <=> %s::vector
            LIMIT %s
            """,
            (q, video_id, q, top_k),
        )
        return [dict(r) for r in cur.fetchall()]


def search_similar_multi(
    conn: psycopg.Connection,
    video_ids: list[str],
    query_embedding: np.ndarray,
    top_k: int = 5,
) -> list[dict[str, Any]]:
    """Nearest chunks restricted to a finite set of videos (e.g. same course across parts).

    A single global ``ORDER BY distance LIMIT top_k`` often returns many chunks from one
    lecture or only generic intros (meta-questions like "study guide" match weakly to
    technical content). We first allocate a floor of chunks per video, then fill any
    remaining budget with the next-best hits from the pool (deduped).
    """
    ids = [str(x).strip() for x in video_ids if x and str(x).strip()]
    if not ids:
        return []
    if len(ids) == 1:
        return search_similar(conn, ids[0], query_embedding, top_k=top_k)

    n = len(ids)
    q = np.asarray(query_embedding, dtype=np.float32).reshape(-1)

    # Fewer slots than videos: take each video's single best chunk, then keep top_k overall.
    if top_k < n:
        candidates: list[dict[str, Any]] = []
        for vid in ids:
            hits = search_similar(conn, vid, query_embedding, top_k=1)
            if hits:
                candidates.append(hits[0])
        candidates.sort(key=lambda r: float(r["distance"]))
        return candidates[:top_k]

    seen: set[tuple[str, int]] = set()
    merged: list[dict[str, Any]] = []

    floor_per = max(1, top_k // n)
    for vid in ids:
        for row in search_similar(conn, vid, query_embedding, top_k=floor_per):
            key = (str(row["video_id"]), int(row["chunk_index"]))
            if key in seen:
                continue
            seen.add(key)
            merged.append(row)

    if len(merged) >= top_k:
        merged.sort(key=lambda r: float(r["distance"]))
        return merged[:top_k]

    deficit = top_k - len(merged)
    fetch_limit = min(800, deficit * 20 + len(seen))
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT
                video_id,
                chunk_index,
                content,
                start_ms,
                end_ms,
                (embedding <=> %s::vector) AS distance
            FROM video_chunks
            WHERE video_id = ANY(%s::text[])
            ORDER BY embedding <=> %s::vector
            LIMIT %s
            """,
            (q, ids, q, fetch_limit),
        )
        for r in cur.fetchall():
            if len(merged) >= top_k:
                break
            row = dict(r)
            key = (str(row["video_id"]), int(row["chunk_index"]))
            if key in seen:
                continue
            seen.add(key)
            merged.append(row)

    merged.sort(key=lambda r: float(r["distance"]))
    return merged[:top_k]


def search_similar_global(
    conn: psycopg.Connection,
    query_embedding: np.ndarray,
    top_k: int = 5,
) -> list[dict[str, Any]]:
    """Nearest chunks across all videos (same embedding index)."""
    q = np.asarray(query_embedding, dtype=np.float32).reshape(-1)
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT
                video_id,
                chunk_index,
                content,
                start_ms,
                end_ms,
                (embedding <=> %s::vector) AS distance
            FROM video_chunks
            ORDER BY embedding <=> %s::vector
            LIMIT %s
            """,
            (q, q, top_k),
        )
        return [dict(r) for r in cur.fetchall()]


def list_videos(conn: psycopg.Connection) -> list[dict[str, Any]]:
    """Distinct video_ids with chunk counts and optional title from video_meta."""
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT
                vc.video_id,
                COUNT(*)::bigint AS chunk_count,
                vm.title AS title
            FROM video_chunks vc
            LEFT JOIN video_meta vm ON vm.video_id = vc.video_id
            GROUP BY vc.video_id, vm.title
            ORDER BY vc.video_id
            """
        )
        return [dict(r) for r in cur.fetchall()]


def upsert_book_document(
    conn: psycopg.Connection,
    *,
    slug: str,
    title: str,
    source_path: str,
    page_count: int,
) -> str:
    """Insert or update book metadata by slug. Returns book id as string."""
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO book_documents (slug, title, source_path, page_count, updated_at)
            VALUES (%s, %s, %s, %s, now())
            ON CONFLICT (slug) DO UPDATE SET
                title = EXCLUDED.title,
                source_path = EXCLUDED.source_path,
                page_count = EXCLUDED.page_count,
                updated_at = now()
            RETURNING id::text
            """,
            (slug, title, source_path, page_count),
        )
        row = cur.fetchone()
        if not row:
            raise RuntimeError("upsert_book_document: no row returned")
        return str(row[0])


def delete_book_chunks(conn: psycopg.Connection, book_id: str) -> None:
    with conn.cursor() as cur:
        cur.execute("DELETE FROM book_chunks WHERE book_id = %s::uuid", (book_id,))


def insert_book_chunks(
    conn: psycopg.Connection,
    book_id: str,
    rows: Sequence[dict[str, Any]],
    embeddings: np.ndarray,
) -> int:
    assert len(rows) == len(embeddings)
    with conn.cursor() as cur:
        for i, (row, vec) in enumerate(zip(rows, embeddings)):
            cur.execute(
                """
                INSERT INTO book_chunks
                    (book_id, chunk_index, content, start_page, end_page, embedding)
                VALUES (%s::uuid, %s, %s, %s, %s, %s)
                ON CONFLICT (book_id, chunk_index) DO UPDATE SET
                    content = EXCLUDED.content,
                    start_page = EXCLUDED.start_page,
                    end_page = EXCLUDED.end_page,
                    embedding = EXCLUDED.embedding,
                    created_at = now()
                """,
                (
                    book_id,
                    i,
                    row["content"],
                    int(row["start_page"]),
                    int(row["end_page"]),
                    vec,
                ),
            )
    return len(rows)


def list_books(conn: psycopg.Connection) -> list[dict[str, Any]]:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT
                bd.id::text AS id,
                bd.slug,
                bd.title,
                bd.page_count,
                COUNT(bc.id)::bigint AS chunk_count
            FROM book_documents bd
            LEFT JOIN book_chunks bc ON bc.book_id = bd.id
            GROUP BY bd.id, bd.slug, bd.title, bd.page_count
            ORDER BY bd.title
            """
        )
        return [dict(r) for r in cur.fetchall()]


def search_similar_books(
    conn: psycopg.Connection,
    book_id: str | None,
    query_embedding: np.ndarray,
    top_k: int = 8,
) -> list[dict[str, Any]]:
    q = np.asarray(query_embedding, dtype=np.float32).reshape(-1)
    with conn.cursor(row_factory=dict_row) as cur:
        if book_id:
            cur.execute(
                """
                SELECT
                    bd.id::text AS book_id,
                    bd.slug,
                    bd.title AS book_title,
                    bc.chunk_index,
                    bc.content,
                    bc.start_page,
                    bc.end_page,
                    (bc.embedding <=> %s::vector) AS distance
                FROM book_chunks bc
                JOIN book_documents bd ON bd.id = bc.book_id
                WHERE bc.book_id = %s::uuid
                ORDER BY bc.embedding <=> %s::vector
                LIMIT %s
                """,
                (q, book_id, q, top_k),
            )
        else:
            cur.execute(
                """
                SELECT
                    bd.id::text AS book_id,
                    bd.slug,
                    bd.title AS book_title,
                    bc.chunk_index,
                    bc.content,
                    bc.start_page,
                    bc.end_page,
                    (bc.embedding <=> %s::vector) AS distance
                FROM book_chunks bc
                JOIN book_documents bd ON bd.id = bc.book_id
                ORDER BY bc.embedding <=> %s::vector
                LIMIT %s
                """,
                (q, q, top_k),
            )
        return [dict(r) for r in cur.fetchall()]


PROMPT_TRACE_KINDS = frozenset(
    {"lecture_rag", "book_rag", "visualize", "grader", "rag_query", "office_hours"}
)


def insert_prompt_trace(
    conn: psycopg.Connection,
    *,
    kind: str,
    preview: str,
    request: dict[str, Any],
    response: Any | None,
    error: str | None,
) -> int:
    pv = (preview or "").strip()
    if len(pv) > 2000:
        pv = pv[:1997] + "…"
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO prompt_traces (kind, preview, request_json, response_json, error_text)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                kind,
                pv,
                Json(request),
                Json(response) if response is not None else None,
                error,
            ),
        )
        row = cur.fetchone()
        assert row is not None
        return int(row[0])


def list_prompt_traces(
    conn: psycopg.Connection,
    *,
    kind: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict[str, Any]]:
    lim = max(1, min(int(limit), 200))
    off = max(0, int(offset))
    with conn.cursor(row_factory=dict_row) as cur:
        if kind:
            cur.execute(
                """
                SELECT
                    id,
                    kind,
                    preview,
                    created_at,
                    (error_text IS NOT NULL) AS has_error
                FROM prompt_traces
                WHERE kind = %s
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s
                """,
                (kind, lim, off),
            )
        else:
            cur.execute(
                """
                SELECT
                    id,
                    kind,
                    preview,
                    created_at,
                    (error_text IS NOT NULL) AS has_error
                FROM prompt_traces
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s
                """,
                (lim, off),
            )
        return [dict(r) for r in cur.fetchall()]


def list_prompt_traces_for_similarity_match(
    conn: psycopg.Connection,
    *,
    kind: str,
    limit: int = 120,
) -> list[dict[str, Any]]:
    """Recent successful traces with full JSON for client-side / preflight cache matching."""
    lim = max(1, min(int(limit), 300))
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT id, request_json, response_json, created_at
            FROM prompt_traces
            WHERE kind = %s
              AND error_text IS NULL
              AND response_json IS NOT NULL
            ORDER BY created_at DESC
            LIMIT %s
            """,
            (kind, lim),
        )
        return [dict(r) for r in cur.fetchall()]


def get_prompt_trace(conn: psycopg.Connection, trace_id: int) -> dict[str, Any] | None:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT
                id,
                kind,
                preview,
                created_at,
                request_json,
                response_json,
                error_text
            FROM prompt_traces
            WHERE id = %s
            """,
            (trace_id,),
        )
        row = cur.fetchone()
        return dict(row) if row else None
