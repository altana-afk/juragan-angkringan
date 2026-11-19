import type { GameContext } from '../core/GameContext';
import type { DepositTerm, GameState } from '../core/GameState';
import { BANK_RULES, depositBalance, loanLimit, loanOutstanding, maturityDay } from '../systems/BankSystem';
import { formatRupiah } from '../utils/formatting';
import { el } from './dom';
import type { ModalHandle, UIManager } from './UIManager';
import { tr } from '../i18n/i18n';

const TERM_LABEL: Record<DepositTerm, string> = { 7: tr('1 minggu'), 14: tr('2 minggu'), 28: tr('4 minggu') };

/** Input nominal Rupiah dengan tombol cepat. */
function amountInput(initial: number, max: number, quick: readonly number[]): { root: HTMLElement; get: () => number } {
  const input = el('input', {
    className: 'amount-input',
    attrs: { type: 'number', inputmode: 'numeric', min: '0', step: '10000', value: String(initial), 'aria-label': tr('Jumlah (Rp)') },
  }) as HTMLInputElement;
  const quickBtns = quick
    .filter((q) => q <= max)
    .map((q) =>
      el('button', {
        className: 'chip-btn',
        text: q === max ? tr('Semua') : formatRupiah(q).replace('Rp', ''),
        attrs: { type: 'button' },
        onClick: () => {
          input.value = String(q);
        },
      }),
    );
  return { root: el('div', { className: 'amount-row', children: [el('span', { text: 'Rp' }), input, ...quickBtns] }), get: () => Math.floor(Number(input.value) || 0) };
}

function termPicker(name: string, initial: DepositTerm): { root: HTMLElement; get: () => DepositTerm } {
  let value = initial;
  const root = el('div', {
    className: 'term-row',
    attrs: { role: 'radiogroup', 'aria-label': tr('Tempo') },
    children: BANK_RULES.terms.map((t) => {
      const input = el('input', { attrs: { type: 'radio', name, value: String(t) } }) as HTMLInputElement;
      input.checked = t === initial;
      input.addEventListener('change', () => {
        value = t;
      });
      return el('label', { className: 'term-option', children: [input, el('span', { text: TERM_LABEL[t] })] });
    }),
  });
  return { root, get: () => value };
}

/**
 * BANK: deposito (tempo 1/2/4 minggu, bunga 0,5%/hari, bisa ditarik kapan saja, bonus jika sampai jatuh tempo)
 * dan pinjaman (bunga 1%/hari, bisa dicicil, otomatis dipotong saat jatuh tempo).
 */
export class BankPanel {
  private modal: ModalHandle | null = null;
  private off: (() => void) | null = null;
  private readonly body = el('div', { className: 'bank-body' });

  constructor(private readonly ctx: GameContext, private readonly ui: UIManager) {}

  open(): void {
    if (this.modal) return;
    this.modal = this.ui.openModal({
      title: tr('Bank Rakyat Juragan'),
      className: 'sheet sheet-bank',
      closeButton: true,
      body: this.body,
      actions: [],
      onClose: () => {
        this.modal = null;
        this.off?.();
        this.off = null;
      },
    });
    this.off = this.ctx.bus.on('state:changed', ({ reason }) => {
      if (reason.startsWith('bank')) this.render();
    });
    this.render();
  }

  private act(res: { ok: boolean; message: string }): void {
    this.ctx.notify(res.message, res.ok ? 'success' : 'error');
    this.render();
  }

  private render(): void {
    const s = this.ctx.store.get();
    const canAct = s.phase === 'persiapan';
    const parts: (HTMLElement | null)[] = [
      el('div', {
        className: 'bank-summary',
        children: [
          stat(tr('Kas'), formatRupiah(s.player.money)),
          stat(tr('Tabungan deposito'), formatRupiah(depositBalance(s))),
          stat(tr('Utang'), formatRupiah(loanOutstanding(s.bank.loan)), s.bank.loan ? 'is-bad' : ''),
        ],
      }),
      canAct ? null : el('p', { className: 'panel-warning', text: tr('Bank hanya melayani transaksi saat persiapan (sebelum buka).') }),
      this.depositSection(s, canAct),
      this.loanSection(s, canAct),
    ];
    this.body.replaceChildren(...parts.filter((x): x is HTMLElement => x !== null));
  }

  private depositSection(s: Readonly<GameState>, canAct: boolean): HTMLElement {
    const amount = amountInput(Math.min(100_000, Math.max(0, s.player.money)), s.player.money, [100_000, 250_000, 500_000, s.player.money]);
    const term = termPicker('dep-term', 14);
    const open = el('button', {
      className: 'btn btn-primary',
      text: tr('Buka deposito'),
      attrs: { type: 'button' },
      onClick: () => this.act(this.ctx.actions.depositMoney(amount.get(), term.get())),
    });
    open.disabled = !canAct;
    const day = s.calendar.day;
    const rows = s.bank.deposits.map((d) => {
      const due = maturityDay(d.startDay, d.termDays);
      const left = due - day;
      const bonus = Math.round(d.principal * BANK_RULES.maturityBonus[d.termDays]);
      const btn = el('button', {
        className: 'btn btn-secondary btn-sm',
        text: tr('Tarik'),
        attrs: { type: 'button', 'aria-label': tr('Tarik deposito {principal}', { principal: formatRupiah(d.principal) }) },
        onClick: () => this.confirmWithdraw(d.id, d.principal + d.interest, bonus, left),
      });
      btn.disabled = !canAct;
      return el('div', {
        className: 'item-row bank-row',
        children: [
          el('div', {
            className: 'item-info',
            children: [
              el('div', { className: 'item-name', text: tr('{principal} · {1}', { principal: formatRupiah(d.principal), 1: TERM_LABEL[d.termDays] }) }),
              el('div', { className: 'item-meta', text: tr('Bunga terkumpul {interest} (+{1}/hari)', { interest: formatRupiah(d.interest), 1: formatRupiah(Math.round(d.principal * BANK_RULES.depositDailyRate)) }) }),
              el('div', {
                className: 'item-meta',
                text: left <= 0 ? tr('Cair malam ini saat tutup') : tr('Jatuh tempo Hari {due} ({left} hari lagi) · bonus {bonus}', { due, left, bonus: formatRupiah(bonus) }),
              }),
            ],
          }),
          btn,
        ],
      });
    });
    return el('section', {
      className: 'bank-section',
      children: [
        el('h3', { className: 'settings-heading', text: tr('Deposito') }),
        el('p', {
          className: 'panel-note',
          text: tr('Bunga 0,5% per hari dari pokok, masuk ke saldo deposito tiap tutup. Bisa ditarik kapan saja (pokok + bunga). Jika ditahan sampai jatuh tempo, otomatis cair ke kas dengan bonus: 1 minggu +1%, 2 minggu +3%, 4 minggu +8%. Minimal {minDeposit}.', { minDeposit: formatRupiah(BANK_RULES.minDeposit) }),
        }),
        amount.root,
        term.root,
        el('div', { className: 'panel-buttons', children: [open] }),
        ...(rows.length ? rows : [el('p', { className: 'panel-note muted', text: tr('Belum ada deposito.') })]),
      ],
    });
  }

  private loanSection(s: Readonly<GameState>, canAct: boolean): HTMLElement {
    const loan = s.bank.loan;
    const limit = loanLimit(s);
    if (loan) {
      const outstanding = loanOutstanding(loan);
      const due = maturityDay(loan.startDay, loan.termDays);
      const pay = amountInput(Math.min(outstanding, Math.max(0, s.player.money)), Math.min(outstanding, s.player.money), [50_000, 100_000, Math.min(outstanding, s.player.money)]);
      const btn = el('button', {
        className: 'btn btn-primary',
        text: tr('Bayar'),
        attrs: { type: 'button' },
        onClick: () => this.act(this.ctx.actions.repayLoan(pay.get())),
      });
      btn.disabled = !canAct;
      return el('section', {
        className: 'bank-section',
        children: [
          el('h3', { className: 'settings-heading', text: tr('Pinjaman') }),
          el('div', {
            className: 'item-row bank-row is-loan',
            children: [
              el('div', {
                className: 'item-info',
                children: [
                  el('div', { className: 'item-name', text: tr('Sisa utang {outstanding}', { outstanding: formatRupiah(outstanding) }) }),
                  el('div', { className: 'item-meta', text: tr('Pokok {principal} · bunga {interest} (+{2}/hari)', { principal: formatRupiah(loan.principal), interest: formatRupiah(loan.interest), 2: formatRupiah(Math.round(loan.principal * BANK_RULES.loanDailyRate)) }) }),
                  el('div', { className: `item-meta${due - s.calendar.day <= 1 ? ' is-bad' : ''}`, text: tr('Jatuh tempo Hari {due}: sisa utang dipotong otomatis dari kas.', { due }) }),
                ],
              }),
            ],
          }),
          pay.root,
          el('div', { className: 'panel-buttons', children: [btn] }),
        ],
      });
    }
    const amount = amountInput(Math.min(200_000, limit), limit, [100_000, 250_000, 500_000, limit]);
    const term = termPicker('loan-term', 14);
    const btn = el('button', {
      className: 'btn btn-secondary',
      text: tr('Ajukan pinjaman'),
      attrs: { type: 'button' },
      onClick: () => this.confirmLoan(amount.get(), term.get()),
    });
    btn.disabled = !canAct;
    return el('section', {
      className: 'bank-section',
      children: [
        el('h3', { className: 'settings-heading', text: tr('Pinjaman') }),
        el('p', {
          className: 'panel-note',
          text: tr('Plafon {limit} (naik dengan level usaha & popularitas). Bunga 1% per hari dari sisa pokok. Bisa dicicil/dilunasi kapan saja; saat jatuh tempo sisa utang dipotong otomatis dari kas.', { limit: formatRupiah(limit) }),
        }),
        amount.root,
        term.root,
        el('div', { className: 'panel-buttons', children: [btn] }),
      ],
    });
  }

  private confirmWithdraw(id: number, total: number, bonus: number, daysLeft: number): void {
    this.ui.openModal({
      title: tr('Tarik deposito?'),
      body:
        daysLeft > 0
          ? tr('Kamu menerima {total} sekarang. Bonus jatuh tempo {bonus} tidak didapat karena belum jatuh tempo ({daysLeft} hari lagi).', { total: formatRupiah(total), bonus: formatRupiah(bonus), daysLeft })
          : tr('Kamu menerima {total} sekarang.', { total: formatRupiah(total) }),
      actions: [{ label: tr('Batal') }, { label: tr('Tarik'), variant: 'primary', onClick: () => this.act(this.ctx.actions.withdrawDeposit(id)) }],
    });
  }

  private confirmLoan(amount: number, term: DepositTerm): void {
    const daily = Math.round(amount * BANK_RULES.loanDailyRate);
    this.ui.openModal({
      title: tr('Ajukan pinjaman?'),
      body: tr('Pinjam {amount} selama {1}. Bunga ±{daily} per hari (jika tidak dicicil, total bunga ±{3}).', { amount: formatRupiah(amount), 1: TERM_LABEL[term], daily: formatRupiah(daily), 3: formatRupiah(daily * term) }),
      actions: [{ label: tr('Batal') }, { label: tr('Ya, pinjam'), variant: 'primary', onClick: () => this.act(this.ctx.actions.borrow(amount, term)) }],
    });
  }
}

function stat(label: string, value: string, cls = ''): HTMLElement {
  return el('div', { className: `bank-stat ${cls}`, children: [el('span', { className: 'muted', text: label }), el('strong', { text: value })] });
}
