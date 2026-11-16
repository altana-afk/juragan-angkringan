import type { GameContext } from '../core/GameContext';
import { eventById } from '../data/events';
import { totalQty } from '../systems/InventorySystem';
import { crowdLabel, dayDemand, isWeekend, locationOf } from '../systems/LocationSystem';
import { formatDateLong } from '../utils/calendar';
import { formatRupiah } from '../utils/formatting';
import { el } from './dom';
import type { UIManager } from './UIManager';
import { activeOnlineEvent } from '../systems/OnlineEventSystem';

/** Teks pesanan borongan untuk UI. */
export function bulkText(ctx: GameContext): { text: string; short: boolean } | null {
  const s = ctx.store.get();
  const bulk = s.event?.bulk;
  if (!bulk) return null;
  const name = ctx.catalog.recipe(bulk.recipeId).name;
  const have = totalQty(s.inventory.products[bulk.recipeId]);
  if (bulk.status === 'terkirim') return { text: `Borongan ${bulk.qty} ${name} terkirim ✓`, short: false };
  if (bulk.status === 'gagal') return { text: `Borongan ${bulk.qty} ${name} batal (stok kurang)`, short: true };
  return {
    text: `Pesanan borongan: ${bulk.qty} ${name} @ ${formatRupiah(bulk.unitPrice)} — siapkan sebelum buka (stok ${have}/${bulk.qty})`,
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
    title: ev && online ? '🎉 2 event hari ini' : ev ? `${ev.icon} ${ev.name}` : online ? `${online.icon} ${online.name}` : 'Hari ini',
    body: el('div', {
      className: 'event-info',
      children: [
        el('p', { className: 'panel-note', text: `${formatDateLong(s.calendar.day)} · ${isWeekend(s.calendar.day) ? 'akhir pekan' : 'hari kerja'} di ${loc.name}.` }),
        el('p', { text: `Perkiraan pengunjung: ${crowdLabel(demand.dayFactor)} (×${demand.dayFactor.toFixed(2)} dari biasa).` }),
        ev && online ? el('h3', { className: 'section-title', text: `${ev.icon} ${ev.name}` }) : null,
        ev ? el('p', { text: ev.description }) : online ? null : el('p', { className: 'muted', text: 'Tidak ada kejadian khusus hari ini.' }),
        bulk ? el('p', { className: bulk.short ? 'panel-warning' : 'panel-note', text: bulk.text }) : null,
        online && ev ? el('h3', { className: 'section-title', text: `${online.icon} ${online.name} (pesanan online)` }) : null,
        online ? el('p', { text: online.description }) : null,
      ],
    }),
    actions: [{ label: 'Oke', variant: 'primary' }],
  });
}
