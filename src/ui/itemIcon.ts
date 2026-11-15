import type { ItemIcon } from '../data/catalog';
import { drawItemIcon } from '../graphics/art/itemIcons';
import { pixelDataUrl } from './pixelImage';

/** <img> ikon bahan/produk pixel art (di-cache per bentuk+warna). */
export function itemIcon(icon: ItemIcon, className = 'item-icon'): HTMLImageElement {
  const img = document.createElement('img');
  img.src = pixelDataUrl(`item:${icon.shape}:${icon.color}:${icon.accent}`, () => drawItemIcon(icon));
  img.alt = '';
  img.className = className;
  img.setAttribute('aria-hidden', 'true');
  img.draggable = false;
  return img;
}

/** Tombol − angka + yang dipakai di panel belanja & persiapan. */
export interface Stepper {
  readonly root: HTMLElement;
  set(value: number): void;
}

export function stepper(label: string, value: number, onChange: (next: number) => void, max = 999): Stepper {
  const minus = document.createElement('button');
  minus.type = 'button';
  minus.className = 'step-btn';
  minus.textContent = '−';
  minus.setAttribute('aria-label', `Kurangi ${label}`);
  const plus = document.createElement('button');
  plus.type = 'button';
  plus.className = 'step-btn';
  plus.textContent = '+';
  plus.setAttribute('aria-label', `Tambah ${label}`);
  const input = document.createElement('input');
  input.type = 'number';
  input.inputMode = 'numeric';
  input.min = '0';
  input.max = String(max);
  input.className = 'step-input';
  input.setAttribute('aria-label', `Jumlah ${label}`);
  const root = document.createElement('div');
  root.className = 'stepper';
  root.append(minus, input, plus);

  let current = value;
  const set = (v: number): void => {
    current = Math.max(0, Math.min(max, Math.floor(Number.isFinite(v) ? v : 0)));
    input.value = String(current);
    minus.disabled = current <= 0;
    plus.disabled = current >= max;
  };
  set(value);
  minus.addEventListener('click', () => onChange(Math.max(0, current - 1)));
  plus.addEventListener('click', () => onChange(Math.min(max, current + 1)));
  input.addEventListener('change', () => onChange(Math.max(0, Math.min(max, Math.floor(Number(input.value) || 0)))));
  input.addEventListener('focus', () => input.select());
  return { root, set };
}
