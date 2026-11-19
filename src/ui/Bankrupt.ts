import type { GameContext } from '../core/GameContext';
import { formatRupiah } from '../utils/formatting';
import { el } from './dom';
import type { UIManager } from './UIManager';
import { tr } from '../i18n/i18n';

/** Layar akhir saat usaha bangkrut (kas minus 3 hari berturut-turut). */
export function showBankrupt(ctx: GameContext, ui: UIManager, onNewGame: () => void): void {
  if (ui.hasOpenModal()) ui.closeAllModals();
  const s = ctx.store.get();
  ui.openModal({
    title: tr('Angkringan Bangkrut'),
    className: 'sheet sheet-bankrupt',
    dismissible: false,
    body: el('div', {
      children: [
        el('p', { className: 'panel-warning', text: tr('Kas minus {0} selama 3 hari berturut-turut. Gerobak terpaksa dijual untuk menutup utang.', { 0: formatRupiah(-s.player.money) }) }),
        el('p', {
          className: 'panel-note',
          text: tr('Bertahan {day} hari · {totalCustomers} pelanggan · {totalPortionsSold} porsi terjual · popularitas {popularity}.', { day: s.calendar.day, totalCustomers: s.stats.totalCustomers, totalPortionsSold: s.stats.totalPortionsSold, popularity: Math.round(s.player.popularity) }),
        }),
        el('p', { className: 'panel-note muted', text: tr('Tips: belanja sesuai perkiraan pelanggan, jangan mematok harga terlalu mahal, dan tunda upgrade sampai kas aman.') }),
      ],
    }),
    actions: [
      { label: tr('Mulai usaha baru'), variant: 'primary', onClick: onNewGame },
      { label: tr('Ke menu utama'), variant: 'secondary', onClick: () => ctx.bus.emit('game:return-to-menu') },
    ],
  });
}
