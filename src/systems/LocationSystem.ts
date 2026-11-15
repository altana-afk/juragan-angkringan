import { DEMAND_CONFIG } from '../config/demandConfig';
import type { DailyEvent, GameState } from '../core/GameState';
import type { Catalog } from '../data/catalog';
import { formatRupiah } from '../utils/formatting';
import { rollEvent } from './EventSystem';
import { GameRuleError } from './rules';
import { locationById, type LocationDef } from '../data/locations';
import { eventById } from '../data/events';
import { getCalendarDate } from '../utils/calendar';

export const locationOf = (state: Readonly<GameState>): LocationDef => locationById(state.mapId);

/** 0 = Minggu … 6 = Sabtu */
export function weekdayOf(day: number): number {
  return getCalendarDate(day).weekday;
}

export function isWeekend(day: number): boolean {
  const w = weekdayOf(day);
  return w === 0 || w === 6;
}

/** Pengali kedatangan dari hari dalam seminggu di lokasi ini. */
export function weekdayFactor(location: LocationDef, day: number): number {
  return location.weekday[weekdayOf(day)] ?? 1;
}

export interface DayDemand {
  /** Pengali kedatangan seharian (hari dalam seminggu × event). */
  readonly dayFactor: number;
  /** Pengali kedatangan setelah larut malam. */
  readonly lateNight: number;
  readonly typeWeights: Readonly<Record<string, number>>;
  readonly budgetFactor: number;
  /** Jam ramai/sepi khusus lokasi. */
  readonly hours: LocationDef['hours'];
  /** Tambahan kesabaran (menit). */
  readonly patienceDelta: number;
}

/** Gabungan pengaruh lokasi, hari dalam seminggu, dan event hari ini terhadap permintaan. */
export function dayDemand(state: Readonly<GameState>): DayDemand {
  const loc = locationOf(state);
  const ev = state.event ? eventById(state.event.id).effects : {};
  const typeWeights: Record<string, number> = { ...loc.typeWeights };
  for (const [id, m] of Object.entries(ev.typeWeights ?? {})) typeWeights[id] = (typeWeights[id] ?? 1) * m;
  return {
    dayFactor: weekdayFactor(loc, state.calendar.day) * (ev.arrival ?? 1),
    lateNight: loc.lateNight,
    typeWeights,
    budgetFactor: loc.budgetFactor * (ev.budget ?? 1),
    hours: loc.hours,
    patienceDelta: loc.patience,
  };
}

export const LATE_NIGHT_FROM = DEMAND_CONFIG.lateNightFrom;

/** Label ramai/sepi hari ini untuk UI. */
export function crowdLabel(factor: number): string {
  if (factor >= 1.25) return 'sangat ramai';
  if (factor >= 1.08) return 'ramai';
  if (factor > 0.92) return 'normal';
  if (factor > 0.75) return 'agak sepi';
  return 'sepi';
}

/** Pengali kedatangan dari jam ramai/sepi lokasi pada menit tertentu (menit ≥ 1440 = lewat tengah malam). */
export function hourBoost(hours: LocationDef['hours'] | undefined, minutes: number): number {
  let f = 1;
  for (const h of hours ?? []) if (minutes >= h.from && minutes < h.to) f *= h.factor;
  return f;
}

/** Pengunjung pinjaman: pelanggan tetap sebagian tertinggal saat pindah (loyalitas ×0,6). */
export const MOVE_LOYALTY_KEEP = 0.6;

/**
 * Pindahkan gerobak ke lokasi lain saat persiapan (maksimal sekali sehari).
 * Bayar biaya pindah lokasi tujuan; sebagian pelanggan tetap tertinggal; event hari ini disesuaikan lokasi baru.
 */
export function moveLocation(draft: GameState, catalog: Catalog, locationId: string): LocationDef {
  const dest = locationById(locationId);
  if (draft.phase !== 'persiapan') throw new GameRuleError('wrong-phase', 'Pindah lokasi hanya saat persiapan (sebelum buka).');
  if (draft.mapId === dest.id) throw new GameRuleError('same-location', `Kamu sudah berada di ${dest.name}.`);
  if (draft.lastMoveDay === draft.calendar.day) throw new GameRuleError('moved-today', 'Gerobak sudah dipindah hari ini. Coba lagi besok.');
  if (draft.player.money < dest.moveCost) throw new GameRuleError('money-short', `Biaya pindah ${formatRupiah(dest.moveCost)}, uang kas tidak cukup.`);
  draft.player.money -= dest.moveCost;
  draft.ledger.moveCost += dest.moveCost;
  draft.player.loyalty = Math.round(draft.player.loyalty * MOVE_LOYALTY_KEEP * 10) / 10;
  draft.mapId = dest.id;
  draft.lastMoveDay = draft.calendar.day;
  // Event & pesanan borongan terikat lokasi lama; ganti dengan event lokasi baru.
  draft.event = rollEvent(draft.calendar.day, dest.id, draft.unlockedRecipes, catalog);
  return dest;
}

/** Perkiraan ramai/sepi hari ini di lokasi lain (untuk membandingkan sebelum pindah). */
export function previewDemand(state: Readonly<GameState>, catalog: Catalog, locationId: string): DayDemand & { event: DailyEvent | null } {
  const event = state.mapId === locationId ? state.event : rollEvent(state.calendar.day, locationId, state.unlockedRecipes, catalog);
  const demand = dayDemand({ ...state, mapId: locationId, event });
  return { ...demand, event };
}
