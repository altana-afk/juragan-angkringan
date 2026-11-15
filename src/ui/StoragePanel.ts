import type { GameContext } from '../core/GameContext';
import type { GameState, StockBatch } from '../core/GameState';
import { storageCapacity, storedUnits } from '../systems/EconomySystem';
import { totalQty } from '../systems/InventorySystem';
import { recipesUsing } from '../systems/StorageSystem';
import { formatRupiah } from '../utils/formatting';
import { el, setText } from './dom';
import { itemIcon, stepper } from './itemIcon';
import type { ModalHandle, UIManager } from './UIManager';

/** Rincian umur stok: "4 basi hari ini · 8 sampai Hari 5 · 10 awet". */
export function batchSummary(batches: readonly StockBatch[], today: number): { text: string; urgent: boolean } {
  const groups = new Map<number | null, number>();
  for (const b of batches) groups.set(b.expiresDay, (groups.get(b.expiresDay) ?? 0) + b.qty);
  const parts = [...groups.entries()]
    .sort((a, b) => (a[0] ?? Infinity) - (b[0] ?? Infinity))
    .map(([day, qty]) => {
      if (day === null) return `${qty} awet`;
      if (day <= today) return `${qty} basi akhir hari ini`;
      if (day === today + 1) return `${qty} basi besok`;
      return `${qty} sampai Hari ${day}`;
    });
  const urgent = batches.some((b) => b.expiresDay !== null && b.expiresDay <= today + 1);
  return { text: parts.join(' · '), urgent };
}

/**
 * Panel Gudang: isi gudang yang jelas (jumlah & satuan, umur simpan per batch, nilai modal,
 * dipakai untuk menu apa) + kapasitas, dan bisa membuang/mengurangi stok untuk memberi ruang.
 */
export class StoragePanel {
  private modal: ModalHandle | null = null;
  private off: (() => void) | null = null;
  private readonly discard = new Map<string, number>();
  private readonly list = el('div', { className: 'item-list' });
  private readonly capText = el('span');
  private readonly capFill = el('span', { className: 'cap-fill' });
  private readonly valueText = el('span', { className: 'muted' });

  constructor(private readonly ctx: GameContext, private readonly ui: UIManager) {}

  isOpen(): boolean {
    return this.modal !== null;
  }

  open(): void {
    if (this.modal) return;
    this.discard.clear();
    this.modal = this.ui.openModal({
      title: 'Gudang Bahan',
      className: 'sheet sheet-storage',
      closeButton: true,
      body: el('div', {
        children: [
          el('div', {
            className: 'capacity',
            children: [
              el('div', { className: 'capacity-row', children: [this.capText, this.valueText] }),
              el('div', { className: 'cap-bar', children: [this.capFill] }),
            ],
          }),
          el('p', { className: 'panel-note', text: 'Bahan yang paling cepat basi dibuang lebih dulu. Bahan yang dibuang tidak dapat dikembalikan dan uangnya tidak kembali.' }),
          this.list,
        ],
      }),
      actions: [],
      onClose: () => {
        this.modal = null;
        this.off?.();
        this.off = null;
      },
    });
    this.off = this.ctx.bus.on('state:changed', () => this.render());
    this.render();
  }

  private render(): void {
    if (!this.modal) return;
    const s = this.ctx.store.get();
    const used = storedUnits(s);
    const cap = storageCapacity(s);
    const pct = Math.min(100, Math.round((used / cap) * 100));
    setText(this.capText, `Terisi ${used}/${cap} satuan (${pct}%)`);
    this.capFill.style.width = `${pct}%`;
    this.capFill.classList.toggle('is-full', pct >= 90);
    const entries = Object.entries(s.inventory.ingredients).filter(([, b]) => totalQty(b) > 0);
    const value = entries.reduce((sum, [, b]) => sum + b.reduce((v, x) => v + x.qty * x.unitCost, 0), 0);
    setText(this.valueText, `nilai modal ±${formatRupiah(Math.round(value))}`);
    if (entries.length === 0) {
      this.list.replaceChildren(el('p', { className: 'panel-note muted', text: 'Gudang kosong. Beli bahan lewat menu Belanja.' }));
      return;
    }
    // Yang paling mendesak (cepat basi) di atas.
    entries.sort(([, a], [, b]) => soonest(a) - soonest(b));
    this.list.replaceChildren(...entries.map(([id, batches]) => this.row(s, id, batches)));
  }

  private row(s: Readonly<GameState>, id: string, batches: readonly StockBatch[]): HTMLElement {
    const def = this.ctx.catalog.ingredient(id);
    const have = totalQty(batches);
    const { text, urgent } = batchSummary(batches, s.calendar.day);
    const uses = recipesUsing(s, this.ctx.catalog, id);
    const amount = Math.min(this.discard.get(id) ?? 0, have);
    const step = stepper(`buang ${def.name}`, amount, (n) => {
      this.discard.set(id, n);
      this.render();
    }, have);
    const discardBtn = el('button', {
      className: 'btn btn-danger btn-sm',
      text: amount > 0 ? `Buang ${amount}` : 'Buang',
      attrs: { type: 'button', 'aria-label': `Buang ${amount} ${def.unit} ${def.name}` },
      onClick: () => this.doDiscard(id, amount),
    });
    discardBtn.disabled = amount <= 0 || s.phase === 'evaluasi';
    const allBtn = el('button', {
      className: 'link-btn',
      text: 'Buang semua',
      attrs: { type: 'button', 'aria-label': `Buang semua ${def.name}` },
      onClick: () => this.confirmAll(id, have),
    });
    return el('div', {
      className: `item-row storage-row${urgent ? ' is-urgent' : ''}`,
      children: [
        itemIcon(def.icon),
        el('div', {
          className: 'item-info',
          children: [
            el('div', { className: 'item-name', text: `${def.name} — ${have} ${def.unit}` }),
            el('div', { className: `item-meta${urgent ? ' is-bad' : ''}`, text: text }),
            el('div', {
              className: `item-meta${uses.length ? '' : ' is-bad'}`,
              text: uses.length ? `Untuk: ${uses.join(', ')}` : 'Tidak dipakai menu yang terbuka — aman dibuang',
            }),
          ],
        }),
        el('div', { className: 'storage-actions', children: [step.root, discardBtn, allBtn] }),
      ],
    });
  }

  private doDiscard(id: string, qty: number): void {
    const res = this.ctx.actions.discardIngredient(id, qty);
    this.ctx.notify(res.message, res.ok ? 'info' : 'error');
    this.discard.delete(id);
    this.render();
  }

  private confirmAll(id: string, have: number): void {
    const def = this.ctx.catalog.ingredient(id);
    this.ui.openModal({
      title: `Buang semua ${def.name}?`,
      body: `${have} ${def.unit} ${def.name} akan dibuang dari gudang. Uang tidak kembali.`,
      actions: [{ label: 'Batal' }, { label: 'Ya, buang', variant: 'danger', onClick: () => this.doDiscard(id, have) }],
    });
  }
}

function soonest(batches: readonly StockBatch[]): number {
  return Math.min(...batches.map((b) => b.expiresDay ?? Infinity));
}
