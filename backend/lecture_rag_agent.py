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
from rag_store import (
    get_connection,
    search_similar,
    search_similar_global,
    search_similar_multi,
    widen_retrieval_query_for_multi_video,
)


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


def _format_context(hits: list[dict]) -> str:
    blocks = []
    for row in hits:
        vid = str(row["video_id"])
        idx = int(row["chunk_index"])
        start = row.get("start_ms")
        end = row.get("end_ms")
        url = youtube_watch_url(vid, start if isinstance(start, int) else None)
        dist = float(row["distance"])
        end_clock = _ms_to_clock(end) if isinstance(end, int) else "??:??"
        blocks.append(
            dedent(
                f"""
                ### Video {vid} · excerpt {idx} (distance {dist:.4f}; ~{_ms_to_clock(start)}–{end_clock})
                Playback: {url}
                {row["content"]}
                """
            ).strip()
        )
    return "\n\n".join(blocks)


def run_rag_agent(
    prompt: str,
    *,
    video_id: str | None,
    video_ids: list[str] | None = None,
    top_k: int,
    model: str,
    max_tokens: int,
) -> tuple[str, list[dict]]:
    q = prompt.strip()
    if not q:
        raise ValueError("Prompt is empty.")

    ids = [x.strip() for x in (video_ids or []) if x and str(x).strip()]
    rq = widen_retrieval_query_for_multi_video(q, len(ids)) if ids else q
    qvec = encode_texts([rq])[0]
    with get_connection() as conn:
        if ids:
            hits = search_similar_multi(conn, ids, qvec, top_k=top_k)
        elif video_id:
            hits = search_similar(conn, video_id, qvec, top_k=top_k)
        else:
            hits = search_similar_global(conn, qvec, top_k=top_k)

    if not hits:
        raise RuntimeError(
            "No transcript chunks found. Run ingest_transcript.py first."
            if not ids and not video_id
            else (
                f"No transcript chunks for video_ids={ids!r}. Run ingest_transcript.py first."
                if ids
                else f"No transcript chunks found for video_id={video_id!r}. "
                "Run ingest_transcript.py first."
            )
        )

    context = _format_context(hits)
    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

    # Check if the query is about creating study materials
    study_keywords = ["study", "guide", "test", "exam", "quiz", "practice", "questions", "review", "learn", "teach", "tutor"]
    is_study_query = any(keyword in q.lower() for keyword in study_keywords)

    # Increase max_tokens for study queries to accommodate longer responses
    effective_max_tokens = max_tokens * 30 if is_study_query else max_tokens

    if is_study_query:
        system = dedent(
            """
            You are an expert tutor for Stanford physics lectures (classical mechanics and related topics).
            The user is asking for help in studying, creating tests, or study guides. Based on the provided transcript excerpts,
            create a comprehensive study guide that includes:

            1. **Overview/Summary**: A brief summary of the key concepts from the material.

            2. **50 Top Questions**: Generate exactly 50 high-quality questions that cover the material.
               - Separate them into **Theory Questions** (conceptual understanding) and **Practical Questions** (problem-solving, calculations).
               - For each question, provide the answer and a detailed explanation.
               - Where appropriate, include descriptions of drawings, diagrams, or charts that would help visualize the concept.
                 Use ASCII art or detailed textual descriptions for diagrams when they would aid understanding.

            3. **Key Formulas and Concepts**: List important equations, principles, and definitions.

            4. **Study Tips**: Provide advice on how to approach this material.

            Use ONLY the provided transcript material. If the excerpts don't cover enough for 50 questions, note that and provide as many as possible.
            Reference specific videos and timestamps when relevant.
            Make it like a personalized tutoring session.

            When excerpts come from several videos in one course group, they are intentionally spread
            across lectures (not only one video). Synthesize across all provided blocks; do not assume
            the material is from a single short clip unless only one video id appears in the excerpts.
            """
        ).strip()
    else:
        system = dedent(
            """
            You are an expert tutor for Stanford physics lectures (classical mechanics and related topics).
            The user message includes transcript excerpts that may come from one lecture or from several
            different videos in a course playlist. Each block is labeled with its YouTube video id,
            timestamps, and a playback URL. Use ONLY this material to answer.
            If the excerpts do not contain enough information, say so clearly. Be technical and faithful
            to the lecture wording where it matters; name which video(s) you are drawing from when helpful.
            """
        ).strip()

    user_content = (
        f"Question:\n{q}\n\n"
        f"Transcript excerpts (from vector search; lower distance = better match):\n\n"
        f"{context}"
    )

    with client.messages.stream(
        model=model,
        max_tokens=effective_max_tokens,
        system=system,
        messages=[{"role": "user", "content": user_content}],
    ) as stream:
        text_parts: list[str] = []
        for text in stream.text_stream:
            text_parts.append(text)
        answer = "".join(text_parts).strip()
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
    p.add_argument(
        "--all-videos",
        action="store_true",
        help="Search across all ingested videos instead of a single --video-id.",
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
            video_id=None if args.all_videos else args.video_id,
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
    for i, row in enumerate(hits):
        start = row.get("start_ms")
        if not isinstance(start, int):
            continue
        vid = str(row["video_id"])
        url = youtube_watch_url(vid, start)
        label = "Primary match" if i == 0 else f"Related #{i + 1}"
        print(f"{label}: {url}  (~{_ms_to_clock(start)}, chunk {row['chunk_index']})")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
