import { fetchHistoryMatch } from '../historyPreflight';
import {
  type LectureGroup,
  type VideoItem,
  buildLectureGroups,
  headerLabelForGroup,
  lectureGroupKey,
} from '../lectureGroups';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  LinearProgress,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Select,
  type SelectChangeEvent,
  Snackbar,
  TextField,
  Typography,
  alpha,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import BookmarkAddOutlinedIcon from '@mui/icons-material/BookmarkAddOutlined';

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
  filter_video_ids: string[] | null;
  hits: RagHit[];
  used_llm: boolean;
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

/** Matches Show Work notebook notes (Google fonts loaded in index.html). */
const HAND_NOTEBOOK = '"Caveat", "Kalam", "Segoe Script", cursive';

type LectureRagPanelProps = {
  theme: Theme;
  /** Hydrate from History: fills fields and applies saved response (no API / LLM). */
  historyReplay?: {
    key: number;
    kind: 'lecture_rag' | 'rag_query';
    request: Record<string, unknown>;
    response: unknown;
    error: string | null;
  } | null;
  onHistoryReplayDone?: () => void;
};

type SearchScope = 'all' | 'single';

/** Restore lecture scope from a saved `/api/rag/*` request body. */
function resolveScopeFromStoredRequest(
  request: Record<string, unknown>,
  groupByKey: Record<string, LectureGroup>,
): { searchScope: SearchScope; groupKey: string; part: 'all' | string } {
  const videoId = typeof request.video_id === 'string' ? request.video_id.trim() || null : null;
  const rawIds = request.video_ids;
  const videoIds = Array.isArray(rawIds)
    ? rawIds.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : [];

  if (!videoId && videoIds.length === 0) {
    return { searchScope: 'all', groupKey: '', part: 'all' };
  }

  const ids = videoIds.length ? videoIds : videoId ? [videoId] : [];

  for (const [, g] of Object.entries(groupByKey)) {
    const gv = new Set(g.videos.map((v) => v.video_id));
    if (ids.length > 1) {
      const allIn = ids.every((id) => gv.has(id));
      if (allIn && ids.length === g.videos.length) {
        return { searchScope: 'single', groupKey: g.groupKey, part: 'all' };
      }
      if (allIn) {
        return { searchScope: 'single', groupKey: g.groupKey, part: 'all' };
      }
    } else if (ids.length === 1) {
      const id = ids[0];
      if (gv.has(id)) {
        return {
          searchScope: 'single',
          groupKey: g.groupKey,
          part: g.videos.length === 1 ? g.videos[0].video_id : id,
        };
      }
    }
  }

  return { searchScope: 'all', groupKey: '', part: 'all' };
}

type RagQueryResponse = {
  filter_video_id: string | null;
  filter_video_ids: string[] | null;
  hits: RagHit[];
};

function coerceRagHit(raw: unknown): RagHit | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.video_id !== 'string') return null;
  if (typeof o.chunk_index !== 'number') return null;
  if (typeof o.content !== 'string') return null;
  const distance = typeof o.distance === 'number' ? o.distance : 0;
  const similarity = typeof o.similarity === 'number' ? o.similarity : 1 - distance;
  return {
    video_id: o.video_id,
    chunk_index: o.chunk_index,
    content: o.content,
    start_ms: typeof o.start_ms === 'number' ? o.start_ms : null,
    end_ms: typeof o.end_ms === 'number' ? o.end_ms : null,
    distance,
    similarity,
  };
}

function parseRagAnswerFromHistory(raw: unknown): RagAnswerResponse | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.summary !== 'string') return null;
  if (!Array.isArray(o.hits)) return null;
  const hits = o.hits.map(coerceRagHit).filter((x): x is RagHit => x != null);
  return {
    summary: o.summary,
    filter_video_id: typeof o.filter_video_id === 'string' ? o.filter_video_id : null,
    filter_video_ids: Array.isArray(o.filter_video_ids)
      ? o.filter_video_ids.filter((x): x is string => typeof x === 'string')
      : null,
    hits,
    used_llm: Boolean(o.used_llm),
  };
}

function parseRagQueryFromHistory(raw: unknown): RagQueryResponse | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.hits)) return null;
  const hits = o.hits.map(coerceRagHit).filter((x): x is RagHit => x != null);
  return {
    filter_video_id: typeof o.filter_video_id === 'string' ? o.filter_video_id : null,
    filter_video_ids: Array.isArray(o.filter_video_ids)
      ? o.filter_video_ids.filter((x): x is string => typeof x === 'string')
      : null,
    hits,
  };
}

/** Metadata for persisting a RAG hit as a saved clip (API body). */
export function organizerMetaForHit(
  hit: RagHit,
  videos: VideoItem[],
  groupByKey: Record<string, LectureGroup>,
): { group_key: string; topic_label: string; video_title: string } {
  const v = videos.find((x) => x.video_id === hit.video_id);
  if (!v) {
    const gk = `v:${hit.video_id}`;
    return { group_key: gk, topic_label: hit.video_id, video_title: hit.video_id };
  }
  const groupKey = lectureGroupKey(v);
  const g = groupByKey[groupKey];
  const topicLabel = g?.topicLabel ?? headerLabelForGroup(groupKey, [v]);
  const videoTitle = (v.title ?? '').trim() || hit.video_id;
  return { group_key: groupKey, topic_label: topicLabel, video_title: videoTitle };
}

export function LectureRagPanel({ theme, historyReplay, onHistoryReplayDone }: LectureRagPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [searchScope, setSearchScope] = useState<SearchScope>('all');
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [videosLoading, setVideosLoading] = useState(true);
  const [videosError, setVideosError] = useState<string | null>(null);
  /** Lecture title group (`lectureGroupKey` — topic/course bucket) */
  const [selectedGroupKey, setSelectedGroupKey] = useState('');
  /** `all` = every video in group; else one `video_id` */
  const [selectedPart, setSelectedPart] = useState<'all' | string>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [usedLlm, setUsedLlm] = useState<boolean | null>(null);
  const [lastPrompt, setLastPrompt] = useState<string | null>(null);
  const [hits, setHits] = useState<RagHit[]>([]);
  const [filterVideoId, setFilterVideoId] = useState<string | null>(null);
  const [filterVideoIds, setFilterVideoIds] = useState<string[] | null>(null);
  /** Human label for scope chip when multi-part topic */
  const [scopeLabel, setScopeLabel] = useState<string | null>(null);
  const [slideIdx, setSlideIdx] = useState(0);
  const [clipSnack, setClipSnack] = useState<{ open: boolean; message: string; ok: boolean }>({
    open: false,
    message: '',
    ok: true,
  });
  const [savingClipKey, setSavingClipKey] = useState<string | null>(null);

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

  const { lectureGroups, groupByKey } = useMemo(() => buildLectureGroups(videos), [videos]);

  useEffect(() => {
    if (!lectureGroups.length) {
      setSelectedGroupKey('');
      setSelectedPart('all');
      return;
    }
    setSelectedGroupKey((prev) => {
      if (prev && lectureGroups.some((g) => g.groupKey === prev)) return prev;
      return lectureGroups[0].groupKey;
    });
  }, [lectureGroups]);

  useEffect(() => {
    const g = selectedGroupKey ? groupByKey[selectedGroupKey] : undefined;
    if (!g?.videos.length) {
      setSelectedPart('all');
      return;
    }
    if (g.videos.length === 1) {
      setSelectedPart(g.videos[0].video_id);
      return;
    }
    setSelectedPart((prev) => {
      if (prev === 'all') return 'all';
      return g.videos.some((v) => v.video_id === prev) ? prev : 'all';
    });
  }, [selectedGroupKey, groupByKey]);

  const titleByVideoId = useMemo(() => {
    const m: Record<string, string> = {};
    for (const v of videos) {
      if (v.title) m[v.video_id] = v.title;
    }
    return m;
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

  const currentGroup = selectedGroupKey ? groupByKey[selectedGroupKey] : undefined;

  const askDisabled =
    loading ||
    (searchScope === 'single' &&
      (videosLoading || !selectedGroupKey || !currentGroup?.videos.length));

  const ask = async () => {
    const q = prompt.trim();
    if (!q) {
      setError('Enter a question.');
      return;
    }
    if (searchScope === 'single' && (!selectedGroupKey || !currentGroup?.videos.length)) {
      setError('Pick a lecture group or switch to “All lectures”.');
      return;
    }
    setLoading(true);
    setError(null);
    setSummary(null);
    setHits([]);
    setLastPrompt(q);
    setSlideIdx(0);
    setScopeLabel(null);

    try {
      const body: {
        query: string;
        top_k: number;
        video_id?: string | null;
        video_ids?: string[] | null;
      } = {
        query: q,
        top_k: 12,
      };
      if (searchScope === 'single') {
        const g = groupByKey[selectedGroupKey];
        if (!g?.videos.length) throw new Error('Invalid lecture group.');
        if (g.videos.length > 1 && selectedPart === 'all') {
          body.video_ids = g.videos.map((v) => v.video_id);
          body.video_id = null;
          body.top_k = Math.min(50, Math.max(28, 4 * g.videos.length));
          setScopeLabel(`All parts · ${g.topicLabel} (${g.videos.length} videos)`);
        } else {
          const vid = g.videos.length === 1 ? g.videos[0].video_id : selectedPart;
          if (!vid || vid === 'all') throw new Error('Pick one part.');
          body.video_id = vid;
          body.video_ids = null;
          setScopeLabel(titleByVideoId[vid] ?? vid);
        }
      } else {
        body.video_id = null;
        body.video_ids = null;
      }

      const cached = await fetchHistoryMatch('lecture_rag', body as Record<string, unknown>);
      if (cached?.hit && cached.response != null && typeof cached.response === 'object') {
        const ok = cached.response as RagAnswerResponse;
        if (typeof ok.summary === 'string' && Array.isArray(ok.hits)) {
          setSummary(ok.summary);
          setUsedLlm(Boolean(ok.used_llm));
          setHits(ok.hits);
          setFilterVideoId(ok.filter_video_id ?? null);
          setFilterVideoIds(ok.filter_video_ids ?? null);
          return;
        }
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
      setFilterVideoIds(ok.filter_video_ids ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setLastPrompt(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!historyReplay || videosLoading) return;
    const { kind, request, response, error } = historyReplay;
    const q = String(request.query ?? '').trim();
    if (!q) {
      onHistoryReplayDone?.();
      return;
    }

    let scope = resolveScopeFromStoredRequest(request, groupByKey);
    if (scope.searchScope === 'single' && (!scope.groupKey || !groupByKey[scope.groupKey])) {
      scope = { searchScope: 'all', groupKey: '', part: 'all' };
    }

    setPrompt(q);
    setSearchScope(scope.searchScope);
    if (scope.searchScope === 'single' && scope.groupKey) {
      setSelectedGroupKey(scope.groupKey);
      setSelectedPart(scope.part);
    }

    setSlideIdx(0);
    setLoading(false);
    setLastPrompt(q);

    if (scope.searchScope === 'single') {
      const g = groupByKey[scope.groupKey];
      if (g?.videos.length > 1 && scope.part === 'all') {
        setScopeLabel(`All parts · ${g.topicLabel} (${g.videos.length} videos)`);
      } else if (g) {
        const vid = g.videos.length === 1 ? g.videos[0].video_id : scope.part;
        if (vid && vid !== 'all') setScopeLabel(titleByVideoId[vid] ?? vid);
        else setScopeLabel(null);
      } else {
        setScopeLabel(null);
      }
    } else {
      setScopeLabel(null);
    }

    if (error) {
      setError(error);
      setSummary(null);
      setHits([]);
      setUsedLlm(null);
      setFilterVideoId(null);
      setFilterVideoIds(null);
      onHistoryReplayDone?.();
      return;
    }

    if (kind === 'rag_query') {
      const ok = parseRagQueryFromHistory(response);
      if (!ok) {
        setError('Could not read saved chunk search from history.');
        setSummary(null);
        setHits([]);
        setUsedLlm(null);
        setFilterVideoId(null);
        setFilterVideoIds(null);
      } else {
        setError(null);
        setSummary(null);
        setUsedLlm(null);
        setHits(ok.hits);
        setFilterVideoId(ok.filter_video_id);
        setFilterVideoIds(ok.filter_video_ids ?? null);
      }
      onHistoryReplayDone?.();
      return;
    }

    const ok = parseRagAnswerFromHistory(response);
    if (!ok) {
      setError('Could not read saved lecture answer from history.');
      setSummary(null);
      setHits([]);
      setUsedLlm(null);
      setFilterVideoId(null);
      setFilterVideoIds(null);
    } else {
      setError(null);
      setSummary(ok.summary);
      setUsedLlm(ok.used_llm);
      setHits(ok.hits);
      setFilterVideoId(ok.filter_video_id);
      setFilterVideoIds(ok.filter_video_ids ?? null);
    }
    onHistoryReplayDone?.();
  }, [
    historyReplay?.key,
    historyReplay?.kind,
    historyReplay?.request,
    historyReplay?.response,
    historyReplay?.error,
    videosLoading,
    groupByKey,
    titleByVideoId,
    onHistoryReplayDone,
  ]);

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
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            gap: 2,
            mb: 2,
            width: '100%',
          }}
        >
          <FormControl fullWidth size="small" sx={{ flex: 1 }} disabled={videosLoading}>
            <FormLabel id="lecture-group-label" sx={{ mb: 0.5 }}>
              Lecture group
            </FormLabel>
            <Select<string>
              labelId="lecture-group-label"
              value={selectedGroupKey}
              onChange={(e: SelectChangeEvent<string>) => setSelectedGroupKey(e.target.value)}
              displayEmpty
              renderValue={(key) => {
                if (videosLoading) return 'Loading…';
                if (!key) return '';
                const g = groupByKey[key];
                if (!g) return key;
                const n = g.videos.length;
                return n > 1 ? `${g.topicLabel} (${n} videos)` : g.topicLabel;
              }}
            >
              {lectureGroups.map((g) => (
                <MenuItem key={g.groupKey} value={g.groupKey}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, width: '100%', alignItems: 'baseline' }}>
                    <Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>
                      {g.topicLabel}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                      {g.videos.length} video{g.videos.length === 1 ? '' : 's'}
                    </Typography>
                  </Box>
                </MenuItem>
              ))}
            </Select>
            <FormHelperText>Course / topic bucket (grouped from titles).</FormHelperText>
          </FormControl>

          <FormControl
            fullWidth
            size="small"
            sx={{ flex: 1 }}
            disabled={videosLoading || !currentGroup || currentGroup.videos.length <= 1}
          >
            <FormLabel id="lecture-part-label" sx={{ mb: 0.5 }}>
              Part
            </FormLabel>
            <Select<string>
              labelId="lecture-part-label"
              value={currentGroup && currentGroup.videos.length > 1 ? selectedPart : currentGroup?.videos[0]?.video_id ?? ''}
              onChange={(e: SelectChangeEvent<string>) =>
                setSelectedPart(e.target.value === 'all' ? 'all' : e.target.value)
              }
              displayEmpty
              renderValue={(val) => {
                if (!currentGroup?.videos.length) return '';
                if (currentGroup.videos.length === 1) {
                  const v = currentGroup.videos[0];
                  return v.title || v.video_id;
                }
                if (val === 'all') return `All parts (${currentGroup.videos.length} videos)`;
                const v = videos.find((x) => x.video_id === val);
                return v?.title || val;
              }}
            >
              {currentGroup && currentGroup.videos.length > 1 ? (
                <MenuItem value="all">
                  <Typography variant="body2" fontWeight={600}>
                    All parts — search combined ({currentGroup.videos.length} videos)
                  </Typography>
                </MenuItem>
              ) : null}
              {currentGroup?.videos.map((v) => (
                <MenuItem key={v.video_id} value={v.video_id}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 0.25, width: '100%', minWidth: 0 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'baseline' }}>
                      <Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {v.title || v.video_id}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                        {v.chunk_count} chunks
                      </Typography>
                    </Box>
                    {v.title ? (
                      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: '0.65rem' }}>
                        {v.video_id}
                      </Typography>
                    ) : null}
                  </Box>
                </MenuItem>
              ))}
            </Select>
            <FormHelperText>
              {!currentGroup
                ? ''
                : currentGroup.videos.length <= 1
                  ? 'Only one video in this group.'
                  : 'One lecture or all parts that share this group.'}
            </FormHelperText>
          </FormControl>
        </Box>
      )}

      {searchScope === 'single' && (
        <FormHelperText sx={{ mb: 2, mt: -1, mx: 0 }}>
          {videosError ||
            (videos.length === 0 && !videosLoading
              ? 'Ingest transcripts with ingest_transcript.py / batch_ingest_lectures.py.'
              : 'Titles group by shared topic after “|”, or by course name for patterns like “Course | lecture N”.')}
        </FormHelperText>
      )}

      <Button
        variant="contained"
        size="large"
        onClick={ask}
        disabled={askDisabled}
        fullWidth
        sx={{ py: 1.5, mb: loading ? 1 : 3 }}
      >
        {loading ? <CircularProgress size={26} color="inherit" /> : 'Ask'}
      </Button>

      {loading && (
        <Paper
          elevation={0}
          sx={{
            overflow: 'hidden',
            mb: 3,
            bgcolor: alpha(theme.palette.primary.main, 0.08),
            border: `1px solid ${alpha(theme.palette.primary.main, 0.22)}`,
          }}
        >
          <LinearProgress color="primary" sx={{ height: 4 }} />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 2, py: 2 }}>
            <CircularProgress size={22} thickness={5} />
            <Box>
              <Typography variant="body2" fontWeight={600}>
                Finding review lectures…
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Searching transcripts for the best-matching clips, then drafting an answer.
              </Typography>
            </Box>
          </Box>
        </Paper>
      )}

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
                p: { xs: 2.5, sm: 3.25 },
                mb: 3,
                borderRadius: 2,
                border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
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
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                <Typography
                  variant="subtitle1"
                  sx={{
                    fontFamily: HAND_NOTEBOOK,
                    fontWeight: 700,
                    fontSize: '1.5rem',
                    color: alpha(theme.palette.secondary.light, 0.95),
                    transform: 'rotate(-0.35deg)',
                  }}
                >
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
                    filterVideoId == null && !(filterVideoIds?.length)
                      ? 'Scope: all lectures'
                      : filterVideoIds && filterVideoIds.length > 1
                        ? `Scope: ${scopeLabel ?? `${filterVideoIds.length} videos`}`
                        : `Scope: ${scopeLabel ?? (filterVideoId ? titleByVideoId[filterVideoId] ?? filterVideoId : '')}`
                  }
                  variant="outlined"
                  sx={{
                    maxWidth: '100%',
                    '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' },
                  }}
                />
              </Box>
              <Typography
                component="div"
                variant="body1"
                sx={{
                  fontFamily: HAND_NOTEBOOK,
                  fontSize: '1.32rem',
                  fontWeight: 500,
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.48,
                  letterSpacing: '0.01em',
                  color: alpha(theme.palette.grey[300], 0.94),
                  pl: 0.25,
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
                      label={titleByVideoId[hit.video_id] ?? hit.video_id}
                      title={hit.video_id}
                      variant="outlined"
                      sx={{ maxWidth: '100%', '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }}
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
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<BookmarkAddOutlinedIcon />}
                    disabled={savingClipKey === `${hit.video_id}-${hit.chunk_index}`}
                    sx={{ mt: 1.5 }}
                    onClick={async () => {
                      const key = `${hit.video_id}-${hit.chunk_index}`;
                      setSavingClipKey(key);
                      try {
                        const meta = organizerMetaForHit(hit, videos, groupByKey);
                        const res = await fetch('/api/clips', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            video_id: hit.video_id,
                            chunk_index: hit.chunk_index,
                            start_ms: hit.start_ms,
                            end_ms: hit.end_ms,
                            transcript_excerpt: hit.content,
                            group_key: meta.group_key,
                            topic_label: meta.topic_label,
                            video_title: meta.video_title,
                          }),
                        });
                        const data = (await res.json()) as { detail?: unknown };
                        if (!res.ok) {
                          const d = data.detail;
                          const msg =
                            typeof d === 'string'
                              ? d
                              : Array.isArray(d)
                                ? d.map((x: { msg?: string }) => x.msg ?? '').join(' ')
                                : `HTTP ${res.status}`;
                          setClipSnack({ open: true, message: msg || 'Could not save clip', ok: false });
                        } else {
                          setClipSnack({ open: true, message: 'Saved to Clips', ok: true });
                        }
                      } catch (e: unknown) {
                        setClipSnack({
                          open: true,
                          message: e instanceof Error ? e.message : 'Could not save clip',
                          ok: false,
                        });
                      } finally {
                        setSavingClipKey(null);
                      }
                    }}
                  >
                    Save to Clips
                  </Button>
                </CardContent>
              </Card>
            ))}
          </Box>
        </Box>
      )}
      <Snackbar
        open={clipSnack.open}
        autoHideDuration={4000}
        onClose={() => setClipSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        message={clipSnack.message}
        ContentProps={{
          sx: {
            bgcolor: clipSnack.ok ? alpha(theme.palette.secondary.main, 0.2) : alpha(theme.palette.error.main, 0.25),
            border: `1px solid ${alpha(clipSnack.ok ? theme.palette.secondary.main : theme.palette.error.main, 0.5)}`,
          },
        }}
      />
    </Box>
  );
}
