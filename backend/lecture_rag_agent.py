#!/usr/bin/env python3
"""
Command-line RAG agent: retrieve lecture transcript chunks from pgvector,
answer with Anthropic Claude using that context, and print YouTube URLs with
start times for playback.

Requires: ANTHROPIC_API_KEY, DATABASE_URL (optional), running Postgres with
ingested chunks (see ingest_transcript.py).

Usage:
  .venv/bin/python lecture_rag_agent.py "What is phase space?"
  .venv/bin/python lecture_rag_agent.py --video-id pyX8kQ-JzHI --top-k 8 "Why conservation laws?"
"""

from __future__ import annotations

import argparse
import os
import sys
from textwrap import dedent

from dotenv import load_dotenv

load_dotenv()

import anthropic

from embeddings import encode_texts
from rag_store import get_connection, search_similar


def _ms_to_clock(ms: int | None) -> str:
    if ms is None:
        return "??:??"
    s, m = divmod(ms // 1000, 60)
    h, m = divmod(m, 60)
    if h:
        return f"{h:d}:{m:02d}:{s % 60:02d}"
    return f"{m:d}:{s % 60:02d}"


def youtube_watch_url(video_id: str, start_ms: int | None) -> str:
    sec = max(0, (start_ms or 0) // 1000)
    return f"https://www.youtube.com/watch?v={video_id}&t={sec}s"


def _format_context(hits: list[dict], video_id: str) -> str:
    blocks = []
    for row in hits:
        idx = int(row["chunk_index"])
        start = row.get("start_ms")
        end = row.get("end_ms")
        url = youtube_watch_url(video_id, start if isinstance(start, int) else None)
        dist = float(row["distance"])
        end_clock = _ms_to_clock(end) if isinstance(end, int) else "??:??"
        blocks.append(
            dedent(
                f"""
                ### Excerpt {idx} (relevance distance {dist:.4f}; ~{_ms_to_clock(start)}–{end_clock})
                Playback: {url}
                {row["content"]}
                """
            ).strip()
        )
    return "\n\n".join(blocks)


def run_rag_agent(
    prompt: str,
    *,
    video_id: str,
    top_k: int,
    model: str,
    max_tokens: int,
) -> tuple[str, list[dict]]:
    q = prompt.strip()
    if not q:
        raise ValueError("Prompt is empty.")

    qvec = encode_texts([q])[0]
    with get_connection() as conn:
        hits = search_similar(conn, video_id, qvec, top_k=top_k)

    if not hits:
        raise RuntimeError(
            f"No transcript chunks found for video_id={video_id!r}. "
            "Run ingest_transcript.py first."
        )

    context = _format_context(hits, video_id)
    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

    system = dedent(
        """
        You are an expert tutor for a Stanford physics lecture (classical mechanics).
        The user message includes labeled transcript excerpts from the lecture with
        approximate timestamps and playback URLs. Use ONLY that material to answer.
        If the excerpts do not contain enough information, say so and suggest what
        topic might need a different search. Be clear, technical, and faithful to
        the lecture wording where it matters.
        """
    ).strip()

    user_content = (
        f"Question:\n{q}\n\n"
        f"Transcript excerpts (from vector search; lower distance = better match):\n\n"
        f"{context}"
    )

    msg = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user_content}],
    )
    text_parts: list[str] = []
    for block in msg.content:
        if block.type == "text":
            text_parts.append(block.text)
    answer = "\n".join(text_parts).strip()
    return answer, hits


def main() -> int:
    p = argparse.ArgumentParser(
        description="RAG over ingested lecture chunks + Anthropic Claude answer + YouTube deep links."
    )
    p.add_argument(
        "prompt",
        nargs="*",
        help="Question (quote the whole string or pass as multiple words)",
    )
    p.add_argument(
        "--video-id",
        default=os.getenv("VIDEO_ID", "pyX8kQ-JzHI"),
        help="YouTube video id stored in video_chunks (default: pyX8kQ-JzHI)",
    )
    p.add_argument("--top-k", type=int, default=8, help="Number of chunks to retrieve (default: 8)")
    p.add_argument(
        "--model",
        default=os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6"),
        help=(
            "Anthropic Messages API model id (default: claude-sonnet-4-6). "
            "Override with ANTHROPIC_MODEL or --model if your key returns 404."
        ),
    )
    p.add_argument("--max-tokens", type=int, default=2048)
    args = p.parse_args()
    prompt = " ".join(args.prompt).strip()
    if not prompt:
        p.error("Provide a prompt, e.g. lecture_rag_agent.py \"What is a phase space?\"")

    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("Missing ANTHROPIC_API_KEY in environment or .env", file=sys.stderr)
        return 1

    try:
        answer, hits = run_rag_agent(
            prompt,
            video_id=args.video_id,
            top_k=args.top_k,
            model=args.model,
            max_tokens=args.max_tokens,
        )
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    print(answer)
    print()
    print("--- Playback (from matched transcript chunks) ---")
    vid = args.video_id
    for i, row in enumerate(hits):
        start = row.get("start_ms")
        if not isinstance(start, int):
            continue
        url = youtube_watch_url(vid, start)
        label = "Primary match" if i == 0 else f"Related #{i + 1}"
        print(f"{label}: {url}  (~{_ms_to_clock(start)}, chunk {row['chunk_index']})")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
