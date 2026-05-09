#!/usr/bin/env python3
"""
LLM-driven interactive scene for problem-solving visualization (molecules,
forces, flowcharts, etc.). Supports single canvas or multi-frame mechanisms.
"""

from __future__ import annotations

import functools
import importlib.util
import json
import os
import re
import uuid
from pathlib import Path
from textwrap import dedent
from typing import Union
from urllib.parse import urlparse

import anthropic
from pydantic import BaseModel, Field, field_validator, model_validator


class SceneNode(BaseModel):
    id: str = Field(..., min_length=1, max_length=64)
    label: str = Field(..., max_length=120)
    sublabel: str | None = Field(None, max_length=160)
    x: float = Field(..., ge=0, le=1000)
    y: float = Field(..., ge=0, le=700)
    kind: str = Field(
        "generic",
        description="molecule | fragment | atom | ion | reagent | body | force | state | generic",
    )

    @field_validator("id")
    @classmethod
    def id_chars(cls, v: str) -> str:
        s = v.strip()
        if not re.match(r"^[a-zA-Z0-9_-]+$", s):
            raise ValueError("node id must be alphanumeric, underscore, or hyphen")
        return s


class SceneEdge(BaseModel):
    id: str | None = Field(None, max_length=80)
    from_id: str = Field(..., min_length=1)
    to_id: str = Field(..., min_length=1)
    kind: str = Field(
        "bond",
        description="single | double | triple | hydrogen_bond | ionic | interaction | arrow | generic",
    )


_PATH_D_SAFE = re.compile(r"^[MmLlHhVvCcSsQqTtAaZz0-9., \-+eE]+$")
_POINTS_SAFE = re.compile(r"^[0-9., \-+eE]+$")

_ALLOWED_IMAGE_HOSTS = frozenset({"upload.wikimedia.org", "commons.wikimedia.org"})

_HEAVY_POLYGON_VERTEX_TOKENS = 56
_HEAVY_POLYGON_CHARS = 480
_HEAVY_POLYGON_SHAPE_COUNT = 14
_HEAVY_PATH_CHARS = 960

_COMMONS_STOPWORDS = frozenset(
    {
        "a",
        "an",
        "the",
        "and",
        "or",
        "but",
        "nor",
        "in",
        "on",
        "at",
        "to",
        "for",
        "of",
        "as",
        "by",
        "with",
        "from",
        "into",
        "via",
        "per",
        "is",
        "are",
        "was",
        "were",
        "be",
        "been",
        "being",
        "have",
        "has",
        "had",
        "do",
        "does",
        "did",
        "will",
        "would",
        "could",
        "should",
        "may",
        "might",
        "must",
        "i",
        "you",
        "he",
        "she",
        "it",
        "we",
        "they",
        "them",
        "their",
        "me",
        "my",
        "your",
        "this",
        "that",
        "these",
        "those",
        "here",
        "there",
        "what",
        "which",
        "who",
        "when",
        "where",
        "why",
        "how",
        "all",
        "any",
        "both",
        "each",
        "few",
        "more",
        "most",
        "some",
        "such",
        "no",
        "not",
        "only",
        "same",
        "so",
        "than",
        "too",
        "very",
        "just",
        "also",
        "then",
        "please",
        "show",
        "give",
        "get",
        "see",
        "want",
        "need",
        "make",
        "using",
        "use",
        "like",
        "about",
        "through",
        "during",
        "between",
        "within",
        "picture",
        "photo",
        "image",
        "snapshot",
        "something",
        "anything",
        "everything",
        "tell",
        "describe",
        "explain",
    }
)
_COMMONS_SHORT_SCI_TERMS = frozenset({"rna", "dna", "atp", "adp", "nad", "fad"})
_COMMONS_QUERY_VIS_TERMS = frozenset(
    {"diagram", "illustration", "chart", "schematic", "schematics", "drawing", "figure"}
)

# Normalized tokens for Wikimedia Commons search (common typos / variants).
_COMMONS_KEYWORD_FIXES: dict[str, str] = {
    "skelleton": "skeleton",
    "skeletton": "skeleton",
}


@functools.lru_cache(maxsize=1)
def _reference_image_module():
    """Load reference_image from PYTHONPATH or from this package directory (Docker/cwd-safe)."""
    try:
        import reference_image as mod

        return mod
    except ImportError:
        path = Path(__file__).resolve().parent / "reference_image.py"
        if not path.is_file():
            return None
        spec = importlib.util.spec_from_file_location("_sk_reference_image", path)
        if spec is None or spec.loader is None:
            return None
        mod = importlib.util.module_from_spec(spec)
        try:
            spec.loader.exec_module(mod)
        except Exception:
            return None
        return mod


def _commons_thumbnail_url(query: str) -> str | None:
    """Resolve a thumbnail URL: English Wikipedia article search first, then Wikimedia Commons file search."""
    mod = _reference_image_module()
    if mod is None:
        return None
    fn = getattr(mod, "wikimedia_thumbnail_url", None)
    if callable(fn):
        return fn(query)
    return mod.commons_thumbnail_url(query)


def _src_blocked_by_safe_media_policy(src: str) -> bool:
    """True when upload URL basename matches blocked NSFW / profanity heuristics."""
    mod = _reference_image_module()
    if mod is None:
        return False
    check = getattr(mod, "is_unsafe_wikimedia_upload_url", None)
    if not callable(check):
        return False
    try:
        return bool(check(src))
    except Exception:
        return False


# Prompts that ask for photograph-like fidelity → image shapes only (no vector illustration).
_PHOTOREAL_IMAGE_ONLY_RE = re.compile(
    r"""
    \b(?:photo[-\s]?real(?:istic)?|hyper[-\s]?real(?:istic)?|ultra[-\s]?real(?:istic)?)\b
    |\b(?:life[-\s]?like|lifelike)\b
    |\bspitting\s+image\b
    |\btrue[-\s]?to[-\s]?life\b
    |\bas\s+real\s+as\b
    |\bindistinguishable\s+from\s+(?:real(?:ity)?|life|a\s+photo|the\s+real)\b
    |\blooks\s+(?:exactly\s+)?(?:like\s+)?(?:real|a\s+photograph|the\s+real\s+thing)\b
    |\b(?:high[-\s]?fidelity)\s+(?:photo|image|picture)\b
    """,
    re.I | re.VERBOSE | re.UNICODE,
)


def wants_photoreal_image_only(user_prompt: str, topic_hint: str | None = None) -> bool:
    blob = f"{user_prompt or ''} {(topic_hint or '')}".strip().lower()
    if not blob:
        return False
    return _PHOTOREAL_IMAGE_ONLY_RE.search(blob) is not None


def effective_photoreal_images_only(
    user_prompt: str,
    topic_hint: str | None,
    *,
    visual_mode: str = "default",
) -> bool:
    """True when the client chose realism or (in default mode) the prompt reads like a photoreal request."""
    if visual_mode == "polygon_only":
        return False
    if visual_mode == "realism":
        return True
    return wants_photoreal_image_only(user_prompt, topic_hint)


# Minimal valid upload URL so Pydantic accepts scenes before clamp replaces shapes with encyclopedia images.
_PHOTOREAL_VALIDATE_PLACEHOLDER_SRC = (
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/"
    "320px-PNG_transparency_demonstration_1.png"
)


def _patch_photoreal_empty_drawables(data: dict, *, animation: bool) -> None:
    """Ensure each scene/frame passes ``need_drawables``; photoreal clamp drops model shapes and fills real URLs."""
    if animation:
        frames = data.get("frames")
        if not isinstance(frames, list):
            return
        placeholder = {
            "type": "image",
            "src": _PHOTOREAL_VALIDATE_PLACEHOLDER_SRC,
            "x": 0.0,
            "y": 0.0,
            "w": 100.0,
            "h": 100.0,
        }
        for fr in frames:
            if not isinstance(fr, dict):
                continue
            if (fr.get("nodes") or []) or (fr.get("shapes") or []):
                continue
            fr["shapes"] = [placeholder.copy()]
        return
    if (data.get("nodes") or []) or (data.get("shapes") or []):
        return
    data["shapes"] = [
        {
            "type": "image",
            "src": _PHOTOREAL_VALIDATE_PLACEHOLDER_SRC,
            "x": 0.0,
            "y": 0.0,
            "w": 100.0,
            "h": 100.0,
        }
    ]


def _keywords_for_commons(text: str, *, max_take: int = 18) -> list[str]:
    """Pull searchable tokens from user/model text; drop fillers so Commons queries hit real topics."""
    words = re.findall(r"[a-zA-Z][a-zA-Z0-9_-]{0,}", (text or "").lower())
    out: list[str] = []
    seen: set[str] = set()
    for w in words:
        w = _COMMONS_KEYWORD_FIXES.get(w, w)
        if w in _COMMONS_STOPWORDS:
            continue
        if len(w) <= 2 and w not in _COMMONS_SHORT_SCI_TERMS:
            continue
        if w not in seen:
            seen.add(w)
            out.append(w)
        if len(out) >= max_take:
            break
    return out


class SceneShape(BaseModel):
    """Vector scenery: primitives + optional built-in icons (any topic)."""

    id: str = Field(default_factory=lambda: f"s-{uuid.uuid4().hex[:12]}", max_length=64)
    type: str = Field(
        ...,
        max_length=32,
        description="ground | rect | ellipse | circle | line | arrow | polygon | path | icon | image",
    )
    x: float | None = None
    y: float | None = None
    w: float | None = None
    h: float | None = None
    cx: float | None = None
    cy: float | None = None
    rx: float | None = None
    ry: float | None = None
    r: float | None = None
    x1: float | None = None
    y1: float | None = None
    x2: float | None = None
    y2: float | None = None
    rotation: float = 0
    fill: str | None = Field(None, max_length=48)
    stroke: str | None = Field(None, max_length=48)
    stroke_width: float | None = None
    label: str | None = Field(None, max_length=120)
    points: str | None = Field(
        None,
        max_length=1200,
        description='polygon points "x,y x,y ..." in canvas coordinates',
    )
    path_d: str | None = Field(
        None,
        max_length=1800,
        description="SVG path d string (M L H V C Q Z etc.; no angle brackets)",
    )
    icon: str | None = Field(
        None,
        max_length=48,
        description="Built-in: car_side | apple | tree_simple | impact_burst | barrier_wall — "
        "or any short noun for a labeled schematic; prefer polygon/path for real silhouettes.",
    )
    scale: float | None = Field(None, ge=0.15, le=5.0)
    src: str | None = Field(
        None,
        max_length=800,
        description="HTTPS image URL (allowed: upload.wikimedia.org, commons.wikimedia.org) when type is image",
    )

    @field_validator("path_d", mode="before")
    @classmethod
    def sanitize_path_d(cls, v: object) -> str | None:
        if v is None or not isinstance(v, str):
            return None
        s = v.strip()
        if len(s) > 1800:
            s = s[:1800]
        if not _PATH_D_SAFE.fullmatch(s):
            return None
        return s

    @field_validator("points", mode="before")
    @classmethod
    def sanitize_points(cls, v: object) -> str | None:
        if v is None or not isinstance(v, str):
            return None
        s = re.sub(r"\s+", " ", v.strip())
        if len(s) > 1200:
            s = s[:1200]
        if not _POINTS_SAFE.fullmatch(s):
            return None
        return s

    @field_validator("id", mode="before")
    @classmethod
    def shape_id_chars(cls, v: object) -> str:
        if v is None or (isinstance(v, str) and not str(v).strip()):
            return f"s-{uuid.uuid4().hex[:12]}"
        s = str(v).strip()
        if not re.match(r"^[a-zA-Z0-9_-]+$", s):
            raise ValueError("shape id must be alphanumeric, underscore, or hyphen")
        return s

    @field_validator("src", mode="before")
    @classmethod
    def sanitize_src(cls, v: object) -> str | None:
        if v is None or not isinstance(v, str):
            return None
        s = v.strip()
        if len(s) > 800:
            s = s[:800]
        if not s.startswith("https://"):
            return None
        p = urlparse(s)
        host = (p.hostname or "").lower()
        if p.scheme != "https" or host not in _ALLOWED_IMAGE_HOSTS:
            return None
        if _src_blocked_by_safe_media_policy(s):
            return None
        return s

    @model_validator(mode="after")
    def image_requires_src(self) -> SceneShape:
        if str(self.type).lower() == "image" and not self.src:
            return self.model_copy(
                update={
                    "type": "rect",
                    "w": max(2.0, float(self.w or 2)),
                    "h": max(2.0, float(self.h or 2)),
                    "x": float(self.x or 0),
                    "y": float(self.y or 0),
                    "fill": self.fill or "#00000000",
                    "stroke": None,
                }
            )
        return self


class SceneFrame(BaseModel):
    """One step in an animated mechanism."""

    step_label: str = Field(..., max_length=140)
    step_detail: str | None = Field(None, max_length=500)
    nodes: list[SceneNode] = Field(default_factory=list, max_length=40)
    edges: list[SceneEdge] = Field(default_factory=list)
    shapes: list[SceneShape] = Field(default_factory=list, max_length=96)

    @model_validator(mode="after")
    def need_drawables(self) -> SceneFrame:
        if not self.nodes and not self.shapes:
            raise ValueError("Each frame needs at least one node or one shape.")
        return self


class VisualizeScene(BaseModel):
    plan: str | None = Field(
        None,
        max_length=2400,
        description="Brief outline written before coordinates; optional but prompted by system instructions.",
    )
    title: str = Field(..., max_length=200)
    caption: str | None = Field(None, max_length=500)
    nodes: list[SceneNode] = Field(default_factory=list, max_length=40)
    edges: list[SceneEdge] = Field(default_factory=list)
    shapes: list[SceneShape] = Field(default_factory=list, max_length=96)

    @model_validator(mode="after")
    def nodes_or_shapes(self) -> VisualizeScene:
        if not self.nodes and not self.shapes:
            raise ValueError("Provide at least one node or one shape.")
        return self


class AnimatedVisualizeScene(BaseModel):
    plan: str | None = Field(
        None,
        max_length=2400,
        description="Brief outline written before frames; optional but prompted by system instructions.",
    )
    title: str = Field(..., max_length=200)
    caption: str | None = Field(None, max_length=500)
    frames: list[SceneFrame] = Field(..., min_length=2, max_length=14)


VisualizeResult = Union[VisualizeScene, AnimatedVisualizeScene]


def _strip_json_fence(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        lines = t.split("\n")
        if lines and lines[0].strip().startswith("```"):
            lines = lines[1:]
        while lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        t = "\n".join(lines).strip()
    return t


def _extract_balanced_object(t: str, start: int) -> str | None:
    """Slice one `{ ... }` object from start, respecting strings and nested `[` `]`."""
    if start < 0 or start >= len(t) or t[start] != "{":
        return None
    depth_brace = 0
    depth_bracket = 0
    in_str = False
    esc = False
    i = start
    while i < len(t):
        c = t[i]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
            i += 1
            continue
        if c == '"':
            in_str = True
            i += 1
            continue
        if c == "{":
            depth_brace += 1
        elif c == "}":
            depth_brace -= 1
            if depth_brace == 0 and depth_bracket == 0:
                return t[start : i + 1]
        elif c == "[":
            depth_bracket += 1
        elif c == "]":
            depth_bracket -= 1
        i += 1
    return None


def _normalize_json_blob(blob: str) -> str:
    s = blob.strip().replace("\ufeff", "")
    return s.replace("\u201c", '"').replace("\u201d", '"')


def _repair_commas_outside_strings(blob: str) -> str:
    """Remove trailing commas and collapse ,, outside quoted strings (regex cannot do this safely)."""
    out: list[str] = []
    i = 0
    n = len(blob)
    in_str = False
    esc = False
    while i < n:
        c = blob[i]
        if in_str:
            if esc:
                out.append(c)
                esc = False
                i += 1
                continue
            if c == "\\":
                out.append(c)
                esc = True
                i += 1
                continue
            if c == '"':
                in_str = False
            out.append(c)
            i += 1
            continue

        if c == '"':
            in_str = True
            out.append(c)
            i += 1
            continue

        if c == ",":
            j = i + 1
            while j < n and blob[j] in " \t\n\r":
                j += 1
            if j < n and blob[j] in "}]":
                i += 1
                continue
            if j < n and blob[j] == ",":
                out.append(",")
                i = j + 1
                while i < n and blob[i] in " \t\n\r,":
                    i += 1
                continue
            out.append(",")
            i += 1
            continue

        out.append(c)
        i += 1

    return "".join(out)


def _repair_llm_json_blob(blob: str) -> str:
    """Normalize quotes / BOM; trailing commas applied after string escaping (see _parse_scene_json)."""
    return _normalize_json_blob(blob)


def _escape_control_chars_inside_json_strings(blob: str) -> str:
    """
    JSON does not allow raw line breaks or most control chars inside "strings".
    Models often paste multi-line labels or paths; escape those so json.loads succeeds.
    Also escape Unicode line/paragraph separators (U+2028 / U+2029) which break many parsers.
    """
    out: list[str] = []
    in_str = False
    esc = False
    i = 0
    n = len(blob)
    while i < n:
        c = blob[i]
        if not in_str:
            if c == '"':
                in_str = True
                out.append(c)
            else:
                out.append(c)
            i += 1
            continue

        if esc:
            if c in "\n\r":
                out.append("\\n")
                esc = False
                i += 1
                if c == "\r" and i < n and blob[i] == "\n":
                    i += 1
                continue
            out.append(c)
            esc = False
            i += 1
            continue
        if c == "\\":
            out.append(c)
            esc = True
            i += 1
            continue
        if c == '"':
            in_str = False
            out.append(c)
            i += 1
            continue

        o = ord(c)
        if c == "\r":
            if i + 1 < n and blob[i + 1] == "\n":
                out.append("\\n")
                i += 2
            else:
                out.append("\\r")
                i += 1
            continue
        if c == "\n":
            out.append("\\n")
            i += 1
            continue
        if c == "\t":
            out.append("\\t")
            i += 1
            continue
        if o < 32:
            out.append(f"\\u{o:04x}")
            i += 1
            continue
        if o in (0x2028, 0x2029):
            out.append(f"\\u{o:04x}")
            i += 1
            continue

        out.append(c)
        i += 1

    return "".join(out)


def _fix_missing_json_values_after_colon(blob: str) -> str:
    """Insert null when a property has ':' then whitespace then ',' '}' or ']' (invalid JSON many LLMs emit)."""
    out: list[str] = []
    i = 0
    n = len(blob)
    in_str = False
    esc = False
    while i < n:
        c = blob[i]
        if in_str:
            if esc:
                out.append(c)
                esc = False
                i += 1
                continue
            if c == "\\":
                out.append(c)
                esc = True
                i += 1
                continue
            if c == '"':
                in_str = False
            out.append(c)
            i += 1
            continue

        if c == '"':
            in_str = True
            out.append(c)
            i += 1
            continue

        if c == ":":
            out.append(c)
            i += 1
            while i < n and blob[i] in " \t\n\r":
                out.append(blob[i])
                i += 1
            if i >= n or blob[i] in ",}]":
                out.append("null")
            continue

        out.append(c)
        i += 1

    return "".join(out)


def _ident_tail(ch: str) -> bool:
    return ch.isalnum() or ch == "_"


def _replace_js_keywords_outside_strings(blob: str) -> str:
    """Map JavaScript tokens to JSON where models slip them in (outside quoted strings only)."""
    replacements: tuple[tuple[str, str], ...] = (
        ("-Infinity", "null"),
        ("undefined", "null"),
        ("Infinity", "null"),
        ("NaN", "null"),
        ("True", "true"),
        ("False", "false"),
    )
    out: list[str] = []
    i = 0
    n = len(blob)
    in_str = False
    esc = False
    while i < n:
        c = blob[i]
        if in_str:
            if esc:
                out.append(c)
                esc = False
                i += 1
                continue
            if c == "\\":
                out.append(c)
                esc = True
                i += 1
                continue
            if c == '"':
                in_str = False
            out.append(c)
            i += 1
            continue

        if c == '"':
            in_str = True
            out.append(c)
            i += 1
            continue

        matched = False
        for key, repl in replacements:
            if blob.startswith(key, i):
                prev_ok = i == 0 or not _ident_tail(blob[i - 1])
                j = i + len(key)
                next_ok = j >= n or not _ident_tail(blob[j])
                if prev_ok and next_ok:
                    out.append(repl)
                    i = j
                    matched = True
                    break
        if matched:
            continue

        out.append(c)
        i += 1

    return "".join(out)


def _scanner_eof_inside_string(blob: str) -> tuple[bool, bool]:
    """Whether scan ends inside a JSON string, and whether a backslash escape was left unfinished."""
    in_str = False
    esc = False
    for c in blob:
        if not in_str:
            if c == '"':
                in_str = True
            continue
        if esc:
            esc = False
            continue
        if c == "\\":
            esc = True
            continue
        if c == '"':
            in_str = False
    return in_str, esc


def _append_closing_quote_if_eof_inside_string(blob: str) -> str:
    """When output truncates mid-string (e.g. `\"fill\": \"#ff`), add the missing closing quote."""
    in_str, esc = _scanner_eof_inside_string(blob)
    if not in_str:
        return blob
    b = blob
    if esc and b:
        b = b[:-1]
    return b + '"'


def _json_loads_scene(blob: str) -> dict:
    """Parse repaired scene JSON; try lenient modes used by messy LLM output."""
    blobs = [blob]
    patched = _append_closing_quote_if_eof_inside_string(blob)
    if patched != blob:
        blobs.append(patched)
    last_err: json.JSONDecodeError | None = None
    for b in blobs:
        for strict in (True, False):
            try:
                obj = json.loads(b, strict=strict)
                if isinstance(obj, dict):
                    return obj
                raise ValueError("Scene JSON root must be an object.")
            except json.JSONDecodeError as e:
                last_err = e
                continue
    assert last_err is not None
    raise last_err


def _parse_scene_json(text: str) -> dict:
    t = _strip_json_fence(text)
    start = t.find("{")
    if start < 0:
        raise ValueError("No JSON object in model response.")
    blob = _extract_balanced_object(t, start)
    if blob is None:
        blob = t[start:]
    blob = _repair_llm_json_blob(blob)
    blob = _escape_control_chars_inside_json_strings(blob)
    for _ in range(96):
        blob2 = _repair_commas_outside_strings(blob)
        if blob2 == blob:
            break
        blob = blob2
    blob = _fix_missing_json_values_after_colon(blob)
    blob = _replace_js_keywords_outside_strings(blob)
    try:
        obj = _json_loads_scene(blob)
    except json.JSONDecodeError as e:
        ctx = 80
        lo = max(0, e.pos - ctx)
        hi = min(len(blob), e.pos + ctx)
        snippet = blob[lo:hi].replace("\n", "\\n")
        raise ValueError(
            f"Scene JSON parse error at char {e.pos} (line {e.lineno}, col {e.colno}): {e.msg}. "
            f"Snippet: …{snippet}…"
        ) from e
    return obj


def _normalize_legacy_edges(raw_edges: list | None) -> None:
    if not isinstance(raw_edges, list):
        return
    for e in raw_edges:
        if not isinstance(e, dict):
            continue
        if "from_id" not in e and "from" in e:
            e["from_id"] = e.pop("from")
        if "to_id" not in e and "to" in e:
            e["to_id"] = e.pop("to")


def _normalize_shape_dict(sh: dict) -> None:
    if not isinstance(sh, dict):
        return
    if sh.get("path_d") is None and isinstance(sh.get("d"), str):
        sh["path_d"] = sh["d"]
    typ = sh.get("type")
    if isinstance(typ, str) and typ.strip().lower() == "image":
        if sh.get("src") is None and isinstance(sh.get("href"), str):
            sh["src"] = sh["href"]
    typ = sh.get("type")
    if typ is None or (isinstance(typ, str) and not typ.strip()):
        kin = sh.get("kind")
        if isinstance(kin, str) and kin.strip():
            sh["type"] = kin.strip()


def _normalize_shapes_list(raw: list | None) -> None:
    if not isinstance(raw, list):
        return
    for sh in raw:
        _normalize_shape_dict(sh)


def _normalize_shapes_in_frame_or_scene(obj: dict) -> None:
    if not isinstance(obj, dict):
        return
    _normalize_shapes_list(obj.get("shapes"))


def clamp_nodes_edges(
    nodes: list[SceneNode], edges: list[SceneEdge]
) -> tuple[list[SceneNode], list[SceneEdge]]:
    if not nodes:
        return [], []
    clamped_nodes = [
        n.model_copy(
            update={
                "x": max(36.0, min(964.0, float(n.x))),
                "y": max(36.0, min(664.0, float(n.y))),
            }
        )
        for n in nodes
    ]
    node_ids = {n.id for n in clamped_nodes}
    seen_e: set[tuple[str, str]] = set()
    out_edges: list[SceneEdge] = []
    for e in edges:
        fr, to = e.from_id.strip(), e.to_id.strip()
        if fr not in node_ids or to not in node_ids:
            continue
        if fr == to:
            continue
        key = tuple(sorted((fr, to)))
        if key in seen_e:
            continue
        seen_e.add(key)
        raw_id = (e.id or "").strip()
        eid = raw_id if raw_id else f"e-{uuid.uuid4().hex[:10]}"
        out_edges.append(e.model_copy(update={"id": eid}))
    return clamped_nodes, out_edges


def clamp_shapes(shapes: list[SceneShape]) -> list[SceneShape]:
    def cfn(v: float | None, lo: float, hi: float) -> float | None:
        if v is None:
            return None
        return max(lo, min(hi, float(v)))

    out: list[SceneShape] = []
    for s in shapes:
        out.append(
            s.model_copy(
                update={
                    "x": cfn(s.x, 0, 1000),
                    "y": cfn(s.y, 0, 700),
                    "w": cfn(s.w, 2, 1000),
                    "h": cfn(s.h, 2, 700),
                    "cx": cfn(s.cx, 0, 1000),
                    "cy": cfn(s.cy, 0, 700),
                    "rx": cfn(s.rx, 2, 400),
                    "ry": cfn(s.ry, 2, 400),
                    "x1": cfn(s.x1, 0, 1000),
                    "y1": cfn(s.y1, 0, 700),
                    "x2": cfn(s.x2, 0, 1000),
                    "y2": cfn(s.y2, 0, 700),
                    "r": cfn(s.r, 2, 400),
                }
            )
        )
    return out


def _commons_search_queries(user_prompt: str, topic_hint: str) -> list[str]:
    """
    Build Commons search strings for **any** visualization prompt.

    Long prompts often start with filler (“show me a picture of…”); those words yield useless searches if kept.
    Avoid duplicating words like ``diagram`` when keywords already end with ``diagram``.
    """
    pk = _keywords_for_commons(user_prompt or "")
    tk = _keywords_for_commons(topic_hint or "")
    if not pk and tk:
        pk = list(tk)

    def pack(ws: list[str], n: int) -> str:
        return " ".join(ws[: min(n, len(ws))]).strip()

    def wants_diagram_suffix(ws: list[str]) -> bool:
        return not ws or ws[-1].lower() not in _COMMONS_QUERY_VIS_TERMS

    english_first: list[str] = []
    candidates: list[str] = []

    def push_english_diagram(core: str, *, min_len: int = 3) -> None:
        core = core.strip()
        if len(core) < min_len:
            return
        english_first.append(f"{core} english diagram")
        english_first.append(f"{core} english labeled diagram")

    if pk:
        joined = " ".join(pk).strip()
        if len(joined) >= 4:
            push_english_diagram(joined, min_len=4)
            candidates.append(joined)
        if wants_diagram_suffix(pk):
            for n in (5, 8, 12):
                core = pack(pk, n)
                if len(core) >= 3:
                    candidates.append(f"{core} diagram")
                    push_english_diagram(core)
            if len(pk) >= 5:
                ld = f"{pack(pk, min(14, len(pk)))} labeled diagram"
                candidates.append(ld)
                push_english_diagram(ld.replace(" labeled diagram", "").strip())
                candidates.append(f"{pack(pk, 7)} schematic")
        else:
            candidates.append(f"{joined} labeled")
            push_english_diagram(f"{joined} labeled".replace(" labeled", "").strip() or joined)

        jlow = joined.lower()
        if "cell" in jlow:
            if "animal" not in jlow:
                candidates.append("animal cell labeled diagram")
                english_first.insert(0, "animal cell labeled diagram english")
            candidates.append("eukaryotic cell diagram")
            english_first.insert(0, "eukaryotic cell diagram english")

    if tk:
        tjoined = " ".join(tk).strip()
        pj = " ".join(pk).strip() if pk else ""
        if len(tjoined) >= 4 and tjoined.lower() != pj.lower():
            push_english_diagram(tjoined, min_len=4)
            if wants_diagram_suffix(tk):
                candidates.append(f"{tjoined} diagram")
                candidates.append(f"{tjoined} labeled diagram")
            else:
                candidates.append(tjoined)

    candidates = english_first + candidates

    seen: set[str] = set()
    out: list[str] = []
    for q in candidates:
        q = q.strip()[:280]
        if len(q) < 6 or q in seen:
            continue
        seen.add(q)
        out.append(q)
    return out[:22]


def _collect_distinct_reference_urls(
    user_prompt: str,
    topic_hint: str,
    *,
    max_urls: int = 4,
) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for q in _commons_search_queries(user_prompt, topic_hint):
        if len(out) >= max_urls:
            break
        u = _commons_thumbnail_url(q)
        if u and u not in seen:
            seen.add(u)
            out.append(u)
    if out:
        return out
    kws = _keywords_for_commons(user_prompt)
    if kws:
        fallback = " ".join(kws[:8]).strip()
        if len(fallback) >= 4:
            u = _commons_thumbnail_url(f"{fallback} photograph")
            if u:
                return [u]
    th = (topic_hint or "").strip()
    if len(th) >= 4:
        u = _commons_thumbnail_url(th[:220])
        if u:
            return [u]
    return []


def _model_wikimedia_image_urls(shapes: list[SceneShape]) -> list[str]:
    seen: set[str] = set()
    urls: list[str] = []
    for s in shapes:
        if (s.type or "").lower() != "image":
            continue
        src = (s.src or "").strip()
        if not src.startswith("https://upload.wikimedia.org"):
            continue
        if src not in seen:
            seen.add(src)
            urls.append(src[:800])
    return urls


def _layout_photoreal_image_shapes(urls: list[str]) -> list[SceneShape]:
    """Fill the canvas with 1–4 encyclopedia images (no vectors)."""
    if not urls:
        return []
    n = len(urls)
    out: list[SceneShape] = []

    def img(src: str, x: float, y: float, w: float, h: float, label: str) -> SceneShape:
        return SceneShape(
            type="image",
            src=src,
            x=x,
            y=y,
            w=w,
            h=h,
            label=label[:110],
            id=f"s-{uuid.uuid4().hex[:12]}",
        )

    if n == 1:
        return [img(urls[0], 0.0, 0.0, 1000.0, 700.0, "Reference")]

    if n == 2:
        return [
            img(urls[0], 16.0, 48.0, 476.0, 604.0, "Reference A"),
            img(urls[1], 508.0, 48.0, 476.0, 604.0, "Reference B"),
        ]

    # 3–4 tiles (2×2)
    w_cell, h_cell = 476.0, 318.0
    xs = (16.0, 508.0)
    ys = (40.0, 366.0)
    labels = ("Reference A", "Reference B", "Reference C", "Reference D")
    for i in range(min(n, 4)):
        row, col = divmod(i, 2)
        out.append(img(urls[i], xs[col], ys[row], w_cell, h_cell, labels[i]))
    return out


_COMMONS_HIDES_PHOTO_TYPES = frozenset(
    {
        "polygon",
        "path",
    }
)


def inject_commons_thumbnail_first(
    shapes: list[SceneShape],
    topic_hint: str,
    user_prompt: str,
) -> list[SceneShape]:
    """
    Try reference thumbnails before relying on model-drawn outlines.

    Lookup order per query string: **English Wikipedia** article thumbnails, then **Wikimedia Commons** file search.

    SVG paint order follows `shapes` array order (later = on top). The reference **`image` is appended last**
    so it is not covered by rectangles and lines the model still emits.

    **`polygon`** and **`path`** are removed on success — models use both for organic cell/outlines; keeping them
    would obscure or replace the thumbnail visually even when the URL loads fine.
    """
    for q in _commons_search_queries(user_prompt, topic_hint):
        url = _commons_thumbnail_url(q)
        if not url:
            continue
        kept = [s for s in shapes if (s.type or "").lower() not in _COMMONS_HIDES_PHOTO_TYPES]
        img = SceneShape(
            type="image",
            src=url,
            x=150.0,
            y=72.0,
            w=700.0,
            h=520.0,
            label=q[:110],
            id=f"s-{uuid.uuid4().hex[:12]}",
        )
        return kept + [img]

    return shapes


def rewrite_commons_image_sources(shapes: list[SceneShape]) -> list[SceneShape]:
    """Re-resolve upload.wikimedia.org URLs via Commons imageinfo (fixes stale thumbs / bad hashes)."""
    mod = _reference_image_module()
    if mod is None:
        return shapes
    resolve_commons_upload_url = mod.resolve_commons_upload_url
    strip_commons_tracking_query = mod.strip_commons_tracking_query

    out: list[SceneShape] = []
    for s in shapes:
        if (s.type or "").lower() != "image":
            out.append(s)
            continue
        src = (s.src or "").strip()
        if not src.startswith("https://upload.wikimedia.org"):
            out.append(s)
            continue
        if _src_blocked_by_safe_media_policy(src):
            continue
        resolved = resolve_commons_upload_url(src)
        if resolved:
            if _src_blocked_by_safe_media_policy(resolved):
                continue
            out.append(s.model_copy(update={"src": resolved}))
            continue
        stripped = strip_commons_tracking_query(src[:800])
        if stripped != src:
            if _src_blocked_by_safe_media_policy(stripped):
                continue
            out.append(s.model_copy(update={"src": stripped}))
        else:
            out.append(s)
    return out


def finalize_visual_shapes(
    shapes: list[SceneShape],
    topic_hint: str,
    user_prompt: str,
    *,
    prefer_commons_thumbnail: bool = True,
    images_only: bool = False,
    polygon_only: bool = False,
) -> list[SceneShape]:
    if images_only:
        merged = _collect_distinct_reference_urls(user_prompt, topic_hint, max_urls=4)
        if not merged:
            injected = inject_commons_thumbnail_first([], topic_hint, user_prompt)
            merged = _model_wikimedia_image_urls(injected)
        merged = merged[:4]
        layout = _layout_photoreal_image_shapes(merged)
        if not layout:
            layout = _layout_photoreal_image_shapes([_PHOTOREAL_VALIDATE_PLACEHOLDER_SRC])
        return rewrite_commons_image_sources(layout)

    if polygon_only:
        return [s for s in shapes if (s.type or "").lower() == "polygon"]

    s = shapes
    if prefer_commons_thumbnail:
        s = inject_commons_thumbnail_first(s, topic_hint, user_prompt)
    s = maybe_substitute_heavy_polygons(s, topic_hint)
    s = rewrite_commons_image_sources(s)
    return s


def _polygon_centroid_xy(points: str) -> tuple[float, float]:
    pts: list[tuple[float, float]] = []
    for tok in points.strip().split():
        parts = tok.split(",")
        if len(parts) != 2:
            continue
        try:
            pts.append((float(parts[0]), float(parts[1])))
        except ValueError:
            continue
    if not pts:
        return 400.0, 350.0
    sx = sum(p[0] for p in pts)
    sy = sum(p[1] for p in pts)
    n = len(pts)
    return sx / n, sy / n


def maybe_substitute_heavy_polygons(
    shapes: list[SceneShape],
    topic_hint: str,
) -> list[SceneShape]:
    hint_base = (topic_hint or "").strip()[:220] or "scientific illustration"

    polygons = [s for s in shapes if (s.type or "").lower() == "polygon"]
    if len(polygons) > _HEAVY_POLYGON_SHAPE_COUNT:
        url = _commons_thumbnail_url(hint_base)
        if url:
            kept = [s for s in shapes if (s.type or "").lower() != "polygon"]
            img = SceneShape(
                type="image",
                src=url,
                x=150.0,
                y=100.0,
                w=700.0,
                h=500.0,
                label="Reference (Commons)",
                id=f"s-{uuid.uuid4().hex[:12]}",
            )
            return kept + [img]

    out: list[SceneShape] = []
    for s in shapes:
        t = (s.type or "").lower()
        if t == "polygon" and s.points:
            pts_len = len(s.points.strip())
            ntok = len(s.points.split())
            heavy = pts_len > _HEAVY_POLYGON_CHARS or ntok > _HEAVY_POLYGON_VERTEX_TOKENS
            if heavy:
                q = (s.label or s.icon or hint_base).strip()[:120]
                url = _commons_thumbnail_url(q)
                if url:
                    cx, cy = _polygon_centroid_xy(s.points)
                    w, h = 280.0, 210.0
                    out.append(
                        SceneShape(
                            id=s.id,
                            type="image",
                            src=url,
                            x=max(0.0, cx - w / 2),
                            y=max(0.0, cy - h / 2),
                            w=w,
                            h=h,
                            label=s.label,
                        )
                    )
                    continue
        if t == "path" and (s.path_d or "") and len(s.path_d) > _HEAVY_PATH_CHARS:
            q = (s.label or hint_base).strip()[:120]
            url = _commons_thumbnail_url(q)
            if url:
                cx = float(s.cx) if s.cx is not None else 500.0
                cy = float(s.cy) if s.cy is not None else 350.0
                w, h = 280.0, 210.0
                out.append(
                    SceneShape(
                        id=s.id,
                        type="image",
                        src=url,
                        x=max(0.0, cx - w / 2),
                        y=max(0.0, cy - h / 2),
                        w=w,
                        h=h,
                        label=s.label,
                    )
                )
                continue
        out.append(s)
    return out


def _clamp_scene(
    scene: VisualizeScene,
    *,
    topic_hint: str,
    user_prompt: str,
    photoreal: bool,
    polygon_only: bool,
) -> VisualizeScene:
    nodes, edges = clamp_nodes_edges(scene.nodes, scene.edges)
    if photoreal:
        nodes, edges = [], []
    th = f"{scene.title} {topic_hint}".strip()
    shapes = clamp_shapes(
        finalize_visual_shapes(
            scene.shapes,
            th,
            user_prompt,
            prefer_commons_thumbnail=not photoreal and not polygon_only,
            images_only=photoreal,
            polygon_only=polygon_only,
        )
    )
    return VisualizeScene(title=scene.title, caption=scene.caption, nodes=nodes, edges=edges, shapes=shapes)


def _clamp_animated(
    scene: AnimatedVisualizeScene,
    *,
    topic_hint: str,
    user_prompt: str,
    photoreal: bool,
    polygon_only: bool,
) -> AnimatedVisualizeScene:
    frames: list[SceneFrame] = []
    for idx, fr in enumerate(scene.frames):
        nodes, edges = clamp_nodes_edges(fr.nodes, fr.edges)
        if photoreal:
            nodes, edges = [], []
        th = f"{scene.title} {fr.step_label} {topic_hint}".strip()
        frame_prompt = f"{user_prompt} {fr.step_label}".strip()
        inject_thumb = idx == 0 and not photoreal and not polygon_only
        shapes = clamp_shapes(
            finalize_visual_shapes(
                fr.shapes,
                th,
                frame_prompt if photoreal else user_prompt,
                prefer_commons_thumbnail=inject_thumb if not photoreal else False,
                images_only=photoreal,
                polygon_only=polygon_only,
            )
        )
        frames.append(
            SceneFrame(
                step_label=fr.step_label,
                step_detail=fr.step_detail,
                nodes=nodes,
                edges=edges,
                shapes=shapes,
            )
        )
    return AnimatedVisualizeScene(title=scene.title, caption=scene.caption, frames=frames)


def run_visualize_scene(
    *,
    prompt: str,
    domain_hint: str | None,
    model: str,
    max_tokens: int,
    animation: bool,
    visual_mode: str = "default",
) -> VisualizeResult:
    q = prompt.strip()
    if not q:
        raise ValueError("Visualization prompt is empty.")

    hint = (domain_hint or "").strip() or "Infer domain from the user prompt."

    vm = (visual_mode or "default").strip().lower()
    if vm not in ("default", "realism", "polygon_only"):
        vm = "default"
    polygon_only = vm == "polygon_only"
    photoreal = effective_photoreal_images_only(q, hint, visual_mode=vm)
    photoreal_system_prefix = (
        dedent(
            """
            **Photoreal / lifelike mode:** The user enabled **Realism** and/or asked for photograph-like fidelity (e.g.
            lifelike, ultra-real, hyperrealistic, “spitting image”, true-to-life).

            - **`shapes`:** Use **only** `"type":"image"` entries. Each needs **`src`** on **`upload.wikimedia.org`**
              (encyclopedia thumbnails). Emit **1–4** images with `x`,`y`,`w`,`h` filling the **1000×700** canvas (full bleed
              or a simple grid). Do **not** use `rect`, `ellipse`, `circle`, `polygon`, `path`, `line`, `arrow`, `icon`, or
              `ground`.
            - **`nodes`** and **`edges`:** Must be **empty arrays** `[]`.
            - **Animated:** Every frame must repeat the same rule (only `image` shapes in each frame’s `shapes` array).
            - The server replaces the canvas with curated encyclopedia thumbnails when needed; your JSON must still be
              **image-only** (no vector illustration).

            """
        ).strip()
        + "\n\n"
        if photoreal
        else ""
    )

    polygon_only_system_prefix = (
        dedent(
            """
            **Polygon-only mode:** The user selected **polygon-only** drawing.

            - **`shapes`:** Emit **only** `"type":"polygon"` entries for geometry (filled regions, silhouettes, arrows as thin triangles,
              coarse circles/ellipses as many-sided polygons). Do **not** use `rect`, `ellipse`, `circle`, `path`, `line`,
              `arrow`, `icon`, `image`, or `ground`.
            - **`nodes`** and **`edges`:** Allowed for labels and conceptual links.
            - **Animated:** Every frame obeys the same polygon-only rule.

            """
        ).strip()
        + "\n\n"
        if polygon_only and not photoreal
        else ""
    )

    if animation:
        system = dedent(
            """
            You design **multi-frame** interactive diagram data for a web canvas: chemistry mechanisms, physics, biology,
            space, food, vehicles, **or any topic** the user names. The server **first** tries an **English Wikipedia**
            article thumbnail for the topic, then **Wikimedia Commons** file search; **if neither matches**, the canvas
            relies on your vectors. Use **`image`** + **`src`**
            (**HTTPS** `upload.wikimedia.org` only) when you have a **known-good** Commons URL; otherwise **`rect` /
            `ellipse` / `polygon` / `path` / `line`** are appropriate.

            **Workflow — plan first:** Start your JSON with a **`plan`** field (single string, 3–8 short sentences or
            newline-separated bullets using `\\n`). In `plan`, state: what story the frames tell, how many frames and what
            changes per frame, what to draw with shapes vs node labels, whether an optional **`image`** fits, and paint-order
            intent (background → foreground). **Then** fill `title`, `caption`, and **`frames`** so the geometry matches
            that plan. Do not contradict `plan` in the data you emit.

            Reply with **only valid JSON** (no markdown fences, no prose). Use strict JSON: **double-quoted keys and
            strings**, **no trailing commas**, no `//` comments, no single-quoted strings. **Never put a real line break
            inside a string value** — keep labels one line or use `\\n` inside the string.

            **Canvas:** width 1000, height 700, origin top-left. x in [80, 920], y in [60, 640].

            **Reuse node ids across frames** when the same entity persists so positions can tween.

            **Each frame** includes:
            - `step_label`, `step_detail` (optional)
            - `nodes`: optional labels (`id`, `label`, `sublabel`, `x`, `y`, `kind`) — formulas, forces, states
            - `edges`: bonds OR conceptual links (`kind` may include `arrow`)
            - `shapes`: vector layers under draggable nodes. Optional `id` (auto-filled if omitted). **Paint order =
              array order** (background first): sky/ground/horizon, large masses, details, arrows/labels last.
              Each shape object **must** use the key **`type`** (`"type":"rect"`, …). Do **not** use **`kind`** on shapes
              — `kind` is **only** for **nodes**.

            **Shape types** (combine many shapes for helicopters, rockets, pizza, cells, etc.):
            - `ground`: full-width floor — `y`, optional `stroke_width`
            - `rect`: `x`,`y`,`w`,`h`, optional `rotation` (deg), `fill`,`stroke`
            - `ellipse`: `cx`,`cy`,`rx`,`ry`
            - `circle`: `cx`,`cy`,`r`
            - `line`: `x1`,`y1`,`x2`,`y2`
            - `arrow`: `x1`,`y1`,`x2`,`y2`, optional `label`
            - `polygon`: closed silhouette — `points` as `"x,y x,y x,y"` (≥3 points), optional `rotation` around centroid
            - `path`: SVG subset — `path_d` (or `d`) using only `M L H V C Q Z` and numbers (no `<`, scripts). Good for
              wings, flames, organic outlines.
            - `image`: **`src`** required — HTTPS thumbnail on **`upload.wikimedia.org`** only; position with `x`,`y`,`w`,`h`.
              Use for a recognizable photo when vector detail would be excessive.
            - `icon`: optional **built-ins** `car_side`, `apple`, `tree_simple`, `impact_burst`, `barrier_wall` — OR any
              other short noun (`helicopter`, `pizza`) for a **labeled schematic badge**. Use **`nodes`** and **`arrow`**
              for labels and small callouts.

            **Style:** Use saturated hex fills (`#1565c0`, `#e65100`, …), **complete** `#RRGGBB`/`#RGB` only (never cut off
            mid-color). Clear strokes; simple cartoon proportions (few primitives per object). Up to ~96 shapes per frame.

            **Examples:** Car crash: ground + `car_side` or rects; orbit: `circle` planets + `ellipse` rings + `arrow`;
            helicopter: fuselage `rect` + tail `polygon` + rotor `line`s; pizza: `ellipse` crust + `polygon` slice.

            Each frame needs **at least one node OR one shape**. Use nodes for short text (`Fg`, `Δv`); shapes carry the drawing.

            **Root JSON:**
            {
              "plan": "Outline: frame roles, entities, vectors vs labels, optional Commons image rationale.",
              "title": "...",
              "caption": null,
              "frames": [
                { "step_label": "...", "step_detail": null, "nodes": [...], "edges": [...], "shapes": [...] },
                ...
              ]
            }

            Use **5–8 frames** when telling a time story. If a text field needs an ASCII quotation mark inside it, use
            JSON escaping (backslash + quotation mark). Do not paste Unicode “smart quotes” as structural JSON quotes.

            Chemistry frames may use `"shapes": []`. Every `edges[].from_id` / `to_id` must exist in that frame's `nodes`.
            """
        ).strip()
        system = photoreal_system_prefix + polygon_only_system_prefix + system
    else:
        system = dedent(
            """
            You design interactive diagram data for a web canvas: chemistry, physics, biology, space, everyday objects,
            food, vehicles, **anything** the user asks for. The server **first** tries an **English Wikipedia** article
            thumbnail, then **Wikimedia Commons** file search; **if those fail**, your **`polygon` / `path` / other primitives**
            carry the drawing. Optional
            **`image`** + **`src`** on **`upload.wikimedia.org`** when you cite a **correct** Commons thumbnail URL.

            **Workflow — plan first:** Begin your JSON with a **`plan`** field (single string, 3–8 short sentences or
            newline-separated bullets via `\\n`). Summarize: diagram goal, main entities and layout regions, what you draw
            with **`shapes`** vs **`nodes`**/**`edges`**, whether an **`image`** is appropriate, and stacking order
            (background first in `shapes`). **Then** set `title`, `caption`, `nodes`, `edges`, and `shapes` to implement that
            plan. Keep `plan` consistent with what you output.

            Reply with **only valid JSON** (no markdown fences, no prose). Strict JSON: **double-quoted keys/strings**,
            **no trailing commas**, no comments. **Do not insert literal line breaks inside string values** (use `\\n` if
            needed).

            **Canvas:** width 1000, height 700. Coordinates in [0,1000] x [0,700].

            **Nodes** (optional if `shapes` carry the scene): `id`, `label`, `sublabel`, `x`, `y`, `kind`.

            **Edges:** between nodes — `from_id`, `to_id`, `kind`. Omit edges if no nodes.

            **Shapes** (`shapes`): **order = paint order** (back to front). Optional `id`. Up to ~96 shapes.
            Each entry **must** include **`type`** for the primitive name. Use **`kind`** only on **nodes**, never on shapes.

            **Types:**
            - `ground`: `y`, optional `stroke_width`
            - `rect`: `x`,`y`,`w`,`h`, optional `rotation`
            - `ellipse`: `cx`,`cy`,`rx`,`ry`
            - `circle`: `cx`,`cy`,`r`
            - `line`: `x1`,`y1`,`x2`,`y2`
            - `arrow`: `x1`,`y1`,`x2`,`y2`, optional `label`
            - `polygon`: `points` = `"x,y x,y …"` (≥3 vertices), optional `rotation`
            - `path`: `path_d` or `d` — SVG path using only `M L H V C Q Z` and numeric coords (no `<`)
            - `image`: **`src`** — HTTPS URL on **`upload.wikimedia.org`** only; box with `x`,`y`,`w`,`h`
            - `icon`: built-ins `car_side`, `apple`, `tree_simple`, `impact_burst`, `barrier_wall`; **or** any short noun
              for a labeled schematic. **Compose `polygon` + `rect` + `ellipse` + `line`** when vectors are the right tool
              (e.g. schematic forces, abstract diagrams). **`nodes`** + **`arrow`** work well for labels.

            **Hex colors** encouraged (`#RRGGBB` or `#RGB`), always **complete** on one line — never truncate a color string.

            **JSON:**
            {
              "plan": "Outline: goal, layout, primitives vs labels, optional image, paint order.",
              "title": "...",
              "caption": null,
              "nodes": [ ... ],
              "edges": [ ... ],
              "shapes": [ ... ]
            }

            At least one **node** OR one **shape** is required. Avoid unescaped double quotes in strings.
            """
        ).strip()
        system = photoreal_system_prefix + polygon_only_system_prefix + system

    user_content = dedent(
        f"""
        Domain hint: {hint}

        User visualization request:
        {q}
        """
    ).strip()

    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
    with client.messages.stream(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user_content}],
    ) as stream:
        text_parts: list[str] = []
        for text in stream.text_stream:
            text_parts.append(text)
    raw = "".join(text_parts).strip()
    if not raw:
        raise RuntimeError("Empty model response.")

    data = _parse_scene_json(raw)

    if photoreal:
        _patch_photoreal_empty_drawables(data, animation=animation)

    if animation:
        frames_raw = data.get("frames")
        if not isinstance(frames_raw, list) or len(frames_raw) < 2:
            raise ValueError("Animated mode requires a JSON `frames` array with at least 2 entries.")
        for fr in frames_raw:
            if isinstance(fr, dict):
                _normalize_legacy_edges(fr.get("edges"))
                _normalize_shapes_in_frame_or_scene(fr)
        ani = AnimatedVisualizeScene.model_validate(data)
        return _clamp_animated(
            ani, topic_hint=hint, user_prompt=q, photoreal=photoreal, polygon_only=polygon_only
        )

    _normalize_legacy_edges(data.get("edges"))
    _normalize_shapes_in_frame_or_scene(data)
    scene = VisualizeScene.model_validate(data)
    return _clamp_scene(scene, topic_hint=hint, user_prompt=q, photoreal=photoreal, polygon_only=polygon_only)
