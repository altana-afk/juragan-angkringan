import type { GameContext } from '../core/GameContext';
import type { PanelId, SimSpeed } from '../core/GameEvents';
import type { GamePhase } from '../core/GameState';
import { el, setText, type UIComponent } from './dom';
import { icon, type IconName } from './icons';
import { BusinessSheet, businessNeedsAttention } from './BusinessSheet';
import { pendingOrders } from '../systems/OnlineOrderSystem';

/**
 * Panel tombol bawah (0.13.0: maksimal 4 tombol + tombol utama, di semua ukuran layar):
 * - persiapan: Belanja, Masak, Usaha (lembar berisi Upgrade, Promosi, Pengantaran, Statistik, Bank), Mulai Berjualan
 * - berjualan: Masak (jam berhenti saat panel terbuka), Pesanan (+ jumlah menunggu), jeda / 1× / 2× / 3×
 * Info kursi pindah ke HUD. Pintasan keyboard lama tetap: B, P, I, U, K, S, H, N; baru: O (Pesanan).
 */
export class ActionBar implements UIComponent {
  readonly root: HTMLElement;
  private readonly offs: (() => void)[] = [];
  private phase: GamePhase;
  private speed: SimSpeed = 1;
  private readonly sheet: BusinessSheet;
  private usahaButton: HTMLButtonElement | null = null;
  private ordersButton: HTMLButtonElement | null = null;
  private readonly ordersBadge = el('span', { className: 'action-badge' });

  constructor(private readonly ctx: GameContext, parent: HTMLElement) {
    this.root = el('nav', { className: 'action-bar', attrs: { 'aria-label': 'Aksi angkringan' } });
    parent.append(this.root);
    this.phase = ctx.store.get().phase;
    this.sheet = new BusinessSheet(ctx, parent);
    this.render();
    this.offs.push(
      ctx.bus.on('state:changed', ({ state }) => {
        if (state.phase !== this.phase) {
          this.phase = state.phase;
          this.sheet.close(false);
          this.render();
        } else this.refreshBadges();
      }),
      ctx.bus.on('sales:speed-changed', ({ speed }) => {
        this.speed = speed;
        this.render();
      }),
    );
    window.addEventListener('keydown', this.onKey);
  }

  private button(label: string, iconName: IconName | null, hint: string, onClick: () => void, extra = '', short?: string): HTMLButtonElement {
    return el('button', {
      className: `action-btn ${extra}`.trim(),
      attrs: { type: 'button', title: hint, 'aria-label': label },
      children: [
        iconName ? icon(iconName, 'px-icon action-icon') : null,
        el('span', { className: short ? 'label-full' : '', text: label }),
        short ? el('span', { className: 'label-short', text: short }) : null,
      ],
      onClick,
    });
  }

  private render(): void {
    const open = (panel: PanelId) => () => this.ctx.bus.emit('ui:open-panel', { panel });
    const items: HTMLElement[] = [];
    if (this.phase === 'persiapan') {
      items.push(
        this.button('Belanja', 'basket', 'Beli bahan baku (B)', open('shop')),
        this.button('Persiapan', 'pot', 'Masak produk untuk dijual (P)', open('kitchen'), '', 'Masak'),
      );
      this.usahaButton = this.button('Usaha', 'briefcase', 'Upgrade, Promosi, Pengantaran, Statistik, Bank', () => {
        this.ctx.bus.emit('story:hint', { show: false, kind: 'bar' });
        this.ctx.actions.markOnlineFlag('barHint');
        this.sheet.toggle(this.usahaButton!);
      }, 'action-usaha');
      if (!this.ctx.store.get().online.flags.barHint) {
        window.setTimeout(() => {
          if (!this.ctx.store.get().online.flags.barHint) this.ctx.bus.emit('story:hint', { show: true, kind: 'bar' });
        }, 1500);
      }
      this.usahaButton.setAttribute('aria-haspopup', 'dialog');
      this.usahaButton.setAttribute('aria-expanded', 'false');
      this.usahaButton.append(el('span', { className: 'action-dot', attrs: { 'aria-hidden': 'true' } }));
      items.push(
        this.usahaButton,
        this.button('Mulai Berjualan', 'store', 'Buka angkringan (Enter)', () => this.ctx.bus.emit('sales:start-request'), 'action-primary', 'Buka'),
      );
    } else if (this.phase === 'berjualan') {
      items.push(this.button('Persiapan', 'pot', 'Masak lagi — jam berhenti selama panel terbuka (P)', open('kitchen'), '', 'Masak'));
      this.ordersButton = this.button('Pesanan', 'phone', 'Pesanan online — terima atau tolak (O)', open('orders'), 'action-orders');
      this.ordersButton.append(this.ordersBadge);
      items.push(this.ordersButton);
      const speeds: [SimSpeed, string, string][] = [[0, '❚❚', 'Jeda (Spasi)'], [1, '1×', 'Normal (1)'], [2, '2×', 'Cepat (2)'], [3, '3×', 'Sangat cepat (3)']];
      const group = el('div', { className: 'speed-group', attrs: { role: 'group', 'aria-label': 'Kecepatan waktu' } });
      for (const [speed, label, hint] of speeds) {
        const b = el('button', {
          className: `speed-btn${this.speed === speed ? ' is-active' : ''}`,
          text: label,
          attrs: { type: 'button', title: hint, 'aria-pressed': String(this.speed === speed) },
          onClick: () => this.ctx.bus.emit('sales:set-speed', { speed }),
        });
        group.append(b);
      }
      items.push(el('div', { className: 'speed-wrap', children: [group] }));
    }
    if (this.phase !== 'persiapan') this.usahaButton = null;
    if (this.phase !== 'berjualan') this.ordersButton = null;
    this.root.replaceChildren(...items);
    this.root.hidden = items.length === 0;
    this.refreshBadges();
  }

  /** Titik merah Usaha & angka pesanan menunggu. */
  private refreshBadges(): void {
    const s = this.ctx.store.get();
    this.usahaButton?.classList.toggle('has-dot', businessNeedsAttention(s));
    const n = pendingOrders(s).length;
    setText(this.ordersBadge, String(n));
    this.ordersBadge.hidden = n === 0;
    this.ordersButton?.classList.toggle('has-orders', n > 0);
    if (this.ordersButton) {
      this.ordersButton.setAttribute('aria-label', n ? `Pesanan, ${n} menunggu` : 'Pesanan');
      this.ordersButton.classList.toggle('is-off', !s.online.mode || !s.online.enabled);
    }
  }

  private readonly onKey = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    if (event.repeat || event.defaultPrevented || target?.closest('input, textarea, select, [role="dialog"]')) return;
    const key = event.key.toLowerCase();
    if (key === 'b' && this.phase === 'persiapan') this.ctx.bus.emit('ui:open-panel', { panel: 'shop' });
    else if (key === 'p' && this.phase !== 'evaluasi') this.ctx.bus.emit('ui:open-panel', { panel: 'kitchen' });
    else if (key === 'i' && this.phase === 'persiapan') this.ctx.bus.emit('ui:open-panel', { panel: 'promo' });
    else if (key === 'k' && this.phase === 'persiapan') this.ctx.bus.emit('ui:open-panel', { panel: 'bank' });
    else if (key === 'o' && this.phase === 'berjualan') this.ctx.bus.emit('ui:open-panel', { panel: 'orders' });
    else if (key === 'u' && this.phase === 'persiapan') this.ctx.bus.emit('ui:open-panel', { panel: 'upgrade' });
    else if (key === 's' && this.phase === 'persiapan') this.ctx.bus.emit('ui:open-panel', { panel: 'stats' });
    else if (key === 'h' && !this.ctx.store.get().bankrupt) this.ctx.bus.emit('ui:open-panel', { panel: 'guide' });
    else if (key === 'n' && !this.ctx.store.get().bankrupt) this.ctx.bus.emit('ui:open-panel', { panel: 'story' });
    else if (key === 'enter' && this.phase === 'persiapan' && target?.tagName !== 'BUTTON') this.ctx.bus.emit('sales:start-request');
    else return;
    event.preventDefault();
  };

  destroy(): void {
    for (const off of this.offs) off();
    this.sheet.destroy();
    window.removeEventListener('keydown', this.onKey);
    this.root.remove();
  }
}
