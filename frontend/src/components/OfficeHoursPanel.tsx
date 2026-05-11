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
import {
  createProfessorSpeechStream,
  ensureSpeechVoicesLoaded,
  isProfessorSpeechSynthBusy,
  stopProfessorSpeech,
} from '../professorSpeech';
import { StudentVoiceMonitor, loadVoiceProfileFromStorage } from '../studentVoiceMonitor';

type Turn = { role: 'user' | 'assistant'; content: string };

function isAbortError(e: unknown): boolean {
  if (e instanceof DOMException && e.name === 'AbortError') return true;
  if (typeof e === 'object' && e !== null && 'name' in e) {
    return (e as { name: string }).name === 'AbortError';
  }
  return false;
}

async function consumeOfficeHoursEventStream(
  res: Response,
  handlers: {
    onDelta: (t: string) => void;
    onDone: () => void;
    onError: (m: string) => void;
  },
): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) {
    handlers.onError('No response body');
    return;
  }
  const dec = new TextDecoder();
  let carry = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      carry += dec.decode(value ?? new Uint8Array(), { stream: !done });
      const blocks = carry.split('\n\n');
      carry = blocks.pop() ?? '';
      for (const block of blocks) {
        for (const line of block.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const jsonStr = trimmed.slice(5).trimStart();
          try {
            const j = JSON.parse(jsonStr) as { text?: string; done?: boolean; error?: string };
            if (typeof j.error === 'string' && j.error) handlers.onError(j.error);
            if (typeof j.text === 'string' && j.text) handlers.onDelta(j.text);
            if (j.done) handlers.onDone();
          } catch {
            /* ignore partial JSON */
          }
        }
      }
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
}

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
    [i: number]: { isFinal?: boolean; [j: number]: { transcript: string } };
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

/** After a final speech-to-text chunk, wait this long with no new finals before sending hands-free. */
const FOLLOW_UP_FINAL_DEBOUNCE_MS = 1100;

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
  const [streamingAssistant, setStreamingAssistant] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<LegacySpeechRecognition | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const speechStreamRef = useRef<ReturnType<typeof createProfessorSpeechStream> | null>(null);
  const loadingRef = useRef(false);
  const voiceMonitorRef = useRef<StudentVoiceMonitor | null>(null);
  const draftRef = useRef('');
  const sendMessageRef = useRef<(text?: string) => Promise<void>>(async () => {});
  const followUpRecRef = useRef<LegacySpeechRecognition | null>(null);
  const followUpAutoSendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listeningRef = useRef(false);
  /** After "Stop speech", hands-free STT stays off until Send, Speak, interrupt, new session, or toggling voice mode. */
  const handsFreeMutedAfterStopRef = useRef(false);

  const [voiceGateEnabled, setVoiceGateEnabled] = useState(false);
  const [voiceProfileReady, setVoiceProfileReady] = useState(() => loadVoiceProfileFromStorage() != null);
  const [voiceEnrolling, setVoiceEnrolling] = useState(false);
  const [voiceMicStarting, setVoiceMicStarting] = useState(false);
  const [voiceMicReady, setVoiceMicReady] = useState(false);
  const [voiceMicError, setVoiceMicError] = useState<string | null>(null);
  const [handsFreeMicHushed, setHandsFreeMicHushed] = useState(false);

  const voiceSupported = typeof window !== 'undefined' && Boolean(getSpeechRecognitionCtor());

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    listeningRef.current = listening;
  }, [listening]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (!voiceGateEnabled) {
      voiceMonitorRef.current?.stop();
      voiceMonitorRef.current = null;
      setVoiceMicStarting(false);
      setVoiceMicReady(false);
      setVoiceMicError(null);
      handsFreeMutedAfterStopRef.current = false;
      setHandsFreeMicHushed(false);
      return;
    }
    let cancelled = false;
    setVoiceMicStarting(true);
    setVoiceMicReady(false);
    const mon = new StudentVoiceMonitor({
      assistantActive: () => loadingRef.current || isProfessorSpeechSynthBusy(),
      onStudentSpeech: () => {
        stopProfessorSpeech();
        speechStreamRef.current?.cancel();
        speechStreamRef.current = null;
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        setStreamingAssistant('');
        setLoading(false);
        handsFreeMutedAfterStopRef.current = false;
        setHandsFreeMicHushed(false);
        if (followUpAutoSendTimerRef.current) {
          window.clearTimeout(followUpAutoSendTimerRef.current);
          followUpAutoSendTimerRef.current = null;
        }
        setDraft('');
        draftRef.current = '';
      },
    });
    void (async () => {
      const ok = await mon.start();
      if (cancelled) {
        mon.stop();
        return;
      }
      setVoiceMicStarting(false);
      if (ok) {
        voiceMonitorRef.current = mon;
        setVoiceMicReady(true);
        setVoiceMicError(null);
      } else {
        voiceMonitorRef.current = null;
        setVoiceMicReady(false);
        setVoiceMicError('Microphone unavailable or permission denied.');
      }
    })();
    return () => {
      cancelled = true;
      mon.stop();
      if (voiceMonitorRef.current === mon) voiceMonitorRef.current = null;
      setVoiceMicStarting(false);
      setVoiceMicReady(false);
    };
  }, [voiceGateEnabled]);

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
  }, [turns, streamingAssistant]);

  useEffect(() => {
    void ensureSpeechVoicesLoaded();
    const onVoices = (): void => {
      void ensureSpeechVoicesLoaded();
    };
    window.speechSynthesis?.addEventListener('voiceschanged', onVoices);
    return () => {
      window.speechSynthesis?.removeEventListener('voiceschanged', onVoices);
      abortControllerRef.current?.abort();
      speechStreamRef.current?.cancel();
      speechStreamRef.current = null;
      recognitionRef.current?.abort();
      followUpRecRef.current?.abort();
      followUpRecRef.current = null;
      if (followUpAutoSendTimerRef.current) {
        window.clearTimeout(followUpAutoSendTimerRef.current);
        followUpAutoSendTimerRef.current = null;
      }
      voiceMonitorRef.current?.stop();
      voiceMonitorRef.current = null;
      stopProfessorSpeech();
    };
  }, []);

  const transcriptText = useMemo(() => {
    const base = turns
      .map((t) => (t.role === 'user' ? `You: ${t.content}` : `Professor: ${t.content}`))
      .join('\n\n');
    if (!streamingAssistant.trim()) return base;
    return base ? `${base}\n\nProfessor: ${streamingAssistant}` : `Professor: ${streamingAssistant}`;
  }, [turns, streamingAssistant]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  }, []);

  const startListening = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor || listening || loading) return;
    handsFreeMutedAfterStopRef.current = false;
    setHandsFreeMicHushed(false);
    followUpRecRef.current?.abort();
    followUpRecRef.current = null;
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
      if (said)
        setDraft((d) => {
          const next = d.trim() ? `${d.trim()} ${said}` : said;
          draftRef.current = next;
          return next;
        });
    };
    try {
      rec.start();
    } catch {
      setListening(false);
      recognitionRef.current = null;
    }
  }, [listening, loading]);

  const runVoiceEnroll = useCallback(async () => {
    const mon = voiceMonitorRef.current;
    if (!mon) {
      setVoiceMicError('Turn on hands-free voice and wait until the mic finishes starting.');
      return;
    }
    const deadline = Date.now() + 5000;
    while (!mon.isAudioReady() && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    if (!mon.isAudioReady()) {
      setVoiceMicError('Microphone is not ready. Toggle hands-free voice off and on, then try again.');
      return;
    }
    followUpRecRef.current?.abort();
    followUpRecRef.current = null;
    if (followUpAutoSendTimerRef.current) {
      window.clearTimeout(followUpAutoSendTimerRef.current);
      followUpAutoSendTimerRef.current = null;
    }
    setVoiceEnrolling(true);
    setVoiceMicError(null);
    const ok = await mon.enroll(3200);
    setVoiceEnrolling(false);
    if (ok) {
      setVoiceProfileReady(true);
      mon.reloadProfileFromStorage();
    } else {
      setVoiceMicError(
        'Could not capture enough speech — speak toward the mic for the full ~3 seconds (mic permission must be allowed).',
      );
    }
    // Re-sync after React effects in this tick (mic `useEffect` can run after microtasks).
    window.setTimeout(() => {
      if (voiceMonitorRef.current === mon && mon.isAudioReady()) {
        setVoiceMicStarting(false);
        setVoiceMicReady(true);
      }
    }, 0);
  }, []);

  const startNewSession = useCallback(async () => {
    stopProfessorSpeech();
    speechStreamRef.current?.cancel();
    speechStreamRef.current = null;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setStreamingAssistant('');
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
    draftRef.current = '';
    setError(null);
    handsFreeMutedAfterStopRef.current = false;
    setHandsFreeMicHushed(false);
    if (followUpAutoSendTimerRef.current) {
      window.clearTimeout(followUpAutoSendTimerRef.current);
      followUpAutoSendTimerRef.current = null;
    }
    followUpRecRef.current?.abort();
    followUpRecRef.current = null;
  }, [sessionKey]);

  const sendMessage = useCallback(async (textArg?: string) => {
    const text = (textArg ?? draftRef.current).trim();
    if (!text || loading) return;
    handsFreeMutedAfterStopRef.current = false;
    setHandsFreeMicHushed(false);
    if (followUpAutoSendTimerRef.current) {
      window.clearTimeout(followUpAutoSendTimerRef.current);
      followUpAutoSendTimerRef.current = null;
    }
    if (searchScope === 'single' && (!selectedGroupKey || !currentGroup?.videos.length)) {
      setError('Pick a lecture group or switch to “All lectures”.');
      return;
    }
    stopProfessorSpeech();
    speechStreamRef.current?.cancel();
    speechStreamRef.current = null;
    setDraft('');
    draftRef.current = '';
    setStreamingAssistant('');
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
        draftRef.current = text;
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
          draftRef.current = text;
          return;
        }
        video_id = vid;
        video_ids = null;
      }
    }

    setLoading(true);
    abortControllerRef.current?.abort();
    const ac = new AbortController();
    abortControllerRef.current = ac;
    let speechStream: ReturnType<typeof createProfessorSpeechStream> | null = null;
    try {
      speechStream = createProfessorSpeechStream();
      speechStreamRef.current = speechStream;
      const res = await fetch('/api/office-hours/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ac.signal,
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
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { detail?: unknown };
        const d = data.detail;
        const msg =
          typeof d === 'string'
            ? d
            : Array.isArray(d)
              ? d.map((x: { msg?: string }) => x.msg ?? '').join(' ')
              : `HTTP ${res.status}`;
        throw new Error(msg || 'Request failed');
      }
      let fullReply = '';
      let streamError: string | null = null;
      await consumeOfficeHoursEventStream(res, {
        onDelta: (t) => {
          fullReply += t;
          setStreamingAssistant((prev) => prev + t);
          speechStreamRef.current?.appendDelta(t);
        },
        onDone: () => {},
        onError: (m) => {
          streamError = m;
        },
      });
      if (streamError) throw new Error(streamError);
      await speechStream.finalize();
      speechStreamRef.current = null;
      const trimmed = fullReply.trim();
      if (!trimmed) throw new Error('Empty reply from professor.');
      setTurns((prev) => [
        ...prev,
        { role: 'user', content: text },
        { role: 'assistant', content: trimmed },
      ]);
      setStreamingAssistant('');
    } catch (e) {
      if (isAbortError(e)) {
        speechStream?.cancel();
        speechStreamRef.current = null;
        setStreamingAssistant('');
        setError(null);
        return;
      }
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setDraft(text);
      draftRef.current = text;
      speechStream?.cancel();
      speechStreamRef.current = null;
      setStreamingAssistant('');
    } finally {
      abortControllerRef.current = null;
      setLoading(false);
    }
  }, [
    loading,
    searchScope,
    selectedGroupKey,
    currentGroup?.videos.length,
    groupByKey,
    selectedPart,
    sessionKey,
    includeBooks,
    turns,
  ]);

  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  useEffect(() => {
    if (!voiceGateEnabled || !voiceSupported) {
      followUpRecRef.current?.abort();
      followUpRecRef.current = null;
      if (followUpAutoSendTimerRef.current) {
        window.clearTimeout(followUpAutoSendTimerRef.current);
        followUpAutoSendTimerRef.current = null;
      }
      return undefined;
    }

    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const assistantBusy = (): boolean => loadingRef.current || isProfessorSpeechSynthBusy();

    const scheduleAutoSend = (): void => {
      if (followUpAutoSendTimerRef.current) {
        window.clearTimeout(followUpAutoSendTimerRef.current);
        followUpAutoSendTimerRef.current = null;
      }
      followUpAutoSendTimerRef.current = window.setTimeout(() => {
        followUpAutoSendTimerRef.current = null;
        if (cancelled || assistantBusy()) return;
        if (handsFreeMutedAfterStopRef.current) return;
        const q = draftRef.current.trim();
        if (!q || loadingRef.current) return;
        void sendMessageRef.current(q);
      }, FOLLOW_UP_FINAL_DEBOUNCE_MS);
    };

    const stopFollowUpRec = (): void => {
      followUpRecRef.current?.abort();
      followUpRecRef.current = null;
      if (followUpAutoSendTimerRef.current) {
        window.clearTimeout(followUpAutoSendTimerRef.current);
        followUpAutoSendTimerRef.current = null;
      }
    };

    const boot = (): void => {
      if (cancelled || assistantBusy() || listeningRef.current || handsFreeMutedAfterStopRef.current) return;
      const Ctor = getSpeechRecognitionCtor();
      if (!Ctor) return;
      const rec = new Ctor();
      followUpRecRef.current = rec;
      rec.lang = 'en-US';
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (ev: LegacySpeechRecognitionEvent) => {
        if (assistantBusy() || listeningRef.current || handsFreeMutedAfterStopRef.current) return;
        let finals = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const r = ev.results[i];
          const tr = r[0]?.transcript ?? '';
          if (r.isFinal) finals += tr;
        }
        const fin = finals.trim();
        if (!fin) return;
        setDraft((d) => {
          const next = d.trim() ? `${d.trim()} ${fin}` : fin;
          draftRef.current = next;
          return next;
        });
        scheduleAutoSend();
      };
      rec.onerror = () => {
        followUpRecRef.current = null;
      };
      rec.onend = () => {
        followUpRecRef.current = null;
        if (!cancelled && !assistantBusy() && !listeningRef.current && !handsFreeMutedAfterStopRef.current) {
          window.setTimeout(boot, 320);
        }
      };
      try {
        rec.start();
      } catch {
        window.setTimeout(boot, 450);
      }
    };

    const sync = (): void => {
      if (cancelled) return;
      if (handsFreeMutedAfterStopRef.current) {
        stopFollowUpRec();
        return;
      }
      if (assistantBusy() || listeningRef.current) {
        stopFollowUpRec();
        return;
      }
      if (!followUpRecRef.current) {
        boot();
      }
    };

    pollTimer = window.setInterval(sync, 260);
    sync();

    return () => {
      cancelled = true;
      if (pollTimer != null) window.clearInterval(pollTimer);
      stopFollowUpRec();
    };
  }, [voiceGateEnabled, voiceSupported]);

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

        <Box sx={{ mt: 2, pt: 2, borderTop: `1px solid ${alpha(theme.palette.divider, 0.12)}` }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={voiceGateEnabled}
                onChange={(e) => setVoiceGateEnabled(e.target.checked)}
                color="primary"
              />
            }
            label="Hands-free voice — interrupt professor and auto-send questions"
          />
          <FormHelperText sx={{ mx: 0, mt: -0.5, mb: 1 }}>
            While the professor is silent, the mic stays open: speak your question, pause about a second, and it sends
            automatically—no keyboard or Send. During playback, enroll your voice once so only you can interrupt (not
            speaker echo).
          </FormHelperText>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
            <Button
              variant="outlined"
              size="small"
              onClick={() => void runVoiceEnroll()}
              disabled={!voiceGateEnabled || voiceMicStarting || !voiceMicReady || voiceEnrolling}
              startIcon={
                voiceMicStarting || voiceEnrolling ? <CircularProgress size={16} color="inherit" /> : undefined
              }
            >
              {voiceMicStarting
                ? 'Starting mic…'
                : voiceEnrolling
                  ? 'Listening…'
                  : 'Enroll my voice (~3s)'}
            </Button>
            <Typography variant="caption" color={voiceProfileReady ? 'success.main' : 'text.secondary'}>
              {voiceProfileReady ? 'Voice profile saved for this tab' : 'Required before interrupts while audio plays'}
            </Typography>
          </Box>
          {voiceMicError ? (
            <Typography variant="caption" color="error" sx={{ display: 'block', mt: 1 }}>
              {voiceMicError}
            </Typography>
          ) : null}
        </Box>
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
            speechStreamRef.current?.cancel();
            speechStreamRef.current = null;
            abortControllerRef.current?.abort();
            abortControllerRef.current = null;
            setStreamingAssistant('');
            setLoading(false);
            setError(null);
            handsFreeMutedAfterStopRef.current = true;
            setHandsFreeMicHushed(true);
            if (followUpAutoSendTimerRef.current) {
              window.clearTimeout(followUpAutoSendTimerRef.current);
              followUpAutoSendTimerRef.current = null;
            }
            followUpRecRef.current?.abort();
            followUpRecRef.current = null;
            setDraft('');
            draftRef.current = '';
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

      {voiceGateEnabled && handsFreeMicHushed ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          Hands-free mic is off after Stop speech. Press Send or Speak to listen again, or turn voice mode off and on.
        </Typography>
      ) : null}

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
        Replies stream from Claude; speech starts as phrases complete while tokens arrive. Voices: macOS System Settings →
        Accessibility → Spoken Content → enhanced or premium voices.
        {voiceGateEnabled && voiceSupported ? (
          <>
            {' '}
            With voice mode on, the browser listens whenever the professor isn&apos;t speaking; pause ~{Math.round(
              FOLLOW_UP_FINAL_DEBOUNCE_MS / 100,
            ) / 10}s after your last words to send hands-free.
          </>
        ) : null}
        {voiceGateEnabled && voiceProfileReady ? (
          <>
            {' '}
            Voice interrupt during playback uses your enrolled profile so speaker bleed doesn&apos;t cut off the
            professor.
          </>
        ) : voiceGateEnabled ? (
          <> Enroll your voice so interrupts ignore professor audio picked up by the mic.</>
        ) : null}
        {voiceSupported ? (
          <> The Speak button is optional push-to-talk if you prefer one-shot capture.</>
        ) : (
          ' For voice questions, try Chrome or Edge where speech recognition is supported.'
        )}
      </Typography>
    </Box>
  );
}
