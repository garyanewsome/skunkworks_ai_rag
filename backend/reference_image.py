"""Fetch reference thumbnails from Wikimedia Commons (educational use, urllib only)."""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request


def strip_commons_tracking_query(url: str) -> str:
    """Remove utm_* etc.; thumbnails load fine without tracking params."""
    if not url or "?" not in url:
        return url
    base, _, qs = url.partition("?")
    if not qs:
        return url
    pairs = []
    for part in qs.split("&"):
        if not part:
            continue
        name = part.split("=", 1)[0].lower()
        if name.startswith("utm_"):
            continue
        pairs.append(part)
    return base if not pairs else f"{base}?{'&'.join(pairs)}"


def commons_original_filename_from_upload_url(url: str) -> str | None:
    """
    Extract the Commons media filename from an upload.wikimedia.org URL path.

    Works for full-size paths and /thumb/... raster derivatives (SVG→PNG, PDF→JPG).
    Stale /thumb/<hash>/ segments still yield the correct basename for API lookup.
    """
    try:
        p = urllib.parse.urlparse(url.strip())
    except Exception:
        return None
    if (p.scheme or "").lower() != "https":
        return None
    host = (p.hostname or "").lower()
    if host != "upload.wikimedia.org":
        return None
    parts = [x for x in p.path.split("/") if x]
    try:
        ci = parts.index("commons")
    except ValueError:
        return None
    rest = parts[ci + 1 :]
    if not rest:
        return None
    if rest[0] == "thumb":
        # .../commons/thumb/<h>/<hh>/<original>/<derivative>.png|.jpg  → 5 segments after "commons"
        if len(rest) < 5:
            return None
        raw = rest[-2]
    else:
        # .../commons/<h>/<hh>/<filename.ext>
        if len(rest) < 3:
            return None
        raw = rest[-1]
    fn = urllib.parse.unquote(raw)
    return fn if fn else None


def _mime_rank(mime: str | None) -> int:
    """Prefer raster originals / PDF page thumbs over fragile SVG→PNG paths."""
    if not mime:
        return 0
    m = mime.lower()
    if m in ("image/png", "image/jpeg", "image/gif", "image/webp"):
        return 30
    if m == "application/pdf":
        return 25
    if m == "image/svg+xml":
        return 5
    return 0


def _api_get(params: dict[str, str], *, timeout: float) -> dict | None:
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "SkunkworksRAG/1.0 (visualize; educational; +https://localhost)",
            "Accept": "application/json",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
    except (urllib.error.URLError, TimeoutError, OSError):
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def commons_thumburl_for_filename(filename: str, *, width: int = 640, timeout: float = 12.0) -> str | None:
    """Resolve current scaled thumbnail URL for a Commons filename via imageinfo."""
    fn = (filename or "").strip().replace(" ", "_")
    if len(fn) < 2:
        return None
    title = fn if fn.startswith("File:") else f"File:{fn}"
    data = _api_get(
        {
            "action": "query",
            "titles": title,
            "prop": "imageinfo",
            "iiprop": "url|mime",
            "iiurlwidth": str(width),
            "format": "json",
            "origin": "*",
        },
        timeout=timeout,
    )
    if not data:
        return None
    pages = (data.get("query") or {}).get("pages") or {}
    for _pid, page in pages.items():
        if not isinstance(page, dict):
            continue
        if page.get("missing"):
            continue
        infos = page.get("imageinfo")
        if not isinstance(infos, list) or not infos:
            continue
        info = infos[0]
        if not isinstance(info, dict):
            continue
        tu = info.get("thumburl")
        if isinstance(tu, str) and tu.startswith("https://upload.wikimedia.org"):
            return strip_commons_tracking_query(tu[:800])
        full = info.get("url")
        if isinstance(full, str) and full.startswith("https://upload.wikimedia.org"):
            return strip_commons_tracking_query(full[:800])
    return None


def resolve_commons_upload_url(src: str, *, timeout: float = 12.0) -> str | None:
    """
    Turn any upload.wikimedia.org commons URL into the current API-backed thumbnail URL.

    Fixes stale /thumb/<hash>/ paths (files moved on Commons) and LLM-hallucinated URLs.
    """
    fn = commons_original_filename_from_upload_url(src)
    if not fn:
        return None
    # PDF page thumbnails depend on iiurlwidth (e.g. page1-500px); try several raster widths.
    for w in (640, 500, 800, 480, 960, 320):
        got = commons_thumburl_for_filename(fn, width=w, timeout=timeout)
        if got:
            return got
    return None


def commons_thumbnail_url(query: str, *, timeout: float = 12.0) -> str | None:
    """Return an HTTPS thumbnail URL from Wikimedia Commons search, or None."""
    q = (query or "").strip()[:160]
    if len(q) < 2:
        return None

    params = {
        "action": "query",
        "generator": "search",
        "gsrnamespace": "6",
        "gsrsearch": q,
        "gsrlimit": "12",
        "prop": "imageinfo",
        "iiprop": "url|mime",
        "iiurlwidth": "640",
        "format": "json",
        "origin": "*",
    }
    data = _api_get(params, timeout=timeout)
    if not data:
        return None

    pages = (data.get("query") or {}).get("pages") or {}
    candidates: list[tuple[int, int, str]] = []
    for _pid, page in pages.items():
        if not isinstance(page, dict):
            continue
        idx = int(page.get("index") or 0)
        infos = page.get("imageinfo")
        if not isinstance(infos, list) or not infos:
            continue
        info = infos[0]
        if not isinstance(info, dict):
            continue
        tu = info.get("thumburl")
        if not isinstance(tu, str) or not tu.startswith("https://upload.wikimedia.org"):
            continue
        mime = info.get("mime")
        mime_s = mime if isinstance(mime, str) else ""
        rank = _mime_rank(mime_s)
        clean = strip_commons_tracking_query(tu[:800])
        candidates.append((rank, idx, clean))

    candidates.sort(key=lambda t: (-t[0], t[1]))
    for _rank, _idx, clean in candidates:
        return clean

    return None
