/**
 * Lightweight mic analysis: spectral “fingerprint” vs an enrolled profile so TTS playback
 * picked up by the mic does not trigger interrupts — only a similar live voice does.
 */

const STORAGE_KEY = 'office_hours_voice_profile_v1';
const N_BANDS = 12;

export function loadVoiceProfileFromStorage(): Float32Array | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const s = sessionStorage.getItem(STORAGE_KEY);
    if (!s) return null;
    const arr = JSON.parse(s) as number[];
    if (!Array.isArray(arr) || arr.length !== N_BANDS + 1) return null;
    return Float32Array.from(arr);
  } catch {
    return null;
  }
}

export function saveVoiceProfileToStorage(profile: Float32Array): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(profile)));
}

export function clearVoiceProfileFromStorage(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(STORAGE_KEY);
}

function extractFeaturesRaw(analyser: AnalyserNode, timeBuf: Uint8Array, freqBuf: Uint8Array): {
  raw: Float32Array;
  rms: number;
} {
  analyser.getByteTimeDomainData(timeBuf);
  analyser.getByteFrequencyData(freqBuf);

  let sumSq = 0;
  for (let i = 0; i < timeBuf.length; i++) {
    const v = (timeBuf[i]! - 128) / 128;
    sumSq += v * v;
  }
  const rms = Math.sqrt(sumSq / timeBuf.length);

  const n = freqBuf.length;
  const raw = new Float32Array(N_BANDS + 1);
  raw[0] = Math.log1p(rms * 12);

  for (let b = 0; b < N_BANDS; b++) {
    const start = Math.floor(2 + (b / N_BANDS) * (n - 3));
    const end = Math.floor(2 + ((b + 1) / N_BANDS) * (n - 3));
    let e = 0;
    for (let i = start; i < end; i++) e += freqBuf[i]! * freqBuf[i]!;
    raw[b + 1] = Math.sqrt(e / Math.max(1, end - start)) / 255;
  }
  return { raw, rms };
}

function l2Normalize(v: Float32Array): Float32Array {
  let norm = 0;
  for (let i = 0; i < v.length; i++) norm += v[i]! * v[i]!;
  norm = Math.sqrt(norm) || 1;
  const o = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) o[i] = v[i]! / norm;
  return o;
}

function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}

/** Similarity required to interrupt while assistant audio is playing (speaker bleed is usually lower). */
const SIMILARITY_INTERRUPT_MIN = 0.72;
/** Louder assistant bleed still needs a strong match; slightly lower when model is confident. */
const SIMILARITY_INTERRUPT_LOUD = 0.78;
const RAW_RMS_SPEECH_MIN = 0.012;
/** Enrollment accepts quieter frames than interrupt detection (AGC / distance). */
const RAW_RMS_ENROLL_MIN = 0.006;
const SUSTAINED_FRAMES_NEED = 5;
const TICK_MS = 95;
const INTERRUPT_COOLDOWN_MS = 2000;
const ENROLL_MIN_SAMPLES = 18;

export type StudentVoiceMonitorOptions = {
  assistantActive: () => boolean;
  onStudentSpeech: () => void;
};

export class StudentVoiceMonitor {
  private opts: StudentVoiceMonitorOptions;
  private profile: Float32Array | null;
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private timeBuf: Uint8Array | null = null;
  private freqBuf: Uint8Array | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private sustained = 0;
  private lastInterrupt = 0;
  /** Rolling energy while assistant is speaking (adapts to playback level). */
  private bleedEnergyEma: number | null = null;
  /** Incremented in `stop()` so an in-flight `start()` cannot attach after teardown. */
  private lifecycle = 0;

  constructor(opts: StudentVoiceMonitorOptions) {
    this.opts = opts;
    this.profile = loadVoiceProfileFromStorage();
  }

  hasProfile(): boolean {
    return this.profile !== null && this.profile.length === N_BANDS + 1;
  }

  reloadProfileFromStorage(): void {
    this.profile = loadVoiceProfileFromStorage();
  }

  /** True once the mic graph exists and feature extraction can run (after `start()` resolves). */
  isAudioReady(): boolean {
    return this.analyser != null && this.timeBuf != null && this.freqBuf != null;
  }

  /**
   * Opens the mic and starts polling. Call `stop()` when done.
   * @returns false if permission denied or AudioContext failed.
   */
  async start(): Promise<boolean> {
    this.stop();
    const token = this.lifecycle;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      if (token !== this.lifecycle) {
        stream.getTracks().forEach((t) => t.stop());
        return false;
      }
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.35;
      source.connect(analyser);

      if (token !== this.lifecycle) {
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close().catch(() => {});
        return false;
      }

      this.ctx = ctx;
      this.stream = stream;
      this.source = source;
      this.analyser = analyser;
      this.timeBuf = new Uint8Array(analyser.fftSize);
      this.freqBuf = new Uint8Array(analyser.frequencyBinCount);

      this.timer = window.setInterval(() => this.tick(), TICK_MS);
      await ctx.resume().catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  stop(): void {
    this.lifecycle++;
    if (this.timer != null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    try {
      this.source?.disconnect();
    } catch {
      /* ignore */
    }
    this.source = null;
    this.analyser = null;
    this.timeBuf = null;
    this.freqBuf = null;

    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;

    void this.ctx?.close().catch(() => {});
    this.ctx = null;

    this.sustained = 0;
    this.bleedEnergyEma = null;
  }

  /**
   * Sample the mic for `durationMs` and store a normalized profile (requires `start()` first).
   */
  async enroll(durationMs: number): Promise<boolean> {
    const analyser = this.analyser;
    const timeBuf = this.timeBuf;
    const freqBuf = this.freqBuf;
    if (!analyser || !timeBuf || !freqBuf) return false;

    await this.ctx?.resume().catch(() => {});

    const acc = new Float32Array(N_BANDS + 1);
    let n = 0;
    const end = Date.now() + durationMs;
    while (Date.now() < end) {
      const { raw, rms } = extractFeaturesRaw(analyser, timeBuf, freqBuf);
      const e = raw[0]!;
      if (rms >= RAW_RMS_ENROLL_MIN && e > Math.log1p(RAW_RMS_ENROLL_MIN * 12)) {
        for (let i = 0; i < acc.length; i++) acc[i] += raw[i]!;
        n += 1;
      }
      await new Promise((r) => window.setTimeout(r, 45));
    }
    if (n < ENROLL_MIN_SAMPLES) return false;
    for (let i = 0; i < acc.length; i++) acc[i]! /= n;
    const normalized = l2Normalize(acc);
    this.profile = normalized;
    saveVoiceProfileToStorage(normalized);
    return true;
  }

  private tick(): void {
    const analyser = this.analyser;
    const timeBuf = this.timeBuf;
    const freqBuf = this.freqBuf;
    if (!analyser || !timeBuf || !freqBuf) return;

    const { raw, rms } = extractFeaturesRaw(analyser, timeBuf, freqBuf);

    const assistantOn = this.opts.assistantActive();

    if (!assistantOn) {
      this.sustained = 0;
      this.bleedEnergyEma = null;
      return;
    }

    const energy = raw[0]!;
    if (this.bleedEnergyEma == null) this.bleedEnergyEma = energy;
    else this.bleedEnergyEma = this.bleedEnergyEma * 0.92 + energy * 0.08;

    if (rms < RAW_RMS_SPEECH_MIN) {
      this.sustained = 0;
      return;
    }

    const profile = this.profile;
    if (!profile || profile.length !== N_BANDS + 1) {
      this.sustained = 0;
      return;
    }

    const frameUnit = l2Normalize(raw);
    const similarity = dot(frameUnit, profile);

    const bleedLift = energy / Math.max(0.08, this.bleedEnergyEma);
    const needSim = bleedLift > 1.35 ? SIMILARITY_INTERRUPT_LOUD : SIMILARITY_INTERRUPT_MIN;

    if (similarity >= needSim) {
      this.sustained += 1;
    } else {
      this.sustained = Math.max(0, this.sustained - 2);
    }

    const now = Date.now();
    if (this.sustained >= SUSTAINED_FRAMES_NEED && now - this.lastInterrupt > INTERRUPT_COOLDOWN_MS) {
      this.lastInterrupt = now;
      this.sustained = 0;
      this.opts.onStudentSpeech();
    }
  }
}
