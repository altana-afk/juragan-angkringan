import type { Branch, GameState } from '../core/GameState';
import { branchUpgradeById, dailyWage, STAFF_RULES, wagePlanById, type WagePlanId } from '../data/branches';
import { formatRupiah } from '../utils/formatting';
import { SeededRandom } from '../utils/random';
import { GameRuleError } from './rules';
import { tr } from '../i18n/i18n';

/** Kinerja karyawan: 1 normal, naik karena pelatihan, turun setiap hari gaji telat. */
export function staffPerformance(branch: Readonly<Branch>): number {
  if (!branch.staff) return 0;
  const training = branch.upgrades.reduce((s, id) => s + (branchUpgradeById(id).effects.performance ?? 0), 0);
  return Math.max(STAFF_RULES.minPerformance, 1 + training - branch.staff.lateStreak * STAFF_RULES.latePerformance);
}

/** Biaya merekrut: karyawan pertama gratis, merekrut lagi kena biaya. */
export function hireCost(branch: Readonly<Branch>): number {
  return branch.everHired ? STAFF_RULES.rehireCost : 0;
}

export function hireStaff(draft: GameState, slot: number, plan: WagePlanId): Branch {
  const b = branchAt(draft, slot);
  if (b.staff) throw new GameRuleError('staff-exists', tr('{name} sudah punya karyawan.', { name: b.name }));
  const cost = hireCost(b);
  if (draft.player.money < cost) throw new GameRuleError('money-short', tr('Biaya rekrut {cost}, kas tidak cukup.', { cost: formatRupiah(cost) }));
  draft.player.money -= cost;
  draft.ledger.operationalCost += cost;
  const day = draft.calendar.day;
  const name = new SeededRandom(`staff-${slot}-${day}-${b.everHired ? 1 : 0}`).pick(STAFF_RULES.staffNames);
  b.staff = { name, plan, hiredDay: day, boundUntil: day + wagePlanById(plan).periodDays - 1, lateStreak: 0 };
  b.everHired = true;
  return b;
}

/** Apakah pilihan gaji sudah boleh diganti / karyawan boleh diberhentikan. */
export function contractFree(state: Readonly<GameState>, branch: Readonly<Branch>): boolean {
  return !branch.staff || state.calendar.day > branch.staff.boundUntil || branch.staff.plan === 'harian';
}

export function changeWagePlan(draft: GameState, slot: number, plan: WagePlanId): Branch {
  const b = branchAt(draft, slot);
  if (!b.staff) throw new GameRuleError('no-staff', tr('{name} belum punya karyawan.', { name: b.name }));
  if (b.staff.plan === plan) throw new GameRuleError('same-plan', tr('Pilihan gaji sudah sama.'));
  if (!contractFree(draft, b)) throw new GameRuleError('bound', tr('Gaji {0} masih terikat sampai hari {boundUntil}.', { 0: wagePlanById(b.staff.plan).name.toLowerCase(), boundUntil: b.staff.boundUntil }));
  const day = draft.calendar.day;
  b.staff.plan = plan;
  b.staff.boundUntil = day + wagePlanById(plan).periodDays - 1;
  return b;
}

export function dismissStaff(draft: GameState, slot: number): Branch {
  const b = branchAt(draft, slot);
  if (!b.staff) throw new GameRuleError('no-staff', tr('{name} belum punya karyawan.', { name: b.name }));
  if (!contractFree(draft, b)) throw new GameRuleError('bound', tr('Masih terikat kontrak sampai hari {boundUntil}.', { boundUntil: b.staff.boundUntil }));
  b.staff = null;
  return b;
}

/** Gaji hari ini wajib dibayar? Harian hanya saat cabang buka; mingguan/bulanan selama masih terikat. */
export function wageDue(state: Readonly<GameState>, branch: Readonly<Branch>): number {
  if (!branch.staff) return 0;
  if (branch.open) return dailyWage(branch.staff.plan);
  return branch.staff.plan !== 'harian' && state.calendar.day <= branch.staff.boundUntil ? dailyWage(branch.staff.plan) : 0;
}

/**
 * Bayar gaji saat tutup hari. Kas kurang → gaji telat (kinerja turun);
 * telat 3 kali berturut-turut → karyawan keluar.
 */
export function payWage(draft: GameState, branch: Branch): { wage: number; late: boolean; quit: boolean } {
  const wage = wageDue(draft, branch);
  if (!branch.staff || wage === 0) return { wage: 0, late: false, quit: false };
  if (draft.player.money >= wage) {
    draft.player.money -= wage;
    branch.staff.lateStreak = 0;
    return { wage, late: false, quit: false };
  }
  branch.staff.lateStreak += 1;
  if (branch.staff.lateStreak >= STAFF_RULES.quitAfterLate) {
    branch.staff = null;
    return { wage: 0, late: true, quit: true };
  }
  return { wage: 0, late: true, quit: false };
}

export function branchAt(draft: GameState, slot: number): Branch {
  const b = draft.branches.list.find((x) => x.slot === slot);
  if (!b) throw new GameRuleError('no-branch', tr('Cabang belum dibuka.'));
  return b;
}
