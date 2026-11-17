import { PREP_PLAN } from './KitchenPanel';
import { buyPriceFactor, eventPriceMultipliers } from '../systems/EventSystem';
import type { GameContext } from '../core/GameContext';
import type { GameState } from '../core/GameState';
import type { IngredientDef } from '../data/catalog';
import { ingredientPrice, priceTrend, quotePurchase, storageCapacity, storedUnits, type CartLine } from '../systems/EconomySystem';
import { nearestExpiry, totalQty } from '../systems/InventorySystem';
import { ingredientsInUse } from '../systems/RecipeSystem';
import { ECONOMY_CONFIG } from '../config/economyConfig';
import { formatRupiah } from '../utils/formatting';
import { el, setText } from './dom';
import { itemIcon, stepper, type Stepper } from './itemIcon';
import type { ModalHandle, UIManager } from './UIManager';

/** Teks umur stok: "awet", "basi akhir hari ini", "sampai Hari 5". */
export function expiryText(expiresDay: number | null, today: number): string {
  if (expiresDay === null) return 'awet';
  if (expiresDay < today) return 'sudah kedaluwarsa';
  if (expiresDay === today) return 'habis hari ini';
  return `sampai Hari ${expiresDay}`;
}

/** Kategori tab Belanja (maks. 6). Bahan baru yang belum dipetakan masuk "Lainnya". */
const SHOP_TABS = [
  { id: 'lauk', label: 'Lauk', items: ['telur', 'tempe', 'tahu', 'sosis', 'bakso', 'ayam', 'ati_ampela', 'usus'] },
  { id: 'sayur', label: 'Sayur', items: ['cabai', 'bawang', 'jahe', 'jagung', 'pisang'] },
  { id: 'karbo', label: 'Karbo', items: ['beras', 'mi_instan', 'bihun', 'roti'] },
  { id: 'bumbu', label: 'Bumbu', items: ['kecap', 'minyak', 'gula'] },
  { id: 'minuman', label: 'Minuman', items: ['teh', 'kopi', 'sirup', 'susu', 'air_minum', 'air_mineral', 'es_batu', 'jeruk'] },
  { id: 'lainnya', label: 'Lainnya', items: [] as string[] },
] as const;
type TabId = 'semua' | (typeof SHOP_TABS)[number]['id'];

export function shopCategory(ingredientId: string): Exclude<TabId, 'semua'> {
  return SHOP_TABS.find((t) => (t.items as readonly string[]).includes(ingredientId))?.id ?? 'lainnya';
}

type ChipId = 'turun' | 'dipakai' | 'menipis' | 'basi';
const SHOP_CHIPS: { id: ChipId; label: string; hint: string }[] = [
  { id: 'turun', label: 'Harga turun', hint: 'Harga hari ini lebih murah dari kemarin' },
  { id: 'dipakai', label: 'Daftar persiapan', hint: 'Bahan yang dibutuhkan menu di Daftar persiapan (Persiapan Dapur)' },
  { id: 'menipis', label: 'Stok menipis', hint: 'Stok kurang dari satu kemasan' },
  { id: 'basi', label: 'Cepat basi', hint: 'Masa simpan 2 hari atau kurang' },
];

interface Row {
  def: IngredientDef;
  stepper: Stepper;
  price: HTMLElement;
  stock: HTMLElement;
  subtotal: HTMLElement;
  root: HTMLElement;
}

/**
 * Panel Belanja: daftar bahan (ikon, kemasan, harga hari ini & trennya, stok dimiliki),
 * tombol tambah/kurang, total, sisa uang. Pembelian ditolak jika uang tidak cukup.
 */
export class ShopPanel {
  private readonly cart = new Map<string, number>();
  /** Filter diingat selama permainan berjalan; keranjang tidak terpengaruh. */
  private tab: TabId = 'semua';
  private readonly chips = new Set<ChipId>();
  private filterBar = el('div', { className: 'shop-filters' });
  private emptyNote = el('p', { className: 'panel-note muted shop-empty', attrs: { role: 'status' } });
  private modal: ModalHandle | null = null;
  private rows: Row[] = [];
  private offState: (() => void) | null = null;
  private totalEl = el('strong', { className: 'sum-value' });
  private remainEl = el('strong', { className: 'sum-value' });
  private moneyEl = el('span', { className: 'panel-money' });
  private buyBtn = el('button', { className: 'btn btn-primary', text: 'Beli', attrs: { type: 'button' } });
  private clearBtn = el('button', { className: 'btn btn-secondary', text: 'Kosongkan', attrs: { type: 'button' } });
  private warning = el('p', { className: 'panel-warning', attrs: { role: 'alert' } });

  constructor(
    private readonly ctx: GameContext,
    private readonly ui: UIManager,
  ) {
    this.buyBtn.addEventListener('click', () => this.buy());
    this.clearBtn.addEventListener('click', () => {
      this.cart.clear();
      this.refresh();
    });
  }

  isOpen(): boolean {
    return this.modal !== null;
  }

  open(): void {
    if (this.modal) return;
    const state = this.ctx.store.get();
    const inUse = ingredientsInUse(state, this.ctx.catalog);
    const defs = this.ctx.catalog.ingredients.filter((d) => inUse.has(d.id));
    const lockedCount = this.ctx.catalog.ingredients.length - defs.length;
    this.rows = defs.map((def) => this.buildRow(def));

    const list = el('div', { className: 'item-list', children: this.rows.map((r) => r.root) });
    const body = el('div', {
      className: 'shop-body',
      children: [
        el('div', {
          className: 'shop-topline',
          children: [
            el('p', { className: 'panel-note', text: `Harga hari ini (Hari ${state.calendar.day}). Harga bisa naik-turun tiap hari.` }),
            el('button', {
              className: 'btn btn-secondary btn-sm',
              text: `Gudang ${storedUnits(state)}/${storageCapacity(state)}`,
              attrs: { type: 'button', title: 'Lihat isi gudang & buang bahan yang tidak perlu' },
              onClick: () => this.ctx.bus.emit('ui:open-panel', { panel: 'storage' }),
            }),
          ],
        }),
        this.filterBar,
        list,
        this.emptyNote,
        lockedCount > 0 ? el('p', { className: 'panel-note muted', text: `${lockedCount} bahan lain tersedia setelah menu barunya terbuka.` }) : null,
      ],
    });
    const footer = el('div', {
      className: 'panel-footer',
      children: [
        el('div', {
          className: 'panel-sums',
          children: [
            el('div', { className: 'sum', children: [el('span', { text: 'Total belanja' }), this.totalEl] }),
            el('div', { className: 'sum', children: [el('span', { text: 'Sisa uang' }), this.remainEl] }),
          ],
        }),
        this.warning,
        el('div', { className: 'panel-buttons', children: [this.clearBtn, this.buyBtn] }),
      ],
    });
    this.modal = this.ui.openModal({
      title: 'Belanja Bahan',
      className: 'sheet sheet-shop',
      closeButton: true,
      headerExtra: this.moneyEl,
      body,
      footer,
      actions: [],
      onClose: () => {
        this.modal = null;
        this.offState?.();
        this.offState = null;
        this.ctx.bus.emit('ui:panel-closed', { panel: 'shop' });
      },
    });
    this.offState = this.ctx.bus.on('state:changed', () => this.refresh());
    this.renderFilters();
    this.refresh();
  }

  close(): void {
    this.modal?.close();
  }

  private buildRow(def: IngredientDef): Row {
    const price = el('span', { className: 'item-price' });
    const stock = el('span', { className: 'item-stock' });
    const subtotal = el('span', { className: 'item-subtotal' });
    const step = stepper(def.name, this.cart.get(def.id) ?? 0, (next) => {
      if (next > 0) this.cart.set(def.id, next);
      else this.cart.delete(def.id);
      this.refresh();
    }, ECONOMY_CONFIG.maxPacksPerLine);
    const root = el('div', {
      className: 'item-row',
      children: [
        itemIcon(def.icon),
        el('div', {
          className: 'item-info',
          children: [
            el('div', { className: 'item-name', text: def.name }),
            el('div', { className: 'item-meta', text: `${def.pack} · ${def.packSize} ${def.unit}` }),
            stock,
          ],
        }),
        el('div', { className: 'item-side', children: [price, step.root, subtotal] }),
      ],
    });
    return { def, stepper: step, price, stock, subtotal, root };
  }

  /** Bahan untuk menu yang ada di Daftar persiapan (Persiapan Dapur). */
  private menuIngredients(_state: Readonly<GameState>): Set<string> {
    const out = new Set<string>();
    for (const id of PREP_PLAN.keys()) {
      try {
        for (const ing of Object.keys(this.ctx.catalog.recipe(id).ingredients)) out.add(ing);
      } catch {
        /* resep lama */
      }
    }
    return out;
  }

  private matches(state: Readonly<GameState>, def: IngredientDef, trend: string, menu: Set<string>): boolean {
    if (this.tab !== 'semua' && shopCategory(def.id) !== this.tab) return false;
    const have = totalQty(state.inventory.ingredients[def.id]);
    for (const c of this.chips) {
      if (c === 'turun' && trend !== 'turun') return false;
      if (c === 'dipakai' && !menu.has(def.id)) return false;
      if (c === 'menipis' && have >= def.packSize) return false;
      if (c === 'basi' && (def.shelfLifeDays === null || def.shelfLifeDays > 2)) return false;
    }
    return true;
  }

  private renderFilters(): void {
    const present = new Set(this.rows.map((r) => shopCategory(r.def.id)));
    const tabs: { id: TabId; label: string }[] = [{ id: 'semua', label: 'Semua' }, ...SHOP_TABS.filter((t) => present.has(t.id))];
    if (!tabs.some((t) => t.id === this.tab)) this.tab = 'semua';
    const tabBtns = tabs.map((t) =>
      el('button', {
        dataset: { tab: t.id },
        className: `shop-tab${this.tab === t.id ? ' is-active' : ''}`,
        text: t.label,
        attrs: { type: 'button', role: 'tab', 'aria-selected': String(this.tab === t.id) },
        onClick: () => {
          this.tab = t.id;
          this.syncFilterButtons();
          this.refresh();
        },
      }),
    );
    const chipBtns = SHOP_CHIPS.map((c) =>
      el('button', {
        dataset: { chip: c.id },
        className: `shop-chip${this.chips.has(c.id) ? ' is-active' : ''}`,
        text: c.label,
        attrs: { type: 'button', 'aria-pressed': String(this.chips.has(c.id)), title: c.hint },
        onClick: () => {
          if (this.chips.has(c.id)) this.chips.delete(c.id);
          else this.chips.add(c.id);
          this.syncFilterButtons();
          this.refresh();
        },
      }),
    );
    this.filterBar.replaceChildren(
      el('div', { className: 'shop-tabs', attrs: { role: 'tablist', 'aria-label': 'Kategori bahan' }, children: tabBtns }),
      el('div', { className: 'shop-chips', attrs: { role: 'group', 'aria-label': 'Saring status' }, children: chipBtns }),
    );
  }

  /** Perbarui tanda aktif tanpa membangun ulang tombol, jadi posisi geser tab/chip tidak kembali ke awal. */
  private syncFilterButtons(): void {
    for (const b of this.filterBar.querySelectorAll<HTMLButtonElement>('[data-tab]')) {
      const on = b.dataset.tab === this.tab;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', String(on));
    }
    for (const b of this.filterBar.querySelectorAll<HTMLButtonElement>('[data-chip]')) {
      const on = this.chips.has(b.dataset.chip as ChipId);
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    }
  }

  private cartLines(): CartLine[] {
    return [...this.cart.entries()].map(([ingredientId, packs]) => ({ ingredientId, packs }));
  }

  private refresh(): void {
    if (!this.modal) return;
    const state: Readonly<GameState> = this.ctx.store.get();
    const day = state.calendar.day;
    const menu = this.menuIngredients(state);
    let shown = 0;
    for (const row of this.rows) {
      const mult = eventPriceMultipliers(state)[row.def.id] ?? 1;
      const factor = buyPriceFactor(state, row.def.id);
      const p = ingredientPrice(row.def, day, factor);
      const trend = mult > 1 ? 'naik' : mult < 1 ? 'turun' : priceTrend(row.def, day);
      setText(row.price, `${formatRupiah(p)}${trend === 'naik' ? ' ▲' : trend === 'turun' ? ' ▼' : ''}`);
      row.price.dataset.trend = trend;
      row.price.title = mult !== 1 ? `Event hari ini: harga ${mult > 1 ? 'naik' : 'turun'} ${Math.round(Math.abs(mult - 1) * 100)}%` : '';
      if (mult !== 1) row.price.append(el('small', { className: 'event-tag', text: mult > 1 ? ' event ↑' : ' event ↓' }));
      const batches = state.inventory.ingredients[row.def.id];
      const have = totalQty(batches);
      setText(row.stock, have > 0 ? `Stok: ${have} ${row.def.unit} · ${expiryText(nearestExpiry(batches), day)}` : 'Stok: kosong');
      row.stock.classList.toggle('is-empty', have === 0);
      const packs = this.cart.get(row.def.id) ?? 0;
      row.stepper.set(packs);
      setText(row.subtotal, packs > 0 ? formatRupiah(p * packs) : '');
      row.root.classList.toggle('in-cart', packs > 0);
      // Bahan di keranjang tetap tersimpan walau barisnya disembunyikan filter.
      const visible = this.matches(state, row.def, trend, menu);
      row.root.hidden = !visible;
      if (visible) shown++;
    }
    const hiddenInCart = this.rows.filter((r) => r.root.hidden && (this.cart.get(r.def.id) ?? 0) > 0).length;
    setText(
      this.emptyNote,
      shown === 0
        ? `${this.chips.has('dipakai') && PREP_PLAN.size === 0 ? 'Daftar persiapan masih kosong — tambahkan menu di Persiapan Dapur dulu.' : 'Tidak ada bahan yang cocok dengan filter ini.'}${hiddenInCart ? ` ${hiddenInCart} bahan di keranjang tersembunyi.` : ''}`
        : hiddenInCart
          ? `${hiddenInCart} bahan di keranjang tidak terlihat karena filter — tetap ikut dibeli.`
          : '',
    );
    this.emptyNote.hidden = shown > 0 && hiddenInCart === 0;
    const quote = quotePurchase(this.ctx.catalog, this.cartLines(), day, (id) => buyPriceFactor(this.ctx.store.get(), id));
    const remaining = state.player.money - quote.total;
    setText(this.moneyEl, `Kas ${formatRupiah(state.player.money)}`);
    setText(this.totalEl, formatRupiah(quote.total));
    setText(this.remainEl, formatRupiah(remaining));
    this.remainEl.classList.toggle('is-bad', remaining < 0);
    setText(this.warning, remaining < 0 ? `Uang kurang ${formatRupiah(-remaining)}. Kurangi belanjaan.` : '');
    this.buyBtn.disabled = quote.lines.length === 0 || remaining < 0;
    this.clearBtn.disabled = quote.lines.length === 0;
    setText(this.buyBtn, quote.lines.length ? `Beli (${formatRupiah(quote.total)})` : 'Beli');
  }

  private buy(): void {
    const result = this.ctx.actions.buyIngredients(this.cartLines());
    if (result.ok) {
      this.cart.clear();
      this.ctx.notify(result.message, 'success');
    } else {
      this.ctx.notify(result.message, 'error');
    }
    this.refresh();
  }
}
