import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Theme } from '@mui/material/styles';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControl,
  FormControlLabel,
  FormHelperText,
  FormLabel,
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
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import StopCircleOutlinedIcon from '@mui/icons-material/StopCircleOutlined';
import { buildLectureGroups, type VideoItem } from '../lectureGroups';
import { ensureSpeechVoicesLoaded, speakProfessorReply, stopProfessorSpeech } from '../professorSpeech';

type Turn = { role: 'user' | 'assistant'; content: string };

type SearchScope = 'all' | 'single';

type LegacySpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((ev: LegacySpeechRecognitionEvent) => void) | null;
};

type LegacySpeechRecognitionEvent = {
  resultIndex: number;
  results: {
    length: number;
    [i: number]: { [j: number]: { transcript: string } };
  };
};

type OfficeHoursPanelProps = {
  theme: Theme;
};

const OH_SESSION_STORAGE_KEY = 'office_hours_session_key';

function getOrCreateOfficeHoursSessionId(): string {
  if (typeof sessionStorage === 'undefined') return '';
  let id = sessionStorage.getItem(OH_SESSION_STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(OH_SESSION_STORAGE_KEY, id);
  }
  return id;
}

function getSpeechRecognitionCtor(): (new () => LegacySpeechRecognition) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => LegacySpeechRecognition;
    webkitSpeechRecognition?: new () => LegacySpeechRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function OfficeHoursPanel({ theme }: OfficeHoursPanelProps) {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [videosLoading, setVideosLoading] = useState(true);
  const [searchScope, setSearchScope] = useState<SearchScope>('all');
  const [selectedGroupKey, setSelectedGroupKey] = useState('');
  const [selectedPart, setSelectedPart] = useState<'all' | string>('all');
  const [includeBooks, setIncludeBooks] = useState(true);
  const [sessionKey, setSessionKey] = useState<string>(() => getOrCreateOfficeHoursSessionId());
  const [sessionHistoryReady, setSessionHistoryReady] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<LegacySpeechRecognition | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const voiceSupported = typeof window !== 'undefined' && Boolean(getSpeechRecognitionCtor());

  useEffect(() => {
    let cancelled = false;
    fetch('/api/videos')
      .then((r) => r.json())
      .then((data: { videos?: VideoItem[] }) => {
        if (!cancelled) setVideos(Array.isArray(data.videos) ? data.videos : []);
      })
      .catch(() => {
        if (!cancelled) setVideos([]);
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

  const currentGroup = selectedGroupKey ? groupByKey[selectedGroupKey] : undefined;

  useEffect(() => {
    if (!sessionKey) {
      setSessionHistoryReady(true);
      return;
    }
    let cancelled = false;
    fetch(`/api/office-hours/session/${encodeURIComponent(sessionKey)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { turns?: { role: string; content: string }[] } | null) => {
        if (cancelled) return;
        if (data === null) return;
        if (!data.turns?.length) {
          setTurns([]);
          return;
        }
        setTurns(
          data.turns.map((t) => ({
            role: t.role === 'assistant' ? 'assistant' : 'user',
            content: t.content,
          })),
        );
      })
      .finally(() => {
        if (!cancelled) setSessionHistoryReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionKey]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns]);

  useEffect(() => {
    void ensureSpeechVoicesLoaded();
    const onVoices = (): void => {
      void ensureSpeechVoicesLoaded();
    };
    window.speechSynthesis?.addEventListener('voiceschanged', onVoices);
    return () => {
      window.speechSynthesis?.removeEventListener('voiceschanged', onVoices);
      recognitionRef.current?.abort();
      stopProfessorSpeech();
    };
  }, []);

  const transcriptText = useMemo(
    () =>
      turns
        .map((t) => (t.role === 'user' ? `You: ${t.content}` : `Professor: ${t.content}`))
        .join('\n\n'),
    [turns],
  );

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  }, []);

  const startListening = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor || listening || loading) return;
    const rec = new Ctor();
    recognitionRef.current = rec;
    rec.lang = 'en-US';
    rec.continuous = false;
    rec.interimResults = false;
    rec.onstart = () => setListening(true);
    rec.onerror = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    rec.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    rec.onresult = (ev: LegacySpeechRecognitionEvent) => {
      let said = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        said += ev.results[i][0].transcript;
      }
      said = said.trim();
      if (said) setDraft((d) => (d.trim() ? `${d.trim()} ${said}` : said));
    };
    try {
      rec.start();
    } catch {
      setListening(false);
      recognitionRef.current = null;
    }
  }, [listening, loading]);

  const startNewSession = useCallback(async () => {
    stopProfessorSpeech();
    const old = sessionKey;
    if (old) {
      try {
        await fetch(`/api/office-hours/session/${encodeURIComponent(old)}`, { method: 'DELETE' });
      } catch {
        /* ignore network errors */
      }
    }
    const sk = crypto.randomUUID();
    sessionStorage.setItem(OH_SESSION_STORAGE_KEY, sk);
    setSessionKey(sk);
    setTurns([]);
    setDraft('');
    setError(null);
  }, [sessionKey]);

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text || loading) return;
    if (searchScope === 'single' && (!selectedGroupKey || !currentGroup?.videos.length)) {
      setError('Pick a lecture group or switch to “All lectures”.');
      return;
    }
    stopProfessorSpeech();
    setDraft('');
    setError(null);

    const prior = turns.map((t) => ({ role: t.role, content: t.content }));
    const payloadMessages = [...prior, { role: 'user' as const, content: text }];

    let video_id: string | null = null;
    let video_ids: string[] | null = null;
    let lecture_top_k = 10;
    if (searchScope === 'single') {
      const g = groupByKey[selectedGroupKey];
      if (!g?.videos.length) {
        setError('Invalid lecture group.');
        setDraft(text);
        return;
      }
      if (g.videos.length > 1 && selectedPart === 'all') {
        video_ids = g.videos.map((v) => v.video_id);
        video_id = null;
        lecture_top_k = Math.min(50, Math.max(28, 4 * g.videos.length));
      } else {
        const vid = g.videos.length === 1 ? g.videos[0].video_id : selectedPart;
        if (!vid || vid === 'all') {
          setError('Pick one part.');
          setDraft(text);
          return;
        }
        video_id = vid;
        video_ids = null;
      }
    }

    setLoading(true);
    try {
      const res = await fetch('/api/office-hours/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: payloadMessages,
          session_key: sessionKey || undefined,
          video_id,
          video_ids,
          include_books: includeBooks,
          lecture_top_k,
          book_top_k: includeBooks ? 8 : 0,
        }),
      });
      const data = (await res.json()) as { reply?: string; detail?: unknown };
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
      const reply = typeof data.reply === 'string' ? data.reply : '';
      if (!reply.trim()) throw new Error('Empty reply from professor.');
      setTurns((prev) => [
        ...prev,
        { role: 'user', content: text },
        { role: 'assistant', content: reply.trim() },
      ]);
      void speakProfessorReply(reply.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setDraft(text);
    } finally {
      setLoading(false);
    }
  };

  const paperSx = {
    p: 2,
    borderRadius: 2,
    border: `1px solid ${alpha(theme.palette.primary.main, 0.12)}`,
    bgcolor: alpha(theme.palette.background.paper, 0.65),
  };

  const onScopeChange = (_: React.ChangeEvent<HTMLInputElement>, value: string) => {
    if (value === 'all' || value === 'single') setSearchScope(value);
  };

  const sendDisabled =
    loading ||
    !draft.trim() ||
    (searchScope === 'single' &&
      (videosLoading || !selectedGroupKey || !currentGroup?.videos.length));

  return (
    <Box sx={{ width: '100%', maxWidth: 720, mx: 'auto' }}>
      <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: '0.12em' }}>
        Office Hours
      </Typography>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        Talk with the professor
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Pick a lecture scope, ask questions by voice or text, and get grounded explanations that can cite
        transcript timestamps and textbook pages. Conversation for this browser tab is saved on the server so the
        professor can recall themes and follow-ups after you refresh.
      </Typography>

      {sessionKey ? (
        <Chip
          size="small"
          label={sessionHistoryReady ? 'Session memory on (Postgres)' : 'Loading session…'}
          color="primary"
          variant="outlined"
          sx={{ mb: 2 }}
        />
      ) : null}

      <Paper elevation={0} sx={{ ...paperSx, mb: 2 }}>
        <FormControl component="fieldset" sx={{ mb: 2, width: '100%' }}>
          <FormLabel component="legend" sx={{ color: 'text.secondary', mb: 1 }}>
            Lecture scope
          </FormLabel>
          <RadioGroup row value={searchScope} onChange={onScopeChange}>
            <FormControlLabel value="all" control={<Radio color="primary" />} label="All ingested lectures" />
            <FormControlLabel value="single" control={<Radio color="primary" />} label="This lecture group" />
          </RadioGroup>
          <FormHelperText sx={{ mx: 0 }}>
            {videosLoading
              ? 'Loading lecture list…'
              : videos.length > 0
                ? `${videos.length} lecture(s) — same grouping as the Prompt tab (titles after “|”, course prefixes, …).`
                : 'No lectures in the database yet — ingest transcripts first.'}
          </FormHelperText>
        </FormControl>

        {searchScope === 'single' ? (
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
              <FormLabel id="oh-lecture-group-label" sx={{ mb: 0.5 }}>
                Lecture group
              </FormLabel>
              <Select<string>
                labelId="oh-lecture-group-label"
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
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 2,
                        width: '100%',
                        alignItems: 'baseline',
                      }}
                    >
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
              <FormLabel id="oh-lecture-part-label" sx={{ mb: 0.5 }}>
                Part
              </FormLabel>
              <Select<string>
                labelId="oh-lecture-part-label"
                value={
                  currentGroup && currentGroup.videos.length > 1
                    ? selectedPart
                    : currentGroup?.videos[0]?.video_id ?? ''
                }
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
                      All parts — combined ({currentGroup.videos.length} videos)
                    </Typography>
                  </MenuItem>
                ) : null}
                {currentGroup?.videos.map((v) => (
                  <MenuItem key={v.video_id} value={v.video_id}>
                    <Box
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'stretch',
                        gap: 0.25,
                        width: '100%',
                        minWidth: 0,
                      }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'baseline' }}>
                        <Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {v.title || v.video_id}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                          {v.chunk_count} chunks
                        </Typography>
                      </Box>
                      {v.title ? (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontFamily: 'monospace', fontSize: '0.65rem' }}
                        >
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
                    : 'One video or all parts in this group.'}
              </FormHelperText>
            </FormControl>
          </Box>
        ) : null}

        <FormControlLabel
          control={
            <Checkbox
              checked={includeBooks}
              onChange={(e) => setIncludeBooks(e.target.checked)}
              color="primary"
            />
          }
          label="Include textbook excerpts when relevant"
        />
      </Paper>

      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.75 }}>
        Conversation
      </Typography>
      <Paper
        elevation={0}
        sx={{
          ...paperSx,
          mb: 2,
          maxHeight: 220,
          overflow: 'auto',
          fontSize: '0.8125rem',
          lineHeight: 1.55,
          whiteSpace: 'pre-wrap',
          fontFamily: theme.typography.fontFamily,
        }}
      >
        {transcriptText ? (
          transcriptText
        ) : (
          <Typography variant="body2" color="text.secondary">
            Your messages and the professor&apos;s replies appear here.
          </Typography>
        )}
        <div ref={transcriptEndRef} />
      </Paper>

      {error ? (
        <Typography variant="body2" color="error" sx={{ mb: 1 }}>
          {error}
        </Typography>
      ) : null}

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'flex-start', mb: 1 }}>
        <TextField
          fullWidth
          multiline
          minRows={2}
          maxRows={5}
          placeholder="Ask your question…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={loading}
          sx={{ flex: '1 1 280px' }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void sendMessage();
            }
          }}
        />
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
        <Button
          variant="contained"
          onClick={() => void sendMessage()}
          disabled={sendDisabled}
        >
          {loading ? <CircularProgress size={22} color="inherit" /> : 'Send'}
        </Button>
        {voiceSupported ? (
          <>
            <Button
              variant="outlined"
              color={listening ? 'secondary' : 'primary'}
              startIcon={listening ? <MicOffIcon /> : <MicIcon />}
              onClick={() => (listening ? stopListening() : startListening())}
              disabled={loading}
            >
              {listening ? 'Listening…' : 'Speak'}
            </Button>
            <Button variant="text" size="small" onClick={stopListening} disabled={!listening}>
              Stop mic
            </Button>
          </>
        ) : (
          <Typography variant="caption" color="text.secondary">
            Voice input isn&apos;t supported in this browser (try Chrome).
          </Typography>
        )}
        <Button
          variant="outlined"
          color="inherit"
          startIcon={<StopCircleOutlinedIcon />}
          onClick={() => {
            stopProfessorSpeech();
          }}
        >
          Stop speech
        </Button>
        <Button
          variant="text"
          color="inherit"
          onClick={() => void startNewSession()}
          disabled={loading}
        >
          New session
        </Button>
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
        Spoken replies use short phrases and pauses, picking the most natural English voice available (on macOS:
        System Settings → Accessibility → Spoken Content → download enhanced or premium voices).
        {voiceSupported
          ? ' The mic sends your question as text via speech-to-text.'
          : ' For voice questions, try Chrome or Edge where speech recognition is supported.'}
      </Typography>
    </Box>
  );
}
