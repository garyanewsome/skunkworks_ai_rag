import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Theme } from '@mui/material/styles';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  alpha,
} from '@mui/material';

type TraceKind =
  | 'lecture_rag'
  | 'book_rag'
  | 'visualize'
  | 'grader'
  | 'rag_query'
  | 'office_hours'
  | 'show_work'
  | '';

type TraceListItem = {
  id: number;
  kind: TraceKind;
  preview: string;
  has_error: boolean;
  created_at: string;
};

type TraceDetail = TraceListItem & {
  request: Record<string, unknown>;
  response: unknown;
  error: string | null;
};

const KIND_LABELS: Record<Exclude<TraceKind, ''>, string> = {
  lecture_rag: 'Lecture answer',
  book_rag: 'Book answer',
  visualize: 'Visualize',
  grader: 'Grader',
  rag_query: 'Chunk search',
  office_hours: 'Office Hours',
  show_work: 'Show Work',
};

const RESTORABLE_KINDS = new Set<string>([
  'lecture_rag',
  'rag_query',
  'visualize',
  'book_rag',
  'grader',
  'show_work',
]);

function jsonBlock(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

type HistoryPanelProps = {
  theme: Theme;
  onRestoreFromHistory: (traceId: number) => void | Promise<void>;
};

export function HistoryPanel({ theme, onRestoreFromHistory }: HistoryPanelProps) {
  const [kindFilter, setKindFilter] = useState<TraceKind | ''>('');
  const [items, setItems] = useState<TraceListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<TraceDetail | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ limit: '80' });
      if (kindFilter) qs.set('kind', kindFilter);
      const res = await fetch(`/api/history?${qs.toString()}`);
      const data = (await res.json()) as { items?: TraceListItem[]; detail?: unknown };
      if (!res.ok) {
        const d = data as { detail?: unknown };
        throw new Error(typeof d.detail === 'string' ? d.detail : `HTTP ${res.status}`);
      }
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load history');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [kindFilter]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const openDetail = async (id: number) => {
    setDetailOpen(true);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/history/${id}`);
      const data = (await res.json()) as TraceDetail & { detail?: string };
      if (!res.ok) {
        throw new Error(typeof data.detail === 'string' ? data.detail : `HTTP ${res.status}`);
      }
      setDetail(data);
    } catch (e) {
      setDetail({
        id,
        kind: '' as TraceKind,
        preview: '',
        has_error: true,
        created_at: '',
        request: {},
        response: null,
        error: e instanceof Error ? e.message : 'Load failed',
      });
    } finally {
      setDetailLoading(false);
    }
  };

  const kindOptions = useMemo(
    () =>
      (Object.keys(KIND_LABELS) as Exclude<TraceKind, ''>[]).map((k) => ({
        value: k,
        label: KIND_LABELS[k],
      })),
    [],
  );

  const paperSx = {
    p: 2,
    borderRadius: 2,
    border: `1px solid ${alpha(theme.palette.primary.main, 0.12)}`,
    bgcolor: alpha(theme.palette.background.paper, 0.65),
  };

  return (
    <Box sx={{ width: '100%', maxWidth: 1100, mx: 'auto' }}>
      <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: '0.12em' }}>
        History
      </Typography>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        Prompt & response log
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Each lecture answer, book answer, visualize run, grader submission, Office Hours turn, transcript chunk search, and Show Work run is stored in
        Postgres when the API runs. Open a row for JSON, or use <strong>Restore</strong> to open the matching tab with
        the saved request and response (no new model call). Show Work traces restore the prompt, explicit-work option, and steps.
      </Typography>

      <Paper elevation={0} sx={{ ...paperSx, mb: 2, display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel id="hist-kind-filter">Filter</InputLabel>
          <Select
            labelId="hist-kind-filter"
            label="Filter"
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as TraceKind | '')}
          >
            <MenuItem value="">All kinds</MenuItem>
            {kindOptions.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button variant="outlined" onClick={() => void loadList()} disabled={loading}>
          Refresh
        </Button>
        {loading ? <CircularProgress size={22} /> : null}
        {error ? (
          <Typography variant="body2" color="error">
            {error}
          </Typography>
        ) : null}
      </Paper>

      <TableContainer component={Paper} elevation={0} sx={paperSx}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell width={72}>ID</TableCell>
              <TableCell width={140}>Kind</TableCell>
              <TableCell>Preview</TableCell>
              <TableCell width={100}>Status</TableCell>
              <TableCell width={200}>When</TableCell>
              <TableCell width={120} align="right">
                Actions
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.length === 0 && !loading ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <Typography variant="body2" color="text.secondary">
                    No traces yet — use Prompt, Office Hours, Source of truth, Visualize, Grader, or chunk search in the lecture panel.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              items.map((row) => (
                <TableRow
                  key={row.id}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => void openDetail(row.id)}
                >
                  <TableCell>{row.id}</TableCell>
                  <TableCell>
                    {row.kind && row.kind in KIND_LABELS
                      ? KIND_LABELS[row.kind as Exclude<TraceKind, ''>]
                      : row.kind || '—'}
                  </TableCell>
                  <TableCell sx={{ maxWidth: 420, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {row.preview || '—'}
                  </TableCell>
                  <TableCell>
                    {row.has_error ? (
                      <Chip size="small" label="Error" color="error" variant="outlined" />
                    ) : (
                      <Chip size="small" label="OK" color="success" variant="outlined" />
                    )}
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {row.created_at ? new Date(row.created_at).toLocaleString() : '—'}
                  </TableCell>
                  <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                    {row.kind && RESTORABLE_KINDS.has(row.kind) ? (
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => void onRestoreFromHistory(row.id)}
                      >
                        Restore
                      </Button>
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        —
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="md" fullWidth scroll="paper">
        <DialogTitle sx={{ pr: 6 }}>
          Trace #{detail?.id ?? '…'}
          {detail?.kind ? (
            <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
              ({detail.kind in KIND_LABELS ? KIND_LABELS[detail.kind as Exclude<TraceKind, ''>] : detail.kind})
            </Typography>
          ) : null}
        </DialogTitle>
        <DialogContent dividers>
          {detailLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : detail ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {detail.error ? (
                <Typography variant="body2" color="error">
                  {detail.error}
                </Typography>
              ) : null}
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Request
                </Typography>
                <Box
                  component="pre"
                  sx={{
                    m: 0,
                    p: 1.5,
                    borderRadius: 1,
                    overflow: 'auto',
                    maxHeight: 280,
                    fontSize: '0.75rem',
                    bgcolor: alpha(theme.palette.background.default, 0.9),
                    border: `1px solid ${alpha(theme.palette.divider, 0.3)}`,
                  }}
                >
                  {jsonBlock(detail.request)}
                </Box>
              </Box>
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Response
                </Typography>
                <Box
                  component="pre"
                  sx={{
                    m: 0,
                    p: 1.5,
                    borderRadius: 1,
                    overflow: 'auto',
                    maxHeight: 360,
                    fontSize: '0.75rem',
                    bgcolor: alpha(theme.palette.background.default, 0.9),
                    border: `1px solid ${alpha(theme.palette.divider, 0.3)}`,
                  }}
                >
                  {detail.response != null ? jsonBlock(detail.response) : '—'}
                </Box>
              </Box>
            </Box>
          ) : null}
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between', px: 3 }}>
          <Box>
            {detail?.kind && RESTORABLE_KINDS.has(detail.kind) ? (
              <Button
                variant="contained"
                onClick={() => {
                  void onRestoreFromHistory(detail.id);
                  setDetailOpen(false);
                }}
              >
                Restore
              </Button>
            ) : null}
          </Box>
          <Button onClick={() => setDetailOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
