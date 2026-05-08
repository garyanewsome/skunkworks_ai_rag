"""Parse SRT cues and merge into fixed-size character chunks with optional boundary overlap."""

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


def _interpolate_ms(start_ms: int, end_ms: int, buf_char_len: int, from_char: int) -> int:
    """Map a character offset inside a flushed buffer to a wall-clock ms (linear)."""
    if buf_char_len <= 0 or end_ms <= start_ms:
        return start_ms
    frac = max(0.0, min(1.0, from_char / buf_char_len))
    return int(start_ms + frac * (end_ms - start_ms))


def _tail_overlap_with_index(text: str, max_len: int) -> tuple[str, int]:
    """Last up to ``max_len`` characters of ``text`` (word-biased cut); return (suffix, start index in rstrip(text))."""
    raw = text.rstrip()
    n = len(raw)
    if max_len <= 0 or n == 0:
        return "", n
    if n <= max_len:
        return raw, 0
    start_idx = n - max_len
    segment = raw[start_idx:]
    first_space = segment.find(" ")
    if 0 < first_space < len(segment) * 0.45:
        start_idx += first_space + 1
        segment = raw[start_idx:]
    segment = segment.lstrip()
    if not segment:
        return "", n
    start_idx = n - len(segment)
    return segment, start_idx


def chunk_cues(
    cues: list[Cue],
    max_chars: int = 1500,
    overlap_ratio: float = 0.1,
) -> list[dict]:
    """Merge cues into chunks of at most ``max_chars`` characters.

    When ``overlap_ratio`` > 0, each chunk after the first begins with a suffix of the
    previous chunk (~``overlap_ratio * max_chars`` chars) so embeddings and search span
    cue boundaries without losing context.
    """
    overlap_chars = max(0, int(max_chars * overlap_ratio)) if overlap_ratio > 0 else 0
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

        prev_buf = buf
        prev_start = start_ms
        prev_end = end_ms
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

        if overlap_chars > 0 and prev_buf.strip():
            overlap, from_char = _tail_overlap_with_index(prev_buf, overlap_chars)
            if overlap:
                merged = f"{overlap} {piece}".strip()
                room = max_chars - len(piece) - 1
                if len(merged) > max_chars and room > 0:
                    overlap, from_char = _tail_overlap_with_index(prev_buf, max(1, room))
                    merged = f"{overlap} {piece}".strip() if overlap else piece
                elif len(merged) > max_chars:
                    merged = piece
                    overlap = ""
                buf = merged
                raw_len = len(prev_buf.rstrip())
                if overlap and prev_start is not None and prev_end is not None and raw_len > 0:
                    start_ms = _interpolate_ms(prev_start, prev_end, raw_len, from_char)
                else:
                    start_ms = cue.start_ms
                end_ms = cue.end_ms
                continue

        buf = piece
        start_ms = cue.start_ms
        end_ms = cue.end_ms
    flush()
    return chunks
