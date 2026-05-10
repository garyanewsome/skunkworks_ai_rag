import { Fragment, useEffect, useRef, type ReactNode } from 'react';
import type { Theme } from '@mui/material/styles';
import { Box, Stack, Typography, alpha } from '@mui/material';
import katex from 'katex';
import 'katex/dist/katex.min.css';

const HAND_NOTEBOOK = '"Caveat", "Kalam", "Segoe Script", cursive';
const HAND_MATH = '"Kalam", "Caveat", KaTeX_Math, KaTeX_Main, serif';

const KATEX_OPTS_COMMON = {
  throwOnError: false,
  strict: 'ignore' as const,
  trust: (context: { command: string }) =>
    context.command === '\\htmlClass' || context.command === '\\htmlStyle',
  macros: {
    '\\cancel': '\\htmlClass{katex-cancel}{#1}',
    '\\bcancel': '\\htmlClass{katex-bcancel}{#1}',
    '\\xcancel': '\\htmlClass{katex-xcancel}{#1}',
  },
};

function handwrittenKatexSx(theme: Theme, display: boolean) {
  const strike = alpha(theme.palette.error.light, 0.88);
  return {
    '& .katex': {
      color: alpha(theme.palette.primary.light, 0.98),
      fontSize: display ? '1.18rem' : '1.05em',
      fontWeight: 400,
    },
    '& .katex-display': {
      margin: display ? '0.35rem 0' : 0,
    },
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
    '& .katex .mord, & .katex .mrel, & .katex .mbin, & .katex .mopen, & .katex .mclose, & .katex .mpunct, & .katex .minner':
      {
        fontFamily: `${HAND_MATH} !important`,
      },
    '& .katex .mord.mathnormal': {
      fontStyle: 'italic',
    },
    '& .katex .mop': {
      fontFamily:
        'KaTeX_Size2, KaTeX_Size1, KaTeX_Size3, KaTeX_Size4, KaTeX_Main, serif !important',
    },
  };
}

function HandwrittenKatexDisplay({ latex, theme }: { latex: string; theme: Theme }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    try {
      katex.render(latex, el, {
        ...KATEX_OPTS_COMMON,
        displayMode: true,
      });
    } catch {
      el.textContent = latex;
    }
    return () => {
      el.innerHTML = '';
    };
  }, [latex]);

  return (
    <Box ref={ref} sx={{ overflowX: 'auto', py: 0.5, ...handwrittenKatexSx(theme, true) }} />
  );
}

function InlineHandwrittenKatex({ latex, theme }: { latex: string; theme: Theme }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    try {
      katex.render(latex, el, {
        ...KATEX_OPTS_COMMON,
        displayMode: false,
      });
    } catch {
      el.textContent = latex;
    }
    return () => {
      el.innerHTML = '';
    };
  }, [latex]);

  return (
    <Box
      component="span"
      ref={ref}
      sx={{
        display: 'inline-block',
        verticalAlign: 'middle',
        mx: 0.25,
        ...handwrittenKatexSx(theme, false),
      }}
    />
  );
}

/** Split **bold** segments (non-nested). */
function renderBoldSegments(text: string, theme: Theme, keyBase: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    const m = p.match(/^\*\*([^*]+)\*\*$/);
    if (m) {
      return (
        <Box component="strong" key={`${keyBase}-b-${i}`} sx={{ fontWeight: 700 }}>
          {renderInlineMathSegments(m[1], theme, `${keyBase}-ib-${i}`)}
        </Box>
      );
    }
    return <Fragment key={`${keyBase}-t-${i}`}>{renderInlineMathSegments(p, theme, `${keyBase}-im-${i}`)}</Fragment>;
  });
}

/** Split $...$ inline math (non-greedy, no nesting). */
function renderInlineMathSegments(text: string, theme: Theme, keyBase: string): ReactNode[] {
  const segments = text.split(/(\$[^$\n]+\$)/g);
  const out: React.ReactNode[] = [];
  segments.forEach((seg, i) => {
    const inner = seg.match(/^\$([^$]+)\$$/);
    if (inner) {
      out.push(<InlineHandwrittenKatex key={`${keyBase}-k-${i}`} latex={inner[1].trim()} theme={theme} />);
    } else if (seg) {
      out.push(
        <Box component="span" key={`${keyBase}-s-${i}`} sx={{ fontFamily: HAND_NOTEBOOK }}>
          {seg}
        </Box>,
      );
    }
  });
  return out;
}

function MarkdownishLines(text: string, theme: Theme): ReactNode[] {
  const lines = text.split('\n');
  const nodes: ReactNode[] = [];
  let k = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;

    const h3 = line.match(/^###\s+(.*)$/);
    const h2 = line.match(/^##\s+(.*)$/);
    const h1 = line.match(/^#\s+(.*)$/);
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);

    if (h1) {
      nodes.push(
        <Typography
          key={k++}
          variant="subtitle1"
          sx={{
            fontFamily: HAND_NOTEBOOK,
            fontWeight: 700,
            fontSize: '1.2rem',
            color: alpha(theme.palette.secondary.light, 0.95),
            mt: 1,
            mb: 0.25,
          }}
        >
          {renderBoldSegments(h1[1], theme, `h1-${k}`)}
        </Typography>,
      );
      continue;
    }
    if (h2) {
      nodes.push(
        <Typography
          key={k++}
          variant="subtitle2"
          sx={{
            fontFamily: HAND_NOTEBOOK,
            fontWeight: 700,
            fontSize: '1.12rem',
            color: alpha(theme.palette.secondary.light, 0.92),
            mt: 1,
            mb: 0.25,
          }}
        >
          {renderBoldSegments(h2[1], theme, `h2-${k}`)}
        </Typography>,
      );
      continue;
    }
    if (h3) {
      nodes.push(
        <Typography
          key={k++}
          variant="body2"
          sx={{
            fontFamily: HAND_NOTEBOOK,
            fontWeight: 700,
            mt: 0.75,
            mb: 0.25,
            color: alpha(theme.palette.grey[200], 0.95),
          }}
        >
          {renderBoldSegments(h3[1], theme, `h3-${k}`)}
        </Typography>,
      );
      continue;
    }
    if (bullet) {
      nodes.push(
        <Box key={k++} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', pl: 0.5 }}>
          <Typography component="span" sx={{ fontFamily: HAND_NOTEBOOK, flexShrink: 0, lineHeight: 1.5 }}>
            •
          </Typography>
          <Typography
            component="span"
            variant="body2"
            sx={{
              fontFamily: HAND_NOTEBOOK,
              fontSize: '1.05rem',
              lineHeight: 1.5,
              color: alpha(theme.palette.grey[300], 0.94),
            }}
          >
            {renderBoldSegments(bullet[1], theme, `li-${k}`)}
          </Typography>
        </Box>,
      );
      continue;
    }

    nodes.push(
      <Typography
        key={k++}
        component="div"
        variant="body2"
        sx={{
          fontFamily: HAND_NOTEBOOK,
          fontSize: '1.05rem',
          lineHeight: 1.5,
          color: alpha(theme.palette.grey[300], 0.94),
          mb: 0.35,
        }}
      >
        {renderBoldSegments(line, theme, `p-${k}`)}
      </Typography>,
    );
  }

  return nodes;
}

export function HandwrittenStudyNotes({ markdown, theme }: { markdown: string; theme: Theme }) {
  const blocks: ReactNode[] = [];
  const re = /\$\$([\s\S]*?)\$\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let bi = 0;

  while ((m = re.exec(markdown)) !== null) {
    if (m.index > last) {
      blocks.push(
        <Stack key={`t-${bi}`} spacing={0.35} sx={{ mb: 1 }}>
          {MarkdownishLines(markdown.slice(last, m.index), theme)}
        </Stack>,
      );
      bi++;
    }
    blocks.push(<HandwrittenKatexDisplay key={`d-${bi}`} latex={m[1].trim()} theme={theme} />);
    bi++;
    last = re.lastIndex;
  }
  if (last < markdown.length) {
    blocks.push(
      <Stack key={`t-${bi}`} spacing={0.35}>
        {MarkdownishLines(markdown.slice(last), theme)}
      </Stack>,
    );
  }

  return (
    <Stack component="div" spacing={1.25}>
      {blocks}
    </Stack>
  );
}
