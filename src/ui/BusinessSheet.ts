import type { GameContext } from '../core/GameContext';
import type { PanelId } from '../core/GameEvents';
import type { GameState } from '../core/GameState';
import { el } from './dom';
import { anyBranchNeedsAttention } from '../systems/BranchStatusSystem';
import { icon, type IconName } from './icons';
import { tr } from '../i18n/i18n';

/**
 * Lembar "Usaha" (0.13.0): tempat menu yang jarang dipakai saat persiapan.
 * Ponsel: lembar dari bawah (bottom sheet), grid 2 kolom. Desktop: menu kecil di atas tombol Usaha.
 * Fokus terkunci selama terbuka; Escape / klik di luar menutup; fokus kembali ke tombol Usaha.
 */

export interface BusinessItem {
  readonly panel: PanelId;
  readonly label: string;
  readonly icon: IconName;
  readonly hint: string;
  readonly key: string;
  /** Titik merah: isi ini butuh perhatian. */
  readonly attention?: (state: Readonly<GameState>) => boolean;
}

export const BUSINESS_ITEMS: readonly BusinessItem[] = [
  { panel: 'upgrade', label: tr('Upgrade'), icon: 'hammer', hint: tr('Gerobak, peralatan & tempat'), key: 'U' },
  { panel: 'promo', label: tr('Promosi'), icon: 'megaphone', hint: tr('Iklan satu hari'), key: 'I' },
  { panel: 'delivery', label: tr('Pengantaran'), icon: 'phone', hint: tr('Kurir sendiri atau ojol'), key: '', attention: (s) => s.online.mode === null },
  { panel: 'branches', label: tr('Cabang'), icon: 'store', hint: tr('Sampai 3 cabang'), key: '', attention: anyBranchNeedsAttention },
  { panel: 'stats', label: tr('Statistik'), icon: 'chart', hint: tr('Riwayat & laporan'), key: 'S' },
  { panel: 'bank', label: tr('Bank'), icon: 'bank', hint: tr('Juga lewat ketuk kas'), key: 'K' },
];

/** True jika salah satu isi lembar Usaha butuh perhatian (titik merah di tombol Usaha). */
export function businessNeedsAttention(state: Readonly<GameState>): boolean {
  return BUSINESS_ITEMS.some((i) => i.attention?.(state) ?? false);
}

export class BusinessSheet {
  private readonly root: HTMLElement;
  private readonly grid: HTMLElement;
  private opener: HTMLElement | null = null;
  private isOpen = false;

  constructor(
    private readonly ctx: GameContext,
    parent: HTMLElement,
  ) {
    this.grid = el('div', { className: 'business-grid' });
    this.root = el('div', {
      className: 'business-sheet',
      attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': tr('Usaha'), hidden: '' },
      children: [
        el('div', { className: 'business-scrim', onClick: () => this.close() }),
        el('div', {
          className: 'business-panel',
          children: [el('div', { className: 'business-handle', attrs: { 'aria-hidden': 'true' } }), el('h2', { className: 'business-title', text: tr('Usaha') }), this.grid],
        }),
      ],
    });
    parent.append(this.root);
  }

  get opened(): boolean {
    return this.isOpen;
  }

  toggle(opener: HTMLElement): void {
    if (this.isOpen) this.close();
    else this.open(opener);
  }

  open(opener: HTMLElement): void {
    this.opener = opener;
    this.isOpen = true;
    const s = this.ctx.store.get();
    this.grid.replaceChildren(
      ...BUSINESS_ITEMS.map((item) => {
        const needs = item.attention?.(s) ?? false;
        return el('button', {
          className: `business-item${needs ? ' has-dot' : ''}`,
          attrs: { type: 'button', title: item.key ? tr('{hint} ({key})', { hint: item.hint, key: item.key }) : item.hint, 'data-panel': item.panel },
          children: [
            icon(item.icon, 'px-icon business-icon'),
            el('span', { className: 'business-text', children: [el('strong', { text: item.label }), el('small', { text: item.hint })] }),
            needs ? el('span', { className: 'action-dot', attrs: { 'aria-label': tr('butuh perhatian') } }) : null,
          ],
          onClick: () => {
            this.close(false);
            this.ctx.bus.emit('ui:open-panel', { panel: item.panel });
          },
        });
      }),
    );
    this.place();
    this.root.hidden = false;
    opener.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => {
      this.root.classList.add('is-open');
      (this.grid.querySelector('button') as HTMLButtonElement | null)?.focus({ preventScroll: true });
    });
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('resize', this.place);
  }

  /** Tutup lembar. `restoreFocus` = kembalikan fokus ke tombol Usaha. */
  close(restoreFocus = true): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.remove('is-open');
    this.root.hidden = true;
    this.opener?.setAttribute('aria-expanded', 'false');
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('resize', this.place);
    if (restoreFocus && this.opener?.isConnected) this.opener.focus({ preventScroll: true });
  }

  /** Desktop: menu kecil tepat di atas tombol Usaha. Ponsel (CSS): lembar penuh dari bawah. */
  private readonly place = (): void => {
    const panel = this.root.querySelector('.business-panel') as HTMLElement;
    const r = this.opener?.getBoundingClientRect();
    if (!r) return;
    panel.style.setProperty('--anchor-x', `${Math.round(r.left + r.width / 2)}px`);
    panel.style.setProperty('--anchor-bottom', `${Math.round(window.innerHeight - r.top + 8)}px`);
  };

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.close();
      return;
    }
    if (e.key !== 'Tab') return;
    // Kunci fokus di dalam lembar.
    const items = [...this.grid.querySelectorAll<HTMLButtonElement>('button')];
    if (!items.length) return;
    const first = items[0] as HTMLButtonElement;
    const last = items[items.length - 1] as HTMLButtonElement;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    } else if (!this.root.contains(document.activeElement)) {
      e.preventDefault();
      first.focus();
    }
  };

  destroy(): void {
    this.close(false);
    this.root.remove();
  }
}
