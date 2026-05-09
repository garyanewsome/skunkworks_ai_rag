/** Preflight: reuse a recent successful Postgres trace when prompt + options match closely enough. */

export const HISTORY_MATCH_MIN_SIMILARITY = 0.92;

export type HistoryMatchResponse = {
  hit: boolean;
  trace_id?: number | null;
  similarity?: number | null;
  response?: unknown;
};

export async function fetchHistoryMatch(
  kind: 'lecture_rag' | 'visualize',
  request: Record<string, unknown>,
  minSimilarity: number = HISTORY_MATCH_MIN_SIMILARITY,
): Promise<HistoryMatchResponse | null> {
  try {
    const res = await fetch('/api/history/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, request, min_similarity: minSimilarity }),
    });
    if (!res.ok) return null;
    return (await res.json()) as HistoryMatchResponse;
  } catch {
    return null;
  }
}
