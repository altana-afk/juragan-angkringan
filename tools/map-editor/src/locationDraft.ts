/**
 * Data lokasi usaha (src/data/locations.json) untuk peta yang sedang disunting.
 */
import type { LocationEntry } from './locationsFile';

export interface HourRule {
  from: number;
  to: number;
  factor: number;
}

export interface LocationDraft {
  /** Daftarkan peta ini sebagai lokasi yang bisa dipilih pemain. */
  registered: boolean;
  /** Entri asli di locations.json (null jika belum terdaftar). */
  original: LocationEntry | null;
  name: string;
  tagline: string;
  description: string;
  rent: number;
  moveCost: number;
  /** Indeks 0 = Minggu … 6 = Sabtu. */
  weekday: number[];
  typeWeights: Record<string, number>;
  budgetFactor: number;
  lateNight: number;
  patience: number;
  ingredientPriceFactor: number;
  perks: string[];
  hours: HourRule[];
}

export const WEEKDAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

const n = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

export function draftFor(mapName: string, entry: LocationEntry | null): LocationDraft {
  const e = (entry ?? {}) as Record<string, unknown>;
  const weekday = Array.isArray(e.weekday) && e.weekday.length === 7 ? (e.weekday as unknown[]).map((v) => n(v, 1)) : [1, 1, 1, 1, 1, 1, 1];
  return {
    registered: entry !== null,
    original: entry,
    name: typeof e.name === 'string' ? e.name : mapName,
    tagline: typeof e.tagline === 'string' ? e.tagline : '',
    description: typeof e.description === 'string' ? e.description : '',
    rent: n(e.rent, 12000),
    moveCost: n(e.moveCost, 25000),
    weekday,
    typeWeights: { ...((e.typeWeights as Record<string, number> | undefined) ?? {}) },
    budgetFactor: n(e.budgetFactor, 1),
    lateNight: n(e.lateNight, 1),
    patience: n(e.patience, 0),
    ingredientPriceFactor: n(e.ingredientPriceFactor, 1),
    perks: Array.isArray(e.perks) ? (e.perks as unknown[]).filter((p): p is string => typeof p === 'string') : [],
    hours: Array.isArray(e.hours) ? (e.hours as HourRule[]).map((h) => ({ from: n(h.from, 0), to: n(h.to, 0), factor: n(h.factor, 1) })) : [],
  };
}

/** Masalah isian lokasi (kosong = siap disimpan). */
export function locationProblems(d: LocationDraft): string[] {
  if (!d.registered) return [];
  const out: string[] = [];
  if (!d.name.trim()) out.push('Nama lokasi masih kosong.');
  if (!d.tagline.trim()) out.push('Tagline lokasi masih kosong (tampil di kartu pilihan lokasi).');
  if (!Number.isInteger(d.rent) || d.rent < 0) out.push('Sewa per hari harus bilangan bulat ≥ 0.');
  if (!Number.isInteger(d.moveCost) || d.moveCost < 0) out.push('Biaya pindah harus bilangan bulat ≥ 0.');
  if (d.weekday.some((v) => !(v > 0))) out.push('Semua pengali hari harus lebih dari 0.');
  d.hours.forEach((h, i) => {
    if (!(h.to > h.from)) out.push(`Jam khusus #${i + 1}: jam selesai harus setelah jam mulai.`);
    if (!(h.factor > 0)) out.push(`Jam khusus #${i + 1}: pengali harus lebih dari 0.`);
  });
  return out;
}

/** Bentuk entri locations.json. Kunci lama dipertahankan urutannya agar diff git kecil. */
export function buildEntry(d: LocationDraft, mapId: string): LocationEntry {
  const base: Record<string, unknown> = d.original ? structuredClone(d.original) : {};
  const typeWeights: Record<string, number> = {};
  const oldWeights = (base.typeWeights ?? {}) as Record<string, unknown>;
  // Pengali 1 = normal, tidak perlu ditulis (kecuali memang sudah ada di file).
  for (const [k, v] of Object.entries(d.typeWeights)) if (Number.isFinite(v) && (v !== 1 || k in oldWeights)) typeWeights[k] = v;
  const fields: Record<string, unknown> = {
    id: mapId,
    mapId,
    name: d.name.trim(),
    tagline: d.tagline.trim(),
    description: d.description.trim(),
    rent: d.rent,
    weekday: [...d.weekday],
    typeWeights,
    budgetFactor: d.budgetFactor,
    lateNight: d.lateNight,
    perks: d.perks.map((p) => p.trim()).filter(Boolean),
    moveCost: d.moveCost,
    hours: d.hours.map((h) => ({ from: h.from, to: h.to, factor: h.factor })),
    patience: d.patience,
    ingredientPriceFactor: d.ingredientPriceFactor,
  };
  for (const [k, v] of Object.entries(fields)) base[k] = v;
  return base as LocationEntry;
}
