import { DEMAND_CONFIG } from '../config/demandConfig';
import type { GameState } from '../core/GameState';
import type { Catalog } from '../data/catalog';
import { clamp } from '../utils/formatting';
import type { SeededRandom } from '../utils/random';
import type { CustomerPlan } from './DemandSystem';
import { overpricePenalty, salePriceOf } from './PricingSystem';
import { effectsOf } from './UpgradeSystem';
import { consumeStock, totalQty } from './InventorySystem';
import { GameRuleError } from './rules';
import { tr } from '../i18n/i18n';

export type OrderOutcomeKind = 'served' | 'partial' | 'left-empty';

export interface SoldLine {
  readonly recipeId: string;
  readonly qty: number;
  readonly price: number;
}

export interface OrderOutcome {
  readonly kind: OrderOutcomeKind;
  readonly sold: readonly SoldLine[];
  /** Pesanan yang dicari tapi habis (tidak terganti). */
  readonly missed: readonly string[];
  /** Pasangan pesanan asli → pengganti. */
  readonly substitutions: readonly { wanted: string; got: string }[];
  readonly total: number;
  readonly satisfaction: number;
}

/**
 * Tentukan hasil pesanan berdasarkan stok produk matang saat ini (tanpa mengubah state):
 * produk habis → coba ganti dengan produk sekategori yang tersedia & terjangkau,
 * atau batal sebagian; jika tidak ada sama sekali pelanggan pergi kecewa.
 */
export function resolveOrder(
  state: Readonly<GameState>,
  catalog: Catalog,
  plan: CustomerPlan,
  rng: SeededRandom,
  waitedMinutes = 0,
): OrderOutcome {
  const available = new Map<string, number>();
  for (const [id, batches] of Object.entries(state.inventory.products)) available.set(id, totalQty(batches));
  const take = (id: string): boolean => {
    const left = available.get(id) ?? 0;
    if (left <= 0) return false;
    available.set(id, left - 1);
    return true;
  };

  const picked: string[] = [];
  const missed: string[] = [];
  const substitutions: { wanted: string; got: string }[] = [];
  let budgetLeft = plan.budget;
  const price = (id: string): number => salePriceOf(state, catalog.recipe(id));
  for (const wanted of plan.wants) {
    const recipe = catalog.recipe(wanted);
    if ((available.get(wanted) ?? 0) > 0) {
      // Ada stok: beli jika uangnya cukup; jika tidak, pelanggan batal item ini (bukan karena habis).
      if (price(wanted) <= budgetLeft && take(wanted)) {
        picked.push(wanted);
        budgetLeft -= price(wanted);
      }
      continue;
    }
    if (rng.chance(DEMAND_CONFIG.substituteChance)) {
      const options = state.unlockedRecipes
        .map((id) => catalog.recipe(id))
        .filter((r) => r.id !== wanted && r.category === recipe.category && (available.get(r.id) ?? 0) > 0 && price(r.id) <= budgetLeft);
      if (options.length > 0) {
        const alt = rng.pick(options);
        take(alt.id);
        picked.push(alt.id);
        substitutions.push({ wanted, got: alt.id });
        budgetLeft -= price(alt.id);
        continue;
      }
    }
    missed.push(wanted);
  }

  const s = DEMAND_CONFIG.satisfaction;
  const waitPenalty = Math.max(0, waitedMinutes - 3) * s.perWaitMinute;
  if (picked.length === 0) {
    return { kind: 'left-empty', sold: [], missed, substitutions: [], total: 0, satisfaction: clamp(s.leftEmpty + waitPenalty, 0, 100) };
  }
  // Sebagian habis: kadang pelanggan batal semuanya.
  if (missed.length > 0 && !rng.chance(DEMAND_CONFIG.keepPartialChance)) {
    return { kind: 'left-empty', sold: [], missed, substitutions: [], total: 0, satisfaction: clamp(s.leftEmpty + waitPenalty, 0, 100) };
  }
  const counts = new Map<string, number>();
  for (const id of picked) counts.set(id, (counts.get(id) ?? 0) + 1);
  const sold = [...counts.entries()].map(([recipeId, qty]) => ({ recipeId, qty, price: price(recipeId) }));
  const fx = effectsOf(state);
  // Rata-rata penalti kemahalan per item, diperkuat 1,5× (pelanggan merasa "dipalak").
  const pricePenalty = (picked.reduce((sum, id) => sum + overpricePenalty(price(id) / catalog.recipe(id).salePrice), 0) / picked.length) * 1.5;
  const total = sold.reduce((sum, l) => sum + l.qty * l.price, 0);
  const fulfilled = picked.length - substitutions.length;
  const satisfaction = clamp(
    s.base + fulfilled * s.perFulfilled + substitutions.length * s.perSubstituted + missed.length * s.perMissing + waitPenalty + fx.satisfaction + pricePenalty + (state.weather === 'panas' ? fx.heatComfort : 0) + (state.weather === 'hujan' ? fx.rainComfort : 0),
    0,
    100,
  );
  return { kind: missed.length > 0 ? 'partial' : 'served', sold, missed, substitutions, total, satisfaction };
}

/**
 * Terapkan penjualan ke draft state: kurangi stok produk (FEFO), tambah uang,
 * catat ke buku harian. Melempar error jika stok ternyata tidak cukup (state tidak berubah).
 */
export function applySale(draft: GameState, outcome: OrderOutcome): void {
  for (const line of outcome.sold) {
    const have = totalQty(draft.inventory.products[line.recipeId]);
    if (have < line.qty) throw new GameRuleError('product-short', tr('Stok {recipeId} tidak cukup untuk dijual', { recipeId: line.recipeId }));
  }
  let cost = 0;
  for (const line of outcome.sold) {
    cost += consumeStock(draft.inventory.products, line.recipeId, line.qty);
    draft.ledger.sold[line.recipeId] = (draft.ledger.sold[line.recipeId] ?? 0) + line.qty;
    draft.stats.totalPortionsSold += line.qty;
  }
  for (const id of outcome.missed) draft.ledger.missed[id] = (draft.ledger.missed[id] ?? 0) + 1;
  draft.player.money += outcome.total;
  draft.ledger.revenue += outcome.total;
  draft.ledger.costOfSales += cost;
  draft.stats.totalRevenue += outcome.total;
  draft.ledger.customers += 1;
  draft.stats.totalCustomers += 1;
  if (outcome.kind === 'served') draft.ledger.served += 1;
  else if (outcome.kind === 'partial') draft.ledger.partial += 1;
  else draft.ledger.leftEmpty += 1;
  draft.ledger.satisfactionSum += outcome.satisfaction;
  if (outcome.satisfaction >= 85) draft.ledger.happy += 1;
  if (outcome.satisfaction < 40) draft.ledger.unhappy += 1;
}

/** Catat rombongan yang pergi karena tidak dapat tempat / menunggu terlalu lama. */
export function applyWalkAway(draft: GameState, wants: readonly string[]): void {
  draft.ledger.customers += 1;
  draft.stats.totalCustomers += 1;
  draft.ledger.leftWaiting += 1;
  draft.ledger.satisfactionSum += DEMAND_CONFIG.satisfaction.leftWaiting;
  draft.ledger.unhappy += 1;
  void wants;
}
