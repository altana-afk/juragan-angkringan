import type { GameContext } from '../core/GameContext';
import { ADS, activeAdEffect } from '../systems/AdvertisingSystem';
import { arrivalChancePerMinute } from '../systems/DemandSystem';
import { totalQty } from '../systems/InventorySystem';
import { modifiersOf } from '../systems/SalesSimulation';
import { GAME_CONFIG } from '../config/gameConfig';
import { formatRupiah } from '../utils/formatting';
import { el, setText } from './dom';
import type { ModalHandle, UIManager } from './UIManager';

/** Perkiraan jumlah rombongan hari ini untuk pengubah permintaan tertentu. */
function expectedCustomers(ctx: GameContext, ads: string[]): number {
  const s = ctx.store.get();
  const mods = { ...modifiersOf(s), ...activeAdEffect(ads) };
  let total = 0;
  for (let m = GAME_CONFIG.dayCycle.openMinutes; m < GAME_CONFIG.dayCycle.closeMinutes; m++) total += arrivalChancePerMinute(m, s.player.popularity, mods);
  return total;
}

/** Panel Promosi: pasang/batalkan iklan satu hari sebelum mulai berjualan. */
export class PromoPanel {
  private modal: ModalHandle | null = null;
  private off: (() => void) | null = null;
  private readonly list = el('div', { className: 'item-list' });
  private readonly forecast = el('p', { className: 'panel-note' });
  private readonly warning = el('p', { className: 'panel-warning' });

  constructor(private readonly ctx: GameContext, private readonly ui: UIManager) {}

  open(): void {
    if (this.modal) return;
    this.modal = this.ui.openModal({
      title: 'Promosi Hari Ini',
      className: 'sheet sheet-promo',
      closeButton: true,
      body: el('div', {
        children: [
          el('p', { className: 'panel-note', text: 'Iklan hanya berlaku hari ini dan tidak menaikkan popularitas langsung — popularitas naik dari pelayanan yang baik. Pastikan stok cukup untuk pelanggan tambahan!' }),
          this.list,
        ],
      }),
      footer: el('div', { className: 'panel-footer', children: [this.forecast, this.warning] }),
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
    const active = s.ledger.ads;
    const base = expectedCustomers(this.ctx, []);
    this.list.replaceChildren(
      ...ADS.map((ad) => {
        const on = active.includes(ad.id);
        const extra = expectedCustomers(this.ctx, on ? active : [...active, ad.id]) - expectedCustomers(this.ctx, on ? active.filter((a) => a !== ad.id) : active);
        const btn = el('button', {
          className: `btn ${on ? 'btn-secondary' : 'btn-primary'} btn-sm`,
          text: on ? 'Batalkan' : `Pasang ${formatRupiah(ad.cost)}`,
          attrs: { type: 'button' },
          onClick: () => {
            const res = on ? this.ctx.actions.cancelAd(ad.id) : this.ctx.actions.buyAd(ad.id);
            this.ctx.notify(res.message, res.ok ? 'success' : 'error');
          },
        });
        btn.disabled = s.phase !== 'persiapan' || (!on && s.player.money < ad.cost);
        return el('div', {
          className: `item-row${on ? ' in-cart' : ''}`,
          children: [
            el('div', {
              className: 'item-info',
              children: [
                el('div', { className: 'item-name', text: `${ad.name}${on ? ' ✓' : ''}` }),
                el('div', { className: 'item-meta', text: ad.description }),
                el('div', { className: 'item-meta', text: `${ad.effectLabel} · ±${extra.toFixed(1)} rombongan` }),
              ],
            }),
            btn,
          ],
        });
      }),
    );
    const expected = expectedCustomers(this.ctx, active);
    setText(this.forecast, `Perkiraan pelanggan hari ini: ±${Math.round(expected)} rombongan (tanpa iklan ±${Math.round(base)}). Biaya promosi: ${formatRupiah(s.ledger.promotionCost)}.`);
    const portions = Object.values(s.inventory.products).reduce((n, b) => n + totalQty(b), 0);
    setText(
      this.warning,
      active.length && portions < expected * 1.5
        ? `Stok siap jual hanya ${portions} porsi — pelanggan tambahan bisa kecewa dan menurunkan popularitas.`
        : '',
    );
  }
}
