#!/usr/bin/env python3
"""
Write lectures_physics/video_titles.json from a YouTube playlist (video id -> title),
and upsert titles into Postgres table video_meta.

Requires: yt-dlp on PATH, DATABASE_URL / Postgres (for DB upsert; JSON still written if DB fails).

Example:
  ./backend/export_playlist_titles.py \\
    "https://www.youtube.com/playlist?list=PL6i60qoDQhQGaGbbg-4aSwXJvxOqO6o5e"
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

from dotenv import load_dotenv

_REPO_ROOT = Path(__file__).resolve().parent.parent
_DEFAULT_OUT = _REPO_ROOT / "lectures_physics" / "video_titles.json"
_BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(_BACKEND_DIR / ".env")


def main() -> int:
    p = argparse.ArgumentParser(description="Export playlist video ids and titles to JSON.")
    p.add_argument("playlist_url", help="YouTube playlist URL")
    p.add_argument(
        "-o",
        "--output",
        type=Path,
        default=_DEFAULT_OUT,
        help=f"Output JSON path (default: {_DEFAULT_OUT})",
    )
    p.add_argument(
        "--no-db",
        action="store_true",
        help="Only write JSON; skip Postgres video_meta upsert.",
    )
    args = p.parse_args()

    try:
        proc = subprocess.run(
            ["yt-dlp", "--flat-playlist", "-J", args.playlist_url],
            capture_output=True,
            text=True,
            check=False,
        )
    except FileNotFoundError:
        print("yt-dlp not found. Install: https://github.com/yt-dlp/yt-dlp", file=sys.stderr)
        return 1

    if proc.returncode != 0:
        print(proc.stderr or proc.stdout or "yt-dlp failed", file=sys.stderr)
        return 1

    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError as e:
        print(f"Invalid JSON from yt-dlp: {e}", file=sys.stderr)
        return 1

    entries = data.get("entries") or []
    out: dict[str, str] = {}
    for e in entries:
        if not e:
            continue
        vid = e.get("id")
        if not vid:
            continue
        title = (e.get("title") or "").strip()
        out[str(vid)] = title or str(vid)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(out, indent=2, ensure_ascii=False, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(out)} entries to {args.output}")

    if not args.no_db and out:
        try:
            from rag_store import get_connection, upsert_video_titles

            with get_connection() as conn:
                n = upsert_video_titles(conn, out)
            print(f"Upserted {n} title(s) into video_meta.")
        except Exception as e:
            print(f"Warning: could not update database ({e}). JSON file was saved.", file=sys.stderr)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
