"""Postgres + pgvector storage for transcript chunks."""

from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Any, Generator, Sequence

import numpy as np
import psycopg
from pgvector.psycopg import register_vector
from psycopg.rows import dict_row

DEFAULT_DATABASE_URL = (
    "postgresql://dev_user:dev_password@127.0.0.1:5432/embedding_db"
)


def database_url() -> str:
    return os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL)


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
