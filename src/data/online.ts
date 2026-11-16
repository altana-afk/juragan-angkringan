import modesRaw from './deliveryModes.json';
import eventsRaw from './onlineEvents.json';
import ordersRaw from './onlineOrders.json';
import type { DeliveryMode } from '../core/GameState';
import type { RecipeCategory } from './catalog';

/** Data pesanan online (0.13.0): cara mengantar, profil pembeli, catatan, dan event online. */

export interface DeliveryModeDef {
  readonly id: DeliveryMode;
  readonly name: string;
  readonly icon: string;
  readonly description: string;
  readonly dailyWage: number;
  readonly commission: number;
  readonly keepsFee: boolean;
  readonly batchSize: number;
  readonly waitMinutes: readonly [number, number];
  readonly courierName: string;
}

export interface OnlineRules {
  readonly deliveryFee: number;
  readonly baseDailyLimit: number;
  readonly acceptWindow: number;
  readonly prepMinutes: number;
  readonly minutesPerKm: number;
  readonly stopMinutes: number;
  readonly dueSlack: number;
  readonly rainSlowdown: number;
  readonly hotMinutes: number;
  readonly startRating: number;
  readonly kurirDispatchWait: number;
}

export interface BuyerProfile {
  readonly id: string;
  readonly label: string;
  readonly weight: number;
  readonly items: readonly [number, number];
  readonly qty: readonly [number, number];
  readonly drinkChance: number;
  readonly favorite: readonly RecipeCategory[];
}

export interface OrderNoteDef {
  readonly id: string;
  readonly text: string;
  readonly extraMinutes: number;
  readonly needsDrink: boolean;
  readonly extraItem: string | null;
}

export interface OnlineEventDef {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly description: string;
  readonly chance: number;
  /** Pengali jumlah pesanan masuk. */
  readonly orders: number;
  /** Pengali harga pesanan online (0,85 = diskon 15%). */
  readonly price: number;
  /** Kenaikan rating per pesanan tepat waktu. */
  readonly ratingGain: number;
  readonly minRating: number;
}

function fail(msg: string): never {
  throw new Error(`Data pesanan online tidak valid: ${msg}`);
}

const pair = (v: number[], where: string): readonly [number, number] => {
  if (v.length !== 2 || v[0]! > v[1]!) fail(`${where}: rentang tidak valid`);
  return [v[0]!, v[1]!] as const;
};

export const DELIVERY_MODES: readonly DeliveryModeDef[] = modesRaw.modes.map((m) => {
  if (m.id !== 'kurir' && m.id !== 'ojol') fail(`mode ${m.id}`);
  return { ...m, id: m.id as DeliveryMode, waitMinutes: pair(m.waitMinutes, m.id) };
});

export const ONLINE_RULES: OnlineRules = modesRaw.rules;

export function modeById(id: DeliveryMode): DeliveryModeDef {
  return DELIVERY_MODES.find((m) => m.id === id) ?? fail(`mode ${id}`);
}

export const AREAS: readonly { readonly name: string; readonly km: readonly [number, number] }[] = ordersRaw.areas.map((a) => ({ name: a.name, km: pair(a.km, a.name) }));
export const BUYER_NAMES: readonly string[] = ordersRaw.names;
export const BUYER_PROFILES: readonly BuyerProfile[] = ordersRaw.profiles.map((p) => ({
  ...p,
  items: pair(p.items, p.id),
  qty: pair(p.qty, p.id),
  favorite: p.favorite as RecipeCategory[],
}));
export const ORDER_NOTES: readonly OrderNoteDef[] = ordersRaw.notes.map((n) => {
  const raw = n as { needsDrink?: boolean; extraItem?: string };
  return { id: n.id, text: n.text, extraMinutes: n.extraMinutes, needsDrink: raw.needsDrink === true, extraItem: raw.extraItem ?? null };
});
export const NOTE_CHANCE = ordersRaw.noteChance;

export const ONLINE_EVENTS: readonly OnlineEventDef[] = eventsRaw.events.map((e) => ({ ...e }));
export const ONLINE_EVENT_GAP = eventsRaw.minGapDays;

export function onlineEventById(id: string): OnlineEventDef {
  return ONLINE_EVENTS.find((e) => e.id === id) ?? fail(`event ${id}`);
}
