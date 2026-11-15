import raw from './events.json';

export interface EventEffects {
  readonly arrival?: number;
  readonly typeWeights?: Readonly<Record<string, number>>;
  readonly budget?: number;
  readonly ingredientPrices?: Readonly<Record<string, number>>;
  readonly bulkOrder?: { readonly min: number; readonly max: number; readonly priceFactor: number; readonly category?: 'makanan' | 'minuman' };
  /** Biaya tambahan sekali (Rp) yang ditagih saat tutup. */
  readonly fee?: number;
  readonly review?: { readonly threshold: number; readonly good: number; readonly bad: number };
}

export interface EventDef {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly description: string;
  readonly effects: EventEffects;
  /** Hanya muncul di lokasi tertentu (kosong = semua). */
  readonly maps?: readonly string[];
  /** Hanya pada tanggal tertentu (mis. tanggal gajian). */
  readonly daysOfMonth?: readonly number[];
}

export function parseEvents(data: unknown): { chance: number; events: EventDef[] } {
  const d = data as { chance?: unknown; events?: unknown };
  if (typeof d.chance !== 'number' || d.chance < 0 || d.chance > 1) throw new Error('[Data event] chance harus 0–1');
  if (!Array.isArray(d.events)) throw new Error('[Data event] events harus array');
  const ids = new Set<string>();
  for (const e of d.events as EventDef[]) {
    if (typeof e.id !== 'string' || ids.has(e.id)) throw new Error(`[Data event] id tidak valid: ${String(e.id)}`);
    ids.add(e.id);
    const b = e.effects.bulkOrder;
    if (b && (b.min < 1 || b.max < b.min)) throw new Error(`[Data event] ${e.id}: bulkOrder tidak valid`);
  }
  return { chance: d.chance, events: d.events as EventDef[] };
}

const parsed = parseEvents(raw);
export const EVENT_CHANCE = parsed.chance;
export const EVENTS: readonly EventDef[] = parsed.events;

export function eventById(id: string): EventDef {
  const e = EVENTS.find((x) => x.id === id);
  if (!e) throw new Error(`Event "${id}" tidak dikenal`);
  return e;
}
