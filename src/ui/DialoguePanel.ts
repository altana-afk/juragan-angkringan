import { namedById, type NamedId } from '../data/story';
import { namedPortrait } from '../graphics/art/customers';
import { el, setText } from './dom';
import { pixelDataUrl } from './pixelImage';
import type { UIManager } from './UIManager';
import { tr } from '../i18n/i18n';

/**
 * Panel dialog di bawah layar (gaya RPG): potret di kiri, nama cyan, teks putih.
 * Ketuk panel / Enter / Spasi untuk lanjut; baris terakhir menutup panel.
 * Selama panel terbuka, jam permainan ditahan sehingga kesabaran pelanggan ikut berhenti.
 */

export interface DialogueOptions {
  readonly who: NamedId;
  readonly lines: readonly string[];
  /** Judul kabar (opsional), tampil kecil di atas teks. */
  readonly title?: string | null;
  /** Dipanggil sekali saat panel ditutup (baris habis atau dilewati). */
  readonly onDone?: () => void;
}

let current: { close: () => void } | null = null;

export function isDialogueOpen(): boolean {
  return current !== null;
}

export function portraitUrl(who: NamedId): string {
  return pixelDataUrl(`portrait-${who}`, () => namedPortrait(who));
}

export function openDialogue(ui: UIManager, options: DialogueOptions): void {
  if (current) return;
  const def = namedById(options.who);
  let index = 0;
  const release = ui.holdTime();
  const text = el('p', { className: 'dialogue-text' });
  const counter = el('span', { className: 'dialogue-counter' });
  const next = el('button', { className: 'btn btn-primary dialogue-next', attrs: { type: 'button' } });
  const root = el('section', {
    className: 'dialogue-panel',
    attrs: { role: 'dialog', 'aria-label': tr('Obrolan dengan {name}', { name: def.name }), 'aria-live': 'polite' },
    children: [
      el('div', {
        className: 'dialogue-portrait',
        children: [el('img', { attrs: { src: portraitUrl(options.who), alt: '' } })],
      }),
      el('div', {
        className: 'dialogue-body',
        children: [
          el('div', {
            className: 'dialogue-head',
            children: [
              el('strong', { className: 'dialogue-name', text: def.name }),
              options.title ? el('span', { className: 'dialogue-title', text: tr('📰 {title}', { title: options.title }) }) : null,
            ],
          }),
          text,
          el('div', { className: 'dialogue-foot', children: [counter, next] }),
        ],
      }),
    ],
  });

  const render = (): void => {
    setText(text, options.lines[index] ?? '');
    const last = index >= options.lines.length - 1;
    setText(next, last ? tr('Tutup') : tr('Lanjut ▸'));
    setText(counter, options.lines.length > 1 ? tr('{0}/{length}', { 0: index + 1, length: options.lines.length }) : '');
    text.classList.remove('is-in');
    void text.offsetWidth;
    text.classList.add('is-in');
  };

  const close = (): void => {
    if (!current) return;
    current = null;
    window.removeEventListener('keydown', onKey, true);
    root.classList.remove('is-visible');
    window.setTimeout(() => root.remove(), 220);
    release();
    options.onDone?.();
  };

  const advance = (): void => {
    if (index >= options.lines.length - 1) close();
    else {
      index++;
      render();
    }
  };

  const onKey = (e: KeyboardEvent): void => {
    if (ui.hasOpenModal()) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      advance();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  // Di layar sentuh, ketukan pada gelembung diikuti "click" sintetis yang bisa jatuh ke panel yang baru
  // muncul. Abaikan klik sesaat setelah panel dibuka supaya dialog tidak langsung tertutup.
  const openedAt = performance.now();
  root.addEventListener('click', (e) => {
    e.stopPropagation();
    if (performance.now() - openedAt < 400) return;
    advance();
  });
  window.addEventListener('keydown', onKey, true);
  current = { close };
  render();
  ui.layers.hud.append(root);
  requestAnimationFrame(() => {
    root.classList.add('is-visible');
    next.focus({ preventScroll: true });
  });
}

/** Tutup paksa (mis. saat scene dihancurkan). */
export function closeDialogue(): void {
  current?.close();
}
