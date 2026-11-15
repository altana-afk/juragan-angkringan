import { effectsOf } from './UpgradeSystem';
import type { GameState } from '../core/GameState';
import type { Catalog } from '../data/catalog';
import { addStock, consumeStock } from './InventorySystem';
import { aggregateRequirements, findShortages, type CookOrder, type Shortage } from './RecipeSystem';
import { GameRuleError } from './rules';

export interface PreparedLine {
  readonly recipeId: string;
  readonly portions: number;
  readonly unitCost: number;
}

export interface CookResult {
  readonly lines: readonly PreparedLine[];
  readonly totalCost: number;
  readonly totalPortions: number;
}

/** Porsi maksimum per produk sekali masak tanpa upgrade (wajan, kompor & gerobak menambah). */
export const BASE_MAX_PORTIONS = 40;

export function maxPortionsPerOrder(state: Readonly<GameState>): number {
  return BASE_MAX_PORTIONS + effectsOf(state).maxCookPortions;
}

/**
 * Masak produk dari bahan mentah (atomik):
 * 1. validasi pesanan & resep terbuka,
 * 2. cek total kebutuhan semua pesanan sekaligus — jika ada yang kurang, tolak tanpa mengubah stok,
 * 3. kurangi bahan TEPAT SEKALI per pesanan (FEFO) dan tambahkan produk matang dengan modalnya.
 */
export function prepareProducts(draft: GameState, catalog: Catalog, orders: readonly CookOrder[]): CookResult {
  const valid = orders.filter((o) => o.portions !== 0);
  if (valid.length === 0) throw new GameRuleError('orders-empty', 'Belum ada produk yang dipilih untuk dimasak.');
  for (const o of valid) {
    if (!Number.isInteger(o.portions) || o.portions < 0) throw new GameRuleError('qty-invalid', 'Jumlah porsi harus bilangan bulat positif.');
    const max = maxPortionsPerOrder(draft);
    if (o.portions > max) throw new GameRuleError('qty-too-large', `Maksimal ${max} porsi per produk sekali masak (upgrade wajan/kompor untuk menambah).`);
    if (!draft.unlockedRecipes.includes(o.recipeId)) {
      throw new GameRuleError('recipe-locked', `${catalog.recipe(o.recipeId).name} belum terbuka.`);
    }
  }
  const shortages: Shortage[] = findShortages(draft, aggregateRequirements(catalog, valid));
  if (shortages.length > 0) {
    const names = shortages.map((s) => `${catalog.ingredient(s.ingredientId).name} (kurang ${s.missing})`).join(', ');
    throw new GameRuleError('ingredients-short', `Bahan tidak cukup: ${names}.`, shortages);
  }

  const day = draft.calendar.day;
  const shelfBonus = effectsOf(draft).productShelfDays;
  const drinkBonus = effectsOf(draft).drinkShelfDays;
  const lines: PreparedLine[] = [];
  let totalCost = 0;
  for (const order of valid) {
    const recipe = catalog.recipe(order.recipeId);
    let cost = 0;
    for (const [id, perPortion] of Object.entries(recipe.ingredients)) {
      cost += consumeStock(draft.inventory.ingredients, id, perPortion * order.portions);
    }
    const unitCost = cost / order.portions;
    addStock(draft.inventory.products, recipe.id, order.portions, day + recipe.shelfLifeDays + shelfBonus + (recipe.category === 'minuman' ? drinkBonus : 0), unitCost);
    draft.ledger.prepared[recipe.id] = (draft.ledger.prepared[recipe.id] ?? 0) + order.portions;
    draft.stats.totalPortionsPrepared += order.portions;
    totalCost += cost;
    lines.push({ recipeId: recipe.id, portions: order.portions, unitCost });
  }
  draft.ledger.cookingCost += totalCost;
  return { lines, totalCost, totalPortions: lines.reduce((s, l) => s + l.portions, 0) };
}
