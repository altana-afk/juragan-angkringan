import type { EventBus } from '../core/EventBus';
import type { GameEvents, NotificationKind } from '../core/GameEvents';
import { el } from './dom';
import { tr } from '../i18n/i18n';

export interface ModalAction {
  label: string;
  variant?: 'primary' | 'secondary' | 'danger';
  /** Kembalikan false untuk menahan modal tetap terbuka. */
  onClick?: () => void | boolean;
}

export interface ModalOptions {
  title: string;
  body?: HTMLElement | string;
  actions: ModalAction[];
  /** Bisa ditutup dengan Esc / klik latar (default true). */
  dismissible?: boolean;
  onClose?: () => void;
  className?: string;
  /** Elemen kaki tetap (mis. total & tombol aksi) di bawah area yang bisa di-scroll. */
  footer?: HTMLElement;
  /** Tampilkan tombol × di pojok kanan atas. */
  closeButton?: boolean;
  /** Elemen tambahan di header (sebelah judul). */
  headerExtra?: HTMLElement;
}

export interface ModalHandle {
  close(): void;
  readonly element: HTMLElement;
}

const MAX_TOASTS = 3;

interface InternalModal extends ModalHandle {
  readonly dismissible: boolean;
}

/**
 * Pengelola lapisan UI (DOM + CSS) di atas kanvas Phaser:
 * HUD, layar (menu), modal, dan notifikasi toast.
 */
export class UIManager {
  readonly layers: { readonly hud: HTMLElement; readonly screen: HTMLElement; readonly modal: HTMLElement; readonly toast: HTMLElement };
  private readonly openModals: InternalModal[] = [];
  private readonly offNotify: () => void;

  constructor(
    readonly root: HTMLElement,
    bus: EventBus<GameEvents>,
  ) {
    root.replaceChildren();
    this.layers = {
      hud: el('div', { className: 'ui-layer layer-hud' }),
      screen: el('div', { className: 'ui-layer layer-screen' }),
      modal: el('div', { className: 'ui-layer layer-modal' }),
      toast: el('div', { className: 'ui-layer layer-toast', attrs: { 'aria-live': 'polite', role: 'status' } }),
    };
    root.append(this.layers.hud, this.layers.screen, this.layers.modal, this.layers.toast);
    this.offNotify = bus.on('notify', ({ message, kind, durationMs }) => this.toast(message, kind, durationMs));
    window.addEventListener('keydown', this.onKeyDown);
  }

  /** Tampilkan notifikasi singkat. */
  toast(message: string, kind: NotificationKind = 'info', durationMs = 3200): void {
    const node = el('div', { className: `toast toast-${kind}`, text: message });
    this.layers.toast.append(node);
    while (this.layers.toast.children.length > MAX_TOASTS) this.layers.toast.firstElementChild?.remove();
    requestAnimationFrame(() => node.classList.add('is-visible'));
    window.setTimeout(() => {
      node.classList.remove('is-visible');
      node.classList.add('is-leaving');
      window.setTimeout(() => node.remove(), 300);
    }, durationMs);
  }

  hasOpenModal(): boolean {
    return this.openModals.length > 0;
  }

  private timeHolds = 0;

  /** Tahan jam permainan (mis. selama panel dialog terbuka). Panggil fungsi kembaliannya untuk melepas. */
  holdTime(): () => void {
    this.timeHolds++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.timeHolds = Math.max(0, this.timeHolds - 1);
    };
  }

  /** True jika waktu sedang ditahan (modal terbuka atau dialog berlangsung). */
  isTimeHeld(): boolean {
    return this.timeHolds > 0 || this.hasOpenModal();
  }

  openModal(options: ModalOptions): ModalHandle {
    const dismissible = options.dismissible ?? true;
    const titleId = `modal-title-${Math.random().toString(36).slice(2, 8)}`;
    const actions = el('div', { className: 'modal-actions' });
    const closeBtn = options.closeButton
      ? el('button', { className: 'modal-close', text: '×', attrs: { type: 'button', 'aria-label': tr('Tutup') } })
      : null;
    const header = el('div', {
      className: 'modal-header',
      children: [el('h2', { className: 'modal-title', text: options.title, attrs: { id: titleId } }), options.headerExtra ?? null, closeBtn],
    });
    const content = el('div', {
      className: 'modal-content',
      children: [typeof options.body === 'string' ? el('p', { className: 'modal-body', text: options.body }) : options.body ?? null],
    });
    const panel = el('div', {
      className: `panel modal ${options.className ?? ''}`.trim(),
      attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
      children: [header, content, options.footer ?? null, options.actions.length ? actions : null],
    });
    const backdrop = el('div', { className: 'modal-backdrop', children: [panel] });

    let closed = false;
    const handle: InternalModal = {
      element: panel,
      dismissible,
      close: () => {
        if (closed) return;
        closed = true;
        const idx = this.openModals.indexOf(handle);
        if (idx >= 0) this.openModals.splice(idx, 1);
        backdrop.classList.add('is-leaving');
        window.setTimeout(() => backdrop.remove(), 160);
        options.onClose?.();
      },
    };

    closeBtn?.addEventListener('click', () => handle.close());
    for (const action of options.actions) {
      const button = el('button', {
        className: `btn btn-${action.variant ?? 'secondary'}`,
        text: action.label,
        attrs: { type: 'button' },
        onClick: () => {
          const keepOpen = action.onClick?.() === false;
          if (!keepOpen) handle.close();
        },
      });
      actions.append(button);
    }
    if (dismissible) {
      backdrop.addEventListener('pointerdown', (e) => {
        if (e.target === backdrop) handle.close();
      });
    }
    this.layers.modal.append(backdrop);
    this.openModals.push(handle);
    requestAnimationFrame(() => {
      backdrop.classList.add('is-visible');
      (panel.querySelector('.modal-actions button, .modal-close') as HTMLButtonElement | null)?.focus({ preventScroll: true });
    });
    return handle;
  }

  closeAllModals(): void {
    for (const m of [...this.openModals]) m.close();
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    const top = this.openModals[this.openModals.length - 1];
    if (top?.dismissible) {
      event.preventDefault();
      top.close();
    }
  };

  destroy(): void {
    this.offNotify();
    window.removeEventListener('keydown', this.onKeyDown);
    this.root.replaceChildren();
  }
}

export const UI_REGISTRY_KEY = 'uiManager';
