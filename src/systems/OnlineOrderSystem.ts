import { branchOption, dispatchFromBranch, type OnlineSource } from './BranchOnlineSystem';
import { GAME_CONFIG } from '../config/gameConfig';
import type { GameState, OnlineOrder, OnlineOrderItem } from '../core/GameState';
import { emptyOnlineDay } from '../core/GameState';
import type { Catalog, RecipeDef } from '../data/catalog';
import { AREAS, BUYER_NAMES, BUYER_PROFILES, NOTE_CHANCE, ORDER_NOTES, ONLINE_RULES, modeById } from '../data/online';
import { formatRupiah } from '../utils/formatting';
import { SeededRandom } from '../utils/random';
import { hotMinutes, planTrip, shouldDispatch, travelFactor, travelMinutes } from './CourierSystem';
import { consumeStock, totalQty } from './InventorySystem';
import { activeOnlineEvent } from './OnlineEventSystem';
import { clampPopularity } from './PopularitySystem';
import { onlinePriceOf, priceAppealFactor } from './PricingSystem';
import { GameRuleError } from './rules';
import { effectsOf } from './UpgradeSystem';
import { tr } from '../i18n/i18n';

/**
 * Pesanan online (0.13.0): pesanan masuk saat berjualan, bisa diterima atau ditolak.
 * Pesanan memakai stok produk FEFO yang sama dengan pembeli di tempat — stok diambil saat
 * dijemput (ojol) atau saat kurir berangkat, jadi kalau stok keburu habis pesanan batal & rating turun.
 * Semua menit adalah menit permainan sesi hari itu.
 */

export const RATING_MIN = 0;
export const RATING_MAX = 100;
/** Tidak ada pesanan baru menjelang tutup. */
export const LAST_ORDER_BEFORE_CLOSE = 30;
/** Berapa pesanan boleh menunggu jawaban bersamaan. */
export const MAX_PENDING = 3;

// ---------- angka dasar ----------

/** Batas pesanan online yang bisa diterima per hari (5 + upgrade sistem pemesanan). */
export function dailyLimit(state: Readonly<GameState>): number {
  return ONLINE_RULES.baseDailyLimit + effectsOf(state).onlineLimit;
}

/** Pesanan yang sudah diterima hari ini (termasuk yang selesai/batal setelah diterima). */
export function acceptedToday(state: Readonly<GameState>): number {
  return state.online.today.accepted;
}

export function pendingOrders(state: Readonly<GameState>): OnlineOrder[] {
  return state.online.orders.filter((o) => o.status === 'menunggu');
}

export function activeOrders(state: Readonly<GameState>): OnlineOrder[] {
  return state.online.orders.filter((o) => o.status === 'diterima' || o.status === 'diantar');
}

/** Rating 0–100 ditampilkan sebagai bintang 1,0–5,0. */
export function ratingStars(rating: number): number {
  return Math.round((1 + (rating / 100) * 4) * 10) / 10;
}

/** Rata-rata pesanan masuk per hari (sebelum batas harian). */
export function expectedOrders(state: Readonly<GameState>, catalog?: Catalog): number {
  const ev = activeOnlineEvent(state);
  const price = catalog ? onlinePriceAppeal(state, catalog) : 1;
  const ratingFactor = 0.6 + state.online.rating / 125;
  const rain = state.weather === 'hujan' ? 1.3 : 1;
  return (3 + state.player.popularity / 15) * ratingFactor * rain * (ev?.orders ?? 1) * price;
}

/** Minat pembeli online dari rata-rata rasio harga online terhadap harga wajar menu yang terbuka. */
export function onlinePriceAppeal(state: Readonly<GameState>, catalog: Catalog): number {
  const open = catalog.recipes.filter((r) => state.unlockedRecipes.includes(r.id));
  if (!open.length) return 1;
  const ratio = open.reduce((s, r) => s + onlinePriceOf(state, r) / r.salePrice, 0) / open.length;
  return priceAppealFactor(ratio);
}

/** Bobot jam: pesanan online paling ramai jam makan malam 19.00–22.00. */
export function onlineHourWeight(minute: number): number {
  const h = (minute / 60) % 24;
  if (h >= 19 && h < 22) return 1.6;
  if (h >= 17 && h < 19) return 0.9;
  if (h >= 22 || h < 0.5) return 0.8;
  return 0.4;
}

function clampRating(v: number): number {
  return Math.max(RATING_MIN, Math.min(RATING_MAX, v));
}

function changeRating(draft: GameState, delta: number): void {
  const before = draft.online.rating;
  draft.online.rating = clampRating(before + delta);
  draft.online.today.ratingChange += draft.online.rating - before;
}

// ---------- membuat pesanan ----------

function pickRecipe(rng: SeededRandom, list: readonly RecipeDef[], fav: readonly string[]): RecipeDef | null {
  if (!list.length) return null;
  return rng.weightedPick(list.map((r) => ({ item: r, weight: fav.includes(r.category) ? 3 : 1 })));
}

/** Buat satu pesanan acak dari menu yang sudah terbuka. */
export function createOrder(state: Readonly<GameState>, catalog: Catalog, rng: SeededRandom, minute: number, id: number): OnlineOrder | null {
  const open = state.unlockedRecipes.map((r) => catalog.recipe(r));
  const foods = open.filter((r) => r.category !== 'minuman');
  const drinks = open.filter((r) => r.category === 'minuman');
  if (!foods.length) return null;
  const profile = rng.weightedPick(BUYER_PROFILES.map((p) => ({ item: p, weight: p.weight })));
  const lines = new Map<string, number>();
  const nItems = rng.int(profile.items[0], profile.items[1]);
  for (let i = 0; i < nItems; i++) {
    const r = pickRecipe(rng, foods, profile.favorite);
    if (r) lines.set(r.id, (lines.get(r.id) ?? 0) + rng.int(profile.qty[0], profile.qty[1]));
  }
  if (drinks.length && rng.chance(profile.drinkChance)) {
    const d = pickRecipe(rng, drinks, profile.favorite) as RecipeDef;
    lines.set(d.id, (lines.get(d.id) ?? 0) + rng.int(1, Math.max(1, profile.qty[1] - 1)));
  }
  const items: OnlineOrderItem[] = [...lines.entries()].map(([recipeId, qty]) => ({ recipeId, qty }));
  const ev = activeOnlineEvent(state);
  const raw = items.reduce((s, l) => s + onlinePriceOf(state, catalog.recipe(l.recipeId)) * l.qty, 0);
  const value = Math.round((raw * (ev?.price ?? 1)) / 500) * 500;
  const area = rng.pick(AREAS);
  const km = Math.round((area.km[0] + rng.next() * (area.km[1] - area.km[0])) * 10) / 10;
  let note: OnlineOrder['note'] = null;
  if (rng.chance(NOTE_CHANCE)) {
    const hasDrink = items.some((l) => catalog.recipe(l.recipeId).category === 'minuman');
    const options = ORDER_NOTES.filter((n) => (!n.needsDrink || hasDrink) && (!n.extraItem || state.unlockedRecipes.includes(n.extraItem)));
    if (options.length) {
      const n = rng.pick(options);
      note = { id: n.id, text: n.text, extraMinutes: n.extraMinutes, extraItem: n.extraItem };
    }
  }
  return {
    id,
    buyer: rng.pick(BUYER_NAMES),
    area: area.name,
    km,
    items,
    note,
    noteHonored: false,
    value,
    fee: ONLINE_RULES.deliveryFee,
    status: 'menunggu',
    createdMinute: minute,
    expiresMinute: minute + ONLINE_RULES.acceptWindow,
    acceptedMinute: null,
    readyMinute: null,
    pickupMinute: null,
    deliveredMinute: null,
    dueMinute: null,
    tripId: null,
    late: false,
    cold: false,
    cancelReason: null,
  };
}

/** Stok produk yang dibutuhkan pesanan (termasuk item tambahan dari catatan jika dipenuhi). */
export function orderNeeds(order: OnlineOrder, honorNote = order.noteHonored): Map<string, number> {
  const need = new Map<string, number>();
  for (const l of order.items) need.set(l.recipeId, (need.get(l.recipeId) ?? 0) + l.qty);
  if (honorNote && order.note?.extraItem) need.set(order.note.extraItem, (need.get(order.note.extraItem) ?? 0) + 1);
  return need;
}

/** Menu yang stoknya kurang untuk pesanan ini (memperhitungkan pesanan lain yang sudah diterima). */
export function stockShortfall(state: Readonly<GameState>, order: OnlineOrder, honorNote = true): string[] {
  const reserved = new Map<string, number>();
  for (const o of state.online.orders) {
    if (o.status !== 'diterima' || o.id === order.id) continue;
    for (const [id, n] of orderNeeds(o)) reserved.set(id, (reserved.get(id) ?? 0) + n);
  }
  const short: string[] = [];
  for (const [id, n] of orderNeeds(order, honorNote)) {
    if (totalQty(state.inventory.products[id]) - (reserved.get(id) ?? 0) < n) short.push(id);
  }
  return short;
}

/** Alasan pesanan belum bisa diterima (null = bisa). */
export function acceptBlocker(state: Readonly<GameState>, order: OnlineOrder): string | null {
  if (state.phase !== 'berjualan') return tr('Pesanan hanya bisa diterima saat berjualan.');
  if (order.status !== 'menunggu') return tr('Pesanan ini sudah tidak menunggu.');
  if (!state.online.mode) return tr('Pilih cara mengantar dulu.');
  if (acceptedToday(state) >= dailyLimit(state)) return tr('Batas {state} pesanan online hari ini sudah tercapai.', { state: dailyLimit(state) });
  return null;
}

// ---------- aksi pemain ----------

export function acceptOrder(draft: GameState, id: number, honorNote: boolean, source: OnlineSource = 'utama', catalog?: Catalog): OnlineOrder {
  const o = draft.online.orders.find((x) => x.id === id);
  if (!o) throw new GameRuleError('online-unknown', tr('Pesanan tidak ditemukan.'));
  const blocker = acceptBlocker(draft, o);
  if (blocker) throw new GameRuleError('online-blocked', blocker);
  const minute = draft.calendar.clockMinutes;
  if (source !== 'utama') {
    if (!catalog) throw new Error('catalog wajib untuk pesanan dari cabang');
    const b = draft.branches.list.find((x) => x.slot === source);
    if (!b) throw new GameRuleError('online-blocked', tr('Cabang tidak ditemukan.'));
    o.noteHonored = o.note !== null && honorNote;
    const opt = branchOption(draft, catalog, o, b, o.noteHonored);
    if (!opt.ok) throw new GameRuleError('online-blocked', tr('{name}: {reason}.', { name: b.name, reason: opt.reason }));
    o.acceptedMinute = minute;
    dispatchFromBranch(draft, catalog, o, source);
    draft.online.today.accepted++;
    return o;
  }
  const mode = modeById(draft.online.mode!);
  o.status = 'diterima';
  o.noteHonored = o.note !== null && honorNote;
  o.acceptedMinute = minute;
  o.readyMinute = minute + ONLINE_RULES.prepMinutes + (o.noteHonored ? (o.note?.extraMinutes ?? 0) : 0);
  const rng = new SeededRandom(`ojol-${draft.calendar.day}-${o.id}`);
  const wait = mode.id === 'ojol' ? rng.int(mode.waitMinutes[0], mode.waitMinutes[1]) : ONLINE_RULES.kurirDispatchWait;
  if (mode.id === 'ojol') o.pickupMinute = Math.max(o.readyMinute, minute + wait);
  // Janji waktu tiba ke pembeli (tanpa memperhitungkan hujan → hujan bisa membuat terlambat).
  const start = mode.id === 'ojol' ? (o.pickupMinute as number) : o.readyMinute + wait;
  o.dueMinute = start + travelMinutes(o.km, 1) + ONLINE_RULES.dueSlack;
  draft.online.today.accepted++;
  return o;
}

export function rejectOrder(draft: GameState, id: number): void {
  const o = draft.online.orders.find((x) => x.id === id);
  if (!o || o.status !== 'menunggu') throw new GameRuleError('online-unknown', tr('Pesanan ini sudah tidak menunggu.'));
  o.status = 'ditolak';
  draft.online.today.rejected++;
}

export function setDeliveryMode(draft: GameState, mode: 'kurir' | 'ojol'): void {
  if (draft.phase === 'berjualan') throw new GameRuleError('wrong-phase', tr('Cara mengantar hanya bisa diganti saat persiapan.'));
  draft.online.mode = mode;
}

// ---------- jalannya waktu ----------

export interface OnlineTickEvent {
  readonly kind: 'baru' | 'kedaluwarsa' | 'dijemput' | 'berangkat' | 'selesai' | 'batal';
  readonly order: OnlineOrder;
  readonly message: string;
}

function cancel(draft: GameState, o: OnlineOrder, reason: string): void {
  o.status = 'batal';
  o.cancelReason = reason;
  draft.online.today.cancelled++;
  changeRating(draft, -3);
}

/** Ambil stok untuk pesanan. Mengembalikan nama menu yang kurang (kosong = berhasil). */
function takeStock(draft: GameState, catalog: Catalog, o: OnlineOrder): string[] {
  const needs = orderNeeds(o);
  const short = [...needs].filter(([id, n]) => totalQty(draft.inventory.products[id]) < n).map(([id]) => id);
  // Item tambahan dari catatan boleh tidak ada: catatan dianggap tidak dipenuhi.
  const extra = o.note?.extraItem;
  if (extra && short.includes(extra) && o.items.every((l) => l.recipeId !== extra)) {
    o.noteHonored = false;
    short.splice(short.indexOf(extra), 1);
    needs.delete(extra);
  }
  if (short.length) return short.map((id) => catalog.recipe(id).name);
  let cost = 0;
  for (const [id, n] of needs) {
    cost += consumeStock(draft.inventory.products, id, n);
    draft.ledger.sold[id] = (draft.ledger.sold[id] ?? 0) + n;
    draft.stats.totalPortionsSold += n;
  }
  draft.ledger.costOfSales += cost;
  return [];
}

function fromBranchOrder(o: OnlineOrder): boolean {
  return o.source !== undefined && o.source !== null;
}

function deliver(draft: GameState, o: OnlineOrder, minute: number): void {
  const mode = modeById(draft.online.mode ?? 'ojol');
  const ev = activeOnlineEvent(draft);
  o.status = 'selesai';
  o.deliveredMinute = minute;
  o.late = o.dueMinute !== null && minute > o.dueMinute;
  o.cold = o.pickupMinute !== null && minute - o.pickupMinute > (fromBranchOrder(o) ? ONLINE_RULES.hotMinutes : hotMinutes(draft));
  // Dari cabang: diantar sendiri → tanpa komisi, ongkir pembeli masuk kas (biaya antar dibayar saat dikirim).
  const fromBranch = o.source !== undefined && o.source !== null;
  const commission = fromBranch ? 0 : Math.round(o.value * mode.commission);
  const fee = fromBranch || mode.keepsFee ? o.fee : 0;
  draft.player.money += o.value - commission + fee;
  draft.ledger.revenue += o.value;
  draft.stats.totalRevenue += o.value;
  const t = draft.online.today;
  t.delivered++;
  t.gross += o.value;
  t.commission += commission;
  t.feesKept += fee;
  if (o.late) t.late++;
  changeRating(draft, o.late ? -2 : (ev?.ratingGain ?? 1));
  if (o.note && !o.noteHonored) changeRating(draft, -1);
  if (o.cold) changeRating(draft, -1);
}

/** Peluang pesanan baru pada menit ini. */
export function orderChance(state: Readonly<GameState>, minute: number, catalog?: Catalog): number {
  const window = GAME_CONFIG.dayCycle.closeMinutes - GAME_CONFIG.dayCycle.openMinutes;
  return Math.min(0.5, (expectedOrders(state, catalog) / window) * onlineHourWeight(minute));
}

/**
 * Majukan pesanan online satu menit permainan: pesanan baru, kedaluwarsa, penjemputan ojol,
 * keberangkatan & kepulangan kurir, dan pesanan tiba.
 */
export function tickOnline(draft: GameState, catalog: Catalog, minute: number, allowNew = true): OnlineTickEvent[] {
  const events: OnlineTickEvent[] = [];
  const on = draft.online;
  if (!on.mode) return events;
  const rng = new SeededRandom(`online-${draft.calendar.day}-${minute}`);
  const close = GAME_CONFIG.dayCycle.closeMinutes;

  // 1. Pesanan baru.
  const room = on.enabled && acceptedToday(draft) < dailyLimit(draft) && pendingOrders(draft).length < MAX_PENDING && on.today.generated < dailyLimit(draft) * 2;
  if (allowNew && room && minute < close - LAST_ORDER_BEFORE_CLOSE && rng.chance(orderChance(draft, minute, catalog))) {
    const o = createOrder(draft, catalog, rng, minute, on.nextId);
    if (o) {
      on.nextId++;
      on.orders.push(o);
      on.today.generated++;
      events.push({ kind: 'baru', order: o, message: tr('Pesanan online dari {buyer} ({value}).', { buyer: o.buyer, value: formatRupiah(o.value) }) });
    }
  }

  // 2. Pesanan yang tidak dijawab.
  for (const o of on.orders) {
    if (o.status === 'menunggu' && minute >= o.expiresMinute) {
      o.status = 'kedaluwarsa';
      on.today.expired++;
      changeRating(draft, -1);
      events.push({ kind: 'kedaluwarsa', order: o, message: tr('Pesanan {buyer} tidak dijawab dan dibatalkan pembeli.', { buyer: o.buyer }) });
    }
  }

  const factor = travelFactor(on.mode, draft.weather, effectsOf(draft).courierSpeed);

  // 3. Ojol: driver tiba, ambil stok, berangkat.
  if (on.mode === 'ojol') {
    for (const o of on.orders) {
      if (o.status === 'diterima' && o.pickupMinute !== null && minute >= o.pickupMinute) {
        const short = takeStock(draft, catalog, o);
        if (short.length) {
          cancel(draft, o, tr('Stok {0} habis saat driver tiba', { 0: short.join(', ') }));
          events.push({ kind: 'batal', order: o, message: tr('Pesanan {buyer} batal: stok {1} habis.', { buyer: o.buyer, 1: short.join(', ') }) });
          continue;
        }
        o.status = 'diantar';
        o.deliveredMinute = minute + travelMinutes(o.km, factor);
        events.push({ kind: 'dijemput', order: o, message: tr('Driver menjemput pesanan {buyer}.', { buyer: o.buyer }) });
      }
    }
  }

  // 4. Kurir sendiri: berangkat jika kotak penuh / menunggu terlalu lama.
  if (on.mode === 'kurir' && shouldDispatch(draft, minute)) events.push(...dispatchCourier(draft, catalog, minute));

  // 5. Pesanan tiba di pembeli.
  for (const o of on.orders) {
    if (o.status === 'diantar' && o.deliveredMinute !== null && minute >= o.deliveredMinute) {
      deliver(draft, o, o.deliveredMinute);
      events.push({ kind: 'selesai', order: o, message: tr('Pesanan {buyer} sampai{1}.', { buyer: o.buyer, 1: o.late ? tr(' (terlambat)') : '' }) });
    }
  }
  return events;
}

/** Kurir sendiri berangkat membawa pesanan yang sudah siap (maks. kapasitas kotak). */
export function dispatchCourier(draft: GameState, catalog: Catalog, minute: number): OnlineTickEvent[] {
  const events: OnlineTickEvent[] = [];
  const def = modeById('kurir');
  const ready = draft.online.orders
    .filter((o) => o.status === 'diterima' && o.readyMinute !== null && o.readyMinute <= minute)
    .sort((a, b) => (a.readyMinute ?? 0) - (b.readyMinute ?? 0))
    .slice(0, def.batchSize);
  const going: OnlineOrder[] = [];
  for (const o of ready) {
    const short = takeStock(draft, catalog, o);
    if (short.length) {
      cancel(draft, o, tr('Stok {0} habis saat kurir berangkat', { 0: short.join(', ') }));
      events.push({ kind: 'batal', order: o, message: tr('Pesanan {buyer} batal: stok {1} habis.', { buyer: o.buyer, 1: short.join(', ') }) });
    } else going.push(o);
  }
  if (!going.length) return events;
  const factor = travelFactor('kurir', draft.weather, effectsOf(draft).courierSpeed);
  const plan = planTrip(going, minute, factor);
  const tripId = draft.online.trips.length + 1;
  draft.online.trips.push({ id: tripId, departMinute: minute, returnMinute: plan.returnMinute, orderIds: going.map((o) => o.id) });
  for (const o of going) {
    o.status = 'diantar';
    o.tripId = tripId;
    o.pickupMinute = minute;
    o.deliveredMinute = plan.deliveries.get(o.id) ?? minute;
  }
  events.push({ kind: 'berangkat', order: going[0] as OnlineOrder, message: tr('{courierName} berangkat mengantar {length} pesanan.', { courierName: def.courierName, length: going.length }) });
  return events;
}

/**
 * Setelah warung tutup: pesanan yang belum dijawab hangus tanpa penalti; pesanan yang sudah diterima
 * diselesaikan (dijemput/diantar sampai tuntas). Dipanggil sekali sebelum tutup hari.
 */
export function finishOnlineDay(draft: GameState, catalog: Catalog): OnlineTickEvent[] {
  const events: OnlineTickEvent[] = [];
  for (const o of draft.online.orders) {
    if (o.status === 'menunggu') {
      o.status = 'kedaluwarsa';
      draft.online.today.expired++;
    }
  }
  const close = GAME_CONFIG.dayCycle.closeMinutes;
  for (let m = close; m < close + 120 && activeOrders(draft).length; m++) {
    if (draft.online.mode === 'kurir' && shouldDispatch(draft, m, true)) events.push(...dispatchCourier(draft, catalog, m));
    events.push(...tickOnline(draft, catalog, m, false));
  }
  for (const o of activeOrders(draft)) {
    if (o.status === 'diterima') cancel(draft, o, tr('Tidak sempat diantar sebelum tutup'));
    else deliver(draft, o, o.deliveredMinute ?? close);
  }
  return events;
}

/** Saat tutup hari: gaji kurir & pengaruh rating ke popularitas. Mengembalikan ringkasan hari. */
export function closeOnlineDay(draft: GameState): GameState['online']['today'] {
  const t = draft.online.today;
  // Gaji kurir dibayar jika pesanan online aktif atau ada pesanan yang diterima hari itu.
  if (draft.online.mode === 'kurir' && (draft.online.enabled || t.accepted > 0)) {
    t.wage = modeById('kurir').dailyWage;
    draft.player.money -= t.wage;
  }
  const delta = Math.max(-2, Math.min(2, Math.round((t.ratingChange / 3) * 10) / 10));
  if (delta !== 0) draft.player.popularity = Math.round(clampPopularity(draft.player.popularity + delta) * 10) / 10;
  t.popularityDelta = delta;
  return { ...t };
}

/** Laba bersih pesanan online hari itu (nilai − komisi + ongkir yang masuk − gaji). */
export function onlineNet(t: GameState['online']['today']): number {
  return t.gross - t.commission + t.feesKept - t.wage - (t.branchFees ?? 0);
}

/** Mulai hari baru: kosongkan pesanan & perjalanan kemarin. */
export function resetOnlineDay(draft: GameState): void {
  draft.online.orders = [];
  draft.online.trips = [];
  draft.online.today = emptyOnlineDay();
}
