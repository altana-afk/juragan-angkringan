import { BEATS_PER_LOOP, BPM, buildLoop, type Note } from './music';
import cricketUrl from '../assets/audio/jangkrik.mp3?url';
import { loadAudioSettings, saveAudioSettings, type AudioSettings } from './AudioSettings';

export type SfxName =
  | 'click' | 'coin' | 'cash' | 'cook' | 'upgrade' | 'error' | 'sad' | 'chime' | 'ad' | 'open' | 'bankrupt' | 'unlock';

export const AUDIO_REGISTRY_KEY = 'audio';

export type Ambience = 'night' | 'rain';

/**
 * Suara dibuat prosedural dengan Web Audio: efek suara, musik gamelan malam, dan hujan.
 * Jangkrik memakai sampel rekaman (`assets/audio/jangkrik.mp3`, 3 kicauan berjarak 0,6 detik). Konteks audio baru dibuat setelah gestur pertama pengguna (aturan autoplay browser).
 */
export class AudioSystem {
  settings: AudioSettings = loadAudioSettings();
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private busMusic: GainNode | null = null;
  private busSfx: GainNode | null = null;
  private busAmb: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private cricket: AudioBuffer | null = null;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private musicOn = false;
  private nextLoopAt = 0;
  private section = 0;
  private readonly ambNodes = new Map<Ambience, { gain: GainNode; stop: () => void }>();
  private wantedAmb = new Set<Ambience>();
  private lastPlay = new Map<SfxName, number>();

  /** Panggil dari gestur pengguna pertama. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
      ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    this.busMusic = ctx.createGain();
    this.busSfx = ctx.createGain();
    this.busAmb = ctx.createGain();
    for (const b of [this.busMusic, this.busSfx, this.busAmb]) b.connect(this.master);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    void fetch(cricketUrl)
      .then((r) => r.arrayBuffer())
      .then((b) => ctx.decodeAudioData(b))
      .then((buf) => { this.cricket = buf; })
      .catch(() => { /* tanpa jangkrik jika gagal dimuat */ });
    this.applyVolumes();
    if (this.musicOn) this.startMusicLoop();
    for (const a of this.wantedAmb) this.startAmb(a);
  }

  get ready(): boolean {
    return this.ctx !== null;
  }

  update(patch: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...patch };
    saveAudioSettings(this.settings);
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const s = this.settings;
    this.master.gain.setTargetAtTime(s.muted ? 0 : 1, t, 0.05);
    this.busMusic?.gain.setTargetAtTime(s.music * 0.35, t, 0.05);
    this.busSfx?.gain.setTargetAtTime(s.sfx * 0.6, t, 0.02);
    this.busAmb?.gain.setTargetAtTime(s.ambience * 0.5, t, 0.1);
  }

  // ---------- efek suara ----------
  play(name: SfxName): void {
    const ctx = this.ctx;
    const out = this.busSfx;
    if (!ctx || !out || this.settings.muted || this.settings.sfx <= 0) return;
    const now = ctx.currentTime;
    const last = this.lastPlay.get(name) ?? -1;
    if (now - last < 0.05) return; // hindari suara menumpuk
    this.lastPlay.set(name, now);
    switch (name) {
      case 'click': return this.tone(1400, 0.04, 'square', 0.12, now, { to: 900 });
      case 'coin':
        this.tone(1568, 0.08, 'square', 0.15, now);
        return this.tone(2093, 0.18, 'square', 0.13, now + 0.07);
      case 'cash':
        this.noiseBurst(0.05, 3000, 0.25, now);
        this.tone(2637, 0.25, 'triangle', 0.25, now + 0.04);
        return this.tone(3136, 0.35, 'triangle', 0.18, now + 0.1);
      case 'cook':
        this.noiseBurst(0.9, 5000, 0.18, now, 'highpass');
        return this.tone(180, 0.15, 'sine', 0.15, now, { to: 120 });
      case 'upgrade':
        [0, 4, 7, 12].forEach((s, i) => this.tone(523 * 2 ** (s / 12), 0.3, 'triangle', 0.22, now + i * 0.09));
        return this.noiseBurst(0.4, 8000, 0.06, now + 0.36, 'highpass');
      case 'error':
        this.tone(220, 0.12, 'sawtooth', 0.12, now);
        return this.tone(165, 0.18, 'sawtooth', 0.12, now + 0.1);
      case 'sad': return this.tone(440, 0.35, 'triangle', 0.1, now, { to: 330 });
      case 'chime':
        return [0, 5, 9].forEach((s, i) => this.bell(659 * 2 ** (s / 12), 1.2, 0.2, now + i * 0.18));
      case 'ad': return [0, 7].forEach((s, i) => this.tone(784 * 2 ** (s / 12), 0.15, 'square', 0.12, now + i * 0.1));
      case 'open':
        this.bell(392, 1.6, 0.25, now);
        return this.bell(587, 1.4, 0.18, now + 0.2);
      case 'bankrupt':
        return [0, -3, -6, -12].forEach((s, i) => this.tone(330 * 2 ** (s / 12), 0.4, 'triangle', 0.18, now + i * 0.25));
      case 'unlock':
        return [0, 7, 12].forEach((s, i) => this.bell(880 * 2 ** (s / 12), 0.6, 0.15, now + i * 0.08));
    }
  }

  private tone(freq: number, dur: number, type: OscillatorType, vel: number, at: number, opts: { to?: number; out?: AudioNode } = {}): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, at + dur);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vel, at + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g).connect(opts.out ?? this.busSfx!);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }

  /** Nada logam (bonang/lonceng): sinus + parsial tak harmonis. */
  private bell(freq: number, dur: number, vel: number, at: number, out?: AudioNode): void {
    for (const [ratio, amp] of [[1, 1], [2.76, 0.35], [5.4, 0.12]] as const) {
      this.tone(freq * ratio, dur / ratio ** 0.5, 'sine', vel * amp, at, { out: out ?? this.busSfx! });
    }
  }

  private noiseBurst(dur: number, cutoff: number, vel: number, at: number, kind: BiquadFilterType = 'bandpass', out?: AudioNode): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = kind;
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(out ?? this.busSfx!);
    src.start(at, Math.random());
    src.stop(at + dur + 0.05);
  }

  // ---------- musik ----------
  setMusic(on: boolean): void {
    this.musicOn = on;
    if (!this.ctx) return;
    if (on) this.startMusicLoop();
    else this.stopMusicLoop();
  }

  private startMusicLoop(): void {
    if (this.musicTimer || !this.ctx) return;
    this.nextLoopAt = this.ctx.currentTime + 0.2;
    const loopSec = (BEATS_PER_LOOP * 60) / BPM;
    const schedule = (): void => {
      const ctx = this.ctx;
      if (!ctx) return;
      while (this.nextLoopAt < ctx.currentTime + 1.5) {
        this.scheduleLoop(buildLoop(this.section++ % 4), this.nextLoopAt);
        this.nextLoopAt += loopSec;
      }
    };
    schedule();
    this.musicTimer = setInterval(schedule, 500);
  }

  private stopMusicLoop(): void {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  private scheduleLoop(notes: readonly Note[], start: number): void {
    const beat = 60 / BPM;
    const out = this.busMusic!;
    for (const n of notes) {
      const at = start + n.beat * beat;
      const dur = n.dur * beat;
      switch (n.voice) {
        case 'bonang': this.bell(n.freq, dur * 1.6, n.vel * 0.3, at, out); break;
        case 'gong': this.tone(n.freq, dur, 'sine', n.vel * 0.5, at, { out }); this.tone(n.freq * 1.01, dur, 'sine', n.vel * 0.3, at, { out }); break;
        case 'bass': this.tone(n.freq / 2, dur, 'triangle', n.vel * 0.35, at, { out }); break;
        case 'pluck': this.tone(n.freq, dur, 'square', n.vel * 0.12, at, { out }); break;
      }
    }
  }

  // ---------- suasana ----------
  setAmbience(kind: Ambience, on: boolean): void {
    if (on) this.wantedAmb.add(kind);
    else this.wantedAmb.delete(kind);
    if (!this.ctx) return;
    if (on) this.startAmb(kind);
    else this.stopAmb(kind);
  }

  private startAmb(kind: Ambience): void {
    if (this.ambNodes.has(kind) || !this.ctx) return;
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.5);
    gain.connect(this.busAmb!);
    if (kind === 'rain') {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2200;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 300;
      const g = ctx.createGain();
      g.gain.value = 0.35;
      src.connect(lp).connect(hp).connect(g).connect(gain);
      src.start();
      this.ambNodes.set(kind, { gain, stop: () => src.stop() });
    } else {
      // Jangkrik (sampel rekaman): dua ekor, kiri dekat dan kanan agak jauh, bersahutan.
      // Tiap kicau memilih satu dari 3 rekaman, diputar sedikit lebih lambat (nada lebih rendah, tidak menusuk).
      // Jeda acak 2–5 detik, sesekali hening 9–15 detik supaya nyaman didengar lama.
      const timers = new Set<ReturnType<typeof setTimeout>>();
      const voices = [
        { pan: -0.4, vol: 0.55, rate: 0.9 },
        { pan: 0.45, vol: 0.35, rate: 0.86 },
      ].map((v) => {
        const p = ctx.createStereoPanner();
        p.pan.value = v.pan;
        p.connect(gain);
        return { ...v, out: p };
      });
      const chirp = (v: (typeof voices)[number]): void => {
        if (!this.ctx || !this.cricket) return;
        const src = this.ctx.createBufferSource();
        src.buffer = this.cricket;
        src.playbackRate.value = v.rate + (Math.random() - 0.5) * 0.04;
        const g = this.ctx.createGain();
        g.gain.value = v.vol * (0.8 + Math.random() * 0.2);
        src.connect(g).connect(v.out);
        src.start(this.ctx.currentTime + 0.02, Math.floor(Math.random() * 3) * 0.6, 0.6);
      };
      const schedule = (v: (typeof voices)[number], first: boolean): void => {
        const rest = Math.random() < 0.15 ? 9000 + Math.random() * 6000 : 2000 + Math.random() * 3000;
        const id = setTimeout(() => {
          timers.delete(id);
          chirp(v);
          schedule(v, false);
        }, first ? 500 + Math.random() * 2500 : rest);
        timers.add(id);
      };
      for (const v of voices) schedule(v, true);
      this.ambNodes.set(kind, {
        gain,
        stop: () => {
          for (const id of timers) clearTimeout(id);
          timers.clear();
          for (const v of voices) v.out.disconnect();
        },
      });
    }
  }

  private stopAmb(kind: Ambience): void {
    const n = this.ambNodes.get(kind);
    if (!n || !this.ctx) return;
    this.ambNodes.delete(kind);
    n.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
    setTimeout(() => {
      n.stop();
      n.gain.disconnect();
    }, 1800);
  }
}
