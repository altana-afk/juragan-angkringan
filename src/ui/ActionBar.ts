import type { GameContext } from '../core/GameContext';
import type { PanelId, SimSpeed } from '../core/GameEvents';
import type { GamePhase } from '../core/GameState';
import { el, setText, type UIComponent } from './dom';
import { icon, type IconName } from './icons';

/**
 * Panel tombol bawah, berubah sesuai fase:
 * - persiapan: Belanja, Persiapan, Mulai Berjualan
 * - berjualan: Persiapan (jam berhenti saat panel terbuka), jeda / 1× / 2× / 3×, info kursi
 * Upgrade (Stage 5) hanya saat persiapan.
 */
export class ActionBar implements UIComponent {
  readonly root: HTMLElement;
  private readonly offs: (() => void)[] = [];
  private phase: GamePhase;
  private speed: SimSpeed = 1;
  private readonly seatInfo = el('span', { className: 'seat-info' });

  constructor(private readonly ctx: GameContext, parent: HTMLElement) {
    this.root = el('nav', { className: 'action-bar', attrs: { 'aria-label': 'Aksi angkringan' } });
    parent.append(this.root);
    this.phase = ctx.store.get().phase;
    this.render();
    this.offs.push(
      ctx.bus.on('state:changed', ({ state }) => {
        if (state.phase !== this.phase) {
          this.phase = state.phase;
          this.render();
        }
      }),
      ctx.bus.on('sales:speed-changed', ({ speed }) => {
        this.speed = speed;
        this.render();
      }),
      ctx.bus.on('sales:status', ({ seatsTaken, seatsTotal }) => setText(this.seatInfo, `Kursi ${seatsTaken}/${seatsTotal}`)),
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
        this.button('Promosi', 'megaphone', 'Pasang iklan satu hari (I)', open('promo'), '', 'Promo'),
        this.button('Upgrade', 'hammer', 'Tingkatkan gerobak, peralatan & tempat (U)', open('upgrade')),
        this.button('Bank', 'bank', 'Deposito & pinjaman (K)', open('bank')),
        this.button('Statistik', 'chart', 'Riwayat & laporan (S)', open('stats'), '', 'Data'),
        this.button('Mulai Berjualan', 'store', 'Buka angkringan (Enter)', () => this.ctx.bus.emit('sales:start-request'), 'action-primary', 'Buka'),
      );
    } else if (this.phase === 'berjualan') {
      items.push(this.button('Persiapan', 'pot', 'Masak lagi — jam berhenti selama panel terbuka (P)', open('kitchen')));
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
      items.push(el('div', { className: 'speed-wrap', children: [group, this.seatInfo] }));
    }
    this.root.replaceChildren(...items);
    this.root.hidden = items.length === 0;
  }

  private readonly onKey = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    if (event.repeat || event.defaultPrevented || target?.closest('input, textarea, select, [role="dialog"]')) return;
    const key = event.key.toLowerCase();
    if (key === 'b' && this.phase === 'persiapan') this.ctx.bus.emit('ui:open-panel', { panel: 'shop' });
    else if (key === 'p' && this.phase !== 'evaluasi') this.ctx.bus.emit('ui:open-panel', { panel: 'kitchen' });
    else if (key === 'i' && this.phase === 'persiapan') this.ctx.bus.emit('ui:open-panel', { panel: 'promo' });
    else if (key === 'k' && this.phase === 'persiapan') this.ctx.bus.emit('ui:open-panel', { panel: 'bank' });
    else if (key === 'u' && this.phase === 'persiapan') this.ctx.bus.emit('ui:open-panel', { panel: 'upgrade' });
    else if (key === 's' && this.phase === 'persiapan') this.ctx.bus.emit('ui:open-panel', { panel: 'stats' });
    else if (key === 'enter' && this.phase === 'persiapan' && target?.tagName !== 'BUTTON') this.ctx.bus.emit('sales:start-request');
    else return;
    event.preventDefault();
  };

  destroy(): void {
    for (const off of this.offs) off();
    window.removeEventListener('keydown', this.onKey);
    this.root.remove();
  }
}
