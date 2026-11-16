import type { GameContext } from '../core/GameContext';
import type { GameState } from '../core/GameState';
import type { RecipeDef } from '../data/catalog';
import { maxPortionsPerOrder } from '../systems/CookingSystem';
import { PRICE_RULES, priceBounds, priceVerdict, salePriceOf } from '../systems/PricingSystem';
import { nearestExpiry, totalQty } from '../systems/InventorySystem';
import { aggregateRequirements, describeUnlock, estimatedPortionCost, findShortages, isDrink, maxPortions, sortRecipesForMenu, type CookOrder } from '../systems/RecipeSystem';
import { formatRupiah } from '../utils/formatting';
import { el, keepScroll, setText } from './dom';
import { UI_SETTINGS } from '../config/uiSettings';
import { itemIcon, stepper } from './itemIcon';
import { expiryText } from './ShopPanel';
import type { ModalHandle, UIManager } from './UIManager';

export const CATEGORY_LABEL: Record<RecipeDef['category'], string> = {
  makanan: 'Makanan',
  gorengan: 'Gorengan',
  sate: 'Sate & bakaran',
  minuman: 'Minuman',
};

/**
 * Panel Persiapan (dapur): pilih produk, tentukan porsi, lihat kebutuhan bahan & yang kurang,
 * lalu masak. Daftar persiapan tetap tersimpan selama sesi meskipun panel ditutup.
 */
export class KitchenPanel {
  /** Daftar persiapan: id resep → porsi (urutan sesuai saat ditambahkan). */
  private readonly plan = new Map<string, number>();
  private modal: ModalHandle | null = null;
  private offState: (() => void) | null = null;
  private readonly menuEl = el('div', { className: 'recipe-grid' });
  private menuFilter: 'semua' | 'makanan' | 'minuman' = 'semua';
  private readonly filterEl = el('div', { className: 'menu-filter', attrs: { role: 'group', 'aria-label': 'Saring menu' } });
  private readonly planEl = el('div', { className: 'plan-list' });
  private readonly stockEl = el('div', { className: 'product-stock' });
  private readonly summaryEl = el('div', { className: 'panel-note' });
  private readonly warning = el('p', { className: 'panel-warning', attrs: { role: 'alert' } });
  private readonly cookAllBtn = el('button', { className: 'btn btn-primary', text: 'Masak semua', attrs: { type: 'button' } });
  private readonly clearBtn = el('button', { className: 'btn btn-secondary', text: 'Kosongkan daftar', attrs: { type: 'button' } });

  constructor(
    private readonly ctx: GameContext,
    private readonly ui: UIManager,
  ) {
    this.cookAllBtn.addEventListener('click', () => this.cook([...this.plan.entries()].map(([recipeId, portions]) => ({ recipeId, portions }))));
    this.clearBtn.addEventListener('click', () => {
      this.plan.clear();
      this.render();
    });
  }

  isOpen(): boolean {
    return this.modal !== null;
  }

  open(): void {
    if (this.modal) return;
    const body = el('div', {
      className: 'kitchen-body',
      children: [
        el('h3', { className: 'section-title', text: 'Daftar persiapan' }),
        this.planEl,
        el('div', { className: 'menu-head', children: [el('h3', { className: 'section-title', text: 'Menu' }), this.filterEl] }),
        this.menuEl,
        el('h3', { className: 'section-title', text: 'Siap dijual' }),
        this.stockEl,
      ],
    });
    const footer = el('div', {
      className: 'panel-footer',
      children: [this.summaryEl, this.warning, el('div', { className: 'panel-buttons', children: [this.clearBtn, this.cookAllBtn] })],
    });
    this.modal = this.ui.openModal({
      title: 'Persiapan Dapur',
      className: 'sheet sheet-kitchen',
      closeButton: true,
      body,
      footer,
      actions: [],
      onClose: () => {
        this.modal = null;
        this.offState?.();
        this.offState = null;
        this.ctx.bus.emit('ui:panel-closed', { panel: 'kitchen' });
      },
    });
    this.offState = this.ctx.bus.on('state:changed', () => this.render());
    this.render();
  }

  close(): void {
    this.modal?.close();
  }

  private orders(): CookOrder[] {
    return [...this.plan.entries()].filter(([, p]) => p > 0).map(([recipeId, portions]) => ({ recipeId, portions }));
  }

  /** Render ulang dengan posisi gulir dijaga (perbaikan "scroll reset" di ponsel). */
  private render(anchor: string | null = null): void {
    if (!this.modal) return;
    keepScroll(this.planEl.parentElement ?? this.planEl, () => this.renderNow(), anchor);
  }

  private renderNow(): void {
    const state = this.ctx.store.get();
    // Hapus resep yang (karena data lama) tidak lagi terbuka.
    for (const id of this.plan.keys()) if (!state.unlockedRecipes.includes(id)) this.plan.delete(id);
    this.renderMenu(state);
    this.renderPlan(state);
    this.renderStock(state);
  }

  private renderMenu(state: Readonly<GameState>): void {
    const day = state.calendar.day;
    // Terbuka di atas, terkunci di bawah; makanan dulu baru minuman.
    const sorted = sortRecipesForMenu(this.ctx.catalog.recipes, state.unlockedRecipes);
    const card = (recipe: RecipeDef): HTMLElement => {
      const unlocked = state.unlockedRecipes.includes(recipe.id);
      const cost = estimatedPortionCost(this.ctx.catalog, recipe, day);
      const price = salePriceOf(state, recipe);
      const margin = Math.round(((price - cost) / price) * 100);
      const inPlan = this.plan.has(recipe.id);
      const can = unlocked ? maxPortions(state, recipe) : 0;
      const button = el('button', {
        className: 'btn btn-secondary btn-sm',
        text: inPlan ? 'Di daftar ✓' : '+ Tambah',
        attrs: { type: 'button', 'aria-label': `Tambah ${recipe.name} ke daftar persiapan` },
        onClick: () => {
          if (!this.plan.has(recipe.id)) this.plan.set(recipe.id, Math.max(1, Math.min(can, 10)) || 1);
          // Bawaan: tetap di posisi kartu yang diketuk. Jika "Gulir otomatis" aktif, pindah ke daftar persiapan.
          this.render(`menu-${recipe.id}`);
          if (UI_SETTINGS.autoScroll) this.planEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        },
      });
      button.disabled = !unlocked || inPlan;
      return el('div', {
        className: `recipe-card${unlocked ? '' : ' is-locked'}`,
        attrs: { 'data-anchor': `menu-${recipe.id}` },
        children: [
          itemIcon(recipe.icon),
          el('div', {
            className: 'recipe-info',
            children: [
              el('div', { className: 'item-name', text: recipe.name }),
              el('div', { className: 'item-meta', text: CATEGORY_LABEL[recipe.category] }),
              unlocked
                ? el('div', { className: 'item-meta', text: `Modal ±${formatRupiah(cost)} · untung ${margin}%` })
                : el('div', { className: 'item-meta lock-text', text: `🔒 ${describeUnlock(recipe.unlock)}` }),
              unlocked ? el('div', { className: `item-meta ${can === 0 ? 'is-bad' : ''}`, text: can > 0 ? `Bahan cukup untuk ${can} porsi` : 'Bahan belum ada' }) : null,
              unlocked ? this.priceControl(state, recipe) : null,
            ],
          }),
          button,
        ],
      });
    };
    this.renderFilter();
    const shown = sorted.filter((r) => this.menuFilter === 'semua' || (this.menuFilter === 'minuman') === isDrink(r));
    const open = shown.filter((r) => state.unlockedRecipes.includes(r.id));
    const locked = shown.filter((r) => !state.unlockedRecipes.includes(r.id));
    const group = (title: string, list: RecipeDef[], extra = ''): HTMLElement[] =>
      list.length ? [el('div', { className: `recipe-group-title${extra}`, text: `${title} · ${list.length}` }), ...list.map(card)] : [];
    this.menuEl.replaceChildren(
      ...group('Makanan', open.filter((r) => !isDrink(r))),
      ...group('Minuman', open.filter(isDrink)),
      ...group('🔒 Masih terkunci', locked, ' is-locked'),
    );
  }

  /** Tombol saring Semua / Makanan / Minuman agar pemain ponsel tidak perlu menggulir jauh. */
  private renderFilter(): void {
    const opts = [['semua', 'Semua'], ['makanan', 'Makanan'], ['minuman', 'Minuman']] as const;
    this.filterEl.replaceChildren(
      ...opts.map(([id, label]) =>
        el('button', {
          className: `filter-btn${this.menuFilter === id ? ' is-active' : ''}`,
          text: label,
          attrs: { type: 'button', 'aria-pressed': String(this.menuFilter === id) },
          onClick: () => {
            if (this.menuFilter === id) return;
            this.menuFilter = id;
            this.render();
            this.filterEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          },
        }),
      ),
    );
  }

  /** Pengatur harga jual: ±Rp500, batas 50–200% harga wajar, dengan penilaian harga. */
  private priceControl(state: Readonly<GameState>, recipe: RecipeDef): HTMLElement {
    const price = salePriceOf(state, recipe);
    const { min, max } = priceBounds(recipe);
    const verdict = priceVerdict(price / recipe.salePrice);
    const change = (next: number): void => {
      const res = this.ctx.actions.setPrice(recipe.id, next);
      if (!res.ok) this.ctx.notify(res.message, 'error');
      this.render();
    };
    const minus = el('button', { className: 'step-btn', text: '−', attrs: { type: 'button', 'aria-label': `Turunkan harga ${recipe.name}` }, onClick: () => change(price - PRICE_RULES.step) });
    const plus = el('button', { className: 'step-btn', text: '+', attrs: { type: 'button', 'aria-label': `Naikkan harga ${recipe.name}` }, onClick: () => change(price + PRICE_RULES.step) });
    minus.disabled = price <= min;
    plus.disabled = price >= max;
    const reset = el('button', { className: 'link-btn', text: 'Wajar', attrs: { type: 'button', title: `Kembalikan ke ${formatRupiah(recipe.salePrice)}` }, onClick: () => change(recipe.salePrice) });
    reset.hidden = price === recipe.salePrice;
    return el('div', {
      className: 'price-control',
      children: [
        el('span', { className: 'item-meta', text: 'Harga' }),
        minus,
        el('strong', { className: 'price-value', text: formatRupiah(price) }),
        plus,
        reset,
        el('span', { className: `price-verdict tone-${verdict.tone}`, text: verdict.label }),
      ],
    });
  }

  private renderPlan(state: Readonly<GameState>): void {
    const orders = this.orders();
    const catalog = this.ctx.catalog;
    const total = aggregateRequirements(catalog, orders);
    const shortages = findShortages(state, total);
    const shortIds = new Set(shortages.map((s) => s.ingredientId));

    if (this.plan.size === 0) {
      this.planEl.replaceChildren(el('p', { className: 'panel-note muted', text: 'Belum ada. Pilih menu di bawah dengan tombol "+ Tambah".' }));
    } else {
      const rows = [...this.plan.entries()].map(([recipeId, portions]) => {
        const recipe = catalog.recipe(recipeId);
        const max = maxPortions(state, recipe);
        const step = stepper(recipe.name, portions, (next) => {
          this.plan.set(recipeId, next);
          this.render(`plan-${recipeId}`);
        }, maxPortionsPerOrder(this.ctx.store.get()));
        const chips = Object.entries(recipe.ingredients).map(([ingId, per]) => {
          const ing = catalog.ingredient(ingId);
          const need = per * portions;
          const have = totalQty(state.inventory.ingredients[ingId]);
          const short = have < need || shortIds.has(ingId);
          return el('span', {
            className: `req-chip${short ? ' is-short' : ''}`,
            attrs: { title: `${ing.name}: butuh ${need} ${ing.unit}, ada ${have}` },
            children: [itemIcon(ing.icon, 'chip-icon'), el('span', { text: `${ing.name} ${need}/${have}` })],
          });
        });
        const cookOne = el('button', {
          className: 'btn btn-primary btn-sm',
          text: 'Masak',
          attrs: { type: 'button' },
          onClick: () => this.cook([{ recipeId, portions: this.plan.get(recipeId) ?? 0 }], recipeId),
        });
        cookOne.disabled = portions <= 0 || portions > max;
        return el('div', {
          className: 'plan-row',
          attrs: { 'data-anchor': `plan-${recipeId}` },
          children: [
            el('div', {
              className: 'plan-head',
              children: [
                itemIcon(recipe.icon),
                el('div', { className: 'item-name', text: recipe.name }),
                el('button', {
                  className: 'link-btn',
                  text: `Maks (${max})`,
                  attrs: { type: 'button' },
                  onClick: () => {
                    this.plan.set(recipeId, Math.min(max, maxPortionsPerOrder(this.ctx.store.get())));
                    this.render(`plan-${recipeId}`);
                  },
                }),
                el('button', {
                  className: 'icon-btn',
                  text: '×',
                  attrs: { type: 'button', 'aria-label': `Hapus ${recipe.name} dari daftar`, title: 'Hapus dari daftar' },
                  onClick: () => {
                    this.plan.delete(recipeId);
                    this.render();
                  },
                }),
              ],
            }),
            el('div', { className: 'plan-controls', children: [step.root, el('span', { className: 'item-meta', text: 'porsi' }), cookOne] }),
            el('div', { className: 'req-chips', children: chips }),
          ],
        });
      });
      this.planEl.replaceChildren(...rows);
    }

    const portions = orders.reduce((s, o) => s + o.portions, 0);
    const cost = orders.reduce((s, o) => s + estimatedPortionCost(catalog, catalog.recipe(o.recipeId), state.calendar.day) * o.portions, 0);
    const revenue = orders.reduce((s, o) => s + salePriceOf(state, catalog.recipe(o.recipeId)) * o.portions, 0);
    setText(this.summaryEl, portions > 0 ? `Total ${portions} porsi · modal ±${formatRupiah(cost)} · potensi penjualan ${formatRupiah(revenue)}` : 'Daftar persiapan kosong.');
    setText(
      this.warning,
      shortages.length
        ? `Bahan kurang: ${shortages.map((s) => `${catalog.ingredient(s.ingredientId).name} ${s.missing} ${catalog.ingredient(s.ingredientId).unit}`).join(', ')}. Belanja dulu atau kurangi porsi.`
        : '',
    );
    this.cookAllBtn.disabled = portions === 0 || shortages.length > 0;
    this.clearBtn.disabled = this.plan.size === 0;
  }

  private renderStock(state: Readonly<GameState>): void {
    const entries = Object.entries(state.inventory.products).filter(([, b]) => totalQty(b) > 0);
    if (entries.length === 0) {
      this.stockEl.replaceChildren(el('p', { className: 'panel-note muted', text: 'Belum ada produk matang.' }));
      return;
    }
    this.stockEl.replaceChildren(
      ...entries.map(([id, batches]) => {
        const recipe = this.ctx.catalog.recipe(id);
        return el('div', {
          className: 'stock-chip',
          attrs: { title: `${recipe.name}: ${expiryText(nearestExpiry(batches), state.calendar.day)}` },
          children: [
            itemIcon(recipe.icon, 'chip-icon'),
            el('span', { className: 'item-name', text: `${recipe.name} × ${totalQty(batches)}` }),
            el('span', { className: 'item-meta', text: expiryText(nearestExpiry(batches), state.calendar.day) }),
          ],
        });
      }),
    );
  }

  private cook(orders: CookOrder[], onlyRecipe?: string): void {
    const result = this.ctx.actions.prepare(orders.filter((o) => o.portions > 0));
    if (result.ok) {
      if (onlyRecipe) this.plan.delete(onlyRecipe);
      else this.plan.clear();
      this.ctx.notify(`${result.message} Modal ${formatRupiah(result.value.totalCost)}.`, 'success');
    } else {
      this.ctx.notify(result.message, 'error', 5000);
    }
    this.render();
  }
}
