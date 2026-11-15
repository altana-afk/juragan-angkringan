import type { GameState } from '../core/GameState';
import type { RecipeDef } from '../data/catalog';
import { GameRuleError } from './rules';

/**
 * Harga jual yang diatur pemain.
 * Rasio = harga / harga wajar (salePrice di data). Harga lebih tinggi menurunkan minat
 * (elastisitas) dan kepuasan; harga lebih murah sedikit menaikkan minat tapi memotong margin.
 */
export const PRICE_RULES = {
  minRatio: 0.5,
  maxRatio: 2,
  step: 500,
  /** Elastisitas minat: minat × rasio^−elasticity. */
  elasticity: 2.2,
  /** Batas atas kenaikan minat karena murah. */
  maxCheapBoost: 1.6,
  /** Pengurangan kepuasan per 10% di atas harga wajar (per item mahal). */
  satisfactionPer10Pct: 3,
} as const;

export function salePriceOf(state: Readonly<GameState>, recipe: RecipeDef): number {
  return state.prices[recipe.id] ?? recipe.salePrice;
}

export function priceRatio(state: Readonly<GameState>, recipe: RecipeDef): number {
  return salePriceOf(state, recipe) / recipe.salePrice;
}

/** Pengali minat dari rasio harga. */
export function priceAppealFactor(ratio: number): number {
  return Math.min(PRICE_RULES.maxCheapBoost, ratio ** -PRICE_RULES.elasticity);
}

/** Penalti kepuasan (≤ 0) untuk satu item yang dibeli dengan rasio harga tertentu. */
export function overpricePenalty(ratio: number): number {
  if (ratio <= 1.05) return 0;
  return -((ratio - 1) * 10 * PRICE_RULES.satisfactionPer10Pct);
}

export function priceBounds(recipe: RecipeDef): { min: number; max: number } {
  const round = (v: number): number => Math.max(PRICE_RULES.step, Math.round(v / PRICE_RULES.step) * PRICE_RULES.step);
  return { min: round(recipe.salePrice * PRICE_RULES.minRatio), max: round(recipe.salePrice * PRICE_RULES.maxRatio) };
}

/** Atur harga jual (dibulatkan ke Rp500 & dibatasi 50–200% harga wajar). */
export function setPrice(draft: GameState, recipe: RecipeDef, price: number): number {
  if (!Number.isFinite(price)) throw new GameRuleError('price-invalid', 'Harga tidak valid.');
  if (!draft.unlockedRecipes.includes(recipe.id)) throw new GameRuleError('recipe-locked', `${recipe.name} belum terbuka.`);
  const { min, max } = priceBounds(recipe);
  const rounded = Math.min(max, Math.max(min, Math.round(price / PRICE_RULES.step) * PRICE_RULES.step));
  if (rounded === recipe.salePrice) delete draft.prices[recipe.id];
  else draft.prices[recipe.id] = rounded;
  return rounded;
}

/** Label singkat penilaian harga untuk UI. */
export function priceVerdict(ratio: number): { label: string; tone: 'good' | 'warn' | 'bad' | 'neutral' } {
  if (ratio < 0.85) return { label: 'Murah — laris, margin tipis', tone: 'warn' };
  if (ratio <= 1.05) return { label: 'Wajar', tone: 'good' };
  if (ratio <= 1.3) return { label: 'Agak mahal — peminat turun', tone: 'warn' };
  return { label: 'Kemahalan — pelanggan kecewa', tone: 'bad' };
}
