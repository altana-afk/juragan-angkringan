import { effectsOf } from './UpgradeSystem';
import type { GameState } from '../core/GameState';
import type { Catalog, RecipeCategory, RecipeDef, UnlockCondition } from '../data/catalog';
import { formatRupiah } from '../utils/formatting';
import { unitCostOn } from './EconomySystem';
import { totalQty } from './InventorySystem';
import { tr } from '../i18n/i18n';

/** Pesanan memasak: resep & jumlah porsi. */
export interface CookOrder {
  readonly recipeId: string;
  readonly portions: number;
}

export interface Shortage {
  readonly ingredientId: string;
  readonly need: number;
  readonly have: number;
  readonly missing: number;
}

/** Kebutuhan bahan untuk sejumlah porsi satu resep. */
export function requirementsFor(recipe: RecipeDef, portions: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, qty] of Object.entries(recipe.ingredients)) out[id] = qty * portions;
  return out;
}

/** Gabungkan kebutuhan beberapa pesanan sekaligus (bahan yang sama dijumlahkan). */
export function aggregateRequirements(catalog: Catalog, orders: readonly CookOrder[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const order of orders) {
    for (const [id, qty] of Object.entries(requirementsFor(catalog.recipe(order.recipeId), order.portions))) {
      out[id] = (out[id] ?? 0) + qty;
    }
  }
  return out;
}

/** Bahan yang kurang untuk memenuhi kebutuhan. */
export function findShortages(state: Readonly<GameState>, requirements: Readonly<Record<string, number>>): Shortage[] {
  const shortages: Shortage[] = [];
  for (const [id, need] of Object.entries(requirements)) {
    const have = totalQty(state.inventory.ingredients[id]);
    if (have < need) shortages.push({ ingredientId: id, need, have, missing: need - have });
  }
  return shortages;
}

/** Porsi maksimum yang bisa dimasak dari stok saat ini. */
export function maxPortions(state: Readonly<GameState>, recipe: RecipeDef): number {
  let max = Number.POSITIVE_INFINITY;
  for (const [id, need] of Object.entries(recipe.ingredients)) {
    max = Math.min(max, Math.floor(totalQty(state.inventory.ingredients[id]) / need));
  }
  return Number.isFinite(max) ? max : 0;
}

/** Perkiraan modal per porsi berdasarkan harga bahan hari ini. */
export function estimatedPortionCost(catalog: Catalog, recipe: RecipeDef, day: number): number {
  let cost = 0;
  for (const [id, qty] of Object.entries(recipe.ingredients)) cost += unitCostOn(catalog.ingredient(id), day) * qty;
  return cost;
}

export function isUnlockMet(condition: UnlockCondition, state: Readonly<GameState>): boolean {
  switch (condition.type) {
    case 'start':
      return true;
    case 'popularity':
      return state.player.popularity >= condition.min;
    case 'money':
      return state.player.money >= condition.min;
    case 'level':
      return effectsOf(state).businessLevel >= condition.min;
    case 'story':
      return (state.story?.chapters[condition.chapter] ?? 0) > 0;
  }
}

export function describeUnlock(condition: UnlockCondition): string {
  switch (condition.type) {
    case 'start':
      return tr('Tersedia sejak awal');
    case 'popularity':
      return tr('Terbuka saat popularitas ≥ {min}', { min: condition.min });
    case 'money':
      return tr('Terbuka saat kas mencapai {min}', { min: formatRupiah(condition.min) });
    case 'level':
      return tr('Butuh level usaha {min} (upgrade gerobak)', { min: condition.min });
    case 'story':
      return tr('Terbuka dari Buku Dapur Kardi bab {chapter}', { chapter: condition.chapter });
  }
}

/** Urutan kategori di daftar menu: makanan dulu (makanan, gorengan, sate & bakaran), minuman paling akhir. */
export const MENU_CATEGORY_ORDER: readonly RecipeCategory[] = ['makanan', 'gorengan', 'sate', 'minuman'];

export const isDrink = (recipe: RecipeDef): boolean => recipe.category === 'minuman';

/**
 * Urutan daftar menu untuk UI: yang sudah terbuka di atas, yang masih terkunci di bawah.
 * Di dalam tiap kelompok: makanan dulu baru minuman (lalu urutan katalog, supaya stabil).
 */
export function sortRecipesForMenu(recipes: readonly RecipeDef[], unlocked: Iterable<string>): RecipeDef[] {
  const open = new Set(unlocked);
  const rank = (r: RecipeDef): number => MENU_CATEGORY_ORDER.indexOf(r.category);
  return recipes
    .map((recipe, index) => ({ recipe, index }))
    .sort(
      (a, b) =>
        Number(!open.has(a.recipe.id)) - Number(!open.has(b.recipe.id)) ||
        Number(isDrink(a.recipe)) - Number(isDrink(b.recipe)) ||
        rank(a.recipe) - rank(b.recipe) ||
        a.index - b.index,
    )
    .map((x) => x.recipe);
}

export function isRecipeUnlocked(state: Readonly<GameState>, recipeId: string): boolean {
  return state.unlockedRecipes.includes(recipeId);
}

/** Buka resep yang syaratnya sudah terpenuhi. Sekali terbuka, resep tidak terkunci lagi. */
export function refreshUnlocks(draft: GameState, catalog: Catalog): RecipeDef[] {
  const opened: RecipeDef[] = [];
  for (const recipe of catalog.recipes) {
    if (!draft.unlockedRecipes.includes(recipe.id) && isUnlockMet(recipe.unlock, draft)) {
      draft.unlockedRecipes.push(recipe.id);
      opened.push(recipe);
    }
  }
  return opened;
}

/** Bahan yang dipakai oleh minimal satu resep yang sudah terbuka. */
export function ingredientsInUse(state: Readonly<GameState>, catalog: Catalog): Set<string> {
  const used = new Set<string>();
  for (const id of state.unlockedRecipes) for (const ing of Object.keys(catalog.recipe(id).ingredients)) used.add(ing);
  return used;
}
