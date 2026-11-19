import type { FameTier } from '../data/challenges';
import type { SeededRandom } from '../utils/random';

/**
 * Aturan minigame tantangan kampung, tanpa DOM supaya bisa diuji.
 * 0.18.1: Ikuti iramanya (ODGJ, cara halus), Telepon berantai (ODGJ, bantuan warga),
 * Kumpulkan warga (ormas). Semua 10–20 detik dan cukup diketuk.
 */

// ---------- ODGJ: "Ikuti iramanya" ----------

/**
 * Pola senandung: ketukan (dalam satuan ketukan dasar) dan nada (Hz) tiap not.
 * Iramanya mengikuti lagu dolanan yang akrab, disederhanakan.
 */
export interface HumPattern {
  readonly id: string;
  readonly name: string;
  readonly beats: readonly number[];
  readonly pitches: readonly number[];
}

export const HUM_PATTERNS: readonly HumPattern[] = [
  // "Gundul-gundul pacul" (disederhanakan)
  { id: 'gundul', name: 'Gundul-gundul pacul', beats: [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14], pitches: [392, 440, 392, 440, 523, 494, 440, 392, 440, 392, 440, 523, 494, 392] },
  // "Lir-ilir" (disederhanakan)
  { id: 'lirilir', name: 'Lir-ilir', beats: [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 12, 13, 14], pitches: [330, 392, 392, 440, 392, 330, 392, 440, 523, 440, 392, 330, 294] },
  // "Cublak-cublak suweng" (disederhanakan)
  { id: 'cublak', name: 'Cublak-cublak suweng', beats: [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 14], pitches: [392, 392, 330, 392, 440, 392, 330, 294, 330, 392, 330, 294, 262] },
];

export interface RhythmNote {
  /** Waktu not masuk lingkaran (detik sejak lagu mulai). */
  readonly time: number;
  readonly pitch: number;
}

export interface RhythmSetup {
  readonly pattern: HumPattern;
  readonly notes: readonly RhythmNote[];
  /** Detik per ketukan dasar. */
  readonly beat: number;
  /** Jeda sebelum not pertama (detik). */
  readonly lead: number;
  /** Batas "tepat" dan "cukup" (detik). */
  readonly perfect: number;
  readonly good: number;
  /** Meter Tenang: awal, tambahan per ketukan tepat/cukup, pengurangan per meleset. */
  readonly start: number;
  readonly perfectGain: number;
  readonly goodGain: number;
  readonly missLoss: number;
  /** Lama lagu sampai selesai (detik). */
  readonly duration: number;
}

const RHYTHM_BY_TIER: Record<FameTier, { beat: number; fakePauses: number; gain: number }> = {
  rendah: { beat: 0.8, fakePauses: 0, gain: 1 },
  sedang: { beat: 0.66, fakePauses: 0, gain: 0.9 },
  tinggi: { beat: 0.56, fakePauses: 2, gain: 0.8 },
};

export function rhythmSetup(rng: SeededRandom, tier: FameTier): RhythmSetup {
  const t = RHYTHM_BY_TIER[tier];
  const pattern = rng.pick(HUM_PATTERNS);
  const lead = 1.6;
  // Level tinggi: sesekali lagu "berhenti sebentar" (setengah ketukan) sebelum not berikutnya.
  const pauses = new Set<number>();
  for (let i = 0; i < t.fakePauses; i++) pauses.add(rng.int(3, pattern.beats.length - 2));
  let shift = 0;
  const notes = pattern.beats.map((b, i) => {
    if (pauses.has(i)) shift += 0.5;
    return { time: lead + (b + shift) * t.beat, pitch: pattern.pitches[i] ?? 392 };
  });
  const last = notes[notes.length - 1]?.time ?? lead;
  return {
    pattern,
    notes,
    beat: t.beat,
    lead,
    perfect: 0.09,
    good: 0.16,
    start: 20,
    perfectGain: Math.round(11 * t.gain),
    goodGain: Math.round(7 * t.gain),
    missLoss: 6,
    duration: last + 0.8,
  };
}

export type HitGrade = 'tepat' | 'cukup' | 'meleset';

/** Nilai satu ketukan terhadap not terdekat yang belum dinilai. */
export function gradeTap(delta: number, setup: Pick<RhythmSetup, 'perfect' | 'good'>): HitGrade {
  const d = Math.abs(delta);
  if (d <= setup.perfect) return 'tepat';
  if (d <= setup.good) return 'cukup';
  return 'meleset';
}

export function meterAfter(meter: number, grade: HitGrade, setup: Pick<RhythmSetup, 'perfectGain' | 'goodGain' | 'missLoss'>): number {
  const next = grade === 'tepat' ? meter + setup.perfectGain : grade === 'cukup' ? meter + setup.goodGain : meter - setup.missLoss;
  return Math.max(0, Math.min(100, next));
}

// ---------- ODGJ: "Telepon berantai" ----------

export type ContactStatus = 'online' | 'sibuk' | 'jalan';

export interface PhoneContact {
  readonly id: string;
  readonly name: string;
  /** Peluang online tiap pergantian status (dipengaruhi hubungan cerita). */
  readonly onlineChance: number;
}

export interface PhoneSetup {
  readonly seconds: number;
  /** Jumlah orang yang harus tersambung. */
  readonly need: number;
  /** Selang pergantian status (detik). */
  readonly flip: number;
  /** Lama berdering sebelum tersambung (detik); mengetuk kontak sibuk = jeda. */
  readonly ring: number;
  readonly busyPenalty: number;
}

const PHONE_BY_TIER: Record<FameTier, PhoneSetup> = {
  rendah: { seconds: 12, need: 3, flip: 1.6, ring: 0.6, busyPenalty: 1 },
  sedang: { seconds: 12, need: 3, flip: 1.2, ring: 0.8, busyPenalty: 1.4 },
  tinggi: { seconds: 12, need: 4, flip: 0.95, ring: 0.9, busyPenalty: 1.8 },
};

export const phoneSetup = (tier: FameTier): PhoneSetup => PHONE_BY_TIER[tier];

/** Peluang kontak online: dasar 35%, +12% per tahap hubungan (maks. 0–3). */
export function contactOnlineChance(stage: number): number {
  return Math.min(0.8, 0.35 + 0.12 * Math.max(0, Math.min(3, stage)));
}

export function nextStatus(rng: SeededRandom, contact: PhoneContact): ContactStatus {
  const r = rng.next();
  if (r < contact.onlineChance) return 'online';
  return r < contact.onlineChance + (1 - contact.onlineChance) / 2 ? 'sibuk' : 'jalan';
}

// ---------- Ormas: "Kumpulkan warga" ----------

export interface GatherSetup {
  readonly seconds: number;
  /** Warga yang harus berdiri di belakangmu. */
  readonly need: number;
  /** Lama tangan terangkat (detik). */
  readonly show: number;
  /** Jeda antar tangan (detik). */
  readonly gap: number;
  /** Peluang tangan merah (anggota ormas yang menyamar). */
  readonly fake: number;
}

const GATHER_BY_TIER: Record<FameTier, GatherSetup> = {
  rendah: { seconds: 10, need: 5, show: 1.5, gap: 0.55, fake: 0 },
  sedang: { seconds: 10, need: 5, show: 1.1, gap: 0.45, fake: 0.12 },
  tinggi: { seconds: 10, need: 6, show: 0.76, gap: 0.38, fake: 0.22 },
};

export const gatherSetup = (tier: FameTier): GatherSetup => GATHER_BY_TIER[tier];

/** Pelanggan bernama dengan hubungan tahap 2+ langsung berdiri membela (tanpa diketuk). */
export function autoSupporters(stages: readonly number[]): number {
  return stages.filter((s) => s >= 2).length;
}

/** Menekan tangan: warga asli +1, tangan merah −1 (tidak di bawah 0). */
export function gatherAfter(count: number, fake: boolean): number {
  return fake ? Math.max(0, count - 1) : count + 1;
}

// ---------- Kenalan: "Pesanan kesukaan" ----------

export interface FavoriteRound {
  readonly hint: string;
  readonly answer: string;
  readonly options: readonly string[];
}

/** Satu tebakan: petunjuk dari kenalan + 3 kartu menu (1 benar, 2 pengecoh dari menu terbuka). */
export function favoriteRound(rng: SeededRandom, hints: Readonly<Record<string, string>>, unlocked: readonly string[]): FavoriteRound | null {
  const answers = Object.keys(hints).filter((id) => unlocked.includes(id));
  if (!answers.length) return null;
  const answer = rng.pick(answers);
  const others = unlocked.filter((id) => id !== answer && !(id in hints));
  const decoys: string[] = [];
  while (decoys.length < 2 && others.length) decoys.push(others.splice(rng.int(0, others.length - 1), 1)[0] as string);
  if (decoys.length < 2) return null;
  const options = [answer, ...decoys];
  for (let i = options.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [options[i], options[j]] = [options[j] as string, options[i] as string];
  }
  return { hint: hints[answer] as string, answer, options };
}
