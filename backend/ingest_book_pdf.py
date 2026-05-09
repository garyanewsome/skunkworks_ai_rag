#!/usr/bin/env python3
"""Ingest a PDF into book_documents + book_chunks (1500 chars, 150 overlap, page refs). OCR fallback per page."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

_BACKEND = Path(__file__).resolve().parent
load_dotenv(_BACKEND / ".env")

from book_pdf_chunking import BOOK_CHUNK_OVERLAP, BOOK_CHUNK_SIZE, chunk_pdf_text, extract_pdf_pages, slug_from_path
from embeddings import embedding_dim, encode_texts
from rag_store import delete_book_chunks, get_connection, init_schema, insert_book_chunks, upsert_book_document


def main() -> int:
    p = argparse.ArgumentParser(description="Chunk & embed a PDF for Source of Truth RAG.")
    p.add_argument("pdf", type=Path, help="Path to PDF file")
    p.add_argument("--title", type=str, default=None, help="Display title (default: filename stem)")
    p.add_argument("--slug", type=str, default=None, help="Stable id slug (default: derived from path)")
    args = p.parse_args()
    path = args.pdf.expanduser().resolve()
    if not path.is_file():
        print(f"Not a file: {path}", file=sys.stderr)
        return 1
    if path.suffix.lower() != ".pdf":
        print("Expected a .pdf file", file=sys.stderr)
        return 1

    title = (args.title or path.stem).strip()
    slug = slug_from_path(path, args.slug)

    pages = extract_pdf_pages(path)
    chunks = chunk_pdf_text(
        pages,
        chunk_size=BOOK_CHUNK_SIZE,
        overlap=BOOK_CHUNK_OVERLAP,
    )
    if not chunks:
        print("No extractable text from PDF (try OCR: install tesseract + pytesseract).", file=sys.stderr)
        return 1

    texts = [c["content"] for c in chunks]
    emb = encode_texts(texts)

    with get_connection() as conn:
        init_schema(conn, embedding_dim())
        book_id = upsert_book_document(
            conn,
            slug=slug,
            title=title,
            source_path=str(path),
            page_count=len(pages),
        )
        delete_book_chunks(conn, book_id)
        n = insert_book_chunks(conn, book_id, chunks, emb)

    print(f"Ingested book id={book_id} slug={slug!r} title={title!r} chunks={n} pages={len(pages)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
