#!/usr/bin/env python3
"""Ingest every lectures_physics/*.en.srt into pgvector (one embedding model load)."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from ingest_transcript import ingest_one_srt

_REPO_ROOT = Path(__file__).resolve().parent.parent
_DEFAULT_DIR = _REPO_ROOT / "lectures_physics"

# YouTube video ids are 11 chars (alphanumeric, underscore, hyphen).
_YT_ID = re.compile(r"^[a-zA-Z0-9_-]{11}$")
_BRACKET_ID = re.compile(r"\[([a-zA-Z0-9_-]{11})\]")


def video_id_from_filename(path: Path) -> str | None:
    stem = path.name.removesuffix(".en.srt")
    m = _BRACKET_ID.search(stem)
    if m:
        return m.group(1)
    if _YT_ID.fullmatch(stem):
        return stem
    return None


def main() -> int:
    p = argparse.ArgumentParser(description="Batch-ingest lectures_physics SRTs into pgvector")
    p.add_argument(
        "directory",
        nargs="?",
        type=Path,
        default=_DEFAULT_DIR,
        help=f"SRT directory (default: {_DEFAULT_DIR})",
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
        help="Replace existing rows for each video_id before insert",
    )
    args = p.parse_args()

    d = args.directory
    if not d.is_dir():
        print(f"Not a directory: {d}", file=sys.stderr)
        return 1

    paths = sorted(d.glob("*.en.srt"))
    if not paths:
        print(f"No .en.srt files under {d}", file=sys.stderr)
        return 1

    failures = 0
    for path in paths:
        vid = video_id_from_filename(path)
        if not vid:
            print(f"SKIP (cannot parse video id): {path.name}", file=sys.stderr)
            failures += 1
            continue
        try:
            n = ingest_one_srt(
                path,
                video_id=vid,
                chunk_chars=args.chunk_chars,
                replace=args.replace,
                verbose=False,
            )
            print(f"OK {vid}: {n} chunks ← {path.name}")
        except Exception as e:
            print(f"FAIL {path.name}: {e}", file=sys.stderr)
            failures += 1

    if failures:
        print(f"Done with {failures} failure(s).", file=sys.stderr)
        return 1
    print(f"Ingested {len(paths)} lecture file(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
