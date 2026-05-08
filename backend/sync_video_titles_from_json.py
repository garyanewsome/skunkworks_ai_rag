#!/usr/bin/env python3
"""Upsert titles from lectures_physics/video_titles.json into video_meta."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from dotenv import load_dotenv

_REPO_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(Path(__file__).resolve().parent / ".env")

from rag_store import get_connection, upsert_video_titles  # noqa: E402
from video_catalog import load_video_titles  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser(description="Load video_titles.json into Postgres video_meta.")
    p.add_argument(
        "--repo-root",
        type=Path,
        default=_REPO_ROOT,
        help="Repo root (default: parent of backend/)",
    )
    args = p.parse_args()

    json_path = args.repo_root / "lectures_physics" / "video_titles.json"
    titles = load_video_titles(args.repo_root)
    if not titles:
        if not json_path.is_file():
            hint = f"Create it by running:\n  python backend/export_playlist_titles.py https://www.youtube.com/playlist?list=PL6i60qoDQhQGaGbbg-4aSwXJvxOqO6o5e\n(that command also upserts Postgres; you may skip this script.)"
        else:
            hint = (
                f"{json_path} is empty or only has {{}}. Fill it from your playlist:\n"
                f"  python backend/export_playlist_titles.py https://www.youtube.com/playlist?list=PL6i60qoDQhQGaGbbg-4aSwXJvxOqO6o5e\n"
                "Or delete the file and run export_playlist_titles.py to recreate it."
            )
        print("No video titles to load.", file=sys.stderr)
        print(hint, file=sys.stderr)
        return 1

    try:
        with get_connection() as conn:
            # Ensure video_meta table exists
            with conn.cursor() as cur:
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS video_meta (
                        video_id TEXT PRIMARY KEY,
                        title TEXT NOT NULL,
                        updated_at TIMESTAMPTZ DEFAULT now()
                    )
                    """
                )
            n = upsert_video_titles(conn, titles)
        print(f"Upserted {n} title(s) into video_meta.")
    except Exception as e:
        print(f"Error: could not update database ({e}).", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
