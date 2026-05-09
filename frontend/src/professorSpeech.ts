/**
 * Natural-ish professor TTS using the browser Speech Synthesis API:
 * prefers neural/enhanced voices when the OS exposes them, splits text for breath pauses,
 * and varies rate/pitch slightly between phrases.
 */

let speakGeneration = 0;

export function stopProfessorSpeech(): void {
  speakGeneration += 1;
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
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
      u.rate = 0.88 + Math.random() * 0.08;
      u.pitch = 0.97 + Math.random() * 0.06;
      u.volume = 1;

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
