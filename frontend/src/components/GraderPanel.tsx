import { useRef, useState } from 'react';
import type { Theme } from '@mui/material/styles';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  FormHelperText,
  Link,
  Paper,
  TextField,
  Typography,
  alpha,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';

type GraderApiResponse = {
  numeric_score: number;
  letter_grade: string;
  summary_line: string;
  detailed_feedback: string;
  used_llm: boolean;
};

type ReviewHit = {
  video_id: string;
  chunk_index: number;
  content: string;
  start_ms: number | null;
  end_ms: number | null;
  distance: number;
  similarity: number;
};

type RagAnswerResponse = {
  summary: string;
  filter_video_id: string | null;
  filter_video_ids: string[] | null;
  hits: ReviewHit[];
  used_llm: boolean;
};

type GraderPanelProps = {
  theme: Theme;
};

function gradeChipColor(letter: string): 'success' | 'primary' | 'warning' | 'error' | 'default' {
  const L = letter.trim().toUpperCase();
  if (L === 'A') return 'success';
  if (L === 'B') return 'primary';
  if (L === 'C') return 'warning';
  if (L === 'D' || L === 'F') return 'error';
  return 'default';
}

const _msToClock = (ms: number | null): string => {
  if (ms == null) return '??:??';
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  return hours ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}` : `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const youtubeEmbedSrc = (videoId: string, startMs: number | null): string => {
  const startSec = Math.max(0, Math.floor((startMs ?? 0) / 1000));
  return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?start=${startSec}&rel=0`;
};

const youtubeWatchUrl = (videoId: string, startMs: number | null): string => {
  const sec = Math.max(0, Math.floor((startMs ?? 0) / 1000));
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&t=${sec}s`;
};

export function GraderPanel({ theme }: GraderPanelProps) {
  const [questions, setQuestions] = useState('');
  const [answers, setAnswers] = useState('');
  const [subject, setSubject] = useState('');
  const [rubric, setRubric] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GraderApiResponse | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewSummary, setReviewSummary] = useState<string | null>(null);
  const [reviewHits, setReviewHits] = useState<ReviewHit[]>([]);

  const questionsFileRef = useRef<HTMLInputElement>(null);
  const answersFileRef = useRef<HTMLInputElement>(null);

  const ingestQuestionsFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const t = await f.text();
    setQuestions(t);
  };

  const ingestAnswersFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const t = await f.text();
    setAnswers(t);
  };

  const gradeDisabled = loading || !questions.trim() || !answers.trim();

  const findReviewLectures = async () => {
    if (!result) return;
    setReviewLoading(true);
    setReviewError(null);
    setReviewSummary(null);
    setReviewHits([]);

    const reviewContext = subject.trim() ? `Subject / context: ${subject.trim()}\n\n` : '';
    const reviewQuery = `${reviewContext}Find the lecture videos and timestamps that best review the weak, missing, or improvable concepts described in this feedback:\n\n${result.detailed_feedback}\n\nReturn the most relevant lecture snippets to review.`;
    try {
      const res = await fetch('/api/rag/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: reviewQuery,
          top_k: 10,
        }),
      });
      const data = (await res.json()) as RagAnswerResponse | { detail?: unknown };
      if (!res.ok) {
        const detail = (data as { detail?: unknown }).detail;
        const msg =
          typeof detail === 'string'
            ? detail
            : Array.isArray(detail)
              ? detail.map((d: { msg?: string }) => d.msg ?? '').join(' ')
              : 'Request failed.';
        throw new Error(msg || `HTTP ${res.status}`);
      }
      const ok = data as RagAnswerResponse;
      setReviewSummary(ok.summary);
      setReviewHits(ok.hits);
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Could not find review lectures.');
    } finally {
      setReviewLoading(false);
    }
  };

  const grade = async () => {
    const q = questions.trim();
    const a = answers.trim();
    if (!q || !a) {
      setError('Paste or upload both the assignment questions and your answers.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    setReviewError(null);
    setReviewSummary(null);
    setReviewHits([]);
    try {
      const res = await fetch('/api/grader/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignment_questions: q,
          student_submission: a,
          subject_context: subject.trim() || null,
          rubric_or_instructions: rubric.trim() || null,
        }),
      });
      const data = (await res.json()) as GraderApiResponse | { detail?: unknown };
      if (!res.ok) {
        const detail = (data as { detail?: unknown }).detail;
        const msg =
          typeof detail === 'string'
            ? detail
            : Array.isArray(detail)
              ? detail.map((d: { msg?: string }) => d.msg ?? '').join(' ')
              : 'Request failed.';
        throw new Error(msg || `HTTP ${res.status}`);
      }
      setResult(data as GraderApiResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ width: '100%', maxWidth: 960, mx: 'auto' }}>
      <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: '0.12em' }}>
        Rubric grader
      </Typography>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        Grade any homework
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Upload or paste the assignment prompt and your submission. Optional: subject and rubric notes. Uses the
        scale A (90–100), B (80–89), C (70–79), D (60–69), F (0–59).
      </Typography>

      <TextField
        label="Assignment / questions"
        placeholder="Paste the homework questions, or upload a .txt file."
        value={questions}
        onChange={(e) => setQuestions(e.target.value)}
        multiline
        minRows={6}
        fullWidth
        sx={{ mb: 1 }}
      />
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
        <input
          ref={questionsFileRef}
          type="file"
          accept=".txt,.md,text/plain"
          hidden
          onChange={ingestQuestionsFile}
        />
        <Button
          size="small"
          variant="outlined"
          startIcon={<UploadFileIcon />}
          onClick={() => questionsFileRef.current?.click()}
        >
          Upload questions (.txt)
        </Button>
      </Box>

      <TextField
        label="Your answers / submission"
        placeholder="Paste your solutions; or upload a .txt file."
        value={answers}
        onChange={(e) => setAnswers(e.target.value)}
        multiline
        minRows={8}
        fullWidth
        sx={{ mb: 1 }}
      />
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
        <input
          ref={answersFileRef}
          type="file"
          accept=".txt,.md,text/plain"
          hidden
          onChange={ingestAnswersFile}
        />
        <Button
          size="small"
          variant="outlined"
          startIcon={<UploadFileIcon />}
          onClick={() => answersFileRef.current?.click()}
        >
          Upload answers (.txt)
        </Button>
      </Box>

      <TextField
        label="Subject / course context (optional)"
        placeholder="e.g. PHY 350 — Statistical Mechanics"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        fullWidth
        sx={{ mb: 2 }}
      />

      <TextField
        label="Rubric or instructor notes (optional)"
        placeholder="Point breakdown, required sections, style expectations…"
        value={rubric}
        onChange={(e) => setRubric(e.target.value)}
        multiline
        minRows={2}
        fullWidth
        sx={{ mb: 2 }}
      />

      <FormHelperText sx={{ mb: 2 }}>
        Grading uses Claude when <code style={{ fontSize: '0.85em' }}>ANTHROPIC_API_KEY</code> is set on the API.
      </FormHelperText>

      <Button
        variant="contained"
        size="large"
        onClick={grade}
        disabled={gradeDisabled}
        fullWidth
        sx={{ py: 1.5, mb: 3 }}
      >
        {loading ? <CircularProgress size={26} color="inherit" /> : 'Grade submission'}
      </Button>

      {error && (
        <Paper
          elevation={0}
          sx={{
            p: 2,
            mb: 3,
            bgcolor: alpha(theme.palette.error.main, 0.12),
            border: `1px solid ${alpha(theme.palette.error.main, 0.35)}`,
          }}
        >
          <Typography color="error">{error}</Typography>
        </Paper>
      )}

      {result && (
        <Box sx={{ mb: 4 }}>
          <Paper
            elevation={0}
            sx={{
              p: 3,
              mb: 2,
              bgcolor: alpha(theme.palette.background.paper, 0.85),
              border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
              <Typography variant="subtitle1" fontWeight={700}>
                Result
              </Typography>
              <Chip
                size="medium"
                label={`Grade ${result.letter_grade}`}
                color={gradeChipColor(result.letter_grade)}
                variant="filled"
              />
              <Chip
                size="medium"
                label={`${Number.isInteger(result.numeric_score) ? result.numeric_score : result.numeric_score.toFixed(1)} / 100`}
                variant="outlined"
              />
              {result.used_llm ? (
                <Chip size="small" label="Claude" color="primary" variant="outlined" />
              ) : null}
            </Box>
            <Typography variant="body1" sx={{ fontWeight: 600, mb: 0 }}>
              {result.summary_line}
            </Typography>
          </Paper>

          <Paper
            elevation={0}
            sx={{
              p: 3,
              bgcolor: alpha(theme.palette.secondary.main, 0.06),
              border: `1px solid ${alpha(theme.palette.secondary.main, 0.2)}`,
            }}
          >
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Detailed feedback
            </Typography>
            <Typography
              component="div"
              variant="body1"
              sx={{
                whiteSpace: 'pre-wrap',
                lineHeight: 1.75,
                color: 'text.primary',
              }}
            >
              {result.detailed_feedback}
            </Typography>

            <Box sx={{ mt: 3, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button
                variant="outlined"
                onClick={findReviewLectures}
                disabled={reviewLoading}
                size="medium"
              >
                {reviewLoading ? 'Finding review lectures…' : 'Find review lectures'}
              </Button>
              <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
                Search lecture transcripts for the missing or improvable content mentioned above.
              </Typography>
            </Box>

            {reviewError ? (
              <Typography color="error" sx={{ mt: 2 }}>
                {reviewError}
              </Typography>
            ) : null}

            {reviewSummary ? (
              <Box sx={{ mt: 2, p: 2, bgcolor: alpha(theme.palette.background.paper, 0.9), borderRadius: 1 }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Review suggestion summary
                </Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                  {reviewSummary}
                </Typography>
              </Box>
            ) : null}

            {reviewHits.length > 0 ? (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Relevant lecture clips
                </Typography>
                {reviewHits.map((hit, index) => (
                  <Paper
                    key={`${hit.video_id}-${hit.chunk_index}-${index}`}
                    elevation={0}
                    sx={{ p: 2, mb: 1, bgcolor: alpha(theme.palette.background.paper, 0.9) }}
                  >
                    <Typography variant="body2" fontWeight={700} sx={{ mb: 0.5 }}>
                      {`Video ${hit.video_id} · snippet ${hit.chunk_index} · ${_msToClock(hit.start_ms)}${hit.end_ms ? `–${_msToClock(hit.end_ms)}` : ''}`}
                    </Typography>
                    <Typography variant="body2" sx={{ mb: 1, color: 'text.secondary' }}>
                      {`Similarity ${hit.similarity.toFixed(2)}`}
                    </Typography>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: 1.5 }}>
                      {hit.content}
                    </Typography>
                    <Box
                      sx={{
                        position: 'relative',
                        pt: '56.25%',
                        bgcolor: '#000',
                        borderRadius: 1,
                        overflow: 'hidden',
                        mb: 1,
                        border: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
                      }}
                    >
                      <Box
                        component="iframe"
                        key={`${hit.video_id}-${hit.chunk_index}-${hit.start_ms ?? 0}`}
                        src={youtubeEmbedSrc(hit.video_id, hit.start_ms)}
                        title={`Lecture clip ${hit.video_id} at ${_msToClock(hit.start_ms)}`}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                        sx={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          border: 0,
                        }}
                      />
                    </Box>
                    <Link
                      href={youtubeWatchUrl(hit.video_id, hit.start_ms)}
                      target="_blank"
                      rel="noreferrer"
                      variant="caption"
                      sx={{ display: 'inline-block' }}
                    >
                      Open this moment in YouTube
                    </Link>
                  </Paper>
                ))}
              </Box>
            ) : null}
          </Paper>
        </Box>
      )}
    </Box>
  );
}
