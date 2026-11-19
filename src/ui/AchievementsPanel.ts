import type { GameContext } from '../core/GameContext';
import { ACHIEVEMENTS } from '../systems/AchievementSystem';
import { formatRupiah } from '../utils/formatting';
import { el } from './dom';
import type { UIManager } from './UIManager';
import { tr } from '../i18n/i18n';

/** Daftar pencapaian: yang sudah didapat (hari & hadiah) dan progres yang belum. */
export function showAchievements(ctx: GameContext, ui: UIManager): void {
  const s = ctx.store.get();
  const got = ACHIEVEMENTS.filter((a) => s.achievements[a.id] !== undefined).length;
  ui.openModal({
    title: tr('Pencapaian {got}/{length}', { got, length: ACHIEVEMENTS.length }),
    className: 'sheet sheet-achievements',
    closeButton: true,
    body: el('div', {
      className: 'achievement-grid',
      children: ACHIEVEMENTS.map((a) => {
        const day = s.achievements[a.id];
        const done = day !== undefined;
        const prog = done ? 1 : (a.progress?.(s) ?? 0);
        return el('div', {
          className: `achievement${done ? ' is-done' : ''}`,
          children: [
            el('span', { className: 'ach-icon', text: done ? a.icon : '🔒', attrs: { 'aria-hidden': 'true' } }),
            el('div', {
              className: 'ach-info',
              children: [
                el('strong', { text: a.name }),
                el('span', { className: 'item-meta', text: a.description }),
                el('span', { className: 'item-meta', text: done ? tr('Didapat Hari {day} · hadiah {reward}', { day, reward: formatRupiah(a.reward) }) : tr('Hadiah {reward}', { reward: formatRupiah(a.reward) }) }),
                !done && a.progress ? el('div', { className: 'cap-bar ach-bar', children: [el('span', { className: 'cap-fill', attrs: { style: `width:${Math.round(prog * 100)}%` } })] }) : null,
              ],
            }),
          ],
        });
      }),
    }),
    actions: [],
  });
}
