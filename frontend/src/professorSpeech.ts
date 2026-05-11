/**
 * Natural-ish professor TTS using the browser Speech Synthesis API:
 * prefers neural/enhanced voices when the OS exposes them, splits text for breath pauses,
 * streams phrase-by-phrase during token deltas, and varies rate / pitch / volume (excited vs dramatic).
 */

let speakGeneration = 0;

export function stopProfessorSpeech(): void {
  speakGeneration += 1;
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

/** True while browser TTS has queued or active utterances. */
export function isProfessorSpeechSynthBusy(): boolean {
  if (typeof window === 'undefined' || !window.speechSynthesis) return false;
  const s = window.speechSynthesis;
  return s.speaking || s.pending;
}

export function ensureSpeechVoicesLoaded(): Promise<void> {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    return Promise.resolve();
  }
  if (window.speechSynthesis.getVoices().length > 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    const done = (): void => {
      synth.removeEventListener('voiceschanged', done);
      resolve();
    };
    synth.addEventListener('voiceschanged', done);
    window.setTimeout(done, 900);
  });
}

function preprocessForSpeech(raw: string): string {
  let t = raw
    .replace(/\r\n/g, '\n')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/#{1,6}\s+/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ' ')
    .replace(/[–—]/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();

  t = t.replace(/\s+([.!?])/g, '$1');
  return t;
}

function scoreVoice(v: SpeechSynthesisVoice): number {
  const n = `${v.name} ${v.voiceURI}`.toLowerCase();
  let s = 0;
  if (n.includes('neural') || n.includes('premium') || n.includes('enhanced')) s += 14;
  if (n.includes('natural')) s += 9;
  if (n.includes('google')) s += 7;
  if (n.includes('microsoft')) s += 6;
  if (n.includes('siri')) s += 5;
  if (n.includes('samantha') || n.includes('karen') || n.includes('daniel')) s += 3;
  const lang = v.lang.toLowerCase();
  if (lang.startsWith('en-us')) s += 5;
  else if (lang.startsWith('en-gb')) s += 3;
  else if (lang.startsWith('en')) s += 2;
  if (n.includes('compact') || n.includes('robot') || n.includes('zarvox')) s -= 12;
  return s;
}

function pickPreferredProfessorVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const en = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
  const pool = en.length ? en : voices;
  if (!pool.length) return null;
  return pool.reduce((best, v) => (scoreVoice(v) > scoreVoice(best) ? v : best));
}

function splitIntoSpeakChunks(text: string): string[] {
  const cleaned = preprocessForSpeech(text);
  if (!cleaned) return [];

  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (const sent of sentences) {
    const words = sent.split(/\s+/).filter(Boolean).length;
    const long = sent.length > 130 || words > 26;
    if (long && sent.includes(',')) {
      const parts = sent.split(/,\s+/);
      for (let j = 0; j < parts.length; j++) {
        const p = parts[j].trim();
        if (!p) continue;
        chunks.push(j < parts.length - 1 ? `${p},` : p);
      }
    } else {
      chunks.push(sent);
    }
  }
  return chunks.filter(Boolean);
}

/** 0–3: enthusiasm / energy cues (louder, brighter). */
function excitementLevel(trimmed: string): number {
  let n = 0;
  if (/!!+|\?!/.test(trimmed)) n += 1.35;
  else if (/!\s*$/.test(trimmed)) n += 0.95;
  const lower = trimmed.toLowerCase();
  if (
    /\b(wow|whoa|amazing|incredible|fantastic|excellent|wonderful|brilliant|awesome|spectacular|thrilling|so exciting|that's wild|unbelievable)\b/.test(
      lower,
    )
  ) {
    n += 1.15;
  }
  if (/\b(let's go|here we go|check this out|this is huge)\b/.test(lower)) n += 0.85;
  if (/\b(yes|exactly|precisely|perfect|nice|great job|well done)\b[!.]*\s*$/i.test(trimmed)) n += 0.65;
  return Math.min(3, n);
}

/** 0–3: gravitas / tension cues (deeper pitch, slightly hushed). */
function dramaticLevel(trimmed: string): number {
  let n = 0;
  const lower = trimmed.toLowerCase();
  if (/\.{2,}\s*$/.test(trimmed)) n += 0.95;
  if (
    /\b(however|nevertheless|yet the|crucially|profound|inevitable|inescapable|the stakes|at stake|ominous|tragically|alas)\b/.test(lower)
  ) {
    n += 1.05;
  }
  if (
    /\b(never forget|always remember|the truth is|all along|little did|until suddenly|mark my words|make no mistake)\b/.test(lower)
  ) {
    n += 1;
  }
  if (/\b(catastrophic|devastating|irreversible|fatal|doomed|grave|solemn)\b/.test(lower)) n += 1.1;
  if (/\b(dark secret|the twist|the rub|the catch)\b/.test(lower)) n += 0.85;
  return Math.min(3, n);
}

type ChunkProsodyCtx = { chunkIndex: number; totalChunks?: number };

function utteranceProsody(chunk: string, ctx: ChunkProsodyCtx): { rate: number; pitch: number; volume: number } {
  const trimmed = chunk.trim();
  const len = trimmed.length;
  const words = trimmed.split(/\s+/).filter(Boolean).length;

  let rate = 0.88 + Math.random() * 0.07;
  let pitch = 0.94 + Math.random() * 0.08;
  let volume = 0.9 + Math.random() * 0.08;

  const tc = ctx.totalChunks;
  const u = tc != null && tc > 1 ? ctx.chunkIndex / (tc - 1) : ctx.chunkIndex * 0.31;
  pitch += Math.sin(u * Math.PI) * 0.038;
  volume += Math.cos(u * Math.PI + 0.5) * 0.055;

  const endsQ = /\?\s*$/.test(trimmed);
  const endsComma = /,\s*$/.test(trimmed);
  if (endsQ) {
    pitch += 0.04 + Math.random() * 0.03;
    volume += 0.03 + Math.random() * 0.03;
  }
  if (endsComma) {
    pitch -= 0.015;
    volume -= 0.028 + Math.random() * 0.02;
    rate -= 0.018;
  }
  if (len > 95 || words > 20) {
    rate -= 0.025;
    volume -= 0.02;
  }
  if (len < 36 && words < 9 && !endsQ) {
    rate += 0.015;
    volume += 0.018;
  }

  const exc = excitementLevel(trimmed);
  const drm = dramaticLevel(trimmed);

  if (exc >= drm + 0.35) {
    const k = Math.min(exc, 2.75);
    volume += 0.06 + k * 0.045;
    pitch += 0.022 + k * 0.025;
    rate += 0.012 + k * 0.014;
  } else if (drm >= exc + 0.35) {
    const k = Math.min(drm, 2.75);
    pitch -= 0.075 + k * 0.045;
    volume -= 0.035 + k * 0.028;
    rate -= 0.014 + k * 0.012;
  } else {
    volume += exc * 0.032 - drm * 0.022;
    pitch += exc * 0.018 - drm * 0.048;
    rate += exc * 0.008 - drm * 0.01;
  }

  rate = Math.min(1.12, Math.max(0.76, rate));
  pitch = Math.min(1.12, Math.max(0.74, pitch));
  volume = Math.min(1, Math.max(0.72, volume));

  return { rate, pitch, volume };
}

function pauseMsAfterChunk(chunk: string, isLast: boolean): number {
  if (isLast) return 0;
  const endsQ = /\?\s*$/.test(chunk);
  const endsExc = /!\s*$/.test(chunk);
  const endsComma = /,\s*$/.test(chunk);
  const short = chunk.length < 24;
  let base: number;
  if (endsComma) base = 140 + Math.floor(Math.random() * 90);
  else if (endsQ) base = 340 + Math.floor(Math.random() * 160);
  else if (endsExc) base = 280 + Math.floor(Math.random() * 120);
  else if (short) base = 100 + Math.floor(Math.random() * 80);
  else base = 240 + Math.floor(Math.random() * 140);
  return base;
}

export async function speakProfessorReply(text: string): Promise<void> {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    return;
  }

  window.speechSynthesis.cancel();
  const gen = speakGeneration;

  await ensureSpeechVoicesLoaded();
  const chunks = splitIntoSpeakChunks(text);
  if (!chunks.length) return;

  const voice = pickPreferredProfessorVoice(window.speechSynthesis.getVoices());

  return new Promise((resolve) => {
    let i = 0;

    const speakNext = (): void => {
      if (gen !== speakGeneration) {
        resolve();
        return;
      }
      if (i >= chunks.length) {
        resolve();
        return;
      }

      const chunk = chunks[i];
      const u = new SpeechSynthesisUtterance(chunk);
      if (voice) u.voice = voice;
      const { rate, pitch, volume } = utteranceProsody(chunk, {
        chunkIndex: i,
        totalChunks: chunks.length > 1 ? chunks.length : undefined,
      });
      u.rate = rate;
      u.pitch = pitch;
      u.volume = volume;

      u.onend = (): void => {
        if (gen !== speakGeneration) {
          resolve();
          return;
        }
        const finishedIdx = i;
        i += 1;
        if (i >= chunks.length) {
          resolve();
          return;
        }
        const delay = pauseMsAfterChunk(chunks[finishedIdx] ?? '', false);
        window.setTimeout(speakNext, delay);
      };

      u.onerror = (): void => {
        i += 1;
        window.setTimeout(speakNext, 40);
      };

      window.speechSynthesis.speak(u);
    };

    speakNext();
  });
}

function drainSpeakablePhrases(buffer: string): { phrases: string[]; rest: string } {
  const phrases: string[] = [];
  let rest = buffer;
  while (rest.length > 0) {
    const m = rest.match(/^([\s\S]{6,}?[.!?])(\s+|$)/);
    if (m) {
      phrases.push(m[1].trim());
      rest = rest.slice(m[0].length);
      continue;
    }
    if (rest.length >= 130) {
      const cut = rest.lastIndexOf(',', 110);
      if (cut > 35) {
        phrases.push(rest.slice(0, cut + 1).trim());
        rest = rest.slice(cut + 1).trimStart();
        continue;
      }
      const sp = rest.indexOf(' ', 95);
      if (sp > 40) {
        phrases.push(rest.slice(0, sp).trim());
        rest = rest.slice(sp + 1).trimStart();
        continue;
      }
    }
    break;
  }
  return { phrases, rest };
}

function waitForSpeechSyntheticIdle(gen: number): Promise<void> {
  return new Promise((resolve) => {
    const tick = (): void => {
      if (typeof window === 'undefined' || !window.speechSynthesis) {
        resolve();
        return;
      }
      if (gen !== speakGeneration) {
        resolve();
        return;
      }
      if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
        resolve();
        return;
      }
      window.setTimeout(tick, 72);
    };
    tick();
  });
}

export type ProfessorSpeechStreamHandle = {
  appendDelta(delta: string): void;
  finalize(): Promise<void>;
  cancel(): void;
};

/** Stream tokens into speech as phrases complete; call `finalize()` when the model stream ends. */
export function createProfessorSpeechStream(): ProfessorSpeechStreamHandle {
  stopProfessorSpeech();
  const gen = speakGeneration;

  let buffer = '';
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let streamChunkOrdinal = 0;

  const enqueuePhrases = (rawPhrases: string[]): void => {
    if (!window.speechSynthesis || gen !== speakGeneration || rawPhrases.length === 0) return;
    void ensureSpeechVoicesLoaded().then(() => {
      const voice = pickPreferredProfessorVoice(window.speechSynthesis.getVoices());
      const flat: string[] = [];
      for (const raw of rawPhrases) {
        const cleaned = preprocessForSpeech(raw);
        if (!cleaned || gen !== speakGeneration) continue;
        flat.push(...splitIntoSpeakChunks(cleaned));
      }
      const total = flat.length;
      for (let si = 0; si < flat.length; si++) {
        const chunk = flat[si];
        if (!chunk || gen !== speakGeneration) continue;
        const u = new SpeechSynthesisUtterance(chunk);
        if (voice) u.voice = voice;
        const prosody = utteranceProsody(chunk, {
          chunkIndex: total > 1 ? si : streamChunkOrdinal + si,
          totalChunks: total > 1 ? total : undefined,
        });
        u.rate = prosody.rate;
        u.pitch = prosody.pitch;
        u.volume = prosody.volume;
        window.speechSynthesis.speak(u);
      }
      streamChunkOrdinal += total;
    });
  };

  const flushBuffer = (): void => {
    flushTimer = null;
    if (gen !== speakGeneration) return;
    const { phrases, rest } = drainSpeakablePhrases(buffer);
    buffer = rest;
    if (phrases.length) enqueuePhrases(phrases);
  };

  return {
    appendDelta(delta: string): void {
      if (gen !== speakGeneration || !delta) return;
      buffer += delta;
      if (flushTimer != null) window.clearTimeout(flushTimer);
      flushBuffer();
      flushTimer = window.setTimeout(flushBuffer, 48);
    },
    async finalize(): Promise<void> {
      if (flushTimer != null) {
        window.clearTimeout(flushTimer);
        flushTimer = null;
      }
      flushBuffer();
      if (buffer.trim() && gen === speakGeneration) {
        enqueuePhrases([buffer]);
        buffer = '';
      }
      await waitForSpeechSyntheticIdle(gen);
    },
    cancel(): void {
      if (flushTimer != null) {
        window.clearTimeout(flushTimer);
        flushTimer = null;
      }
      buffer = '';
      stopProfessorSpeech();
    },
  };
}
