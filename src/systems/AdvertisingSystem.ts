import adsJson from '../data/advertising.json';
import type { GameState } from '../core/GameState';
import { GameRuleError } from './rules';

/**
 * Iklan & promosi satu hari: dibayar di fase persiapan, menambah calon pelanggan hari itu saja,
 * dan TIDAK menaikkan popularitas secara langsung (popularitas hanya dari pelayanan).
 */
export interface AdDef {
  readonly id: string;
  readonly name: string;
  readonly cost: number;
  /** Tambahan peluang kedatangan (0,3 = +30%). */
  readonly arrivalBonus: number;
  /** Tambahan bobot pelanggan baru / penasaran. */
  readonly newCustomerBonus: number;
  readonly description: string;
  readonly effectLabel: string;
}

export function parseAds(raw: unknown): AdDef[] {
  const list = (raw as { ads?: unknown }).ads;
  if (!Array.isArray(list) || list.length === 0) throw new Error('[Data iklan] advertising.json harus berisi "ads"');
  const ids = new Set<string>();
  return list.map((a: Record<string, unknown>, i) => {
    if (typeof a.id !== 'string' || ids.has(a.id)) throw new Error(`[Data iklan] id iklan #${i} tidak valid/ganda`);
    ids.add(a.id);
    for (const k of ['cost', 'arrivalBonus', 'newCustomerBonus']) {
      if (typeof a[k] !== 'number' || (a[k] as number) < 0) throw new Error(`[Data iklan] ${a.id}.${k} harus angka ≥ 0`);
    }
    return a as unknown as AdDef;
  });
}

export const ADS: readonly AdDef[] = parseAds(adsJson);
export const adById = (id: string): AdDef => {
  const ad = ADS.find((a) => a.id === id);
  if (!ad) throw new GameRuleError('ad-unknown', `Iklan "${id}" tidak dikenal`);
  return ad;
};

/**
 * Total efek iklan aktif. Beberapa iklan sekaligus memberi hasil yang makin berkurang
 * (iklan ke-2 70%, ke-3 49%, …) agar tidak bisa menumpuk tanpa batas.
 */
export function activeAdEffect(adIds: readonly string[]): { arrivalBonus: number; newCustomerBonus: number } {
  const ads = adIds.map(adById).sort((a, b) => b.arrivalBonus - a.arrivalBonus);
  let arrival = 0;
  let fresh = 0;
  ads.forEach((ad, i) => {
    const f = 0.7 ** i;
    arrival += ad.arrivalBonus * f;
    fresh += ad.newCustomerBonus * f;
  });
  return { arrivalBonus: arrival, newCustomerBonus: fresh };
}

export function buyAd(draft: GameState, adId: string): AdDef {
  const ad = adById(adId);
  if (draft.phase !== 'persiapan') throw new GameRuleError('wrong-phase', 'Iklan hanya bisa dipasang sebelum mulai berjualan.');
  if (draft.ledger.ads.includes(adId)) throw new GameRuleError('ad-active', `${ad.name} sudah dipasang hari ini.`);
  if (draft.player.money < ad.cost) throw new GameRuleError('money-short', 'Uang tidak cukup untuk iklan ini.');
  draft.player.money -= ad.cost;
  draft.ledger.ads.push(adId);
  draft.ledger.promotionCost += ad.cost;
  return ad;
}

/** Batalkan iklan sebelum buka (uang kembali penuh). */
export function cancelAd(draft: GameState, adId: string): AdDef {
  const ad = adById(adId);
  if (draft.phase !== 'persiapan') throw new GameRuleError('wrong-phase', 'Iklan sudah berjalan.');
  if (!draft.ledger.ads.includes(adId)) throw new GameRuleError('ad-inactive', `${ad.name} belum dipasang.`);
  draft.ledger.ads = draft.ledger.ads.filter((a) => a !== adId);
  draft.ledger.promotionCost -= ad.cost;
  draft.player.money += ad.cost;
  return ad;
}
