import { mix, type Color } from '../graphics/color';

/** Suasana pencahayaan pada satu titik waktu. */
export interface AmbientState {
  /** Warna yang dikalikan ke seluruh dunia (0xffffff = tanpa perubahan). */
  readonly ambient: Color;
  /** Warna langit / latar di luar peta. */
  readonly sky: Color;
  /** Kekuatan lampu 0..1 (siang redup, malam penuh). */
  readonly lampFactor: number;
}

interface Keyframe extends AmbientState {
  readonly minutes: number;
}

/** Titik-titik kunci suasana dari sore sampai dini hari (menit sejak 00.00). */
export const AMBIENT_KEYFRAMES: readonly Keyframe[] = [
  { minutes: 15 * 60, ambient: 0xffffff, sky: 0x8fb3cf, lampFactor: 0 },
  { minutes: 17 * 60, ambient: 0xffdcb4, sky: 0xd9976a, lampFactor: 0.3 },
  { minutes: 18 * 60, ambient: 0xbf93ad, sky: 0x7a4e78, lampFactor: 0.75 },
  { minutes: 18 * 60 + 45, ambient: 0x7d6fa8, sky: 0x3b2d58, lampFactor: 1 },
  { minutes: 20 * 60, ambient: 0x4a4f8c, sky: 0x1e1b3c, lampFactor: 1 },
  { minutes: 24 * 60, ambient: 0x3a3f7a, sky: 0x15132d, lampFactor: 1 },
  { minutes: 26 * 60, ambient: 0x343873, sky: 0x120f28, lampFactor: 1 },
  { minutes: 29 * 60, ambient: 0x6a6898, sky: 0x2d2a55, lampFactor: 0.9 },
];

/** Interpolasi suasana untuk jam tertentu; di luar rentang memakai keyframe terdekat. */
export function getAmbientAt(minutes: number): AmbientState {
  const frames = AMBIENT_KEYFRAMES;
  const first = frames[0] as Keyframe;
  const last = frames[frames.length - 1] as Keyframe;
  if (!Number.isFinite(minutes) || minutes <= first.minutes) return first;
  if (minutes >= last.minutes) return last;
  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i] as Keyframe;
    const b = frames[i + 1] as Keyframe;
    if (minutes >= a.minutes && minutes <= b.minutes) {
      const t = (minutes - a.minutes) / (b.minutes - a.minutes);
      return {
        ambient: mix(a.ambient, b.ambient, t),
        sky: mix(a.sky, b.sky, t),
        lampFactor: a.lampFactor + (b.lampFactor - a.lampFactor) * t,
      };
    }
  }
  return last;
}
