"""Parse SRT cues and merge into fixed-size character chunks."""

from __future__ import annotations

import re
from dataclasses import dataclass

TIME_LINE = re.compile(
    r"^(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})"
)


def _ts_to_ms(h: str, m: str, s: str, ms: str) -> int:
    return int(h) * 3_600_000 + int(m) * 60_000 + int(s) * 1_000 + int(ms)


@dataclass(frozen=True)
class Cue:
    start_ms: int
    end_ms: int
    text: str


def parse_srt(content: str) -> list[Cue]:
    content = content.lstrip("\ufeff")
    cues: list[Cue] = []
    lines = content.splitlines()
    n = len(lines)
    i = 0
    while i < n:
        while i < n and not lines[i].strip():
            i += 1
        if i >= n:
            break
        if re.match(r"^\d+\s*$", lines[i].strip()):
            i += 1
            if i >= n:
                break
        m = TIME_LINE.match(lines[i].strip())
        if not m:
            i += 1
            continue
        start_ms = _ts_to_ms(m.group(1), m.group(2), m.group(3), m.group(4))
        end_ms = _ts_to_ms(m.group(5), m.group(6), m.group(7), m.group(8))
        i += 1
        text_lines: list[str] = []
        while i < n and lines[i].strip():
            text_lines.append(lines[i].strip())
            i += 1
        text = " ".join(text_lines)
        cues.append(Cue(start_ms=start_ms, end_ms=end_ms, text=text))
        i += 1
    return cues


def chunk_cues(cues: list[Cue], max_chars: int = 1500) -> list[dict]:
    """Merge cues into chunks of at most max_chars characters."""
    chunks: list[dict] = []
    buf = ""
    start_ms: int | None = None
    end_ms: int | None = None

    def flush() -> None:
        nonlocal buf, start_ms, end_ms
        if buf and start_ms is not None and end_ms is not None:
            chunks.append(
                {
                    "content": buf,
                    "start_ms": start_ms,
                    "end_ms": end_ms,
                }
            )
        buf = ""
        start_ms = None
        end_ms = None

    for cue in cues:
        piece = cue.text.strip()
        if not piece:
            continue
        if start_ms is None:
            start_ms = cue.start_ms
        sep = 1 if buf else 0
        if len(buf) + sep + len(piece) <= max_chars:
            buf = f"{buf} {piece}".strip() if buf else piece
            end_ms = cue.end_ms
            continue
        flush()
        if len(piece) > max_chars:
            for j in range(0, len(piece), max_chars):
                sub = piece[j : j + max_chars]
                chunks.append(
                    {
                        "content": sub,
                        "start_ms": cue.start_ms,
                        "end_ms": cue.end_ms,
                    }
                )
            continue
        buf = piece
        start_ms = cue.start_ms
        end_ms = cue.end_ms
    flush()
    return chunks
