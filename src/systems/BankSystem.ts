import type { DepositTerm, GameState, Loan } from '../core/GameState';
import { formatRupiah } from '../utils/formatting';
import { GameRuleError } from './rules';
import { effectsOf } from './UpgradeSystem';

/**
 * BANK: deposito & pinjaman.
 * - Deposito tempo 1/2/4 minggu, bunga 0,5% per hari dari pokok (masuk saldo deposito tiap tutup hari).
 *   Bisa ditarik kapan saja (pokok + bunga terkumpul). Jika ditahan sampai jatuh tempo, otomatis cair ke kas
 *   plus bonus jatuh tempo.
 * - Pinjaman: satu pinjaman aktif, bunga 1% per hari dari sisa pokok, bisa dilunasi/dicicil kapan saja;
 *   saat jatuh tempo sisa utang otomatis dipotong dari kas.
 */
export const BANK_RULES = {
  depositDailyRate: 0.005,
  terms: [7, 14, 28] as const satisfies readonly DepositTerm[],
  maturityBonus: { 7: 0.01, 14: 0.03, 28: 0.08 } as Record<DepositTerm, number>,
  minDeposit: 50_000,
  maxDeposits: 5,
  loanDailyRate: 0.01,
  minLoan: 50_000,
} as const;

const isTerm = (t: number): t is DepositTerm => (BANK_RULES.terms as readonly number[]).includes(t);

function requirePrep(draft: GameState): void {
  if (draft.phase !== 'persiapan') throw new GameRuleError('wrong-phase', 'Bank hanya melayani saat persiapan (sebelum buka).');
}

export function depositBalance(state: Readonly<GameState>): number {
  return state.bank.deposits.reduce((s, d) => s + d.principal + d.interest, 0);
}

export function loanOutstanding(loan: Readonly<Loan> | null): number {
  return loan ? loan.principal + loan.interest : 0;
}

/** Hari jatuh tempo (deposito/pinjaman cair saat tutup hari ini). */
export function maturityDay(startDay: number, termDays: number): number {
  return startDay + termDays - 1;
}

export function openDeposit(draft: GameState, amount: number, term: number): number {
  requirePrep(draft);
  if (!isTerm(term)) throw new GameRuleError('term-invalid', 'Tempo deposito: 1, 2, atau 4 minggu.');
  if (!Number.isInteger(amount) || amount < BANK_RULES.minDeposit) throw new GameRuleError('amount-invalid', `Deposito minimal ${formatRupiah(BANK_RULES.minDeposit)}.`);
  if (amount > draft.player.money) throw new GameRuleError('money-short', 'Uang kas tidak cukup.');
  if (draft.bank.deposits.length >= BANK_RULES.maxDeposits) throw new GameRuleError('too-many', `Maksimal ${BANK_RULES.maxDeposits} deposito aktif.`);
  const id = draft.bank.nextId++;
  draft.player.money -= amount;
  draft.bank.deposits.push({ id, principal: amount, interest: 0, startDay: draft.calendar.day, termDays: term });
  return id;
}

/** Tarik deposito kapan saja: pokok + bunga terkumpul (tanpa bonus jatuh tempo). */
export function withdrawDeposit(draft: GameState, id: number): number {
  requirePrep(draft);
  const i = draft.bank.deposits.findIndex((d) => d.id === id);
  const dep = draft.bank.deposits[i];
  if (!dep) throw new GameRuleError('deposit-unknown', 'Deposito tidak ditemukan.');
  const total = dep.principal + dep.interest;
  draft.player.money += total;
  draft.bank.deposits.splice(i, 1);
  return total;
}

/** Plafon pinjaman: naik dengan level usaha & popularitas. */
export function loanLimit(state: Readonly<GameState>): number {
  const level = effectsOf(state).businessLevel;
  const raw = 300_000 + 200_000 * (level - 1) + Math.round(state.player.popularity) * 5_000;
  return Math.floor(raw / 10_000) * 10_000;
}

export function takeLoan(draft: GameState, amount: number, term: number): void {
  requirePrep(draft);
  if (draft.bank.loan) throw new GameRuleError('loan-active', 'Lunasi pinjaman yang ada dulu.');
  if (!isTerm(term)) throw new GameRuleError('term-invalid', 'Tempo pinjaman: 1, 2, atau 4 minggu.');
  const limit = loanLimit(draft);
  if (!Number.isInteger(amount) || amount < BANK_RULES.minLoan) throw new GameRuleError('amount-invalid', `Pinjaman minimal ${formatRupiah(BANK_RULES.minLoan)}.`);
  if (amount > limit) throw new GameRuleError('over-limit', `Plafon pinjamanmu ${formatRupiah(limit)}.`);
  draft.player.money += amount;
  draft.bank.loan = { principal: amount, interest: 0, borrowed: amount, startDay: draft.calendar.day, termDays: term };
}

/** Bayar pinjaman (bunga dulu, lalu pokok). Mengembalikan jumlah yang dibayar. */
export function repayLoan(draft: GameState, amount: number): number {
  requirePrep(draft);
  const loan = draft.bank.loan;
  if (!loan) throw new GameRuleError('no-loan', 'Tidak ada pinjaman.');
  if (!Number.isInteger(amount) || amount <= 0) throw new GameRuleError('amount-invalid', 'Jumlah bayar tidak valid.');
  const pay = Math.min(amount, loanOutstanding(loan));
  if (pay > draft.player.money) throw new GameRuleError('money-short', 'Uang kas tidak cukup.');
  draft.player.money -= pay;
  const toInterest = Math.min(pay, loan.interest);
  loan.interest -= toInterest;
  loan.principal -= pay - toInterest;
  draft.bank.totalInterestPaid += toInterest;
  if (loan.principal <= 0 && loan.interest <= 0) {
    draft.bank.loan = null;
    draft.bank.loansRepaid += 1;
  }
  return pay;
}

export interface BankCloseResult {
  income: number;
  loanCost: number;
  matured: number;
  loanAutoPaid: number;
  depositsUsed: number;
}

/**
 * Proses bank saat tutup hari: bunga deposito & pinjaman, pencairan jatuh tempo, potong pinjaman jatuh tempo,
 * dan bila kas minus, deposito dicairkan otomatis untuk menutupnya.
 */
export function processBankAtClose(draft: GameState): BankCloseResult {
  const day = draft.calendar.day;
  const bank = draft.bank;
  const res: BankCloseResult = { income: 0, loanCost: 0, matured: 0, loanAutoPaid: 0, depositsUsed: 0 };
  for (const dep of [...bank.deposits]) {
    const interest = Math.round(dep.principal * BANK_RULES.depositDailyRate);
    dep.interest += interest;
    res.income += interest;
    if (day >= maturityDay(dep.startDay, dep.termDays)) {
      const bonus = Math.round(dep.principal * BANK_RULES.maturityBonus[dep.termDays]);
      res.income += bonus;
      const total = dep.principal + dep.interest + bonus;
      draft.player.money += total;
      res.matured += total;
      bank.depositsMatured += 1;
      bank.deposits = bank.deposits.filter((d) => d.id !== dep.id);
    }
  }
  const loan = bank.loan;
  if (loan) {
    const interest = Math.round(loan.principal * BANK_RULES.loanDailyRate);
    loan.interest += interest;
    res.loanCost += interest;
    if (day >= maturityDay(loan.startDay, loan.termDays)) {
      const due = loanOutstanding(loan);
      draft.player.money -= due;
      bank.totalInterestPaid += loan.interest;
      res.loanAutoPaid = due;
      bank.loan = null;
      bank.loansRepaid += 1;
    }
  }
  // Kas minus → cairkan deposito (yang paling dekat jatuh tempo dulu).
  if (draft.player.money < 0 && bank.deposits.length) {
    bank.deposits.sort((a, b) => maturityDay(a.startDay, a.termDays) - maturityDay(b.startDay, b.termDays));
    while (draft.player.money < 0 && bank.deposits.length) {
      const dep = bank.deposits.shift()!;
      const total = dep.principal + dep.interest;
      draft.player.money += total;
      res.depositsUsed += total;
    }
  }
  bank.totalInterestEarned += res.income;
  draft.ledger.bankIncome += res.income;
  draft.ledger.loanCost += res.loanCost;
  return res;
}
