"""Study notes for a saved lecture clip (Claude, plain markdown)."""

from __future__ import annotations

import os
from textwrap import dedent

import anthropic


def generate_clip_study_notes(
    transcript_excerpt: str,
    video_title: str,
    start_ms: int | None,
    end_ms: int | None,
    *,
    model: str,
    max_tokens: int,
) -> str:
    excerpt = (transcript_excerpt or "").strip()
    if not excerpt:
        raise ValueError("transcript_excerpt is empty")
    title = (video_title or "").strip() or "Lecture"

    timing_parts: list[str] = []
    if start_ms is not None:
        timing_parts.append(f"start_ms={start_ms}")
    if end_ms is not None:
        timing_parts.append(f"end_ms={end_ms}")
    timing = ", ".join(timing_parts) if timing_parts else "timing not specified"

    user = dedent(
        f"""
        Lecture / video title: {title}
        Clip timing ({timing}).

        Transcript excerpt:
        ---
        {excerpt}
        ---
        """
    ).strip()

    system = dedent(
        """
        You help a physics student study from a short lecture transcript clip.

        Write markdown (no JSON, no code fences wrapping the whole answer). Use short sections with ## headings.

        EQUATIONS — KaTeX/LaTeX only (the UI renders math; raw Unicode-only formulas are discouraged):
        - Inline math: wrap in single dollar signs, e.g. $\\left|\\psi(t_1+t)\\right\\rangle = U(t)\\left|\\psi(t_1)\\right\\rangle$
        - Display (centered) math: use $$ on their own lines:
          $$\\left|\\psi(t_1+t)\\right\\rangle = U(t)\\left|\\psi(t_1)\\right\\rangle$$
        Use standard LaTeX: \\psi, \\Psi, \\vec{A}, \\hat{H}, subscripts t_1, fractions \\frac{a}{b}, etc.
        For kets/bras prefer \\left|\\psi\\right\\rangle (or \\langle \\psi |) so spacing is correct.

        Include:
        - **Key ideas** — bullet list of the main points.
        - **Definitions** — any important terms or quantities introduced (brief).
        - **Practice prompt** — one concrete question the student could try (no full solution).

        Stay faithful to the excerpt; do not invent content not supported by the text.
        """
    ).strip()

    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
    with client.messages.stream(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    ) as stream:
        parts: list[str] = []
        for text in stream.text_stream:
            parts.append(text)
    out = "".join(parts).strip()
    if not out:
        raise ValueError("Model returned empty study notes")
    return out
