#!/usr/bin/env python3
"""Load an SRT transcript into pgvector in ~1500-character chunks."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from embeddings import embedding_dim, encode_texts
from rag_store import (
    database_url,
    delete_video_chunks,
    get_connection,
    init_schema,
    insert_chunks,
)
from srt_chunker import chunk_cues, parse_srt

_REPO_ROOT = Path(__file__).resolve().parent.parent
_DEFAULT_SRT = _REPO_ROOT / (
    "Lecture 1 ｜ Modern Physics： Classical Mechanics (Stanford) [pyX8kQ-JzHI].en.srt"
)


def main() -> int:
    p = argparse.ArgumentParser(description="Ingest SRT into pgvector video_chunks")
    p.add_argument(
        "srt_path",
        nargs="?",
        type=Path,
        default=_DEFAULT_SRT,
        help="Path to .srt file (default: lecture transcript at repo root)",
    )
    p.add_argument(
        "--video-id",
        default="pyX8kQ-JzHI",
        help="Stable id for this video (default: YouTube id)",
    )
    p.add_argument(
        "--chunk-chars",
        type=int,
        default=1500,
        help="Maximum characters per chunk (default: 1500)",
    )
    p.add_argument(
        "--replace",
        action="store_true",
        help="Delete existing rows for this video_id before insert",
    )
    args = p.parse_args()

    path: Path = args.srt_path
    if not path.is_file():
        print(f"File not found: {path}", file=sys.stderr)
        return 1

    text = path.read_text(encoding="utf-8", errors="replace")
    cues = parse_srt(text)
    chunks = chunk_cues(cues, max_chars=args.chunk_chars)
    if not chunks:
        print("No cues or chunks parsed from SRT.", file=sys.stderr)
        return 1

    print(f"Database: {database_url()}")
    print(f"Cues: {len(cues)}, chunks: {len(chunks)} (max {args.chunk_chars} chars)")

    dim = embedding_dim()
    vectors = encode_texts([c["content"] for c in chunks])

    with get_connection() as conn:
        init_schema(conn, dim)
        if args.replace:
            delete_video_chunks(conn, args.video_id)
        n = insert_chunks(conn, args.video_id, chunks, vectors)
    print(f"Ingested {n} rows for video_id={args.video_id!r}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
