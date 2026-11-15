import { locationById } from '../data/locations';
import type { DailyEvent, GameState } from '../core/GameState';
import type { Catalog } from '../data/catalog';
import { EVENT_CHANCE, EVENTS, eventById, type EventDef } from '../data/events';
import { getCalendarDate } from '../utils/calendar';
import { SeededRandom } from '../utils/random';
import { consumeStock, totalQty } from './InventorySystem';

/** Event yang mungkin muncul di lokasi & tanggal ini. */
export function eligibleEvents(day: number, mapId: string): EventDef[] {
  const dom = getCalendarDate(day).dayOfMonth;
  return EVENTS.filter((e) => (!e.maps || e.maps.includes(mapId)) && (!e.daysOfMonth || e.daysOfMonth.includes(dom)));
}

/**
 * Event acak hari ini — deterministik dari hari & lokasi (memuat ulang game tidak mengubahnya).
 * Hari 1 tanpa event. Pesanan borongan memilih menu makanan yang sudah terbuka.
 */
export function rollEvent(day: number, mapId: string, unlockedRecipes: readonly string[], catalog: Catalog): DailyEvent | null {
  if (day <= 1) return null;
  const rng = new SeededRandom(`event-${mapId}-${day}`);
  if (!rng.chance(EVENT_CHANCE)) return null;
  const pool = eligibleEvents(day, mapId);
  if (pool.length === 0) return null;
  const def = rng.pick(pool);
  let bulk: DailyEvent['bulk'] = null;
  if (def.effects.bulkOrder) {
    const wantDrinks = def.effects.bulkOrder.category === 'minuman';
    const foods = unlockedRecipes.map((id) => catalog.recipe(id)).filter((r) => (r.category === 'minuman') === wantDrinks && r.id !== 'air_mineral');
    if (foods.length === 0) return null;
    const recipe = rng.pick(foods);
    const b = def.effects.bulkOrder;
    bulk = {
      recipeId: recipe.id,
      qty: rng.int(b.min, b.max),
      unitPrice: Math.round((recipe.salePrice * b.priceFactor) / 500) * 500,
      status: 'menunggu',
    };
  }
  return { id: def.id, bulk };
}

/** Pengali harga bahan karena event hari ini. */
export function eventPriceMultipliers(state: Readonly<GameState>): Readonly<Record<string, number>> {
  return state.event ? eventById(state.event.id).effects.ingredientPrices ?? {} : {};
}

/** Pengali harga satu bahan: lokasi (mis. dekat pasar lebih murah) × event hari ini. */
export function buyPriceFactor(state: Readonly<GameState>, ingredientId: string): number {
  return locationById(state.mapId).ingredientPriceFactor * (eventPriceMultipliers(state)[ingredientId] ?? 1);
}

export interface BulkResult {
  delivered: boolean;
  qty: number;
  revenue: number;
  have: number;
}

/**
 * Kirim pesanan borongan saat warung dibuka: jika stok cukup, porsi diambil & dibayar (harga khusus).
 * Jika kurang, pesanan batal dan popularitas turun sedikit.
 */
export function deliverBulkOrder(draft: GameState): BulkResult | null {
  const bulk = draft.event?.bulk;
  if (!bulk || bulk.status !== 'menunggu') return null;
  const have = totalQty(draft.inventory.products[bulk.recipeId]);
  if (have < bulk.qty) {
    bulk.status = 'gagal';
    draft.player.popularity = Math.max(0, draft.player.popularity - 1.5);
    return { delivered: false, qty: bulk.qty, revenue: 0, have };
  }
  const cost = consumeStock(draft.inventory.products, bulk.recipeId, bulk.qty);
  const revenue = bulk.qty * bulk.unitPrice;
  const l = draft.ledger;
  l.revenue += revenue;
  l.costOfSales += cost;
  l.sold[bulk.recipeId] = (l.sold[bulk.recipeId] ?? 0) + bulk.qty;
  draft.player.money += revenue;
  draft.stats.totalRevenue += revenue;
  draft.stats.totalPortionsSold += bulk.qty;
  draft.stats.bulkDelivered += 1;
  bulk.status = 'terkirim';
  return { delivered: true, qty: bulk.qty, revenue, have };
}

/** Efek ulasan food vlogger saat tutup (perubahan popularitas). */
export function reviewDelta(state: Readonly<GameState>, avgSatisfaction: number): number {
  const review = state.event ? eventById(state.event.id).effects.review : undefined;
  if (!review || state.ledger.customers === 0) return 0;
  return avgSatisfaction >= review.threshold ? review.good : review.bad;
}
