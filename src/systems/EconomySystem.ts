import { buyPriceFactor } from './EventSystem';
import { effectsOf } from './UpgradeSystem';
import { ECONOMY_CONFIG } from '../config/economyConfig';
import type { GameState } from '../core/GameState';
import type { Catalog, IngredientDef } from '../data/catalog';
import { hashNoise, hashString } from '../utils/random';
import { addStock, totalQty } from './InventorySystem';
import { GameRuleError } from './rules';
import { tr } from '../i18n/i18n';

/**
 * Ekonomi belanja: harga bahan yang bergerak bertahap per hari dan transaksi pembelian.
 * Harga deterministik (hari + id bahan) agar bisa diuji dan tidak berubah saat game dimuat ulang.
 */

export function ingredientPrice(def: IngredientDef, day: number, eventMult = 1): number {
  const { dailyInflation, priceSwing, minPriceFactor } = ECONOMY_CONFIG.ingredientPrices;
  const inflation = 1 + dailyInflation * Math.max(0, day - 1);
  // Fluktuasi halus: rata-rata noise dua hari agar tidak melompat drastis.
  const seed = hashString(def.id);
  const noise = (hashNoise(day, seed) + hashNoise(day - 1, seed)) / 2;
  const swing = 1 + (noise * 2 - 1) * priceSwing;
  const price = def.basePrice * Math.max(minPriceFactor, inflation * swing) * eventMult;
  return Math.max(100, Math.round(price / 100) * 100);
}

export type PriceTrend = 'naik' | 'turun' | 'tetap';

export function priceTrend(def: IngredientDef, day: number): PriceTrend {
  if (day <= 1) return 'tetap';
  const now = ingredientPrice(def, day);
  const before = ingredientPrice(def, day - 1);
  return now > before ? 'naik' : now < before ? 'turun' : 'tetap';
}

/** Modal per satuan stok (Rupiah) jika dibeli pada hari tertentu. */
export function unitCostOn(def: IngredientDef, day: number): number {
  return ingredientPrice(def, day) / def.packSize;
}

export interface CartLine {
  readonly ingredientId: string;
  /** Jumlah kemasan yang dibeli. */
  readonly packs: number;
}

export interface QuoteLine {
  readonly def: IngredientDef;
  readonly packs: number;
  readonly packPrice: number;
  readonly subtotal: number;
  readonly units: number;
}

export interface PurchaseQuote {
  readonly lines: readonly QuoteLine[];
  readonly total: number;
}

/** Kapasitas gudang bahan tanpa upgrade (satuan takar/biji). */
export const BASE_STORAGE = 500;

export function storageCapacity(state: Readonly<GameState>): number {
  return BASE_STORAGE + effectsOf(state).storage;
}

export function storedUnits(state: Readonly<GameState>): number {
  return Object.values(state.inventory.ingredients).reduce((s, b) => s + totalQty(b), 0);
}

/** Hitung total belanja (baris dengan 0 kemasan diabaikan). */
export function quotePurchase(catalog: Catalog, cart: readonly CartLine[], day: number, factor: (ingredientId: string) => number = () => 1): PurchaseQuote {
  const lines: QuoteLine[] = [];
  for (const line of cart) {
    if (!Number.isInteger(line.packs) || line.packs < 0) throw new GameRuleError('qty-invalid', tr('Jumlah belanja harus bilangan bulat ≥ 0'));
    if (line.packs > ECONOMY_CONFIG.maxPacksPerLine) throw new GameRuleError('qty-too-large', tr('Maksimal {maxPacksPerLine} kemasan per bahan', { maxPacksPerLine: ECONOMY_CONFIG.maxPacksPerLine }));
    if (line.packs === 0) continue;
    const def = catalog.ingredient(line.ingredientId);
    const packPrice = ingredientPrice(def, day, factor(def.id));
    lines.push({ def, packs: line.packs, packPrice, subtotal: packPrice * line.packs, units: def.packSize * line.packs });
  }
  return { lines, total: lines.reduce((s, l) => s + l.subtotal, 0) };
}

/**
 * Terapkan pembelian pada draft state: kurangi uang, tambah stok bahan, catat di buku harian.
 * Melempar GameRuleError (tanpa mengubah state) jika keranjang kosong atau uang tidak cukup.
 */
export function applyPurchase(draft: GameState, catalog: Catalog, cart: readonly CartLine[]): PurchaseQuote {
  const day = draft.calendar.day;
  const quote = quotePurchase(catalog, cart, day, (id) => buyPriceFactor(draft, id));
  if (quote.lines.length === 0) throw new GameRuleError('cart-empty', tr('Keranjang belanja masih kosong.'));
  if (quote.total > draft.player.money) {
    throw new GameRuleError('money-short', tr('Uang tidak cukup untuk belanja ini.'), { total: quote.total, money: draft.player.money });
  }
  const capacity = storageCapacity(draft);
  const stored = storedUnits(draft);
  const incoming = quote.lines.reduce((s, l) => s + l.units, 0);
  if (stored + incoming > capacity) {
    throw new GameRuleError('storage-full', tr('Gudang tidak muat: terisi {stored}/{capacity} satuan, belanja ini {incoming}. Upgrade penyimpanan untuk menambah.', { stored, capacity, incoming }), { stored, capacity, incoming });
  }
  draft.player.money -= quote.total;
  const fx = effectsOf(draft);
  const shelfBonus = fx.ingredientShelfDays;
  for (const line of quote.lines) {
    const chill = line.def.chilled ? fx.chilledShelfDays : 0;
    const expires = line.def.shelfLifeDays === null ? null : day + line.def.shelfLifeDays + shelfBonus + chill - 1;
    addStock(draft.inventory.ingredients, line.def.id, line.units, expires, line.packPrice / line.def.packSize);
  }
  draft.ledger.purchaseTotal += quote.total;
  draft.ledger.purchaseCount += 1;
  draft.stats.totalPurchases += quote.total;
  return quote;
}
