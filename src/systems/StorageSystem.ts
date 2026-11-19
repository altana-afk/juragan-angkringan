import type { GameState } from '../core/GameState';
import type { Catalog } from '../data/catalog';
import { consumeStock, totalQty } from './InventorySystem';
import { GameRuleError } from './rules';
import { tr } from '../i18n/i18n';

export interface DiscardResult {
  ingredientId: string;
  qty: number;
  /** Nilai modal bahan yang dibuang. */
  cost: number;
}

/**
 * Buang/kurangi stok bahan di gudang (yang paling cepat basi dibuang lebih dulu) untuk memberi ruang bahan lain.
 * Tidak ada pengembalian uang. Tidak bisa saat evaluasi.
 */
export function discardIngredient(draft: GameState, catalog: Catalog, ingredientId: string, qty: number): DiscardResult {
  const def = catalog.ingredient(ingredientId);
  if (draft.phase === 'evaluasi') throw new GameRuleError('wrong-phase', tr('Gudang bisa diatur saat persiapan atau berjualan.'));
  const have = totalQty(draft.inventory.ingredients[ingredientId]);
  if (have <= 0) throw new GameRuleError('stock-empty', tr('{name} tidak ada di gudang.', { name: def.name }));
  if (!Number.isInteger(qty) || qty <= 0) throw new GameRuleError('qty-invalid', tr('Jumlah yang dibuang harus bilangan bulat positif.'));
  const take = Math.min(qty, have);
  // urutkan batch: yang paling cepat basi dulu
  const batches = draft.inventory.ingredients[ingredientId] ?? [];
  batches.sort((a, b) => (a.expiresDay ?? Infinity) - (b.expiresDay ?? Infinity));
  const cost = consumeStock(draft.inventory.ingredients, ingredientId, take);
  return { ingredientId, qty: take, cost: Math.round(cost) };
}

/** Resep terbuka yang memakai bahan ini (untuk info gudang). */
export function recipesUsing(state: Readonly<GameState>, catalog: Catalog, ingredientId: string): string[] {
  return state.unlockedRecipes.map((id) => catalog.recipe(id)).filter((r) => ingredientId in r.ingredients).map((r) => r.name);
}
