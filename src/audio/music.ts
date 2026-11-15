/**
 * Musik latar prosedural bernuansa gamelan/keroncong malam:
 * tangga nada pelog-ish, pola bonang + gong + bas petik. Data murni (diuji).
 */
export interface Note {
  /** Ketukan mulai dalam satu putaran. */
  beat: number;
  /** Frekuensi Hz. */
  freq: number;
  dur: number;
  voice: 'bonang' | 'gong' | 'bass' | 'pluck';
  vel: number;
}

/** Tangga nada pentatonik "slendro" kira-kira (rasio dari nada dasar). */
export const SCALE = [1, 1.143, 1.306, 1.5, 1.714];
export const BASE_HZ = 220;
export const BEATS_PER_LOOP = 32;
export const BPM = 84;

export function scaleFreq(step: number, base = BASE_HZ): number {
  const n = SCALE.length;
  const octave = Math.floor(step / n);
  const idx = ((step % n) + n) % n;
  return base * (SCALE[idx] as number) * 2 ** octave;
}

/** Pola satu putaran (32 ketukan) — deterministik dari seed bagian. */
export function buildLoop(section: number): Note[] {
  const notes: Note[] = [];
  const melody = [
    [0, 2, 3, 2, 4, 3, 2, 0],
    [2, 3, 5, 4, 3, 2, 3, 1],
    [4, 5, 7, 5, 4, 3, 2, 3],
    [3, 2, 0, 2, 3, 1, 0, -1],
  ];
  for (let bar = 0; bar < 4; bar++) {
    const line = melody[(bar + section) % melody.length] as number[];
    line.forEach((step, i) => {
      const beat = bar * 8 + i;
      notes.push({ beat, freq: scaleFreq(step + 5), dur: 0.9, voice: 'bonang', vel: i % 2 === 0 ? 0.55 : 0.4 });
      if (i % 4 === 2) notes.push({ beat: beat + 0.5, freq: scaleFreq(step + 7), dur: 0.4, voice: 'pluck', vel: 0.25 });
    });
    const root = [0, 3, 2, 4][(bar + section) % 4] as number;
    for (let k = 0; k < 4; k++) notes.push({ beat: bar * 8 + k * 2, freq: scaleFreq(root), dur: 1.6, voice: 'bass', vel: k === 0 ? 0.6 : 0.4 });
  }
  notes.push({ beat: 0, freq: scaleFreq(-5), dur: 6, voice: 'gong', vel: 0.8 });
  notes.push({ beat: 16, freq: scaleFreq(-3), dur: 4, voice: 'gong', vel: 0.5 });
  return notes;
}
