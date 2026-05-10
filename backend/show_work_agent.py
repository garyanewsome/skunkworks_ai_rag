"""Stepped math 'show work' as JSON with KaTeX-ready LaTeX (Claude)."""

from __future__ import annotations

import json
import os
import re
from textwrap import dedent

import anthropic


def _strip_json_fence(raw: str) -> str:
    s = raw.strip()
    if s.startswith("```"):
        s = re.sub(r"^```(?:json)?\s*", "", s, flags=re.IGNORECASE)
        s = re.sub(r"\s*```\s*$", "", s)
    return s.strip()


def run_show_work(
    prompt: str,
    *,
    model: str,
    max_tokens: int,
    explicit_all_steps: bool = False,
) -> dict[str, object]:
    q = prompt.strip()
    if not q:
        raise ValueError("prompt is empty")

    explicit_rules = dedent(
        """

        EXPLICIT / FULL SCRATCH MODE (follow strictly):
        - Walk the problem like handwritten homework: many small steps (often 12–35), not just key highlights.
        - Before simplifying fractions or cancelling common factors, SHOW the factors explicitly and cross out what cancels.
          Use KaTeX \\\\cancel{...} around each cancelled factor or term (e.g. \\\\frac{\\\\cancel{x}}{\\\\cancel{x}} shows the cancellation).
          Use \\\\bcancel{...} if you want a heavier strike on a whole term.
        - After cancellation, write the simplified expression on the next line so the reader sees the result clearly.
        - For algebra: distribute, collect like terms, move terms across = with sign changes — show each micro-move when helpful.
        - For limits: try forms, factor if needed, cancel or rationalize with crossed-out intermediate factors where applicable.
        - For integrals (u-sub, parts): state substitutions and plug back in over separate steps.
        - Prefer \\\\begin{aligned} ... \\\\end{aligned} when a step has multiple aligned lines.
        """
    ).strip()

    base_rules = dedent(
        """
        Rules:
        - Use enough steps to justify the result (typically 4–14): derivatives, integrals, substitutions, algebra.
        - "note": short, conversational; no LaTeX inside note.
        - "latex": valid KaTeX. Use \\\\ for line breaks inside aligned environments.
          Example aligned step: "\\\\begin{aligned} u &= x^2 \\\\\\\\ \\\\frac{du}{dx} &= 2x \\\\end{aligned}"
        - Escape JSON properly (backslashes doubled in JSON strings).
        - Final step should present the answer clearly.
        """
    ).strip()

    if explicit_all_steps:
        step_range = "typically 12–35"
        rules_block = explicit_rules + "\n\n" + base_rules.replace(
            "- Use enough steps to justify the result (typically 4–14): derivatives, integrals, substitutions, algebra.",
            f"- Use enough steps to justify the result ({step_range}): treat every legal algebraic move as its own step when it clarifies cancellations.",
        )
    else:
        rules_block = base_rules

    system = dedent(
        f"""
        You produce worked mathematics for a notebook-style UI that renders math with KaTeX.

        Reply with ONLY a single JSON object (no markdown code fences, no text before or after) using exactly:
        {{
          "title": "short problem label",
          "steps": [
            {{ "note": "plain-English margin comment, informal like handwritten scratch", "latex": "KaTeX math string" }}
          ]
        }}

        {rules_block}
        """
    ).strip()

    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
    with client.messages.stream(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": q}],
    ) as stream:
        parts: list[str] = []
        for text in stream.text_stream:
            parts.append(text)
        raw = "".join(parts).strip()

    text = _strip_json_fence(raw)
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        raise ValueError(f"Model did not return valid JSON: {e}") from e

    if not isinstance(data, dict):
        raise ValueError("Expected JSON object")
    title = data.get("title")
    steps_raw = data.get("steps")
    if not isinstance(title, str) or not title.strip():
        raise ValueError("Missing or empty title")
    if not isinstance(steps_raw, list) or len(steps_raw) < 1:
        raise ValueError("steps must be a non-empty array")

    out_steps: list[dict[str, str]] = []
    for i, item in enumerate(steps_raw):
        if not isinstance(item, dict):
            continue
        note = str(item.get("note") or "").strip()
        latex = str(item.get("latex") or "").strip()
        if not latex:
            continue
        out_steps.append({"note": note or f"Step {len(out_steps) + 1}", "latex": latex})

    if not out_steps:
        raise ValueError("No valid steps after parsing")

    return {"title": title.strip(), "steps": out_steps, "used_llm": True}
