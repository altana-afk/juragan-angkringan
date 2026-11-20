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
  /** Pelanggan bernama yang bicara. Boleh kosong jika `speaker` diisi (mis. ketua ormas). */
  readonly who?: NamedId;
  /** Pembicara di luar pelanggan bernama: nama, potret (data URL), label kecil di samping nama. */
  readonly speaker?: { readonly name: string; readonly portrait: string; readonly tag?: string };
  /** Gaya panel: 'danger' = garis & nama merah (ancaman, mis. ormas menagih). */
  readonly tone?: 'danger';
  /** Hati hubungan di kanan atas (merah = terisi, hitam = belum). */
  readonly hearts?: { readonly value: number; readonly max: number } | null;
  /** Elemen tambahan yang muncul di bawah teks pada baris terakhir (mis. jumlah uang yang diambil). */
  readonly finale?: HTMLElement | null;
  /** Dipanggil sekali saat baris terakhir pertama kali tampil (mis. uang benar-benar diambil saat itu). */
  readonly onLastLine?: () => void;
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
  const def = options.speaker ?? (options.who ? { name: namedById(options.who).name, portrait: portraitUrl(options.who), tag: undefined } : null);
  if (!def) return;
  let index = 0;
  let lastShown = false;
  const release = ui.holdTime();
  const text = el('p', { className: 'dialogue-text' });
  const counter = el('span', { className: 'dialogue-counter' });
  const next = el('button', { className: 'btn btn-primary dialogue-next', attrs: { type: 'button' } });
  const finale = options.finale ?? null;
  if (finale) finale.hidden = true;
  const root = el('section', {
    className: `dialogue-panel${options.tone === 'danger' ? ' is-danger' : ''}`,
    attrs: { role: 'dialog', 'aria-label': tr('Obrolan dengan {name}', { name: def.name }), 'aria-live': 'polite' },
    children: [
      el('div', {
        className: 'dialogue-portrait',
        children: [el('img', { attrs: { src: def.portrait, alt: '' } })],
      }),
      el('div', {
        className: 'dialogue-body',
        children: [
          el('div', {
            className: 'dialogue-head',
            children: [
              el('strong', { className: 'dialogue-name', text: def.name }),
              def.tag ? el('span', { className: 'dialogue-tag', text: def.tag }) : null,
              options.title ? el('span', { className: 'dialogue-title', text: tr('📰 {title}', { title: options.title }) }) : null,
              options.hearts ? heartRow(options.hearts.value, options.hearts.max) : null,
            ],
          }),
          text,
          finale,
          el('div', { className: 'dialogue-foot', children: [counter, next] }),
        ],
      }),
    ],
  });

  const render = (): void => {
    setText(text, options.lines[index] ?? '');
    const last = index >= options.lines.length - 1;
    if (last && !lastShown) {
      lastShown = true;
      options.onLastLine?.();
    }
    if (finale) {
      finale.hidden = !last;
      if (last) {
        finale.classList.remove('is-in');
        void finale.offsetWidth;
        finale.classList.add('is-in');
      }
    }
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

const HEART_PATH = 'M8 14.5 1.6 8.3A3.7 3.7 0 0 1 8 3.4a3.7 3.7 0 0 1 6.4 4.9z';

/** Deretan hati: merah = terisi, hitam bergaris tepi = belum. */
export function heartRow(value: number, max: number): HTMLElement {
  const row = el('div', { className: 'dialogue-hearts', attrs: { role: 'img', 'aria-label': tr('Hati {value} dari {max}', { value, max }) } });
  const ns = 'http://www.w3.org/2000/svg';
  for (let i = 0; i < max; i++) {
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('dialogue-heart', i < value ? 'is-full' : 'is-empty');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', HEART_PATH);
    svg.append(path);
    row.append(svg);
  }
  return row;
}

/** Tutup paksa (mis. saat scene dihancurkan). */
export function closeDialogue(): void {
  current?.close();
}
