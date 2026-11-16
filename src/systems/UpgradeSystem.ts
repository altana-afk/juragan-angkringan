import upgradesJson from '../data/upgrades.json';
import type { GameState } from '../core/GameState';
import { formatRupiah } from '../utils/formatting';
import { GameRuleError } from './rules';

export type UpgradeCategory = 'gerobak' | 'peralatan' | 'kapasitas' | 'lingkungan' | 'online';

/** Efek upgrade. Semua angka dijumlahkan dari upgrade yang dimiliki; `variants` mengganti tampilan objek peta. */
export interface UpgradeEffects {
  /** Level usaha (diambil nilai tertinggi): membuka menu "level". */
  businessLevel?: number;
  /** + skor kepuasan per rombongan. */
  satisfaction?: number;
  /** + kedatangan (0,05 = +5%). */
  arrivalBonus?: number;
  newCustomerBonus?: number;
  /** + menit kesabaran menunggu tempat. */
  patience?: number;
  /** Pengurangan waktu memesan (0,35 = 35% lebih cepat). */
  serviceSpeed?: number;
  /** + porsi maksimum sekali masak. */
  maxCookPortions?: number;
  /** + hari umur simpan produk matang. */
  productShelfDays?: number;
  /** + hari umur simpan bahan yang bisa basi. */
  ingredientShelfDays?: number;
  /** + hari umur simpan minuman matang (kulkas). */
  drinkShelfDays?: number;
  /** + hari umur simpan bahan dingin: es batu, air, susu (kulkas). */
  chilledShelfDays?: number;
  /** + kepuasan saat panas terik (kipas angin). */
  heatComfort?: number;
  /** + kepuasan saat hujan (terpal). */
  rainComfort?: number;
  /** Mengurangi penurunan pengunjung saat hujan (0,15 = +15 poin dari 75%). */
  rainShelter?: number;
  /** + kapasitas gudang bahan (satuan). */
  storage?: number;
  /** + kursi (lewat objek & kursi berpersyaratan di peta). */
  seats?: number;
  /** + minat terhadap minuman (0,25 = +25%). */
  drinkAppeal?: number;
  /** + batas pesanan online per hari (sistem pemesanan). */
  onlineLimit?: number;
  /** Perjalanan kurir sendiri lebih cepat (0,25 = 25%). */
  courierSpeed?: number;
  /** + menit makanan tetap hangat saat diantar kurir sendiri (kotak termos). */
  thermal?: number;
  /** id objek peta → varian tampilan */
  variants?: Record<string, string>;
}

export interface UpgradeDef {
  readonly id: string;
  readonly category: UpgradeCategory;
  readonly name: string;
  readonly cost: number;
  readonly requires: { readonly upgrades?: readonly string[]; readonly popularity?: number; readonly day?: number };
  readonly effects: UpgradeEffects;
  readonly description: string;
}

export const UPGRADE_CATEGORIES: readonly { id: UpgradeCategory; label: string }[] = [
  { id: 'gerobak', label: 'Gerobak' },
  { id: 'peralatan', label: 'Peralatan' },
  { id: 'kapasitas', label: 'Kapasitas' },
  { id: 'lingkungan', label: 'Lingkungan' },
  { id: 'online', label: 'Pesanan online' },
];

export function parseUpgrades(raw: unknown): UpgradeDef[] {
  const list = (raw as { upgrades?: unknown }).upgrades;
  if (!Array.isArray(list)) throw new Error('[Data upgrade] upgrades.json harus berisi "upgrades"');
  const ids = new Set<string>();
  const out = list.map((u: Record<string, unknown>, i) => {
    if (typeof u.id !== 'string' || ids.has(u.id)) throw new Error(`[Data upgrade] id #${i} tidak valid/ganda`);
    ids.add(u.id);
    if (!UPGRADE_CATEGORIES.some((c) => c.id === u.category)) throw new Error(`[Data upgrade] ${u.id}: kategori tidak dikenal`);
    if (typeof u.cost !== 'number' || u.cost <= 0 || !Number.isInteger(u.cost)) throw new Error(`[Data upgrade] ${u.id}: cost tidak valid`);
    return u as unknown as UpgradeDef;
  });
  for (const u of out) for (const r of u.requires.upgrades ?? []) if (!ids.has(r)) throw new Error(`[Data upgrade] ${u.id} butuh upgrade tak dikenal ${r}`);
  return out;
}

export const UPGRADES: readonly UpgradeDef[] = parseUpgrades(upgradesJson);

export function upgradeById(id: string): UpgradeDef {
  const u = UPGRADES.find((x) => x.id === id);
  if (!u) throw new GameRuleError('upgrade-unknown', `Upgrade "${id}" tidak dikenal`);
  return u;
}

export interface TotalEffects extends Required<Omit<UpgradeEffects, 'variants'>> {
  variants: Record<string, string>;
}

/** Jumlahkan efek semua upgrade yang dimiliki (urutan pembelian menentukan varian yang menang). */
export function totalEffects(owned: readonly string[]): TotalEffects {
  const t: TotalEffects = {
    businessLevel: 1, satisfaction: 0, arrivalBonus: 0, newCustomerBonus: 0, patience: 0, serviceSpeed: 0,
    maxCookPortions: 0, productShelfDays: 0, ingredientShelfDays: 0, drinkShelfDays: 0, chilledShelfDays: 0, heatComfort: 0, rainComfort: 0, rainShelter: 0, storage: 0, seats: 0, drinkAppeal: 0, onlineLimit: 0, courierSpeed: 0, thermal: 0, variants: {},
  };
  for (const id of owned) {
    const e = upgradeById(id).effects;
    t.businessLevel = Math.max(t.businessLevel, e.businessLevel ?? 1);
    for (const k of ['satisfaction', 'arrivalBonus', 'newCustomerBonus', 'patience', 'serviceSpeed', 'maxCookPortions', 'productShelfDays', 'ingredientShelfDays', 'drinkShelfDays', 'chilledShelfDays', 'heatComfort', 'rainComfort', 'rainShelter', 'storage', 'seats', 'drinkAppeal', 'onlineLimit', 'courierSpeed', 'thermal'] as const) {
      t[k] += e[k] ?? 0;
    }
    Object.assign(t.variants, e.variants ?? {});
  }
  t.serviceSpeed = Math.min(0.7, t.serviceSpeed);
  return t;
}

export const effectsOf = (state: Readonly<GameState>): TotalEffects => totalEffects(state.upgrades);

/** Alasan upgrade belum bisa dibeli (kosong = bisa). */
export function upgradeBlockers(state: Readonly<GameState>, u: UpgradeDef): string[] {
  const reasons: string[] = [];
  if (state.upgrades.includes(u.id)) return ['Sudah dimiliki'];
  for (const r of u.requires.upgrades ?? []) if (!state.upgrades.includes(r)) reasons.push(`Butuh ${upgradeById(r).name}`);
  if (u.requires.popularity !== undefined && state.player.popularity < u.requires.popularity) reasons.push(`Popularitas ≥ ${u.requires.popularity}`);
  if (u.requires.day !== undefined && state.calendar.day < u.requires.day) reasons.push(`Mulai Hari ${u.requires.day}`);
  if (state.player.money < u.cost) reasons.push(`Kurang ${formatRupiah(u.cost - state.player.money)}`);
  return reasons;
}

export function buyUpgrade(draft: GameState, id: string): UpgradeDef {
  const u = upgradeById(id);
  if (draft.phase !== 'persiapan') throw new GameRuleError('wrong-phase', 'Upgrade hanya bisa dibeli saat persiapan.');
  const blockers = upgradeBlockers(draft, u);
  if (blockers.length) throw new GameRuleError('upgrade-blocked', `${u.name}: ${blockers.join(', ')}.`);
  draft.player.money -= u.cost;
  draft.upgrades.push(u.id);
  draft.ledger.upgradeCost += u.cost;
  return u;
}

/** Ringkas efek upgrade untuk ditampilkan. */
export function describeEffects(e: UpgradeEffects): string[] {
  const out: string[] = [];
  if (e.businessLevel) out.push(`Level usaha ${e.businessLevel}`);
  if (e.seats) out.push(`+${e.seats} kursi`);
  if (e.arrivalBonus) out.push(`+${Math.round(e.arrivalBonus * 100)}% pelanggan`);
  if (e.newCustomerBonus) out.push('pelanggan baru ↑');
  if (e.satisfaction) out.push(`+${e.satisfaction} kepuasan`);
  if (e.patience) out.push(`+${e.patience} mnt kesabaran`);
  if (e.serviceSpeed) out.push(`layanan ${Math.round(e.serviceSpeed * 100)}% lebih cepat`);
  if (e.maxCookPortions) out.push(`+${e.maxCookPortions} porsi/masak`);
  if (e.productShelfDays) out.push(`produk awet +${e.productShelfDays} hari`);
  if (e.ingredientShelfDays) out.push(`bahan awet +${e.ingredientShelfDays} hari`);
  if (e.drinkShelfDays) out.push(`minuman awet +${e.drinkShelfDays} hari`);
  if (e.chilledShelfDays) out.push(`es & bahan dingin +${e.chilledShelfDays} hari`);
  if (e.heatComfort) out.push(`+${e.heatComfort} kepuasan saat panas`);
  if (e.rainComfort) out.push(`+${e.rainComfort} kepuasan saat hujan`);
  if (e.rainShelter) out.push(`hujan: pengunjung +${Math.round(e.rainShelter * 100)}%`);
  if (e.storage) out.push(`gudang +${e.storage}`);
  if (e.onlineLimit) out.push(`+${e.onlineLimit} pesanan online/hari`);
  if (e.courierSpeed) out.push(`kurir ${Math.round(e.courierSpeed * 100)}% lebih cepat`);
  if (e.thermal) out.push(`antaran hangat +${e.thermal} mnt`);
  if (e.drinkAppeal) out.push(`minuman +${Math.round(e.drinkAppeal * 100)}% diminati`);
  return out;
}
