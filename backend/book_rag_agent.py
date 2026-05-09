"""RAG over book_chunks (PDF excerpts with page ranges) + Claude."""

from __future__ import annotations

import os
from textwrap import dedent

import anthropic

from embeddings import encode_texts
from rag_store import get_connection, search_similar_books


def _format_book_context(hits: list[dict]) -> str:
    blocks = []
    for row in hits:
        title = str(row.get("book_title") or row.get("slug") or "Book")
        slug = str(row.get("slug") or "")
        idx = int(row["chunk_index"])
        sp = int(row["start_page"])
        ep = int(row["end_page"])
        dist = float(row["distance"])
        page_note = f"p. {sp}" if sp == ep else f"pp. {sp}–{ep}"
        blocks.append(
            dedent(
                f"""
                ### {title} ({slug}) · chunk {idx} · {page_note} · distance {dist:.4f}
                {row["content"]}
                """
            ).strip()
        )
    return "\n\n".join(blocks)


def run_book_rag_agent(
    prompt: str,
    *,
    book_id: str | None,
    top_k: int,
    model: str,
    max_tokens: int,
) -> tuple[str, list[dict]]:
    q = prompt.strip()
    if not q:
        raise ValueError("Prompt is empty.")

    qvec = encode_texts([q])[0]
    with get_connection() as conn:
        hits = search_similar_books(conn, book_id, qvec, top_k=top_k)

    if not hits:
        raise RuntimeError(
            "No book chunks found. Ingest PDFs with: python ingest_book_pdf.py your.pdf"
        )

    context = _format_book_context(hits)
    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

    system = dedent(
        """
        You answer using ONLY the provided excerpts from books (PDF sources).
        Each block is labeled with the book title, chunk index, and PDF page range (pp.).
        Cite pages when you quote or paraphrase (e.g. "p. 42" or "pp. 40–43").
        If the excerpts are insufficient, say so clearly.
        """
    ).strip()

    user_content = f"Question:\n{q}\n\nBook excerpts (vector search; lower distance = closer match):\n\n{context}"

    with client.messages.stream(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user_content}],
    ) as stream:
        parts: list[str] = []
        for text in stream.text_stream:
            parts.append(text)
        answer = "".join(parts).strip()
    return answer, hits
