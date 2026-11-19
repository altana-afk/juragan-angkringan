import configRaw from './challengeEvents.json';
import alliesRawBase from './allies.json';
import alliesRawEn from '../i18n/en/data/allies.json';
import { localizeData } from '../i18n/i18n';
import type { NamedCustomerDef } from './story';
import type { AllyKind } from '../core/GameState';

// Teks data dalam bahasa aktif (tumpangan terjemahan Inggris di src/i18n/en/data/).
const alliesRaw = localizeData(alliesRawBase, alliesRawEn);

/**
 * Data tantangan kampung (0.18.0): kucing liar, ODGJ, ormas, serta dua kenalan (nakes & polisi)
 * yang menolong saat hatinya penuh.
 */

export type FameTier = 'rendah' | 'sedang' | 'tinggi';
export const FAME_TIERS: readonly FameTier[] = ['rendah', 'sedang', 'tinggi'];

export interface ChallengeConfig {
  readonly graceDays: number;
  readonly tiers: Readonly<Record<FameTier, { readonly maxPopularity: number }>>;
  readonly cat: {
    readonly chances: Readonly<Record<FameTier, readonly number[]>>;
    readonly portions: Readonly<Record<FameTier, readonly [number, number]>>;
  };
  readonly odgj: {
    readonly chance: Readonly<Record<FameTier, number>>;
    readonly minGapDays: number;
    readonly untilMinute: number;
    readonly arrivalFactor: number;
    readonly fleeChance: number;
    readonly failFleeChance: number;
  };
  readonly ormas: {
    readonly chance: Readonly<Record<FameTier, number>>;
    readonly minGapDays: number;
    readonly rateMin: number;
    readonly rateMax: number;
    readonly failRate: number;
    readonly minAmount: number;
    readonly patienceMinutes: number;
  };
  readonly allies: { readonly maxHeart: number; readonly homeVisitChance: number; readonly awayVisitChance: number };
}

export const CHALLENGE_CONFIG = configRaw as unknown as ChallengeConfig;

export interface AllyDef extends NamedCustomerDef {
  readonly kind: AllyKind;
  /** Lokasi tempat berkenalan (hati < 5 hanya mampir di sini). */
  readonly homeLocation: string;
  /** Obrolan per jumlah hati 0–5. */
  readonly hearts: readonly (readonly string[])[];
  /** Petunjuk pesanan kesukaan: id resep → cara dia menyebutnya (minigame Pesanan kesukaan, 0.18.1). */
  readonly favoriteHints: Readonly<Record<string, string>>;
}

interface AllyRaw extends Omit<NamedCustomerDef, 'talk'> {
  readonly kind: AllyKind;
  readonly homeLocation: string;
  readonly talk: readonly (readonly string[])[];
  readonly favoriteHints?: Readonly<Record<string, string>>;
}

function parseAllies(): AllyDef[] {
  const list = (alliesRaw as unknown as { allies: AllyRaw[] }).allies;
  const kinds = new Set<string>();
  return list.map((a) => {
    if (kinds.has(a.kind)) throw new Error(`[Data kenalan] jenis ganda: ${a.kind}`);
    kinds.add(a.kind);
    if (a.talk.length !== CHALLENGE_CONFIG.allies.maxHeart + 1) throw new Error(`[Data kenalan] ${a.id}: obrolan harus ada untuk hati 0–5`);
    const t = a.talk;
    return { ...a, favoriteHints: a.favoriteHints ?? {}, hearts: t, talk: { 0: t[0] as string[], 1: t[2] as string[], 2: t[4] as string[], 3: t[5] as string[] } };
  });
}

export const ALLIES: readonly AllyDef[] = parseAllies();

export function allyById(id: string): AllyDef | undefined {
  return ALLIES.find((a) => a.id === id);
}

export function allyOfKind(kind: AllyKind): AllyDef {
  const a = ALLIES.find((x) => x.kind === kind);
  if (!a) throw new Error(`Kenalan ${kind} tidak ada`);
  return a;
}

export function isAlly(id: string): boolean {
  return ALLIES.some((a) => a.id === id);
}
