import { useEffect, useRef, useState } from 'react';
import type { Theme } from '@mui/material/styles';
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  Paper,
  TextField,
  Typography,
  alpha,
} from '@mui/material';
import katex from 'katex';
import 'katex/dist/katex.min.css';

type ShowWorkStep = { note: string; latex: string };

function parseShowWorkHistoryResponse(raw: unknown): { title: string; steps: ShowWorkStep[] } | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const stepsRaw = o.steps;
  if (!Array.isArray(stepsRaw)) return null;
  const steps: ShowWorkStep[] = [];
  for (const item of stepsRaw) {
    if (!item || typeof item !== 'object') continue;
    const s = item as Record<string, unknown>;
    const latex = typeof s.latex === 'string' ? s.latex.trim() : '';
    if (!latex) continue;
    const note = typeof s.note === 'string' ? s.note.trim() : '';
    steps.push({ note, latex });
  }
  if (!steps.length) return null;
  const title = typeof o.title === 'string' ? o.title.trim() : '';
  return { title: title || 'Work', steps };
}

type ShowWorkPanelProps = {
  theme: Theme;
  historyReplay?: {
    key: number;
    request: Record<string, unknown>;
    response: unknown;
    error: string | null;
  } | null;
  onHistoryReplayDone?: () => void;
};

const HAND_NOTE = '"Caveat", "Kalam", "Segoe Script", cursive';
/** Same families as margin notes; paired with KaTeX fallbacks for metrics. */
const HAND_MATH = '"Kalam", "Caveat", KaTeX_Math, KaTeX_Main, serif';

function KatexBlock({ latex, theme }: { latex: string; theme: Theme }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    try {
      katex.render(latex, el, {
        displayMode: true,
        throwOnError: false,
        strict: 'ignore',
        trust: (context) =>
          context.command === '\\htmlClass' || context.command === '\\htmlStyle',
        macros: {
          '\\cancel': '\\htmlClass{katex-cancel}{#1}',
          '\\bcancel': '\\htmlClass{katex-bcancel}{#1}',
          '\\xcancel': '\\htmlClass{katex-xcancel}{#1}',
        },
      });
    } catch {
      el.textContent = latex;
    }
    return () => {
      el.innerHTML = '';
    };
  }, [latex]);

  const strike = alpha(theme.palette.error.light, 0.88);

  return (
    <Box
      ref={ref}
      sx={{
        overflowX: 'auto',
        py: 0.5,
        '& .katex': {
          color: alpha(theme.palette.primary.light, 0.98),
          fontSize: '1.22rem',
          fontWeight: 400,
        },
        '& .katex-display': {
          margin: '0.35rem 0',
        },
        /* \\cancel / \\bcancel / \\xcancel (macros → htmlClass); diagonal strike like scratch work */
        '& .katex .katex-cancel, & .katex .katex-bcancel, & .katex .katex-xcancel': {
          position: 'relative',
          display: 'inline-block',
        },
        '& .katex .katex-cancel::after': {
          content: '""',
          position: 'absolute',
          left: '-6%',
          right: '-6%',
          top: '44%',
          borderTop: `2px solid ${strike}`,
          transform: 'rotate(-11deg)',
          pointerEvents: 'none',
        },
        '& .katex .katex-bcancel::after': {
          content: '""',
          position: 'absolute',
          left: '-6%',
          right: '-6%',
          top: '42%',
          borderTop: `2px solid ${strike}`,
          transform: 'rotate(-11deg)',
          pointerEvents: 'none',
        },
        '& .katex .katex-bcancel::before': {
          content: '""',
          position: 'absolute',
          left: '-6%',
          right: '-6%',
          top: '58%',
          borderTop: `2px solid ${strike}`,
          transform: 'rotate(-11deg)',
          pointerEvents: 'none',
        },
        '& .katex .katex-xcancel::after': {
          content: '""',
          position: 'absolute',
          left: '-6%',
          right: '-6%',
          top: '44%',
          borderTop: `2px solid ${strike}`,
          transform: 'rotate(-11deg)',
          pointerEvents: 'none',
        },
        '& .katex .katex-xcancel::before': {
          content: '""',
          position: 'absolute',
          left: '-6%',
          right: '-6%',
          top: '44%',
          borderTop: `2px solid ${strike}`,
          transform: 'rotate(11deg)',
          pointerEvents: 'none',
        },
        /* Handwritten Latin math: letters, digits, binrels, punctuation */
        '& .katex .mord, & .katex .mrel, & .katex .mbin, & .katex .mopen, & .katex .mclose, & .katex .mpunct, & .katex .minner':
          {
            fontFamily: `${HAND_MATH} !important`,
          },
        '& .katex .mord.mathnormal': {
          fontStyle: 'italic',
        },
        /* Keep KaTeX glyph fonts for big ops (Σ, ∫, ∏) so braces/fractions stay aligned */
        '& .katex .mop': {
          fontFamily:
            'KaTeX_Size2, KaTeX_Size1, KaTeX_Size3, KaTeX_Size4, KaTeX_Main, serif !important',
        },
      }}
    />
  );
}

export function ShowWorkPanel({
  theme,
  historyReplay,
  onHistoryReplayDone,
}: ShowWorkPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [explicitAllSteps, setExplicitAllSteps] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [steps, setSteps] = useState<ShowWorkStep[]>([]);

  useEffect(() => {
    if (!historyReplay) return;
    const r = historyReplay.request;
    setPrompt(typeof r.prompt === 'string' ? r.prompt : '');
    setExplicitAllSteps(Boolean(r.explicit_all_steps));
    setLoading(false);

    if (historyReplay.error) {
      setError(historyReplay.error);
      setTitle(null);
      setSteps([]);
      onHistoryReplayDone?.();
      return;
    }

    const parsed = parseShowWorkHistoryResponse(historyReplay.response);
    if (!parsed) {
      setError('Nothing to restore from this history entry.');
      setTitle(null);
      setSteps([]);
      onHistoryReplayDone?.();
      return;
    }

    setError(null);
    setTitle(parsed.title);
    setSteps(parsed.steps);
    onHistoryReplayDone?.();
  }, [
    historyReplay?.key,
    historyReplay?.request,
    historyReplay?.response,
    historyReplay?.error,
    onHistoryReplayDone,
  ]);

  const paperSx = {
    borderRadius: 2,
    border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
  };

  const runShowWork = async () => {
    const q = prompt.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/show-work', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: q, explicit_all_steps: explicitAllSteps }),
      });
      const data = (await res.json()) as {
        title?: string;
        steps?: ShowWorkStep[];
        detail?: unknown;
      };
      if (!res.ok) {
        const d = data.detail;
        const msg =
          typeof d === 'string'
            ? d
            : Array.isArray(d)
              ? d.map((x: { msg?: string }) => x.msg ?? '').join(' ')
              : `HTTP ${res.status}`;
        throw new Error(msg || 'Request failed');
      }
      const st = Array.isArray(data.steps) ? data.steps : [];
      if (!st.length) throw new Error('No steps returned.');
      setTitle(typeof data.title === 'string' ? data.title : 'Work');
      setSteps(st.filter((s) => s && typeof s.latex === 'string' && s.latex.trim()));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setSteps([]);
      setTitle(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ width: '100%', maxWidth: 920, mx: 'auto' }}>
      <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: '0.12em' }}>
        Show Work
      </Typography>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        Handwritten-style math steps
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Describe a derivative, integral, limit, or algebra problem. The notebook canvas lays out steps with
        handwriting-style notes and equations (KaTeX with Kalam/Caveat for symbols and text; large operators keep
        KaTeX fonts for clean layout).
      </Typography>

      <TextField
        label="Problem or instruction"
        placeholder="e.g. Show the work for ∫ x² e^x dx using integration by parts"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        multiline
        minRows={2}
        fullWidth
        sx={{ mb: 2 }}
        disabled={loading}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void runShowWork();
          }
        }}
      />

      <FormControlLabel
        sx={{ mb: 2, alignItems: 'flex-start', ml: 0 }}
        control={
          <Checkbox
            checked={explicitAllSteps}
            onChange={(_, c) => setExplicitAllSteps(c)}
            disabled={loading}
            color="secondary"
          />
        }
        label={
          <Box>
            <Typography variant="body2" component="span" sx={{ fontWeight: 600 }}>
              Explicit full work
            </Typography>
            <Typography variant="caption" display="block" color="text.secondary">
              Dense paper-style steps: crossed-out cancelled terms, factors that divide out, and every micro-move where it helps.
            </Typography>
          </Box>
        }
      />

      <Button
        variant="contained"
        onClick={() => void runShowWork()}
        disabled={loading || !prompt.trim()}
        sx={{ mb: 3 }}
      >
        {loading ? <CircularProgress size={22} color="inherit" /> : 'Show work'}
      </Button>

      {error ? (
        <Typography variant="body2" color="error" sx={{ mb: 2 }}>
          {error}
        </Typography>
      ) : null}

      {steps.length > 0 ? (
        <Paper
          elevation={0}
          sx={{
            ...paperSx,
            p: { xs: 2.5, sm: 3.5 },
            minHeight: 280,
            borderLeft: `5px solid ${alpha('#f48fb1', 0.55)}`,
            backgroundImage: `repeating-linear-gradient(
              0deg,
              transparent,
              transparent 26px,
              ${alpha(theme.palette.primary.main, 0.06)} 26px,
              ${alpha(theme.palette.primary.main, 0.06)} 27px
            )`,
            bgcolor: alpha('#1a1528', 0.92),
            boxShadow: `inset 0 0 80px ${alpha(theme.palette.primary.dark, 0.08)}`,
          }}
        >
          <Typography
            variant="subtitle1"
            sx={{
              fontFamily: HAND_NOTE,
              fontSize: '1.65rem',
              fontWeight: 600,
              color: alpha(theme.palette.secondary.light, 0.95),
              mb: 2,
              transform: 'rotate(-0.4deg)',
            }}
          >
            {title}
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {steps.map((step, i) => (
              <Box
                key={`${i}-${step.latex.slice(0, 40)}`}
                sx={{
                  transform: `rotate(${i % 2 === 0 ? -0.35 : 0.28}deg)`,
                  transformOrigin: 'left center',
                }}
              >
                {step.note ? (
                  <Typography
                    variant="body1"
                    sx={{
                      fontFamily: HAND_NOTE,
                      fontSize: '1.35rem',
                      lineHeight: 1.45,
                      color: alpha(theme.palette.grey[300], 0.92),
                      mb: 0.75,
                      pl: 0.5,
                    }}
                  >
                    {step.note}
                  </Typography>
                ) : null}
                <Box
                  sx={{
                    pl: 1,
                    borderRadius: 1,
                    bgcolor: alpha(theme.palette.background.default, 0.35),
                  }}
                >
                  <KatexBlock latex={step.latex} theme={theme} />
                </Box>
              </Box>
            ))}
          </Box>
        </Paper>
      ) : null}
    </Box>
  );
}
