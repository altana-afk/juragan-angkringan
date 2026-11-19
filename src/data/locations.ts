import rawBase from './locations.json';
import rawEn from '../i18n/en/data/locations.json';
import { getMap } from '../world/maps';
import { localizeData } from '../i18n/i18n';

// Teks data dalam bahasa aktif (tumpangan terjemahan Inggris di src/i18n/en/data/).
const raw = localizeData(rawBase, rawEn);

/** Lokasi usaha: peta + sifat gameplay yang membuatnya unik. */
export interface LocationDef {
  readonly id: string;
  readonly mapId: string;
  readonly name: string;
  readonly tagline: string;
  readonly description: string;
  /** Biaya operasional/sewa per hari. */
  readonly rent: number;
  /** Pengali kedatangan per hari dalam seminggu, indeks 0 = Minggu … 6 = Sabtu. */
  readonly weekday: readonly number[];
  /** Pengali bobot tipe pelanggan (id tipe → pengali). */
  readonly typeWeights: Readonly<Record<string, number>>;
  readonly budgetFactor: number;
  /** Pengali kedatangan setelah jam larut malam (22.00). */
  readonly lateNight: number;
  readonly perks: readonly string[];
  /** Biaya memindahkan gerobak ke lokasi ini. */
  readonly moveCost: number;
  /** Jam ramai/sepi khusus lokasi: menit [from, to) → pengali kedatangan. */
  readonly hours: readonly { readonly from: number; readonly to: number; readonly factor: number }[];
  /** Tambahan kesabaran pelanggan (menit; negatif = buru-buru). */
  readonly patience: number;
  /** Pengali harga bahan baku di lokasi ini. */
  readonly ingredientPriceFactor: number;
}

export function parseLocations(data: unknown): LocationDef[] {
  const list = (data as { locations?: unknown }).locations;
  if (!Array.isArray(list) || list.length === 0) throw new Error('[Data lokasi] locations.json kosong');
  const ids = new Set<string>();
  return list.map((l: LocationDef, i) => {
    if (typeof l.id !== 'string' || ids.has(l.id)) throw new Error(`[Data lokasi] id #${i} tidak valid`);
    ids.add(l.id);
    if (!Array.isArray(l.weekday) || l.weekday.length !== 7 || l.weekday.some((n) => typeof n !== 'number' || n <= 0)) {
      throw new Error(`[Data lokasi] ${l.id}: weekday harus 7 angka positif`);
    }
    if (!Number.isInteger(l.rent) || l.rent < 0) throw new Error(`[Data lokasi] ${l.id}: rent tidak valid`);
    return l;
  });
}

/** Semua lokasi di locations.json, termasuk yang petanya belum selesai dibuat di editor peta. */
export const ALL_LOCATIONS: readonly LocationDef[] = parseLocations(raw);

/**
 * Peta siap dimainkan: punya gerobak dan jalur pelanggan (kursi, antrean, titik datang).
 * Lokasi baru dari editor peta yang belum lengkap disembunyikan dari permainan sampai petanya selesai.
 */
function playable(l: LocationDef): boolean {
  try {
    const map = getMap(l.mapId);
    const ok = map.customers !== null && map.customers.seats.length > 0 && map.objects.some((o) => o.id === 'cart');
    if (!ok && import.meta.env?.DEV) console.warn(`[Lokasi] "${l.id}" disembunyikan: peta belum punya gerobak (cart) dan jalur pelanggan.`);
    return ok;
  } catch {
    return false;
  }
}

/** Lokasi yang bisa dipilih pemain. */
export const LOCATIONS: readonly LocationDef[] = ALL_LOCATIONS.filter(playable);
export const DEFAULT_LOCATION = 'main-street';

export function locationById(id: string): LocationDef {
  const l = ALL_LOCATIONS.find((x) => x.id === id);
  if (!l) throw new Error(`Lokasi "${id}" tidak dikenal`);
  return l;
}
