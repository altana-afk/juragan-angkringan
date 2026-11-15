import type { GameContext } from '../core/GameContext';
import { eventById } from '../data/events';
import { LOCATIONS } from '../data/locations';
import { crowdLabel, isWeekend, MOVE_LOYALTY_KEEP, previewDemand } from '../systems/LocationSystem';
import { formatRupiah } from '../utils/formatting';
import { el } from './dom';
import type { ModalHandle, UIManager } from './UIManager';

/**
 * Pindah lokasi saat persiapan: bandingkan semua lokasi (sifat, sewa, perkiraan ramai hari ini, event di sana)
 * lalu pindahkan gerobak. Maksimal sekali sehari.
 */
export class LocationPanel {
  private modal: ModalHandle | null = null;

  constructor(private readonly ctx: GameContext, private readonly ui: UIManager) {}

  open(): void {
    if (this.modal) return;
    const s = this.ctx.store.get();
    const canMove = s.phase === 'persiapan' && s.lastMoveDay !== s.calendar.day;
    const cards = LOCATIONS.map((loc) => {
      const here = loc.id === s.mapId;
      const preview = previewDemand(s, this.ctx.catalog, loc.id);
      const ev = preview.event ? eventById(preview.event.id) : null;
      const btn = el('button', {
        className: `btn ${here ? 'btn-secondary' : 'btn-primary'} btn-sm`,
        text: here ? 'Lokasi sekarang' : `Pindah · ${formatRupiah(loc.moveCost)}`,
        attrs: { type: 'button', 'aria-label': here ? `${loc.name} (lokasi sekarang)` : `Pindah ke ${loc.name}` },
        onClick: () => this.confirm(loc.id),
      });
      btn.disabled = here || !canMove || s.player.money < loc.moveCost;
      return el('div', {
        className: `location-card${here ? ' is-current' : ''}`,
        children: [
          el('h3', { text: `${here ? '📍 ' : ''}${loc.name}` }),
          el('strong', { className: 'muted', text: loc.tagline }),
          el('p', { className: 'item-meta', text: loc.description }),
          el('ul', { children: loc.perks.map((p) => el('li', { text: p })) }),
          el('div', {
            className: 'location-today',
            children: [
              el('span', { text: `Hari ini: pengunjung ${crowdLabel(preview.dayFactor)} (×${preview.dayFactor.toFixed(2)})` }),
              el('span', { text: ev ? `${ev.icon} ${ev.name}` : 'Tanpa event' }),
            ],
          }),
          btn,
        ],
      });
    });
    this.modal = this.ui.openModal({
      title: 'Pindah Lokasi',
      className: 'sheet location-modal',
      closeButton: true,
      body: el('div', {
        children: [
          el('p', {
            className: s.phase !== 'persiapan' || !canMove ? 'panel-warning' : 'panel-note',
            text:
              s.phase !== 'persiapan'
                ? 'Pindah lokasi hanya bisa saat persiapan (sebelum buka).'
                : !canMove
                  ? 'Gerobak sudah dipindah hari ini. Kamu bisa pindah lagi besok.'
                  : `Hari ini ${isWeekend(s.calendar.day) ? 'akhir pekan' : 'hari kerja'}. Pindah maksimal sekali sehari; stok, upgrade & tabungan ikut, tapi sebagian pelanggan tetap tertinggal (loyalitas ×${MOVE_LOYALTY_KEEP}).`,
          }),
          el('div', { className: 'location-grid', children: cards }),
        ],
      }),
      actions: [],
      onClose: () => {
        this.modal = null;
      },
    });
  }

  private confirm(id: string): void {
    const loc = LOCATIONS.find((l) => l.id === id);
    if (!loc) return;
    this.ui.openModal({
      title: `Pindah ke ${loc.name}?`,
      body: `Biaya pindah ${formatRupiah(loc.moveCost)}, sewa di sana ${formatRupiah(loc.rent)}/hari. Sebagian pelanggan tetap tidak ikut pindah. Kamu baru bisa pindah lagi besok.`,
      actions: [
        { label: 'Batal' },
        {
          label: 'Ya, pindah',
          variant: 'primary',
          onClick: () => {
            const res = this.ctx.actions.moveLocation(id);
            this.ctx.notify(res.message, res.ok ? 'success' : 'error', 5000);
            if (res.ok) {
              this.modal?.close();
              this.ctx.bus.emit('world:rebuild', {});
            }
          },
        },
      ],
    });
  }
}
