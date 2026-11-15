import type { GameContext } from '../core/GameContext';
import { formatRupiah } from '../utils/formatting';
import { el } from './dom';
import type { UIManager } from './UIManager';

/** Layar akhir saat usaha bangkrut (kas minus 3 hari berturut-turut). */
export function showBankrupt(ctx: GameContext, ui: UIManager, onNewGame: () => void): void {
  if (ui.hasOpenModal()) ui.closeAllModals();
  const s = ctx.store.get();
  ui.openModal({
    title: 'Angkringan Bangkrut',
    className: 'sheet sheet-bankrupt',
    dismissible: false,
    body: el('div', {
      children: [
        el('p', { className: 'panel-warning', text: `Kas minus ${formatRupiah(-s.player.money)} selama 3 hari berturut-turut. Gerobak terpaksa dijual untuk menutup utang.` }),
        el('p', {
          className: 'panel-note',
          text: `Bertahan ${s.calendar.day} hari · ${s.stats.totalCustomers} pelanggan · ${s.stats.totalPortionsSold} porsi terjual · popularitas ${Math.round(s.player.popularity)}.`,
        }),
        el('p', { className: 'panel-note muted', text: 'Tips: belanja sesuai perkiraan pelanggan, jangan mematok harga terlalu mahal, dan tunda upgrade sampai kas aman.' }),
      ],
    }),
    actions: [
      { label: 'Mulai usaha baru', variant: 'primary', onClick: onNewGame },
      { label: 'Ke menu utama', variant: 'secondary', onClick: () => ctx.bus.emit('game:return-to-menu') },
    ],
  });
}
