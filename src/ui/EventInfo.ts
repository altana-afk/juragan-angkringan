import type { GameContext } from '../core/GameContext';
import { eventById } from '../data/events';
import { totalQty } from '../systems/InventorySystem';
import { crowdLabel, dayDemand, isWeekend, locationOf } from '../systems/LocationSystem';
import { formatDateLong } from '../utils/calendar';
import { formatRupiah } from '../utils/formatting';
import { el } from './dom';
import type { UIManager } from './UIManager';
import { activeOnlineEvent } from '../systems/OnlineEventSystem';
import { tr } from '../i18n/i18n';

/** Teks pesanan borongan untuk UI. */
export function bulkText(ctx: GameContext): { text: string; short: boolean } | null {
  const s = ctx.store.get();
  const bulk = s.event?.bulk;
  if (!bulk) return null;
  const name = ctx.catalog.recipe(bulk.recipeId).name;
  const have = totalQty(s.inventory.products[bulk.recipeId]);
  if (bulk.status === 'terkirim') return { text: tr('Borongan {qty} {name} terkirim ✓', { qty: bulk.qty, name }), short: false };
  if (bulk.status === 'gagal') return { text: tr('Borongan {qty} {name} batal (stok kurang)', { qty: bulk.qty, name }), short: true };
  return {
    text: tr('Pesanan borongan: {qty} {name} @ {unitPrice} — siapkan sebelum buka (stok {have}/{qty})', { qty: bulk.qty, name, unitPrice: formatRupiah(bulk.unitPrice), have }),
    short: have < bulk.qty,
  };
}

/** Rincian hari ini: lokasi, ramai/sepi hari dalam seminggu, dan event acak. */
export function showEventInfo(ctx: GameContext, ui: UIManager): void {
  const s = ctx.store.get();
  const loc = locationOf(s);
  const demand = dayDemand(s);
  const ev = s.event ? eventById(s.event.id) : null;
  const bulk = bulkText(ctx);
  const online = activeOnlineEvent(s);
  ui.openModal({
    title: ev && online ? tr('🎉 2 event hari ini') : ev ? tr('{icon} {name}', { icon: ev.icon, name: ev.name }) : online ? tr('{icon} {name}', { icon: online.icon, name: online.name }) : tr('Hari ini'),
    body: el('div', {
      className: 'event-info',
      children: [
        el('p', { className: 'panel-note', text: tr('{day} · {1} di {name}.', { day: formatDateLong(s.calendar.day), 1: isWeekend(s.calendar.day) ? tr('akhir pekan') : tr('hari kerja'), name: loc.name }) }),
        el('p', { text: tr('Perkiraan pengunjung: {dayFactor} (×{1} dari biasa).', { dayFactor: crowdLabel(demand.dayFactor), 1: demand.dayFactor.toFixed(2) }) }),
        ev && online ? el('h3', { className: 'section-title', text: tr('{icon} {name}', { icon: ev.icon, name: ev.name }) }) : null,
        ev ? el('p', { text: ev.description }) : online ? null : el('p', { className: 'muted', text: tr('Tidak ada kejadian khusus hari ini.') }),
        bulk ? el('p', { className: bulk.short ? 'panel-warning' : 'panel-note', text: bulk.text }) : null,
        online && ev ? el('h3', { className: 'section-title', text: tr('{icon} {name} (pesanan online)', { icon: online.icon, name: online.name }) }) : null,
        online ? el('p', { text: online.description }) : null,
      ],
    }),
    actions: [{ label: tr('Oke'), variant: 'primary' }],
  });
}
