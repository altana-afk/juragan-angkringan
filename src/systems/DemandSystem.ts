import { hourBoost } from './LocationSystem';
import { GAME_CONFIG } from '../config/gameConfig';
import { DEMAND_CONFIG } from '../config/demandConfig';
import type { GameState, WeatherKind } from '../core/GameState';
import { salePriceOf, priceAppealFactor } from './PricingSystem';
import { effectsOf } from './UpgradeSystem';
import { WEATHER_EFFECTS } from './WeatherSystem';
import type { Catalog, RecipeDef } from '../data/catalog';
import type { CustomerTypeDef } from '../data/customers';
import type { SeededRandom } from '../utils/random';

/**
 * Sistem permintaan pelanggan: kapan pelanggan datang, tipe apa, dan apa yang ingin dipesan.
 * Semua pilihan memakai bobot probabilitas (bukan acak murni) yang dipengaruhi jam,
 * popularitas, tipe pelanggan, dan sifat produk.
 */

export interface CustomerPlan {
  readonly typeId: string;
  readonly name: string;
  readonly partySize: number;
  readonly budget: number;
  /** Menit permainan yang sanggup ditunggu sampai dapat tempat. */
  readonly patience: number;
  /** Daftar porsi yang diinginkan (boleh berulang untuk rombongan). */
  readonly wants: readonly string[];
  readonly paletteIndex: number;
}

/** Kurva keramaian per jam: puncak sekitar jam makan malam, sepi menjelang tutup (rata-rata ≈ 1). */
export function hourFactor(minutes: number): number {
  const h = minutes / 60;
  const { open, close } = { open: GAME_CONFIG.dayCycle.openMinutes / 60, close: GAME_CONFIG.dayCycle.closeMinutes / 60 };
  if (h < open || h >= close) return 0;
  const evening = Math.exp(-((h - 19.75) ** 2) / (2 * 1.4 ** 2));
  const late = 0.55 * Math.exp(-((h - 22.5) ** 2) / (2 * 1.6 ** 2));
  return 0.25 + 1.25 * evening + late;
}

/** Pengali kedatangan dari popularitas (10 → 1×, 50 → ±2,6×, 100 → ±4,6×). */
export function popularityFactor(popularity: number): number {
  return 0.6 + Math.max(0, Math.min(100, popularity)) / 25;
}

/** Pengubah permintaan harian: iklan aktif & loyalitas pelanggan. */
export interface DemandModifiers {
  /** Tambahan kedatangan dari iklan (0,3 = +30%). */
  readonly arrivalBonus: number;
  /** Tambahan bobot pelanggan baru / penasaran dari iklan. */
  readonly newCustomerBonus: number;
  /** Loyalitas 0–100. */
  readonly loyalty: number;
  /** Cuaca hari ini (pengaruh kedatangan). */
  readonly weather?: WeatherKind;
  /** Lokasi × hari dalam seminggu × event (pengali kedatangan). */
  readonly dayFactor?: number;
  /** Pengali kedatangan setelah larut malam (lokasi). */
  readonly lateNight?: number;
  /** Pengali bobot tipe pelanggan (lokasi & event). */
  readonly typeWeights?: Readonly<Record<string, number>>;
  /** Pengali anggaran pelanggan. */
  readonly budgetFactor?: number;
  /** Jam ramai/sepi khusus lokasi. */
  readonly hours?: readonly { readonly from: number; readonly to: number; readonly factor: number }[];
  /** Tambahan kesabaran pelanggan (menit). */
  readonly patienceDelta?: number;
  /** Peneduh hujan dari upgrade (menambah pengali kedatangan saat hujan). */
  readonly rainShelter?: number;
}

export const NO_MODIFIERS: DemandModifiers = { arrivalBonus: 0, newCustomerBonus: 0, loyalty: 0 };

/** Peluang kedatangan rombongan baru dalam satu menit permainan. */
export function arrivalChancePerMinute(minutes: number, popularity: number, mods: DemandModifiers = NO_MODIFIERS): number {
  const sessionMinutes = GAME_CONFIG.dayCycle.closeMinutes - GAME_CONFIG.dayCycle.openMinutes;
  const perMinute = DEMAND_CONFIG.baseCustomersPerDay / sessionMinutes;
  const loyaltyBoost = 1 + (mods.loyalty / 100) * DEMAND_CONFIG.loyaltyArrivalBoost;
  const base = mods.weather ? WEATHER_EFFECTS[mods.weather].arrival : 1;
  const weather = mods.weather === 'hujan' ? Math.min(1, base + (mods.rainShelter ?? 0)) : base;
  const day = (mods.dayFactor ?? 1) * (minutes >= DEMAND_CONFIG.lateNightFrom ? (mods.lateNight ?? 1) : 1) * hourBoost(mods.hours, minutes);
  return Math.min(0.9, perMinute * hourFactor(minutes) * popularityFactor(popularity) * (1 + mods.arrivalBonus) * loyaltyBoost * weather * day);
}

function typeWeight(type: CustomerTypeDef, minutes: number, popularity: number, mods: DemandModifiers): number {
  const h = minutes / 60;
  const time = Math.exp(-((h - type.peakHour) ** 2) / (2 * type.spread ** 2));
  let w = type.weight * (0.35 + time) * (mods.typeWeights?.[type.id] ?? 1);
  if (type.id === 'penasaran') w *= (0.6 + popularity / 40) * (1 + mods.newCustomerBonus * 3);
  if (type.id === 'royal') w *= popularity >= 40 ? 1.5 : 0.5;
  // Pelanggan lama kembali lebih sering saat loyalitas tinggi.
  if (type.id === 'tetap') w *= 0.5 + mods.loyalty / 40;
  return w;
}

export function pickCustomerType(
  rng: SeededRandom,
  types: readonly CustomerTypeDef[],
  minutes: number,
  popularity: number,
  mods: DemandModifiers = NO_MODIFIERS,
): CustomerTypeDef {
  return rng.weightedPick(types.map((t) => ({ item: t, weight: typeWeight(t, minutes, popularity, mods) })));
}

/** Konteks minat produk: harga jual, cuaca & peralatan. */
export interface AppealContext {
  readonly price: number;
  readonly weather: WeatherKind;
  readonly drinkAppeal: number;
}

/** Bobot keinginan satu resep bagi satu tipe pelanggan pada jam tertentu. */
export function recipeAppeal(
  recipe: RecipeDef,
  type: CustomerTypeDef,
  minutes: number,
  budgetPerPerson: number,
  ctx: AppealContext = { price: recipe.salePrice, weather: 'cerah', drinkAppeal: 0 },
): number {
  let w = type.categoryWeights[recipe.category];
  const weather = WEATHER_EFFECTS[ctx.weather];
  if (recipe.tags.includes('hangat')) w *= weather.warm;
  if (recipe.tags.includes('dingin')) w *= weather.cold;
  if (recipe.category === 'minuman') w *= 1 + ctx.drinkAppeal;
  w *= priceAppealFactor(ctx.price / recipe.salePrice);
  for (const tag of recipe.tags) w *= type.tagWeights[tag] ?? 1;
  // Larut malam: makanan mengenyangkan & minuman hangat makin dicari.
  if (minutes >= DEMAND_CONFIG.lateNightFrom) {
    if (recipe.tags.includes('mengenyangkan')) w *= DEMAND_CONFIG.lateNightFillingBoost;
    if (recipe.tags.includes('hangat') && recipe.category === 'minuman') w *= 1.2;
  }
  // Harga di atas kemampuan per orang menurunkan minat tajam.
  if (ctx.price > budgetPerPerson) w *= 0.15;
  return w;
}

/** Susun rencana satu rombongan pelanggan (siapa & mau apa) dari menu yang tersedia. */
export function planCustomer(
  rng: SeededRandom,
  types: readonly CustomerTypeDef[],
  state: Readonly<GameState>,
  catalog: Catalog,
  minutes: number,
  mods: DemandModifiers = NO_MODIFIERS,
): CustomerPlan {
  const type = pickCustomerType(rng, types, minutes, state.player.popularity, mods);
  const fx = effectsOf(state);
  const partySize = rng.int(type.party[0], type.party[1]);
  // Anggaran di data = per orang; total rombongan = per orang × jumlah orang.
  const budget = Math.round((rng.range(type.budget[0], type.budget[1]) * partySize * (mods.budgetFactor ?? 1)) / 500) * 500;
  const perPerson = budget / partySize;
  const menu = state.unlockedRecipes.map((id) => catalog.recipe(id));
  const foods = menu.filter((r) => r.category !== 'minuman');
  const drinks = menu.filter((r) => r.category === 'minuman');
  const wants: string[] = [];
  const pick = (pool: RecipeDef[], allowDecline = true): string | null => {
    const weighted = pool
      .map((r) => ({ item: r.id, weight: recipeAppeal(r, type, minutes, perPerson, { price: salePriceOf(state, r), weather: state.weather, drinkAppeal: fx.drinkAppeal }) }))
      .filter((x) => x.weight > 0);
    if (!weighted.length) return null;
    const id = rng.weightedPick(weighted);
    // Harga mutlak juga berpengaruh: kemahalan → pelanggan urung memesan item tambahan.
    const recipe = catalog.recipe(id);
    const ratio = salePriceOf(state, recipe) / recipe.salePrice;
    if (allowDecline && ratio > 1 && !rng.chance(priceAppealFactor(ratio))) return null;
    return id;
  };
  // Setiap anggota rombongan memesan minimal 1 menu (boleh lebih), jadi pesanan ≥ jumlah orang.
  for (let i = 0; i < partySize; i++) {
    const mine: string[] = [];
    const count = rng.int(type.foodItems[0], type.foodItems[1]);
    for (let k = 0; k < count; k++) {
      const id = pick(foods);
      if (id) {
        mine.push(id);
        // Murah: kadang pelanggan menambah porsi.
        const r = catalog.recipe(id);
        const ratio = salePriceOf(state, r) / r.salePrice;
        if (ratio < 1 && rng.chance(Math.min(0.35, (priceAppealFactor(ratio) - 1) * 0.6))) mine.push(id);
      }
    }
    if (rng.chance(type.drinkChance)) {
      const id = pick(drinks);
      if (id) mine.push(id);
    }
    if (mine.length === 0) {
      // Orang ini belum memesan apa pun: pilih satu menu (minuman jika tipe suka minum, selain itu makanan).
      const pool = drinks.length && (foods.length === 0 || rng.chance(type.drinkChance)) ? drinks : foods.length ? foods : drinks;
      const id = pick(pool, false) ?? pick(menu, false);
      if (id) mine.push(id);
    }
    wants.push(...mine);
  }
  return {
    typeId: type.id,
    name: rng.pick(type.names),
    partySize,
    budget,
    patience: Math.max(3, type.patience + fx.patience + (mods.patienceDelta ?? 0)),
    wants,
    paletteIndex: rng.int(0, type.palettes.length - 1),
  };
}
