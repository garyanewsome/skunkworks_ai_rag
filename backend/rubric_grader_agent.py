#!/usr/bin/env python3
"""
Generic university homework grader using Anthropic Claude.

Maps numeric scores to letter grades:
  A: 100–90, B: 89–80, C: 79–70, D: 69–60, F: 59–0
"""

from __future__ import annotations

import json
import os
import re
from textwrap import dedent

import anthropic
from pydantic import BaseModel, Field, ValidationError


class GraderResult(BaseModel):
    numeric_score: float = Field(ge=0, le=100, description="Overall score 0–100.")
    letter_grade: str = Field(description="A, B, C, D, or F consistent with numeric_score.")
    summary_line: str = Field(description="One-line overall judgment.")
    detailed_feedback: str = Field(
        description="Markdown: reasoning, item-by-item critique, how to improve."
    )


def letter_from_score(score: float) -> str:
    if score >= 90:
        return "A"
    if score >= 80:
        return "B"
    if score >= 70:
        return "C"
    if score >= 60:
        return "D"
    return "F"


BEGIN_FEEDBACK = "BEGIN_DETAILED_FEEDBACK"
END_FEEDBACK = "END_DETAILED_FEEDBACK"


def _strip_markdown_fences(text: str) -> str:
    t = text.strip()
    if not t.startswith("```"):
        return t
    lines = t.split("\n")
    if lines and lines[0].strip().startswith("```"):
        lines = lines[1:]
    while lines and lines[-1].strip() == "```":
        lines = lines[:-1]
    return "\n".join(lines).strip()


def _parse_delimited_grader_response(text: str) -> GraderResult:
    """Parse model output: short header lines + multiline markdown block (no JSON in feedback)."""
    t = _strip_markdown_fences(text)
    bi = t.find(BEGIN_FEEDBACK)
    if bi < 0:
        raise ValueError(f"Missing {BEGIN_FEEDBACK} marker in model response.")

    header = t[:bi].strip()
    # Allow a short preamble before the required header lines (models sometimes add a phrase).
    m_hdr = re.search(r"(?ms)^NUMERIC_SCORE\s*:", header)
    if m_hdr:
        header = header[m_hdr.start() :].strip()

    tail = t[bi + len(BEGIN_FEEDBACK) :].lstrip("\n")
    ei = tail.find(END_FEEDBACK)
    if ei >= 0:
        feedback = tail[:ei].strip()
    else:
        feedback = tail.strip()

    meta: dict[str, str] = {}
    for line in header.splitlines():
        line = line.strip()
        if not line or ":" not in line:
            continue
        key, _, val = line.partition(":")
        k = key.strip().upper().replace(" ", "_")
        meta[k] = val.strip()

    score_raw = meta.get("NUMERIC_SCORE")
    if score_raw is None:
        raise ValueError("Missing NUMERIC_SCORE line before detailed feedback block.")
    score = float(score_raw)

    lg_raw = (meta.get("LETTER_GRADE") or "").strip().upper()
    if lg_raw and lg_raw[0] in "ABCDF":
        letter = lg_raw[0]
    else:
        letter = letter_from_score(score)

    summary = (meta.get("SUMMARY_LINE") or meta.get("SUMMARY") or "").strip()
    if not summary:
        raise ValueError("Missing SUMMARY_LINE before detailed feedback block.")
    if not feedback:
        raise ValueError("Detailed feedback block is empty.")

    expected = letter_from_score(score)
    if letter != expected:
        letter = expected

    return GraderResult(
        numeric_score=score,
        letter_grade=letter,
        summary_line=summary,
        detailed_feedback=feedback,
    )


def _extract_json_object(text: str) -> dict:
    t = _strip_markdown_fences(text)
    start = t.find("{")
    if start < 0:
        raise ValueError("No JSON object found in model response.")
    decoder = json.JSONDecoder()
    obj, _ = decoder.raw_decode(t, start)
    if not isinstance(obj, dict):
        raise ValueError("Model JSON root must be an object.")
    return obj


def _parse_json_grader_response(text: str) -> GraderResult:
    data = _extract_json_object(text)
    if "numeric_score" not in data:
        raise ValueError("Model JSON missing numeric_score.")
    score = float(data["numeric_score"])
    lg_raw = str(data.get("letter_grade", "")).strip().upper()
    if lg_raw and lg_raw[0] in "ABCDF":
        data["letter_grade"] = lg_raw[0]
    else:
        data["letter_grade"] = letter_from_score(score)
    result = GraderResult.model_validate(data)
    expected = letter_from_score(result.numeric_score)
    if result.letter_grade != expected:
        result = result.model_copy(update={"letter_grade": expected})
    return result


def run_rubric_grader(
    *,
    assignment_questions: str,
    student_submission: str,
    subject_context: str | None,
    rubric_or_instructions: str | None,
    model: str,
    max_tokens: int,
) -> GraderResult:
    q = assignment_questions.strip()
    a = student_submission.strip()
    if not q:
        raise ValueError("Assignment questions / prompts are empty.")
    if not a:
        raise ValueError("Student submission is empty.")

    subject_block = (
        (subject_context or "").strip()
        or "Not specified — infer the discipline from the assignment wording."
    )
    rubric_block = (
        (rubric_or_instructions or "").strip()
        or "No separate rubric supplied — infer reasonable university-level criteria from the questions."
    )

    system = dedent(
        """
        You are an experienced university instructor grading homework across disciplines (STEM, humanities,
        social sciences, professional programs). You grade fairly, consistently, and with the nuance a professor
        would use in office hours or written feedback.

        **Letter grade scale (must align numeric_score with letter_grade):**
        - A: 100–90 — excellent mastery; minor issues only.
        - B: 89–80 — solid work; some gaps or errors but core competence clear.
        - C: 79–70 — acceptable but uneven; important misunderstandings or missing pieces.
        - D: 69–60 — weak; substantial errors or incomplete reasoning.
        - F: 59–0 — failing; fundamentally incorrect, largely incomplete, or does not address the assignment.

        **How to grade (generic, any subject):**
        - Infer what each question is asking (definitions, proofs, essays, calculations, code, diagrams described in text).
        - Weight parts reasonably if the assignment is multi-part; note if the student skipped sections.
        - Reward correct reasoning even if a final number or wording is slightly off; penalize unsupported claims,
          logical gaps, and misunderstanding of core concepts.
        - For quantitative work: check setup, units (when applicable), intermediate steps, and final answers.
        - For writing: clarity, argument structure, use of evidence, and alignment with the prompt.
        - If the submission is ambiguous or illegible, say what you assumed and how that affected the score.

        **Output contract (required — do not use JSON):** Your reply must be plain text in exactly this shape:

        NUMERIC_SCORE: <number 0–100, decimals allowed>
        LETTER_GRADE: <A, B, C, D, or F consistent with the score>
        SUMMARY_LINE: <single line, no line breaks — one-sentence overall judgment>

        BEGIN_DETAILED_FEEDBACK
        <Markdown feedback here — multiple paragraphs and headings allowed. Include:>
        1. Overall reasoning for the letter grade and score.
        2. Section-by-section or question-by-question commentary where possible.
        3. Specific, actionable changes to raise the grade.
        4. Brief note on strengths as well as weaknesses.
        END_DETAILED_FEEDBACK

        Nothing may appear before NUMERIC_SCORE or after END_DETAILED_FEEDBACK. Do not wrap the response in ``` fences.
        In SUMMARY_LINE, do not use double-quote characters; use plain wording.

        Be substantive and specific; avoid generic praise or vague advice.
        """
    ).strip()

    user_content = dedent(
        f"""
        **Subject / course context (may be brief):**
        {subject_block}

        **Rubric or instructor instructions (optional):**
        {rubric_block}

        ---

        **Assignment / questions:**
        {q}

        ---

        **Student submission (answers):**
        {a}
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

    try:
        return _parse_delimited_grader_response(raw)
    except ValueError:
        pass
    try:
        return _parse_json_grader_response(raw)
    except (ValueError, json.JSONDecodeError, ValidationError) as e2:
        raise RuntimeError(
            "Could not parse grader response (expected delimiter block or valid JSON). "
            f"Underlying error: {e2}"
        ) from e2
