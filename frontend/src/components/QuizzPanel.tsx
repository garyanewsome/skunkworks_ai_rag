import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Theme } from '@mui/material/styles';
import {
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  LinearProgress,
  Paper,
  Slider,
  Tab,
  Tabs,
  TextField,
  Typography,
  alpha,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';

const STORAGE_KEY = 'skunkworks_quizz_v1';

type QuizCard = {
  id: string;
  question: string;
  answer: string;
  /** SM-2 ease factor (typical start 2.5). */
  ease: number;
  /** Current interval in days. */
  intervalDays: number;
  repetitions: number;
  /** Milliseconds since epoch when card is due. */
  nextDueAt: number;
};

type Grade = 'again' | 'hard' | 'good' | 'easy';

type QuizzPanelProps = {
  theme: Theme;
};

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function emptyCard(): QuizCard {
  const now = Date.now();
  return {
    id: newId(),
    question: '',
    answer: '',
    ease: 2.5,
    intervalDays: 0,
    repetitions: 0,
    nextDueAt: now,
  };
}

/** Quality 0–5 for SM-2 update. */
function qualityFromGrade(g: Grade): number {
  switch (g) {
    case 'again':
      return 0;
    case 'hard':
      return 3;
    case 'good':
      return 4;
    case 'easy':
      return 5;
    default:
      return 4;
  }
}

function applySm2(card: QuizCard, grade: Grade): QuizCard {
  const q = qualityFromGrade(grade);
  let { ease, intervalDays, repetitions } = card;

  if (q < 3) {
    repetitions = 0;
    intervalDays = 1;
  } else {
    if (repetitions === 0) intervalDays = 1;
    else if (repetitions === 1) intervalDays = 6;
    else intervalDays = Math.max(1, Math.round(intervalDays * ease));
    repetitions += 1;
    ease += 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
    ease = Math.max(1.3, Math.min(ease, 3));
    if (grade === 'easy') intervalDays = Math.max(1, Math.round(intervalDays * 1.3));
    if (grade === 'hard') intervalDays = Math.max(1, Math.round(intervalDays * 0.85));
  }

  const nextDueAt = Date.now() + intervalDays * 86_400_000;
  return { ...card, ease, intervalDays, repetitions, nextDueAt };
}

function loadCards(): QuizCard[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (x): x is QuizCard =>
          x &&
          typeof x === 'object' &&
          typeof (x as QuizCard).id === 'string' &&
          typeof (x as QuizCard).question === 'string' &&
          typeof (x as QuizCard).answer === 'string',
      )
      .map((c) => ({
        ...c,
        ease: typeof c.ease === 'number' ? c.ease : 2.5,
        intervalDays: typeof c.intervalDays === 'number' ? c.intervalDays : 1,
        repetitions: typeof c.repetitions === 'number' ? c.repetitions : 0,
        nextDueAt: typeof c.nextDueAt === 'number' ? c.nextDueAt : Date.now(),
      }));
  } catch {
    return [];
  }
}

function saveCards(cards: QuizCard[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
  } catch {
    /* ignore quota */
  }
}

function normalizeAnswer(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '');
}

function answersRoughlyMatch(user: string, expected: string): boolean {
  const u = normalizeAnswer(user);
  const e = normalizeAnswer(expected);
  if (!u || !e) return false;
  if (u === e) return true;
  if (e.includes(u) || u.includes(e)) return true;
  const ew = e.split(' ');
  const hits = ew.filter((w) => w.length > 2 && u.includes(w)).length;
  return ew.length > 0 && hits / ew.length >= 0.6;
}

export function QuizzPanel({ theme }: QuizzPanelProps) {
  const [cards, setCards] = useState<QuizCard[]>(() => loadCards());
  const [arenaTab, setArenaTab] = useState(0);
  const [studyIdx, setStudyIdx] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [challengeActive, setChallengeActive] = useState(false);
  const [challengeRemaining, setChallengeRemaining] = useState(120);
  const [challengeScore, setChallengeScore] = useState(0);
  const [sandboxScratch, setSandboxScratch] = useState('');
  const [decayHalfLife, setDecayHalfLife] = useState(5);
  const [decayTime, setDecayTime] = useState(10);

  useEffect(() => {
    saveCards(cards);
  }, [cards]);

  const readyCards = useMemo(
    () => cards.filter((c) => c.question.trim() && c.answer.trim()),
    [cards],
  );

  const dueQueue = useMemo(() => {
    const now = Date.now();
    const due = readyCards.filter((c) => c.nextDueAt <= now);
    const future = readyCards.filter((c) => c.nextDueAt > now);
    return [...due.sort((a, b) => a.nextDueAt - b.nextDueAt), ...future];
  }, [readyCards]);

  const challengeDeck = useMemo(() => {
    const shuffled = [...readyCards];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, Math.min(12, Math.max(3, shuffled.length)));
  }, [readyCards, challengeActive]);

  const currentStudyCard = dueQueue[studyIdx] ?? null;
  const currentChallengeCard =
    challengeActive && challengeDeck.length ? challengeDeck[studyIdx % challengeDeck.length] : null;

  const resetStudyCardUi = useCallback(() => {
    setUserAnswer('');
    setRevealed(false);
  }, []);

  const patchCard = useCallback((id: string, patch: Partial<QuizCard>) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  const gradeCurrent = useCallback(
    (grade: Grade) => {
      const card = arenaTab === 2 ? currentChallengeCard : currentStudyCard;
      if (!card) return;
      const updated = applySm2(card, grade);
      patchCard(card.id, updated);
      resetStudyCardUi();
      setStudyIdx((i) => i + 1);
      if (arenaTab === 2 && challengeActive) {
        if (grade !== 'again') setChallengeScore((s) => s + (grade === 'easy' ? 3 : grade === 'good' ? 2 : 1));
      }
    },
    [arenaTab, challengeActive, currentChallengeCard, currentStudyCard, patchCard, resetStudyCardUi],
  );

  useEffect(() => {
    if (!challengeActive) return;
    const t = window.setInterval(() => {
      setChallengeRemaining((r) => (r <= 1 ? 0 : r - 1));
    }, 1000);
    return () => window.clearInterval(t);
  }, [challengeActive]);

  useEffect(() => {
    if (challengeActive && challengeRemaining === 0) {
      setChallengeActive(false);
    }
  }, [challengeActive, challengeRemaining]);

  const startChallenge = () => {
    if (readyCards.length < 2) return;
    setStudyIdx(0);
    setChallengeScore(0);
    setChallengeRemaining(120);
    resetStudyCardUi();
    setChallengeActive(true);
    setArenaTab(2);
  };

  const retentionFraction = Math.pow(0.5, decayTime / Math.max(0.5, decayHalfLife));

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', lg: 'minmax(280px, 380px) minmax(0, 1fr)' },
        gap: 3,
        alignItems: 'flex-start',
      }}
    >
      <Paper
        elevation={0}
        sx={{
          p: 2.5,
          borderRadius: 3,
          border: `1px solid ${alpha(theme.palette.primary.main, 0.12)}`,
          background: alpha(theme.palette.background.paper, 0.65),
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
          Deck builder
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Add question–answer pairs. Study uses active recall and spaced repetition scheduling (SM-2 style).
        </Typography>
        <Button
          size="small"
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCards((c) => [...c, emptyCard()])}
          sx={{ mb: 2 }}
        >
          Add card
        </Button>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: { lg: '62vh' }, overflowY: 'auto', pr: 0.5 }}>
          {cards.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No cards yet — add your first pair.
            </Typography>
          ) : (
            cards.map((c, idx) => (
              <Paper
                key={c.id}
                variant="outlined"
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  borderColor: alpha(theme.palette.divider, 0.5),
                  bgcolor: alpha(theme.palette.background.default, 0.35),
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Chip size="small" label={`Card ${idx + 1}`} variant="outlined" />
                  <IconButton
                    size="small"
                    aria-label="Remove card"
                    onClick={() => setCards((prev) => prev.filter((x) => x.id !== c.id))}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Box>
                <TextField
                  fullWidth
                  size="small"
                  label="Question"
                  value={c.question}
                  onChange={(e) => patchCard(c.id, { question: e.target.value })}
                  sx={{ mb: 1 }}
                />
                <TextField
                  fullWidth
                  size="small"
                  label="Answer"
                  value={c.answer}
                  onChange={(e) => patchCard(c.id, { answer: e.target.value })}
                  multiline
                  minRows={2}
                />
              </Paper>
            ))
          )}
        </Box>
      </Paper>

      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, sm: 2.5 },
          borderRadius: 3,
          border: `1px solid ${alpha(theme.palette.secondary.main, 0.15)}`,
          background: `linear-gradient(145deg, ${alpha(theme.palette.background.paper, 0.9)} 0%, ${alpha(theme.palette.background.default, 0.55)} 100%)`,
          minHeight: 480,
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
          Game arena
        </Typography>
        <Tabs
          value={arenaTab}
          onChange={(_, v) => {
            setArenaTab(v);
            setStudyIdx(0);
            resetStudyCardUi();
          }}
          sx={{ mb: 2, minHeight: 42 }}
        >
          <Tab label="Recall" />
          <Tab label="Schedule" />
          <Tab label="Challenge" />
          <Tab label="Sandbox" />
        </Tabs>

        {arenaTab === 0 && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Type what you remember, then reveal the answer. Rate yourself to schedule the next review (active recall +
              spaced repetition).
            </Typography>
            {readyCards.length === 0 ? (
              <Typography color="text.secondary">Add at least one complete card to study.</Typography>
            ) : !currentStudyCard ? (
              <Box>
                <Typography color="success.main" sx={{ mb: 2 }}>
                  Queue finished — nice work. Check back when cards are due.
                </Typography>
                <Button size="small" variant="outlined" onClick={() => setStudyIdx(0)}>
                  Restart round
                </Button>
              </Box>
            ) : (
              <>
                <Chip
                  label={`Due stack: ${dueQueue.filter((c) => c.nextDueAt <= Date.now()).length} / ${readyCards.length}`}
                  size="small"
                  sx={{ mb: 2 }}
                />
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2.5,
                    mb: 2,
                    borderRadius: 2,
                    bgcolor: alpha(theme.palette.primary.main, 0.06),
                    minHeight: 160,
                  }}
                >
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Question
                  </Typography>
                  <Typography variant="body1" sx={{ fontWeight: 600, mb: 2, whiteSpace: 'pre-wrap' }}>
                    {currentStudyCard.question}
                  </Typography>
                  <TextField
                    fullWidth
                    size="small"
                    label="Your answer (active recall)"
                    value={userAnswer}
                    onChange={(e) => setUserAnswer(e.target.value)}
                    disabled={revealed}
                  />
                  <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    <Button size="small" variant="outlined" onClick={() => setRevealed(true)}>
                      Reveal answer
                    </Button>
                    {userAnswer.trim() ? (
                      <Chip
                        size="small"
                        color={answersRoughlyMatch(userAnswer, currentStudyCard.answer) ? 'success' : 'warning'}
                        label={
                          answersRoughlyMatch(userAnswer, currentStudyCard.answer)
                            ? 'Looks aligned — still verify below'
                            : 'Compare with revealed answer'
                        }
                      />
                    ) : null}
                  </Box>
                  {revealed ? (
                    <Box sx={{ mt: 2, p: 1.5, borderRadius: 1, bgcolor: alpha(theme.palette.background.paper, 0.8) }}>
                      <Typography variant="caption" color="text.secondary">
                        Answer
                      </Typography>
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                        {currentStudyCard.answer}
                      </Typography>
                    </Box>
                  ) : null}
                </Paper>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                  How well did you recall? (schedules next interval)
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  <Button color="error" variant="contained" disabled={!revealed} onClick={() => gradeCurrent('again')}>
                    Again
                  </Button>
                  <Button color="warning" variant="contained" disabled={!revealed} onClick={() => gradeCurrent('hard')}>
                    Hard
                  </Button>
                  <Button variant="contained" disabled={!revealed} onClick={() => gradeCurrent('good')}>
                    Good
                  </Button>
                  <Button color="secondary" variant="contained" disabled={!revealed} onClick={() => gradeCurrent('easy')}>
                    Easy
                  </Button>
                </Box>
              </>
            )}
          </Box>
        )}

        {arenaTab === 1 && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Upcoming reviews for cards you have already studied at least once (simulation of spaced repetition load).
            </Typography>
            {readyCards.length === 0 ? (
              <Typography color="text.secondary">Nothing scheduled yet.</Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {readyCards
                  .filter((c) => c.repetitions > 0)
                  .sort((a, b) => a.nextDueAt - b.nextDueAt)
                  .slice(0, 12)
                  .map((c) => (
                    <Paper key={c.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {c.question.slice(0, 80)}
                        {c.question.length > 80 ? '…' : ''}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Next: {new Date(c.nextDueAt).toLocaleString()} · interval {c.intervalDays}d · ease {c.ease.toFixed(2)}
                      </Typography>
                    </Paper>
                  ))}
                {readyCards.every((c) => c.repetitions === 0) ? (
                  <Typography variant="body2" color="text.secondary">
                    Study cards once on the Recall tab to populate this timeline.
                  </Typography>
                ) : null}
              </Box>
            )}
          </Box>
        )}

        {arenaTab === 2 && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Timed run: random subset, score points for Good/Easy. Builds fluency under light pressure (challenge
              problems).
            </Typography>
            {!challengeActive ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                <Typography variant="body2">
                  {readyCards.length < 2
                    ? 'Need at least two cards for a challenge.'
                    : '2 minutes · mixed deck · self-grade after reveal'}
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<PlayArrowIcon />}
                  disabled={readyCards.length < 2}
                  onClick={startChallenge}
                >
                  Start challenge
                </Button>
                {challengeRemaining === 0 && challengeScore > 0 ? (
                  <Chip label={`Last score: ${challengeScore}`} color="primary" />
                ) : null}
              </Box>
            ) : (
              <>
                <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Chip label={`${challengeRemaining}s`} color={challengeRemaining < 30 ? 'warning' : 'default'} />
                  <Chip label={`Score ${challengeScore}`} variant="outlined" />
                  <LinearProgress
                    variant="determinate"
                    value={(challengeRemaining / 120) * 100}
                    sx={{ flex: 1, minWidth: 120, height: 8, borderRadius: 4 }}
                  />
                </Box>
                {currentChallengeCard ? (
                  <>
                    <Paper
                      variant="outlined"
                      sx={{
                        p: 2.5,
                        mb: 2,
                        borderRadius: 2,
                        bgcolor: alpha(theme.palette.secondary.main, 0.06),
                        minHeight: 140,
                      }}
                    >
                      <Typography variant="subtitle2" color="text.secondary">
                        Challenge prompt
                      </Typography>
                      <Typography variant="body1" sx={{ fontWeight: 600, my: 1, whiteSpace: 'pre-wrap' }}>
                        {currentChallengeCard.question}
                      </Typography>
                      <TextField
                        fullWidth
                        size="small"
                        label="Answer"
                        value={userAnswer}
                        onChange={(e) => setUserAnswer(e.target.value)}
                        disabled={revealed}
                      />
                      <Button sx={{ mt: 1 }} size="small" variant="outlined" onClick={() => setRevealed(true)}>
                        Reveal
                      </Button>
                      {revealed ? (
                        <Typography variant="body2" sx={{ mt: 2, whiteSpace: 'pre-wrap' }}>
                          {currentChallengeCard.answer}
                        </Typography>
                      ) : null}
                    </Paper>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      <Button size="small" color="error" variant="contained" disabled={!revealed} onClick={() => gradeCurrent('again')}>
                        Again
                      </Button>
                      <Button size="small" color="warning" variant="contained" disabled={!revealed} onClick={() => gradeCurrent('hard')}>
                        Hard
                      </Button>
                      <Button size="small" variant="contained" disabled={!revealed} onClick={() => gradeCurrent('good')}>
                        Good
                      </Button>
                      <Button size="small" color="secondary" variant="contained" disabled={!revealed} onClick={() => gradeCurrent('easy')}>
                        Easy
                      </Button>
                    </Box>
                  </>
                ) : null}
              </>
            )}
          </Box>
        )}

        {arenaTab === 3 && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Sandbox: sketch variants of your answers or hypotheses. Below is a tiny forgetting-curve toy model (not your
              real schedule — illustrative simulation).
            </Typography>
            <TextField
              fullWidth
              multiline
              minRows={5}
              label="Scratch notes / alternate solutions"
              value={sandboxScratch}
              onChange={(e) => setSandboxScratch(e.target.value)}
              sx={{ mb: 3 }}
            />
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" gutterBottom>
              Forgetting curve toy (exponential decay)
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
              Retention ≈ 0.5^(t / half-life). Drag sliders to see how half-life and elapsed time interact.
            </Typography>
            <Box sx={{ px: 1 }}>
              <Typography variant="caption">Half-life (arbitrary units)</Typography>
              <Slider
                size="small"
                value={decayHalfLife}
                onChange={(_, v) => setDecayHalfLife(v as number)}
                min={1}
                max={20}
                valueLabelDisplay="auto"
              />
              <Typography variant="caption">Elapsed time</Typography>
              <Slider
                size="small"
                value={decayTime}
                onChange={(_, v) => setDecayTime(v as number)}
                min={0}
                max={40}
                valueLabelDisplay="auto"
              />
            </Box>
            <Paper sx={{ mt: 2, p: 2, borderRadius: 2, bgcolor: alpha(theme.palette.background.default, 0.5) }}>
              <Typography variant="h4" sx={{ fontWeight: 800, color: 'secondary.main' }}>
                {(retentionFraction * 100).toFixed(0)}%
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Modeled retention — spaced reviews reset this upward in real decks when you hit Good/Easy on Recall.
              </Typography>
              <Box sx={{ mt: 2, height: 120, display: 'flex', alignItems: 'flex-end', gap: 0.5 }}>
                {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
                  const t = (i / 7) * decayTime;
                  const h = Math.pow(0.5, t / Math.max(0.5, decayHalfLife)) * 100;
                  return (
                    <Box
                      key={i}
                      sx={{
                        flex: 1,
                        height: `${Math.max(4, h)}%`,
                        borderRadius: '6px 6px 0 0',
                        bgcolor: alpha(theme.palette.primary.main, 0.35 + (i / 14) * 0.4),
                        transition: 'height 0.2s ease',
                      }}
                    />
                  );
                })}
              </Box>
            </Paper>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
