import raw from './locations.json';

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

export const LOCATIONS: readonly LocationDef[] = parseLocations(raw);
export const DEFAULT_LOCATION = 'main-street';

export function locationById(id: string): LocationDef {
  const l = LOCATIONS.find((x) => x.id === id);
  if (!l) throw new Error(`Lokasi "${id}" tidak dikenal`);
  return l;
}
