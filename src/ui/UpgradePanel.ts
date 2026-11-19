import type { GameContext } from '../core/GameContext';
import { storageCapacity, storedUnits } from '../systems/EconomySystem';
import { maxPortionsPerOrder } from '../systems/CookingSystem';
import { UPGRADE_CATEGORIES, UPGRADES, describeEffects, effectsOf, upgradeBlockers, type UpgradeCategory } from '../systems/UpgradeSystem';
import { formatRupiah } from '../utils/formatting';
import { el, setText } from './dom';
import type { ModalHandle, UIManager } from './UIManager';
import { tr } from '../i18n/i18n';

/** Panel Upgrade: kategori gerobak/peralatan/kapasitas/lingkungan, syarat & efek nyata. */
export class UpgradePanel {
  private modal: ModalHandle | null = null;
  private off: (() => void) | null = null;
  private tab: UpgradeCategory = 'gerobak';
  private readonly tabs = el('div', { className: 'tab-row', attrs: { role: 'tablist', 'aria-label': tr('Kategori upgrade') } });
  private readonly list = el('div', { className: 'item-list' });
  private readonly summary = el('p', { className: 'panel-note' });

  constructor(private readonly ctx: GameContext, private readonly ui: UIManager) {}

  open(): void {
    if (this.modal) return;
    this.modal = this.ui.openModal({
      title: tr('Upgrade Angkringan'),
      className: 'sheet sheet-upgrade',
      closeButton: true,
      body: el('div', {
        children: [
          el('p', { className: 'panel-note', text: tr('Investasi dibayar sekali dan langsung berlaku. Gerobak yang lebih baik menaikkan level usaha dan membuka menu spesial.') }),
          this.tabs,
          this.list,
        ],
      }),
      footer: el('div', { className: 'panel-footer', children: [this.summary] }),
      actions: [],
      onClose: () => {
        this.modal = null;
        this.off?.();
        this.off = null;
      },
    });
    this.off = this.ctx.bus.on('state:changed', () => this.render());
    this.render();
  }

  private render(): void {
    if (!this.modal) return;
    const s = this.ctx.store.get();
    this.tabs.replaceChildren(
      ...UPGRADE_CATEGORIES.map((c) => {
        const owned = UPGRADES.filter((u) => u.category === c.id && s.upgrades.includes(u.id)).length;
        const total = UPGRADES.filter((u) => u.category === c.id).length;
        return el('button', {
          className: `tab-btn${this.tab === c.id ? ' is-active' : ''}`,
          text: tr('{label} {owned}/{total}', { label: c.label, owned, total }),
          attrs: { type: 'button', role: 'tab', 'aria-selected': String(this.tab === c.id) },
          onClick: () => {
            this.tab = c.id;
            this.render();
          },
        });
      }),
    );
    this.list.replaceChildren(
      ...UPGRADES.filter((u) => u.category === this.tab).map((u) => {
        const owned = s.upgrades.includes(u.id);
        const blockers = upgradeBlockers(s, u);
        const locked = !owned && blockers.some((b) => !b.startsWith(tr('Kurang {0}', { 0: '' })));
        const btn = el('button', {
          className: `btn ${owned ? 'btn-secondary' : 'btn-primary'} btn-sm`,
          text: owned ? tr('Terpasang ✓') : formatRupiah(u.cost),
          attrs: { type: 'button', 'aria-label': owned ? tr('{name} sudah terpasang', { name: u.name }) : tr('Beli {name} seharga {cost}', { name: u.name, cost: formatRupiah(u.cost) }) },
          onClick: () => {
            const res = this.ctx.actions.buyUpgrade(u.id);
            this.ctx.notify(res.message, res.ok ? 'success' : 'error');
            if (res.ok) this.ctx.bus.emit('world:rebuild', { reopen: 'upgrade' });
          },
        });
        btn.disabled = owned || blockers.length > 0 || s.phase !== 'persiapan';
        return el('div', {
          className: `item-row upgrade-row${owned ? ' in-cart' : ''}${locked ? ' is-locked' : ''}`,
          children: [
            el('div', {
              className: 'item-info',
              children: [
                el('div', { className: 'item-name', text: u.name }),
                el('div', { className: 'item-meta', text: u.description }),
                el('div', { className: 'item-meta effect-text', text: describeEffects(u.effects).join(' · ') }),
                !owned && blockers.length ? el('div', { className: 'item-meta lock-text', text: `🔒 ${blockers.join(' · ')}` }) : null,
              ],
            }),
            btn,
          ],
        });
      }),
    );
    const fx = effectsOf(s);
    setText(
      this.summary,
      tr('Level usaha {businessLevel} · kursi {1} · gudang {s}/{s2} · maks {s3} porsi/masak · kepuasan +{satisfaction}', { businessLevel: fx.businessLevel, 1: 10 + fx.seats, s: storedUnits(s), s2: storageCapacity(s), s3: maxPortionsPerOrder(s), satisfaction: fx.satisfaction }),
    );
  }
}
