import { showAchievements } from './AchievementsPanel';
import { ACHIEVEMENTS } from '../systems/AchievementSystem';
import type { GameContext } from '../core/GameContext';
import { getPopularityTier } from '../systems/PopularitySystem';
import { formatRupiah, formatRupiahShort } from '../utils/formatting';
import { el } from './dom';
import { renderReport } from './DaySummary';
import { renderHistory } from './HistoryPanel';
import type { UIManager } from './UIManager';

/** Tab Ringkasan / Riwayat di panel Statistik. Riwayat dibuat saat tab pertama kali dibuka. */
function tabbed(ctx: GameContext, ui: UIManager, summary: HTMLElement): HTMLElement {
  let history: HTMLElement | null = null;
  const pane = el('div', { className: 'stats-pane', children: [summary] });
  const tabs = (['Ringkasan', 'Riwayat'] as const).map((label, i) =>
    el('button', {
      className: `stats-tab${i === 0 ? ' is-active' : ''}`,
      text: label,
      attrs: { type: 'button', role: 'tab', 'aria-selected': String(i === 0) },
      onClick: () => {
        tabs.forEach((t, j) => {
          t.classList.toggle('is-active', j === i);
          t.setAttribute('aria-selected', String(j === i));
        });
        if (i === 1) history ??= renderHistory(ctx, ui);
        pane.replaceChildren(i === 0 ? summary : history!);
        pane.parentElement?.scrollTo?.({ top: 0 });
      },
    }),
  );
  return el('div', { className: 'stats-body', children: [el('div', { className: 'stats-tabs', attrs: { role: 'tablist' }, children: tabs }), pane] });
}

/** Panel Statistik: tren 14 hari terakhir, total sepanjang permainan, dan laporan hari terakhir. */
export function showStats(ctx: GameContext, ui: UIManager): void {
  const s = ctx.store.get();
  const recent = s.history.slice(-14);
  const maxRev = Math.max(1, ...recent.map((h) => Math.max(h.revenue, Math.abs(h.netProfit))));
  const bars = recent.length
    ? el('div', {
        className: 'stat-chart',
        attrs: { role: 'img', 'aria-label': 'Grafik penjualan & keuntungan per hari' },
        children: recent.map((h) =>
          el('div', {
            className: 'stat-col',
            attrs: { title: `Hari ${h.day}: penjualan ${formatRupiah(h.revenue)}, untung ${formatRupiah(h.netProfit)}, ${h.customers} pelanggan, popularitas ${Math.round(h.popularity)}` },
            children: [
              el('div', {
                className: 'stat-bars',
                children: [
                  (() => {
                    const b = el('i', { className: 'bar-rev' });
                    b.style.height = `${(h.revenue / maxRev) * 100}%`;
                    return b;
                  })(),
                  (() => {
                    const b = el('i', { className: `bar-profit ${h.netProfit < 0 ? 'is-neg' : ''}` });
                    b.style.height = `${(Math.abs(h.netProfit) / maxRev) * 100}%`;
                    return b;
                  })(),
                ],
              }),
              el('span', { className: 'stat-label', text: `H${h.day}` }),
              el('span', { className: 'stat-label', text: formatRupiahShort(h.netProfit).replace('Rp', '') }),
            ],
          }),
        ),
      })
    : el('p', { className: 'panel-note muted', text: 'Belum ada hari yang ditutup. Statistik muncul setelah hari pertama selesai.' });

  const st = s.stats;
  const totalProfit = s.history.reduce((n, h) => n + h.netProfit, 0);
  const row = (label: string, value: string): HTMLElement => el('div', { className: 'report-row', children: [el('span', { text: label }), el('strong', { text: value })] });
  ui.openModal({
    title: 'Statistik Usaha',
    className: 'sheet sheet-stats',
    closeButton: true,
    body: tabbed(ctx, ui, el('div', {
      className: 'report',
      children: [
        el('h3', { className: 'section-title', text: 'Penjualan & keuntungan bersih (14 hari terakhir)' }),
        el('div', { className: 'stat-legend', children: [el('span', { className: 'lg-rev', text: 'Penjualan' }), el('span', { className: 'lg-profit', text: 'Untung bersih' })] }),
        bars,
        el('h3', { className: 'section-title', text: 'Sepanjang usaha' }),
        el('div', {
          className: 'report-grid',
          children: [
            row('Hari berjalan', String(s.calendar.day)),
            row('Total penjualan', formatRupiah(st.totalRevenue)),
            row('Total keuntungan bersih', formatRupiah(totalProfit)),
            row('Total belanja bahan', formatRupiah(st.totalPurchases)),
            row('Porsi dimasak / terjual', `${st.totalPortionsPrepared} / ${st.totalPortionsSold}`),
            row('Total pelanggan', `${st.totalCustomers} rombongan`),
            row('Popularitas', `${Math.round(s.player.popularity)} — ${getPopularityTier(s.player.popularity).label}`),
            row('Loyalitas', `${Math.round(s.player.loyalty)}/100`),
            row('Menu terbuka', `${s.unlockedRecipes.length}/${ctx.catalog.recipes.length}`),
          ],
        }),
        s.lastReport ? el('h3', { className: 'section-title', text: `Laporan terakhir (Hari ${s.lastReport.day})` }) : null,
        s.lastReport ? renderReport(ctx, s.lastReport, ui) : null,
      ],
    })),
    actions: [{ label: `Pencapaian ${Object.keys(ctx.store.get().achievements).length}/${ACHIEVEMENTS.length}`, onClick: () => { showAchievements(ctx, ui); return false; } }],
  });
}
