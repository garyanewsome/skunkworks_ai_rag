"""Fetch reference thumbnails: English Wikipedia articles first, then Wikimedia Commons (urllib only).

Unsafe-looking filenames and titles (explicit intimate content, nudity-focused media, common profanity) are skipped when
selecting thumbnails.
"""

from __future__ import annotations

import json
import re
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


def is_unsafe_wikimedia_media_label(label: str) -> bool:
    """
    Filter sexually explicit, intimate body-focused-for-display, nudity-focused, or profane media labels.

    Used for Commons ``File:`` titles, Wikipedia article titles, and upload URL basenames. Heuristic only.
    """
    if not label or not str(label).strip():
        return False
    s0 = str(label).strip()
    if s0.lower().startswith("file:"):
        s0 = s0[5:].strip()
    s = s0.replace("_", " ").lower()

    # Poultry / recipe exceptions for "breast"
    if re.search(r"\b(chicken|turkey|duck|goose)\s+breast\b", s):
        return False

    if re.search(r"\bbreasts?\b", s):
        if re.search(
            r"\b(cancer|mastectomy|feeding|mammograph|mammogram|self[\s-]?exam|biopsy|implant|lumpectomy)\b",
            s,
        ):
            return False
        return True

    if re.search(
        r"\b(genitals?|genitalia|penis|penises|phallus|vagina|vulva|vulvar|scrotum|testicles?|testes|\btestis\b|"
        r"clitoris|labia|labial|glans\b|foreskin|pubic\s+hair|pubic\s+area|anus\b|"
        r"nipples?|areola|erection|ejaculat|semen|orgasm|coitus|copulation|fellatio|cunnilingus|"
        r"anal\s+sex|\brape\b|molest|bestiality)\b",
        s,
    ):
        return True

    if re.search(
        r"\b(porn(?:ography|ographic)?|xxx|nsfw|hentai|erotic|nudes?|nudity|striptease|"
        r"playboy|penthouse|hustler|onlyfans|fetish|bdsm)\b",
        s,
    ):
        return True

    if re.search(
        r"\b(pedoph|paedoph|child\s+porn|csam|lolita\b)\b",
        s,
    ):
        return True

    if re.search(
        r"\b(fuck|fucking|fucked|motherfuck|shit|cunt|slut|whore|bastard|"
        r"\bcock\b|\bdick\b|\bpussy\b|\bcum\b|\bjizz\b|\btits\b|\basshole\b|\bcrap\b)\b",
        s,
    ):
        return True

    return False


def upload_media_basename_from_url(url: str) -> str | None:
    """Best-effort media filename from an ``upload.wikimedia.org`` URL (Commons + other wiki thumb paths)."""
    fn = commons_original_filename_from_upload_url(url)
    if fn:
        return fn
    try:
        p = urllib.parse.urlparse((url or "").strip())
        parts = [x for x in p.path.split("/") if x]
        if not parts:
            return None
        return urllib.parse.unquote(parts[-1])
    except Exception:
        return None


def is_unsafe_wikimedia_upload_url(url: str) -> bool:
    base = upload_media_basename_from_url(url)
    return bool(base and is_unsafe_wikimedia_media_label(base))


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


_NON_EN_DIAGRAM_LANG_RE = re.compile(
    r"diagram[-_](bn|hi|ta|ml|te|kn|gu|zh|ja|ko|ar|fa|ru|uk|vi|th|id|ms|tr)",
    re.I,
)
_NON_EN_SUFFIX_BEFORE_EXT_RE = re.compile(
    r"[-_](bn|hi|ta|ml|te|kn|gu|pa|ur|zh|ja|ko|ar|fa|ru|uk|fr|de|es|pt|it|nl|pl|vi|th|id|sv|da|no|fi)"
    r"\.(?:png|svg|jpg|jpeg|webp|gif)\b",
    re.I,
)
_EN_IN_FILENAME_RE = re.compile(
    r"(?:^|[-_])(english|en)(?:[-_.]|$)|diagram[-_]en|[-_]en\.(?:png|svg|jpg)",
    re.I,
)
_NON_LATIN_SCRIPT_RE = re.compile(r"[\u0400-\u04FF\u0600-\u06FF\u3040-\u30FF\u4e00-\u9fff\uac00-\ud7af]")


def _english_locale_score(title: str) -> int:
    """
    Prefer Commons files that are clearly English-labeled; down-rank common localized diagram variants.

    Diagram text inside the image may still be wrong; pairing with ``english`` search terms helps.
    """
    if not title:
        return 0
    tl = title.lower()
    score = 0
    if _EN_IN_FILENAME_RE.search(tl):
        score += 32
    if _NON_EN_DIAGRAM_LANG_RE.search(tl):
        score -= 55
    if _NON_EN_SUFFIX_BEFORE_EXT_RE.search(tl):
        score -= 50
    if _NON_LATIN_SCRIPT_RE.search(title):
        score -= 45
    return score


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


_API_HEADERS = {
    "User-Agent": "SkunkworksRAG/1.0 (visualize; educational; +https://localhost)",
    "Accept": "application/json",
}


def _commons_api_get(params: dict[str, str], *, timeout: float) -> dict | None:
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=_API_HEADERS, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
    except (urllib.error.URLError, TimeoutError, OSError):
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def _enwiki_api_get(params: dict[str, str], *, timeout: float) -> dict | None:
    url = "https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=_API_HEADERS, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
    except (urllib.error.URLError, TimeoutError, OSError):
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def _api_get(params: dict[str, str], *, timeout: float) -> dict | None:
    """Commons API (legacy name used by imageinfo-by-filename helpers)."""
    return _commons_api_get(params, timeout=timeout)


def commons_thumburl_for_filename(filename: str, *, width: int = 640, timeout: float = 12.0) -> str | None:
    """Resolve current scaled thumbnail URL for a Commons filename via imageinfo."""
    fn = (filename or "").strip().replace(" ", "_")
    if len(fn) < 2:
        return None
    if is_unsafe_wikimedia_media_label(fn):
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
            out = strip_commons_tracking_query(tu[:800])
            if not is_unsafe_wikimedia_upload_url(out):
                return out
        full = info.get("url")
        if isinstance(full, str) and full.startswith("https://upload.wikimedia.org"):
            out = strip_commons_tracking_query(full[:800])
            if not is_unsafe_wikimedia_upload_url(out):
                return out
    return None


def resolve_commons_upload_url(src: str, *, timeout: float = 12.0) -> str | None:
    """
    Turn any upload.wikimedia.org commons URL into the current API-backed thumbnail URL.

    Fixes stale /thumb/<hash>/ paths (files moved on Commons) and LLM-hallucinated URLs.
    """
    fn = commons_original_filename_from_upload_url(src)
    if not fn:
        return None
    if is_unsafe_wikimedia_media_label(fn):
        return None
    # PDF page thumbnails depend on iiurlwidth (e.g. page1-500px); try several raster widths.
    for w in (640, 500, 800, 480, 960, 320):
        got = commons_thumburl_for_filename(fn, width=w, timeout=timeout)
        if got:
            return got
    return None


def _query_pages_as_list(data: dict | None) -> list[dict]:
    """Normalize MediaWiki ``query.pages`` (mapping or list, depending on formatversion) into page dicts."""
    if not data:
        return []
    pages = (data.get("query") or {}).get("pages")
    if isinstance(pages, list):
        return [p for p in pages if isinstance(p, dict)]
    if isinstance(pages, dict):
        return [p for p in pages.values() if isinstance(p, dict)]
    return []


def wikipedia_en_thumbnail_url(query: str, *, timeout: float = 12.0) -> str | None:
    """
    English Wikipedia: full-text article search (main namespace) + ``pageimages`` thumbnail.

    Thumbnails still live on ``upload.wikimedia.org``; ordering follows on-wiki search relevance.
    """
    q = (query or "").strip()[:280]
    if len(q) < 2:
        return None
    data = _enwiki_api_get(
        {
            "action": "query",
            "generator": "search",
            "gsrsearch": q,
            "gsrnamespace": "0",
            "gsrlimit": "12",
            "prop": "pageimages",
            "piprop": "thumbnail",
            "pithumbsize": "640",
            "format": "json",
            "formatversion": "2",
            "origin": "*",
        },
        timeout=timeout,
    )
    rows: list[tuple[int, str]] = []
    for page in _query_pages_as_list(data):
        if page.get("missing"):
            continue
        thumb = page.get("thumbnail")
        if not isinstance(thumb, dict):
            continue
        src = thumb.get("source")
        if not isinstance(src, str) or not src.startswith("https://upload.wikimedia.org"):
            continue
        title = page.get("title") or ""
        if is_unsafe_wikimedia_media_label(title):
            continue
        clean = strip_commons_tracking_query(src[:800])
        if is_unsafe_wikimedia_upload_url(clean):
            continue
        idx = int(page.get("index") or 0)
        rows.append((idx, clean))
    rows.sort(key=lambda t: t[0])
    for _idx, url in rows:
        return url
    return None


def wikimedia_thumbnail_url(query: str, *, timeout: float = 12.0) -> str | None:
    """Prefer an English Wikipedia article thumbnail; if none, search Wikimedia Commons files."""
    wiki = wikipedia_en_thumbnail_url(query, timeout=timeout)
    if wiki and not is_unsafe_wikimedia_upload_url(wiki):
        return wiki
    return commons_thumbnail_url(query, timeout=timeout)


def commons_thumbnail_url(query: str, *, timeout: float = 12.0) -> str | None:
    """Return an HTTPS thumbnail URL from Wikimedia Commons search, or None."""
    # Commons fulltext search accepts fairly long strings; clip to stay within URL limits.
    q = (query or "").strip()[:280]
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

    ql = q.lower()
    wants_diagram = any(k in ql for k in ("diagram", "illustration", "labeled", "cell"))

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
        score = _mime_rank(mime_s)
        raw_title = page.get("title") or ""
        if is_unsafe_wikimedia_media_label(raw_title):
            continue
        tl = raw_title.lower()
        score += _english_locale_score(raw_title)
        wants_english = "english" in ql
        if wants_english:
            score += _english_locale_score(raw_title)
        if wants_diagram:
            if any(k in tl for k in ("diagram", "illustration", "labeled", "schematic", "scheme")):
                score += 18
            if "animal_cell" in tl or "animal cell" in tl.replace("_", " "):
                score += 6
            if "karyotype" in tl or "chromosome" in tl or "mitotic" in tl:
                score -= 35

        clean = strip_commons_tracking_query(tu[:800])
        if is_unsafe_wikimedia_upload_url(clean):
            continue
        candidates.append((score, idx, clean))

    candidates.sort(key=lambda t: (-t[0], t[1]))
    for _rank, _idx, clean in candidates:
        return clean

    return None
