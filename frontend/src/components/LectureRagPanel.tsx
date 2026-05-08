import { useCallback, useEffect, useRef, useState } from 'react';
import type { Theme } from '@mui/material/styles';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  FormControl,
  FormControlLabel,
  FormHelperText,
  FormLabel,
  IconButton,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Select,
  type SelectChangeEvent,
  TextField,
  Typography,
  alpha,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';

export type RagHit = {
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
  hits: RagHit[];
  used_llm: boolean;
};

type VideoItem = {
  video_id: string;
  chunk_count: number;
};

function msToClock(ms: number | null): string {
  if (ms == null) return '—';
  const totalSec = Math.floor(ms / 1000);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function youtubeEmbedSrc(videoId: string, startMs: number | null): string {
  const startSec = Math.max(0, Math.floor((startMs ?? 0) / 1000));
  return `https://www.youtube.com/embed/${videoId}?start=${startSec}&rel=0`;
}

type LectureRagPanelProps = {
  theme: Theme;
};

type SearchScope = 'all' | 'single';

export function LectureRagPanel({ theme }: LectureRagPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [searchScope, setSearchScope] = useState<SearchScope>('all');
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [videosLoading, setVideosLoading] = useState(true);
  const [videosError, setVideosError] = useState<string | null>(null);
  const [selectedVideoId, setSelectedVideoId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [usedLlm, setUsedLlm] = useState<boolean | null>(null);
  const [lastPrompt, setLastPrompt] = useState<string | null>(null);
  const [hits, setHits] = useState<RagHit[]>([]);
  const [filterVideoId, setFilterVideoId] = useState<string | null>(null);
  const [slideIdx, setSlideIdx] = useState(0);

  const deckRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setVideosLoading(true);
    setVideosError(null);
    fetch('/api/videos')
      .then(async (r) => {
        const data = (await r.json()) as { videos?: VideoItem[]; detail?: unknown };
        if (!r.ok) {
          const d = data.detail;
          const msg =
            typeof d === 'string'
              ? d
              : Array.isArray(d)
                ? d.map((x: { msg?: string }) => x.msg ?? '').join(' ')
                : `HTTP ${r.status}`;
          throw new Error(msg || 'Failed to load videos');
        }
        return data.videos ?? [];
      })
      .then((list) => {
        if (!cancelled) setVideos(list);
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setVideosError(e instanceof Error ? e.message : 'Could not load videos from the API.');
      })
      .finally(() => {
        if (!cancelled) setVideosLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (videos.length === 0) {
      setSelectedVideoId('');
      return;
    }
    setSelectedVideoId((prev) => {
      if (prev && videos.some((v) => v.video_id === prev)) return prev;
      return videos[0].video_id;
    });
  }, [videos]);

  const scrollToSlide = useCallback((index: number) => {
    const container = deckRef.current;
    if (!container) return;
    const children = container.children;
    const clamped = Math.max(0, Math.min(index, children.length - 1));
    const el = children[clamped] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    setSlideIdx(clamped);
  }, []);

  const onDeckScroll = useCallback(() => {
    const container = deckRef.current;
    if (!container) return;
    const { scrollLeft, clientWidth } = container;
    const slideW = container.children[0]?.clientWidth ?? clientWidth;
    const gap = 16;
    const i = Math.round(scrollLeft / (slideW + gap));
    setSlideIdx(Math.max(0, Math.min(i, hits.length - 1)));
  }, [hits.length]);

  const askDisabled =
    loading ||
    (searchScope === 'single' && (!selectedVideoId || videosLoading));

  const ask = async () => {
    const q = prompt.trim();
    if (!q) {
      setError('Enter a question.');
      return;
    }
    if (searchScope === 'single' && !selectedVideoId) {
      setError('Pick a lecture or switch to “All lectures”.');
      return;
    }
    setLoading(true);
    setError(null);
    setSummary(null);
    setHits([]);
    setLastPrompt(q);
    setSlideIdx(0);

    try {
      const body: {
        query: string;
        top_k: number;
        video_id?: string | null;
      } = {
        query: q,
        top_k: 12,
      };
      if (searchScope === 'single') {
        body.video_id = selectedVideoId;
      } else {
        body.video_id = null;
      }

      const res = await fetch('/api/rag/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as RagAnswerResponse | { detail: unknown };

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
      setSummary(ok.summary);
      setUsedLlm(ok.used_llm);
      setHits(ok.hits);
      setFilterVideoId(ok.filter_video_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setLastPrompt(null);
    } finally {
      setLoading(false);
    }
  };

  const onVideoChange = (e: SelectChangeEvent<string>) => {
    setSelectedVideoId(e.target.value);
  };

  const onScopeChange = (_: React.ChangeEvent<HTMLInputElement>, value: string) => {
    if (value === 'all' || value === 'single') setSearchScope(value);
  };

  return (
    <Box sx={{ width: '100%', maxWidth: 960, mx: 'auto' }}>
      <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: '0.12em' }}>
        Lecture RAG
      </Typography>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
        Ask the transcripts
      </Typography>

      <TextField
        label="Question"
        placeholder='e.g. What is the force equation mentioned in the lectures?'
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        multiline
        minRows={2}
        fullWidth
        sx={{ mb: 2 }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            ask();
          }
        }}
      />

      <FormControl component="fieldset" sx={{ mb: 2, width: '100%' }}>
        <FormLabel component="legend" sx={{ color: 'text.secondary', mb: 1 }}>
          Search scope
        </FormLabel>
        <RadioGroup row value={searchScope} onChange={onScopeChange}>
          <FormControlLabel value="all" control={<Radio color="primary" />} label="All ingested lectures" />
          <FormControlLabel
            value="single"
            control={<Radio color="primary" />}
            label="This lecture only"
          />
        </RadioGroup>
        <FormHelperText>
          {videosLoading
            ? 'Loading lecture list…'
            : videos.length > 0
              ? `${videos.length} lecture(s) in the database. Global search ranks the best clips across all of them.`
              : 'No lectures in the database yet — ingest SRTs first.'}
        </FormHelperText>
      </FormControl>

      {searchScope === 'single' && (
        <FormControl fullWidth size="small" sx={{ mb: 2 }} disabled={videosLoading}>
          <FormLabel id="lecture-video-label" sx={{ mb: 0.5 }}>
            Lecture video
          </FormLabel>
          <Select<string>
            labelId="lecture-video-label"
            value={selectedVideoId}
            onChange={onVideoChange}
            displayEmpty
            renderValue={(id) => id || (videosLoading ? 'Loading…' : '')}
          >
            {videos.map((v) => (
              <MenuItem key={v.video_id} value={v.video_id}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, width: '100%' }}>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {v.video_id}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {v.chunk_count} chunks
                  </Typography>
                </Box>
              </MenuItem>
            ))}
          </Select>
          <FormHelperText>
            {videosError ||
              (videos.length === 0 && !videosLoading
                ? 'Ingest transcripts with ingest_transcript.py / batch_ingest_lectures.py.'
                : 'Restrict vector search to one YouTube video id.')}
          </FormHelperText>
        </FormControl>
      )}

      <Button
        variant="contained"
        size="large"
        onClick={ask}
        disabled={askDisabled}
        fullWidth
        sx={{ py: 1.5, mb: 3 }}
      >
        {loading ? <CircularProgress size={26} color="inherit" /> : 'Ask'}
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

      {(summary || lastPrompt) && (
        <Box sx={{ mb: 4 }}>
          {summary && (
            <Paper
              elevation={0}
              sx={{
                p: 3,
                mb: 3,
                bgcolor: alpha(theme.palette.background.paper, 0.85),
                border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                <Typography variant="subtitle1" fontWeight={700}>
                  Answer
                </Typography>
                {usedLlm !== null && (
                  <Chip
                    size="small"
                    label={usedLlm ? 'Claude + transcript' : 'Transcript excerpts'}
                    color={usedLlm ? 'primary' : 'default'}
                    variant="outlined"
                  />
                )}
                <Chip
                  size="small"
                  label={
                    filterVideoId == null
                      ? 'Scope: all lectures'
                      : `Scope: ${filterVideoId}`
                  }
                  variant="outlined"
                  sx={{ fontFamily: 'monospace' }}
                />
              </Box>
              <Typography
                component="div"
                variant="body1"
                sx={{
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.7,
                  color: 'text.primary',
                }}
              >
                {summary}
              </Typography>
            </Paper>
          )}

          {lastPrompt && (
            <Paper
              elevation={0}
              sx={{
                p: 2,
                mb: 3,
                bgcolor: alpha(theme.palette.secondary.main, 0.06),
                border: `1px solid ${alpha(theme.palette.secondary.main, 0.2)}`,
              }}
            >
              <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                Your question
              </Typography>
              <Typography variant="body1" sx={{ fontStyle: 'italic' }}>
                {lastPrompt}
              </Typography>
            </Paper>
          )}
        </Box>
      )}

      {hits.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Typography variant="subtitle1" fontWeight={600}>
              Related moments ({hits.length})
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <IconButton
                size="small"
                aria-label="Previous clip"
                onClick={() => scrollToSlide(slideIdx - 1)}
                disabled={slideIdx <= 0}
              >
                <ChevronLeftIcon />
              </IconButton>
              <Typography variant="caption" color="text.secondary">
                {slideIdx + 1} / {hits.length}
              </Typography>
              <IconButton
                size="small"
                aria-label="Next clip"
                onClick={() => scrollToSlide(slideIdx + 1)}
                disabled={slideIdx >= hits.length - 1}
              >
                <ChevronRightIcon />
              </IconButton>
            </Box>
          </Box>

          <Box
            ref={deckRef}
            onScroll={onDeckScroll}
            sx={{
              display: 'flex',
              gap: 2,
              overflowX: 'auto',
              scrollSnapType: 'x mandatory',
              pb: 1,
              mx: { xs: -2, sm: 0 },
              px: { xs: 2, sm: 0 },
              scrollbarGutter: 'stable',
            }}
          >
            {hits.map((hit, i) => (
              <Card
                key={`${hit.video_id}-${hit.chunk_index}-${i}`}
                elevation={0}
                sx={{
                  flex: '0 0 min(100%, 440px)',
                  scrollSnapAlign: 'start',
                  overflow: 'hidden',
                  border: `1px solid ${alpha('#fff', 0.06)}`,
                }}
              >
                <Box sx={{ position: 'relative', pt: '56.25%', bgcolor: '#000' }}>
                  <Box
                    component="iframe"
                    src={youtubeEmbedSrc(hit.video_id, hit.start_ms)}
                    title={`Clip ${hit.video_id}`}
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
                <CardContent sx={{ pt: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                    <Chip
                      size="small"
                      label={hit.video_id}
                      variant="outlined"
                      sx={{ fontFamily: 'monospace', fontSize: '0.7rem', maxWidth: '100%' }}
                    />
                    <Chip
                      icon={<PlayCircleOutlineIcon sx={{ fontSize: 18 }} />}
                      label={`${msToClock(hit.start_ms)} · ${(hit.similarity * 100).toFixed(0)}% match`}
                      size="small"
                      variant="outlined"
                    />
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {hit.content}
                  </Typography>
                </CardContent>
              </Card>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
