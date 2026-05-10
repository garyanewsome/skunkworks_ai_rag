import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Theme } from '@mui/material/styles';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Paper,
  TextField,
  Typography,
  alpha,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import { HandwrittenStudyNotes } from './HandwrittenStudyNotes';

type SavedClip = {
  id: number;
  video_id: string;
  chunk_index: number;
  start_ms: number | null;
  end_ms: number | null;
  transcript_excerpt: string;
  group_key: string;
  topic_label: string;
  video_title: string;
  student_note: string;
  ai_note: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ClipsPanelProps = {
  theme: Theme;
};

const HAND_NOTEBOOK = '"Caveat", "Kalam", "Segoe Script", cursive';

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

export function ClipsPanel({ theme }: ClipsPanelProps) {
  const [clips, setClips] = useState<SavedClip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Local drafts for student notes before Save */
  const [noteDrafts, setNoteDrafts] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [generatingId, setGeneratingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadClips = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/clips');
      const data = (await res.json()) as { clips?: SavedClip[]; detail?: unknown };
      if (!res.ok) {
        const d = data.detail;
        const msg =
          typeof d === 'string'
            ? d
            : Array.isArray(d)
              ? d.map((x: { msg?: string }) => x.msg ?? '').join(' ')
              : `HTTP ${res.status}`;
        throw new Error(msg || 'Failed to load clips');
      }
      const list = Array.isArray(data.clips) ? data.clips : [];
      setClips(list);
      setNoteDrafts((prev) => {
        const next = { ...prev };
        for (const c of list) {
          if (next[c.id] === undefined) next[c.id] = c.student_note ?? '';
        }
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load clips');
      setClips([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadClips();
  }, [loadClips]);

  const grouped = useMemo(() => {
    const topics = new Map<string, Map<string, SavedClip[]>>();
    for (const c of clips) {
      const topic = c.topic_label || 'Uncategorized';
      const vidTitle = c.video_title || c.video_id;
      if (!topics.has(topic)) topics.set(topic, new Map());
      const vm = topics.get(topic)!;
      if (!vm.has(vidTitle)) vm.set(vidTitle, []);
      vm.get(vidTitle)!.push(c);
    }
    const sortedTopics = [...topics.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    return sortedTopics.map(([topicLabel, videoMap]) => ({
      topicLabel,
      videos: [...videoMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([videoTitle, clipList]) => ({
          videoTitle,
          clips: [...clipList].sort((x, y) => (y.id ?? 0) - (x.id ?? 0)),
        })),
    }));
  }, [clips]);

  const patchStudentNote = async (clip: SavedClip) => {
    const draft = noteDrafts[clip.id] ?? '';
    setSavingId(clip.id);
    setActionError(null);
    try {
      const res = await fetch(`/api/clips/${clip.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_note: draft }),
      });
      const data = (await res.json()) as SavedClip & { detail?: unknown };
      if (!res.ok) {
        const d = data.detail;
        const msg =
          typeof d === 'string'
            ? d
            : Array.isArray(d)
              ? d.map((x: { msg?: string }) => x.msg ?? '').join(' ')
              : `HTTP ${res.status}`;
        throw new Error(msg || 'Could not save note');
      }
      setClips((prev) => prev.map((c) => (c.id === clip.id ? { ...c, student_note: data.student_note ?? draft } : c)));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not save note');
    } finally {
      setSavingId(null);
    }
  };

  const generateNotes = async (clip: SavedClip) => {
    setGeneratingId(clip.id);
    setActionError(null);
    try {
      const res = await fetch(`/api/clips/${clip.id}/generate-notes`, { method: 'POST' });
      const data = (await res.json()) as SavedClip & { detail?: unknown };
      if (!res.ok) {
        const d = data.detail;
        const msg =
          typeof d === 'string'
            ? d
            : Array.isArray(d)
              ? d.map((x: { msg?: string }) => x.msg ?? '').join(' ')
              : `HTTP ${res.status}`;
        throw new Error(msg || 'Generation failed');
      }
      setClips((prev) =>
        prev.map((c) => (c.id === clip.id ? { ...c, ai_note: data.ai_note ?? null, updated_at: data.updated_at } : c)),
      );
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setGeneratingId(null);
    }
  };

  const deleteClip = async (clip: SavedClip) => {
    if (!window.confirm('Remove this clip from your saved list?')) return;
    setActionError(null);
    try {
      const res = await fetch(`/api/clips/${clip.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = (await res.json()) as { detail?: unknown };
        const d = data.detail;
        const msg =
          typeof d === 'string'
            ? d
            : Array.isArray(d)
              ? d.map((x: { msg?: string }) => x.msg ?? '').join(' ')
              : `HTTP ${res.status}`;
        throw new Error(msg || 'Delete failed');
      }
      setClips((prev) => prev.filter((c) => c.id !== clip.id));
      setNoteDrafts((prev) => {
        const next = { ...prev };
        delete next[clip.id];
        return next;
      });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const notebookPaperSx = {
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
  };

  return (
    <Box sx={{ width: '100%', maxWidth: 920, mx: 'auto' }}>
      <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: '0.12em' }}>
        Clips
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Saved lecture moments
        </Typography>
        <Button variant="outlined" size="small" onClick={() => void loadClips()} disabled={loading}>
          Refresh
        </Button>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Saved from <strong>Prompt → Related moments</strong>. Organized by lecture group and video. Add your own notes or generate
        AI study notes from the transcript.
      </Typography>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : error ? (
        <Typography color="error">{error}</Typography>
      ) : clips.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No clips yet — open Prompt, run a question, then use <strong>Save to Clips</strong> on a moment card.
        </Typography>
      ) : (
        <>
          {actionError ? (
            <Typography variant="body2" color="error" sx={{ mb: 2 }}>
              {actionError}
            </Typography>
          ) : null}
          {grouped.map((topic) => (
            <Accordion
              key={topic.topicLabel}
              defaultExpanded
              disableGutters
              elevation={0}
              sx={{
                mb: 1.5,
                bgcolor: alpha(theme.palette.background.paper, 0.4),
                border: `1px solid ${alpha(theme.palette.divider, 0.12)}`,
                borderRadius: '12px !important',
                '&:before': { display: 'none' },
              }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle1" fontWeight={700}>
                  {topic.topicLabel}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ ml: 1.5, alignSelf: 'center' }}>
                  Lecture group
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0 }}>
                {topic.videos.map((vid) => (
                  <Accordion
                    key={`${topic.topicLabel}-${vid.videoTitle}`}
                    defaultExpanded
                    disableGutters
                    elevation={0}
                    sx={{
                      mb: 1,
                      bgcolor: alpha(theme.palette.background.default, 0.35),
                      border: `1px solid ${alpha(theme.palette.divider, 0.08)}`,
                      borderRadius: '10px !important',
                      '&:before': { display: 'none' },
                    }}
                  >
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Typography variant="body2" fontWeight={600}>
                        {vid.videoTitle}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ ml: 1, alignSelf: 'center' }}>
                        Video · {vid.clips.length} clip{vid.clips.length === 1 ? '' : 's'}
                      </Typography>
                    </AccordionSummary>
                    <AccordionDetails sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {vid.clips.map((clip) => (
                        <Paper key={clip.id} elevation={0} sx={{ ...notebookPaperSx, p: 2 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, mb: 1.5 }}>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
                              <Typography variant="caption" color="text.secondary">
                                Chunk #{clip.chunk_index}
                              </Typography>
                              <Typography
                                variant="caption"
                                sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                                color="text.secondary"
                              >
                                <PlayCircleOutlineIcon sx={{ fontSize: 16 }} />
                                {msToClock(clip.start_ms)}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                                {clip.video_id}
                              </Typography>
                            </Box>
                            <IconButton size="small" aria-label="Delete clip" onClick={() => void deleteClip(clip)} color="error">
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Box>

                          <Box sx={{ position: 'relative', pt: '56.25%', bgcolor: '#000', borderRadius: 1, overflow: 'hidden', mb: 1.5 }}>
                            <Box
                              component="iframe"
                              src={youtubeEmbedSrc(clip.video_id, clip.start_ms)}
                              title={`Clip ${clip.video_id}`}
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

                          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.75 }}>
                            Transcript excerpt
                          </Typography>
                          <Typography variant="body2" sx={{ mb: 1.5, whiteSpace: 'pre-wrap', color: alpha(theme.palette.grey[400], 0.95) }}>
                            {clip.transcript_excerpt}
                          </Typography>

                          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                            Your notes
                          </Typography>
                          <TextField
                            multiline
                            minRows={2}
                            fullWidth
                            size="small"
                            value={noteDrafts[clip.id] ?? ''}
                            onChange={(e) => setNoteDrafts((p) => ({ ...p, [clip.id]: e.target.value }))}
                            placeholder="Jot reminders, equations, or questions…"
                            sx={{ mb: 1 }}
                          />
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
                            <Button
                              size="small"
                              variant="outlined"
                              disabled={savingId === clip.id}
                              onClick={() => void patchStudentNote(clip)}
                            >
                              {savingId === clip.id ? <CircularProgress size={18} /> : 'Save note'}
                            </Button>
                            <Button
                              size="small"
                              variant="contained"
                              color="secondary"
                              startIcon={<AutoAwesomeOutlinedIcon />}
                              disabled={generatingId === clip.id}
                              onClick={() => void generateNotes(clip)}
                            >
                              {generatingId === clip.id ? 'Generating…' : 'Generate study notes'}
                            </Button>
                          </Box>

                          {clip.ai_note ? (
                            <>
                              <Typography
                                variant="subtitle2"
                                sx={{
                                  fontFamily: HAND_NOTEBOOK,
                                  fontWeight: 700,
                                  color: alpha(theme.palette.secondary.light, 0.95),
                                  mb: 0.75,
                                }}
                              >
                                AI study notes
                              </Typography>
                              <HandwrittenStudyNotes markdown={clip.ai_note} theme={theme} />
                            </>
                          ) : null}
                        </Paper>
                      ))}
                    </AccordionDetails>
                  </Accordion>
                ))}
              </AccordionDetails>
            </Accordion>
          ))}
        </>
      )}
    </Box>
  );
}
