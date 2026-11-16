import branchesRaw from './branches.json';
import upgradesRaw from './branchUpgrades.json';
import staffRaw from './branchStaff.json';

export interface BranchSlotDef {
  readonly slot: number;
  readonly name: string;
  readonly openCost: number;
  readonly minLevel: number;
  readonly minPopularity: number;
}

export interface BranchUpgradeDef {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly cost: number;
  readonly description: string;
  readonly effects: {
    readonly shelfDays?: number;
    readonly performance?: number;
    readonly shrinkFactor?: number;
    readonly demand?: number;
    readonly popularityPerDay?: number;
    readonly freeShipping?: boolean;
  };
}

export type WagePlanId = 'harian' | 'mingguan' | 'bulanan';

export interface WagePlanDef {
  readonly id: WagePlanId;
  readonly name: string;
  readonly amount: number;
  readonly periodDays: number;
  readonly description: string;
}

export const BRANCH_SLOTS: readonly BranchSlotDef[] = branchesRaw.branches;
export const BRANCH_RULES = branchesRaw.rules;
export const BRANCH_UPGRADES: readonly BranchUpgradeDef[] = upgradesRaw.upgrades;
export const WAGE_PLANS: readonly WagePlanDef[] = staffRaw.plans as WagePlanDef[];
export const STAFF_RULES = staffRaw.rules;
export const MAX_BRANCHES = BRANCH_SLOTS.length;

export function branchUpgradeById(id: string): BranchUpgradeDef {
  const u = BRANCH_UPGRADES.find((x) => x.id === id);
  if (!u) throw new Error(`Upgrade cabang "${id}" tidak dikenal`);
  return u;
}

export function wagePlanById(id: WagePlanId): WagePlanDef {
  const p = WAGE_PLANS.find((x) => x.id === id);
  if (!p) throw new Error(`Pilihan gaji "${id}" tidak dikenal`);
  return p;
}

/** Gaji per hari: harian dibayar penuh, mingguan/bulanan = total ÷ jumlah hari (dibulatkan ke Rp100). */
export function dailyWage(plan: WagePlanId): number {
  const p = wagePlanById(plan);
  return Math.round(p.amount / p.periodDays / 100) * 100;
}
