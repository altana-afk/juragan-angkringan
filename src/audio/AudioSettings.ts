/** Pengaturan audio disimpan terpisah dari save permainan (berlaku juga di menu utama). */
export interface AudioSettings {
  music: number;
  sfx: number;
  ambience: number;
  muted: boolean;
}

export const DEFAULT_AUDIO: AudioSettings = { music: 0.5, sfx: 0.8, ambience: 0.6, muted: false };
const KEY = 'juragan-angkringan:audio';

const clamp01 = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);

export function parseAudioSettings(raw: string | null): AudioSettings {
  if (!raw) return { ...DEFAULT_AUDIO };
  try {
    const o = JSON.parse(raw) as Partial<AudioSettings>;
    return {
      music: clamp01(o.music, DEFAULT_AUDIO.music),
      sfx: clamp01(o.sfx, DEFAULT_AUDIO.sfx),
      ambience: clamp01(o.ambience, DEFAULT_AUDIO.ambience),
      muted: typeof o.muted === 'boolean' ? o.muted : false,
    };
  } catch {
    return { ...DEFAULT_AUDIO };
  }
}

export function loadAudioSettings(): AudioSettings {
  try {
    return parseAudioSettings(globalThis.localStorage?.getItem(KEY) ?? null);
  } catch {
    return { ...DEFAULT_AUDIO };
  }
}

export function saveAudioSettings(s: AudioSettings): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(s));
  } catch {
    /* penyimpanan diblokir: pengaturan hanya berlaku sesi ini */
  }
}
