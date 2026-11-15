import { bulkText } from './EventInfo';
import type { GameContext } from '../core/GameContext';
import type { GameState } from '../core/GameState';
import type { RecipeDef } from '../data/catalog';
import { storageCapacity, storedUnits } from '../systems/EconomySystem';
import { totalQty } from '../systems/InventorySystem';
import { el, setText, type UIComponent } from './dom';
import { itemIcon } from './itemIcon';

const COLLAPSE_KEY = 'juragan-angkringan:stockboard-collapsed';

export interface BoardItem {
  recipe: RecipeDef;
  qty: number;
  sold: number;
}

/**
 * Daftar menu siap jual hari ini: produk yang punya stok, ATAU sudah dimasak/terjual hari ini.
 * Produk yang habis tetap tampil dengan jumlah 0 (mis. "Nasi goreng × 0"). Urutan mengikuti katalog
 * supaya baris tidak meloncat saat stok berubah.
 */
export function boardItems(state: Readonly<GameState>, recipes: readonly RecipeDef[]): BoardItem[] {
  const out: BoardItem[] = [];
  for (const recipe of recipes) {
    const qty = totalQty(state.inventory.products[recipe.id]);
    const prepared = state.ledger.prepared[recipe.id] ?? 0;
    const sold = state.ledger.sold[recipe.id] ?? 0;
    if (qty > 0 || prepared > 0 || sold > 0) out.push({ recipe, qty, sold });
  }
  return out;
}

/** Papan stok terpisah (kiri layar): "Siap Dijual" makanan & minuman + ringkasan gudang. */
export class StockBoard implements UIComponent {
  readonly root: HTMLElement;
  private readonly body = el('div', { className: 'board-body' });
  private readonly bulk = el('div', { className: 'board-bulk' });
  private readonly summary = el('span', { className: 'board-summary' });
  private readonly storageText = el('span');
  private readonly toggle: HTMLButtonElement;
  private readonly off: () => void;
  private collapsed: boolean;

  constructor(private readonly ctx: GameContext, parent: HTMLElement) {
    this.collapsed = readCollapsed();
    this.toggle = el('button', {
      className: 'board-toggle',
      attrs: { type: 'button', 'aria-expanded': String(!this.collapsed), 'aria-controls': 'stock-board-body' },
      children: [el('strong', { text: 'Siap Dijual' }), this.summary, el('span', { className: 'board-caret', attrs: { 'aria-hidden': 'true' } })],
      onClick: () => this.setCollapsed(!this.collapsed),
    }) as HTMLButtonElement;
    this.body.id = 'stock-board-body';
    const storageBtn = el('button', {
      className: 'board-storage',
      attrs: { type: 'button', title: 'Lihat & atur isi gudang bahan' },
      children: [el('span', { text: 'Gudang' }), this.storageText],
      onClick: () => ctx.bus.emit('ui:open-panel', { panel: 'storage' }),
    });
    this.root = el('aside', {
      className: 'stock-board panel',
      attrs: { 'aria-label': 'Menu siap dijual' },
      children: [this.toggle, this.bulk, this.body, storageBtn],
    });
    parent.append(this.root);
    this.setCollapsed(this.collapsed);
    this.off = ctx.bus.on('state:changed', ({ state }) => this.render(state));
    this.render(ctx.store.get());
  }

  private setCollapsed(v: boolean): void {
    this.collapsed = v;
    this.root.classList.toggle('is-collapsed', v);
    this.toggle.setAttribute('aria-expanded', String(!v));
    try {
      localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0');
    } catch {
      /* abaikan */
    }
  }

  private render(state: Readonly<GameState>): void {
    const visible = state.phase === 'persiapan' || state.phase === 'berjualan';
    this.root.hidden = !visible || state.bankrupt;
    if (this.root.hidden) return;
    const bulk = bulkText(this.ctx);
    this.bulk.hidden = !bulk;
    if (bulk) {
      setText(this.bulk, bulk.text);
      this.bulk.classList.toggle('is-short', bulk.short);
    }
    const items = boardItems(state, this.ctx.catalog.recipes);
    const ready = items.reduce((s, i) => s + i.qty, 0);
    const soldOut = items.filter((i) => i.qty === 0).length;
    setText(this.summary, items.length ? `${ready} porsi${soldOut ? ` · ${soldOut} habis` : ''}` : 'kosong');
    setText(this.storageText, `${storedUnits(state)}/${storageCapacity(state)}`);
    if (items.length === 0) {
      this.body.replaceChildren(el('p', { className: 'board-empty', text: 'Belum ada yang dimasak. Buka Persiapan untuk memasak menu.' }));
      return;
    }
    const section = (title: string, list: BoardItem[]): HTMLElement | null =>
      list.length
        ? el('div', {
            className: 'board-section',
            children: [
              el('div', { className: 'board-heading', text: title }),
              ...list.map((i) =>
                el('div', {
                  className: `board-row${i.qty === 0 ? ' is-out' : i.qty <= 3 ? ' is-low' : ''}`,
                  attrs: { title: `${i.recipe.name}: ${i.qty} porsi tersisa, ${i.sold} terjual hari ini` },
                  children: [
                    itemIcon(i.recipe.icon, 'board-icon'),
                    el('span', { className: 'board-name', text: i.recipe.name }),
                    el('span', { className: 'board-qty', text: `× ${i.qty}` }),
                    i.qty === 0 ? el('span', { className: 'board-tag', text: 'Habis' }) : null,
                  ],
                }),
              ),
            ],
          })
        : null;
    this.body.replaceChildren(
      ...[section('Makanan', items.filter((i) => i.recipe.category !== 'minuman')), section('Minuman', items.filter((i) => i.recipe.category === 'minuman'))].filter(
        (x): x is HTMLElement => x !== null,
      ),
    );
  }

  destroy(): void {
    this.off();
    this.root.remove();
  }
}

function readCollapsed(): boolean {
  try {
    const v = localStorage.getItem(COLLAPSE_KEY);
    if (v !== null) return v === '1';
  } catch {
    /* abaikan */
  }
  return window.innerWidth < 640;
}
