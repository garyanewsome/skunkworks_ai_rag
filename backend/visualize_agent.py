#!/usr/bin/env python3
"""
LLM-driven interactive scene for problem-solving visualization (molecules,
forces, flowcharts, etc.). Supports single canvas or multi-frame mechanisms.
"""

from __future__ import annotations

import json
import os
import re
import uuid
from textwrap import dedent
from typing import Union

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


class SceneShape(BaseModel):
    """Vector scenery: primitives + optional built-in icons (any topic)."""

    id: str = Field(default_factory=lambda: f"s-{uuid.uuid4().hex[:12]}", max_length=64)
    type: str = Field(
        ...,
        max_length=32,
        description="ground | rect | ellipse | circle | line | arrow | polygon | path | icon",
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


def _parse_scene_json(text: str) -> dict:
    t = _strip_json_fence(text)
    start = t.find("{")
    if start < 0:
        raise ValueError("No JSON object in model response.")
    decoder = json.JSONDecoder()
    obj, _ = decoder.raw_decode(t, start)
    if not isinstance(obj, dict):
        raise ValueError("Scene JSON root must be an object.")
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


def _clamp_scene(scene: VisualizeScene) -> VisualizeScene:
    nodes, edges = clamp_nodes_edges(scene.nodes, scene.edges)
    shapes = clamp_shapes(scene.shapes)
    return VisualizeScene(title=scene.title, caption=scene.caption, nodes=nodes, edges=edges, shapes=shapes)


def _clamp_animated(scene: AnimatedVisualizeScene) -> AnimatedVisualizeScene:
    frames: list[SceneFrame] = []
    for fr in scene.frames:
        nodes, edges = clamp_nodes_edges(fr.nodes, fr.edges)
        frames.append(
            SceneFrame(
                step_label=fr.step_label,
                step_detail=fr.step_detail,
                nodes=nodes,
                edges=edges,
                shapes=clamp_shapes(fr.shapes),
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
) -> VisualizeResult:
    q = prompt.strip()
    if not q:
        raise ValueError("Visualization prompt is empty.")

    hint = (domain_hint or "").strip() or "Infer domain from the user prompt."

    if animation:
        system = dedent(
            """
            You design **multi-frame** interactive diagram data for a web canvas: chemistry mechanisms, physics, biology,
            space, food, vehicles, **or any topic** the user names. Illustrations are built from vector primitives (not
            external images).

            Reply with **only valid JSON** (no markdown fences, no prose).

            **Canvas:** width 1000, height 700, origin top-left. x in [80, 920], y in [60, 640].

            **Reuse node ids across frames** when the same entity persists so positions can tween.

            **Each frame** includes:
            - `step_label`, `step_detail` (optional)
            - `nodes`: optional labels (`id`, `label`, `sublabel`, `x`, `y`, `kind`) — formulas, forces, states
            - `edges`: bonds OR conceptual links (`kind` may include `arrow`)
            - `shapes`: vector layers under draggable nodes. Optional `id` (auto-filled if omitted). **Paint order =
              array order** (background first): sky/ground/horizon, large masses, details, arrows/labels last.

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
            - `icon`: optional **built-ins** `car_side`, `apple`, `tree_simple`, `impact_burst`, `barrier_wall` — OR any
              other short noun (`helicopter`, `pizza`) for a **labeled schematic badge**. Prefer **polygon / path /
              stacked rects+ellipses** when you want a recognizable drawing.

            **Style:** Use saturated hex fills (`#1565c0`, `#e65100`, …), clear strokes, simple cartoon proportions (few
            primitives per object). Up to ~96 shapes per frame.

            **Examples:** Car crash: ground + `car_side` or rects; orbit: `circle` planets + `ellipse` rings + `arrow`;
            helicopter: fuselage `rect` + tail `polygon` + rotor `line`s; pizza: `ellipse` crust + `polygon` slice.

            Each frame needs **at least one node OR one shape**. Use nodes for short text (`Fg`, `Δv`); shapes carry the drawing.

            **Root JSON:**
            {
              "title": "...",
              "caption": null,
              "frames": [
                { "step_label": "...", "step_detail": null, "nodes": [...], "edges": [...], "shapes": [...] },
                ...
              ]
            }

            Use **5–8 frames** when telling a time story. ASCII-friendly strings; no raw `"` inside labels.

            Chemistry frames may use `"shapes": []`. Every `edges[].from_id` / `to_id` must exist in that frame's `nodes`.
            """
        ).strip()
    else:
        system = dedent(
            """
            You design interactive diagram data for a web canvas: chemistry, physics, biology, space, everyday objects,
            food, vehicles, **anything** the user asks for. Output vector primitives only (no bitmap URLs).

            Reply with **only valid JSON** (no markdown fences, no prose).

            **Canvas:** width 1000, height 700. Coordinates in [0,1000] x [0,700].

            **Nodes** (optional if `shapes` carry the scene): `id`, `label`, `sublabel`, `x`, `y`, `kind`.

            **Edges:** between nodes — `from_id`, `to_id`, `kind`. Omit edges if no nodes.

            **Shapes** (`shapes`): **order = paint order** (back to front). Optional `id`. Up to ~96 shapes.

            **Types:**
            - `ground`: `y`, optional `stroke_width`
            - `rect`: `x`,`y`,`w`,`h`, optional `rotation`
            - `ellipse`: `cx`,`cy`,`rx`,`ry`
            - `circle`: `cx`,`cy`,`r`
            - `line`: `x1`,`y1`,`x2`,`y2`
            - `arrow`: `x1`,`y1`,`x2`,`y2`, optional `label`
            - `polygon`: `points` = `"x,y x,y …"` (≥3 vertices), optional `rotation`
            - `path`: `path_d` or `d` — SVG path using only `M L H V C Q Z` and numeric coords (no `<`)
            - `icon`: built-ins `car_side`, `apple`, `tree_simple`, `impact_burst`, `barrier_wall`; **or** any short noun
              for a labeled schematic. For clear drawings of arbitrary subjects, **compose `polygon` + `rect` +
              `ellipse` + `line`** (e.g. spaceship body + fins + window circles).

            **Hex colors** encouraged. Stack simple shapes; label forces with `arrow` + `nodes` if helpful.

            **JSON:**
            {
              "title": "...",
              "caption": null,
              "nodes": [ ... ],
              "edges": [ ... ],
              "shapes": [ ... ]
            }

            At least one **node** OR one **shape** is required. Avoid unescaped double quotes in strings.
            """
        ).strip()

    user_content = dedent(
        f"""
        Domain hint: {hint}

        User visualization request:
        {q}
        """
    ).strip()

    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
    msg = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user_content}],
    )
    text_parts: list[str] = []
    for block in msg.content:
        if block.type == "text":
            text_parts.append(block.text)
    raw = "".join(text_parts).strip()
    if not raw:
        raise RuntimeError("Empty model response.")

    data = _parse_scene_json(raw)

    if animation:
        frames_raw = data.get("frames")
        if not isinstance(frames_raw, list) or len(frames_raw) < 2:
            raise ValueError("Animated mode requires a JSON `frames` array with at least 2 entries.")
        for fr in frames_raw:
            if isinstance(fr, dict):
                _normalize_legacy_edges(fr.get("edges"))
                _normalize_shapes_in_frame_or_scene(fr)
        ani = AnimatedVisualizeScene.model_validate(data)
        return _clamp_animated(ani)

    _normalize_legacy_edges(data.get("edges"))
    _normalize_shapes_in_frame_or_scene(data)
    scene = VisualizeScene.model_validate(data)
    return _clamp_scene(scene)
