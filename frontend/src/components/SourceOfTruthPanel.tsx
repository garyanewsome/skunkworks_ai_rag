import { useCallback, useEffect, useState } from 'react';
import type { Theme } from '@mui/material/styles';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  type SelectChangeEvent,
  TextField,
  Typography,
  alpha,
} from '@mui/material';

type BookItem = {
  id: string;
  slug: string;
  title: string;
  page_count: number | null;
  chunk_count: number;
};

type BookHit = {
  book_id: string;
  slug: string;
  book_title: string;
  chunk_index: number;
  content: string;
  start_page: number;
  end_page: number;
  distance: number;
  similarity: number;
};

type BookAnswerResponse = {
  summary: string;
  filter_book_id: string | null;
  hits: BookHit[];
  used_llm: boolean;
};

type SourceOfTruthPanelProps = {
  theme: Theme;
  historyReplay?: {
    key: number;
    request: Record<string, unknown>;
    response: unknown;
    error: string | null;
  } | null;
  onHistoryReplayDone?: () => void;
};

function pageLabel(sp: number, ep: number): string {
  return sp === ep ? `p. ${sp}` : `pp. ${sp}–${ep}`;
}

export function SourceOfTruthPanel({ theme, historyReplay, onHistoryReplayDone }: SourceOfTruthPanelProps) {
  const [books, setBooks] = useState<BookItem[]>([]);
  const [booksError, setBooksError] = useState<string | null>(null);
  const [bookId, setBookId] = useState<string>('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BookAnswerResponse | null>(null);

  const loadBooks = useCallback(() => {
    setBooksError(null);
    fetch('/api/books')
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || r.statusText);
        return r.json() as Promise<{ books: BookItem[] }>;
      })
      .then((d) => setBooks(d.books || []))
      .catch((e: Error) => setBooksError(e.message));
  }, []);

  useEffect(() => {
    loadBooks();
  }, [loadBooks]);

  const onBookChange = (e: SelectChangeEvent<string>) => {
    setBookId(e.target.value);
  };

  const ask = async () => {
    const q = query.trim();
    if (!q) {
      setError('Enter a question.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch('/api/books/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          book_id: bookId || null,
          top_k: 12,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail || r.statusText));
      }
      setResult(data as BookAnswerResponse);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!historyReplay) return;
    const request = historyReplay.request;
    const q = String(request.query ?? '').trim();
    const bid = typeof request.book_id === 'string' ? request.book_id : '';
    setBookId(bid);
    setQuery(q);
    setLoading(false);

    if (historyReplay.error) {
      setError(historyReplay.error);
      setResult(null);
      onHistoryReplayDone?.();
      return;
    }

    setError(null);
    const raw = historyReplay.response;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const o = raw as Record<string, unknown>;
      if (typeof o.summary === 'string' && Array.isArray(o.hits)) {
        setResult(raw as BookAnswerResponse);
        onHistoryReplayDone?.();
        return;
      }
    }
    if (q) {
      setError('No saved book answer in history for this entry.');
    }
    setResult(null);
    onHistoryReplayDone?.();
  }, [historyReplay?.key, historyReplay?.request, historyReplay?.response, historyReplay?.error, onHistoryReplayDone]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, sm: 3 },
          borderRadius: 3,
          border: `1px solid ${alpha(theme.palette.primary.main, 0.12)}`,
          background: alpha(theme.palette.background.paper, 0.55),
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
          Query PDF library
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Books are ingested on the server from PDFs (chunked ~1500 characters with ~150 overlap; OCR when pages lack
          text). Run{' '}
          <Typography component="span" variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.85em' }}>
            python ingest_book_pdf.py &lt;file.pdf&gt;
          </Typography>{' '}
          in <code style={{ fontSize: '0.85em' }}>backend/</code>, then reload the list.
        </Typography>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'flex-start', mb: 2 }}>
          <FormControl sx={{ minWidth: 280 }} size="small">
            <InputLabel id="sot-book-label">Book</InputLabel>
            <Select<string>
              labelId="sot-book-label"
              label="Book"
              value={bookId}
              onChange={onBookChange}
              disabled={!!booksError && books.length === 0}
            >
              <MenuItem value="">
                <em>All ingested books</em>
              </MenuItem>
              {books.map((b) => (
                <MenuItem key={b.id} value={b.id}>
                  {b.title}
                  {b.chunk_count != null ? ` (${b.chunk_count} chunks)` : ''}
                </MenuItem>
              ))}
            </Select>
            <FormHelperText>{booksError || `${books.length} book(s) loaded`}</FormHelperText>
          </FormControl>
          <Button variant="outlined" size="small" onClick={loadBooks} sx={{ mt: 0.5 }}>
            Refresh list
          </Button>
        </Box>

        <TextField
          label="Your question"
          placeholder="Search the selected book(s) for an answer grounded in the PDF…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          multiline
          minRows={4}
          fullWidth
          sx={{ mb: 2 }}
        />

        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button variant="contained" onClick={() => void ask()} disabled={loading}>
            {loading ? <CircularProgress size={22} color="inherit" /> : 'Ask'}
          </Button>
          {result ? (
            <Chip
              size="small"
              label={result.used_llm ? 'Claude answer' : 'Excerpts only (set ANTHROPIC_API_KEY)'}
              color={result.used_llm ? 'primary' : 'default'}
              variant="outlined"
            />
          ) : null}
        </Box>

        {error ? (
          <Typography color="error" variant="body2" sx={{ mt: 2 }}>
            {error}
          </Typography>
        ) : null}
      </Paper>

      {result ? (
        <Paper
          elevation={0}
          sx={{
            p: { xs: 2, sm: 3 },
            borderRadius: 3,
            border: `1px solid ${alpha(theme.palette.secondary.main, 0.15)}`,
            background: alpha(theme.palette.background.paper, 0.45),
          }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
            Answer
          </Typography>
          <Typography
            variant="body2"
            sx={{
              whiteSpace: 'pre-wrap',
              color: 'text.primary',
              lineHeight: 1.65,
              mb: 3,
            }}
          >
            {result.summary}
          </Typography>

          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
            Sources ({result.hits.length})
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {result.hits.map((h, i) => (
              <Card key={`${h.book_id}-${h.chunk_index}-${i}`} variant="outlined" sx={{ borderRadius: 2 }}>
                <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', mb: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      {h.book_title}
                    </Typography>
                    <Chip size="small" label={pageLabel(h.start_page, h.end_page)} color="secondary" variant="outlined" />
                    <Chip size="small" label={`chunk ${h.chunk_index}`} variant="outlined" />
                    <Chip size="small" label={`sim ${h.similarity.toFixed(2)}`} variant="outlined" />
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                    {h.content.length > 1200 ? `${h.content.slice(0, 1200)}…` : h.content}
                  </Typography>
                </CardContent>
              </Card>
            ))}
          </Box>
        </Paper>
      ) : null}
    </Box>
  );
}
