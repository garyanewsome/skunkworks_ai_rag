"""Optional catalog: lectures_physics/video_titles.json maps video_id -> YouTube title."""

from __future__ import annotations

import json
from pathlib import Path


def load_video_titles(repo_root: Path) -> dict[str, str]:
    """Return id -> title from JSON; empty dict if file missing or invalid."""
    path = repo_root / "lectures_physics" / "video_titles.json"
    if not path.is_file():
        return {}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}
    if not isinstance(raw, dict):
        return {}
    out: dict[str, str] = {}
    for k, v in raw.items():
        if v is None:
            continue
        out[str(k)] = str(v).strip() or str(k)
    return out
