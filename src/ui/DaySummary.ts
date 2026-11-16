import { eventById } from '../data/events';
import { WEATHER_EFFECTS } from '../systems/WeatherSystem';
import { BANKRUPT_AFTER_DAYS } from '../systems/DayCloseSystem';
import type { GameContext } from '../core/GameContext';
import type { DayReport } from '../core/GameState';
import { adById } from '../systems/AdvertisingSystem';
import { getPopularityTier } from '../systems/PopularitySystem';
import { formatRupiah } from '../utils/formatting';
import { el } from './dom';
import { itemIcon } from './itemIcon';
import type { UIManager } from './UIManager';
import { openBranchReportDetail } from './BranchPanel';
import { locationById } from '../data/locations';
import { decisionAvailable, unreadImportant, unreadNews } from '../systems/StorySystem';
import type { GameState } from '../core/GameState';

/** Pengingat kabar kampung di laporan harian (kabar penting yang belum dibaca / keputusan menunggu). */
export function storyReminder(ctx: GameContext, state: Readonly<GameState>): HTMLElement | null {
  const important = unreadImportant(state);
  const unread = unreadNews(state).length;
  const decide = decisionAvailable(state);
  if (!important.length && !decide && !unread) return null;
  const text = decide
    ? 'Pak Hendra menunggu keputusanmu tentang gerobak. Buka Kabar Kampung → Keputusan.'
    : important.length
      ? `Ada kabar penting yang belum kamu dengar: "${important.map((n) => n.title).join('", "')}". Cerita belum bisa berlanjut sebelum kabar ini didengar.`
      : `${unread} kabar kampung belum dibaca.`;
  return el('div', {
    className: `story-reminder${important.length || decide ? ' is-important' : ''}`,
    children: [
      el('span', { text: '📰', attrs: { 'aria-hidden': 'true' } }),
      el('p', { text }),
      el('button', {
        className: 'btn btn-secondary btn-sm',
        text: 'Buka Kabar Kampung',
        attrs: { type: 'button' },
        onClick: () => ctx.bus.emit('ui:open-panel', { panel: 'story', tab: decide ? 'keputusan' : 'kabar' }),
      }),
    ],
  });
}

/** Laporan keuangan harian setelah angkringan tutup, dengan tombol lanjut ke hari berikutnya. */
export function showDaySummary(ctx: GameContext, ui: UIManager): void {
  const state = ctx.store.get();
  const report = state.lastReport;
  if (!report || report.day !== state.calendar.day) {
    // Data dari versi lama tanpa laporan: cukup tawarkan lanjut hari.
    ui.openModal({
      title: `Hari ${state.calendar.day} selesai`,
      body: 'Laporan hari ini tidak tersedia (data dari versi sebelumnya).',
      dismissible: false,
      actions: [{ label: `Lanjutkan ke Hari ${state.calendar.day + 1}`, variant: 'primary', onClick: () => void ctx.actions.startNextDay() }],
    });
    return;
  }
  ui.openModal({
    title: `Laporan Hari ${report.day}`,
    className: 'sheet sheet-report',
    dismissible: false,
    body: el('div', { children: [storyReminder(ctx, state), renderReport(ctx, report, ui)] }),
    actions: [
      {
        label: `Lanjutkan ke Hari ${report.day + 1}`,
        variant: 'primary',
        onClick: () => {
          const res = ctx.actions.startNextDay();
          ctx.notify(res.message, res.ok ? 'info' : 'error', 5000);
        },
      },
    ],
  });
}

export function renderReport(ctx: GameContext, r: DayReport, ui?: UIManager): HTMLElement {
  const catalog = ctx.catalog;
  const name = (id: string, kind: 'produk' | 'bahan' = 'produk'): string => (kind === 'bahan' ? catalog.ingredient(id).name : catalog.recipe(id).name);
  const icon = (id: string, kind: 'produk' | 'bahan' = 'produk'): HTMLImageElement =>
    itemIcon(kind === 'bahan' ? catalog.ingredient(id).icon : catalog.recipe(id).icon, 'chip-icon');
  const row = (label: string, value: string, cls = ''): HTMLElement =>
    el('div', { className: `report-row ${cls}`, children: [el('span', { text: label }), el('strong', { text: value })] });
  const money = (v: number, sign: '+' | '−' | '' = ''): string => `${sign}${formatRupiah(Math.abs(v))}`;
  const chips = (items: HTMLElement[]): HTMLElement =>
    items.length ? el('div', { className: 'product-stock', children: items }) : el('p', { className: 'panel-note muted', text: '—' });
  const chip = (text: string, img: HTMLImageElement): HTMLElement => el('span', { className: 'stock-chip', children: [img, el('span', { text })] });

  const delta = Math.round((r.popularityAfter - r.popularityBefore) * 10) / 10;
  const tierBefore = getPopularityTier(r.popularityBefore);
  const tierAfter = getPopularityTier(r.popularityAfter);

  return el('div', {
    className: 'report',
    children: [
      el('div', {
        className: `report-hero ${r.netProfit >= 0 ? 'is-good' : 'is-bad'}`,
        children: [
          el('span', { text: r.netProfit >= 0 ? 'Keuntungan bersih' : 'Kerugian bersih' }),
          el('strong', { text: money(r.netProfit, r.netProfit >= 0 ? '+' : '−') }),
          el('small', { text: `Kas sekarang ${formatRupiah(r.moneyEnd)} · cuaca ${WEATHER_EFFECTS[r.weather].label.toLowerCase()}` }),
        ],
      }),
      r.debtDays > 0
        ? el('p', {
            className: 'panel-warning',
            text: `Kas minus ${r.debtDays}/${BANKRUPT_AFTER_DAYS} hari berturut-turut! Jika masih minus saat tutup ${BANKRUPT_AFTER_DAYS - r.debtDays} hari lagi, angkringan bangkrut.`,
          })
        : null,
      el('h3', { className: 'section-title', text: 'Keuangan' }),
      el('div', {
        className: 'report-grid',
        children: [
          row('Total penjualan', money(r.revenue, '+'), 'is-good'),
          row('Biaya bahan baku', money(r.ingredientCost, '−')),
          row(`Biaya promosi${r.ads.length ? ` (${r.ads.map((a) => adById(a).name).join(', ')})` : ''}`, money(r.promotionCost, '−')),
          row('Biaya operasional / sewa', money(r.operationalCost, '−')),
          r.online?.commission ? row('Komisi ojol', money(r.online.commission, '−')) : null,
          r.online?.wage ? row('Gaji kurir', money(r.online.wage, '−')) : null,
          r.online?.feesKept ? row('Ongkir pesanan online', money(r.online.feesKept, '+'), 'is-good') : null,
          r.bankIncome ? row('Bunga & bonus deposito', money(r.bankIncome, '+'), 'is-good') : null,
          r.loanCost ? row('Bunga pinjaman', money(r.loanCost, '−'), 'is-bad') : null,
          row('Keuntungan bersih', money(r.netProfit, r.netProfit >= 0 ? '+' : '−'), r.netProfit >= 0 ? 'is-good' : 'is-bad'),
          r.bankMatured ? row('Deposito jatuh tempo cair ke kas', money(r.bankMatured, '+'), 'is-good') : null,
          r.loanAutoPaid ? row('Pinjaman jatuh tempo dipotong dari kas', money(r.loanAutoPaid, '−'), 'is-bad') : null,
          r.depositsUsed ? row('Deposito dicairkan untuk menutup kas minus', money(r.depositsUsed, '+')) : null,
          r.event ? row('Event hari ini', `${eventById(r.event.id).icon} ${eventById(r.event.id).name}${r.event.bulk ? ` · borongan ${r.event.bulk.status}` : ''}`) : null,
          r.reviewDelta ? row('Ulasan food vlogger', `${r.reviewDelta > 0 ? '+' : ''}${r.reviewDelta} popularitas`, r.reviewDelta > 0 ? 'is-good' : 'is-bad') : null,
          r.upgradeCost ? row('Investasi upgrade (tidak dihitung rugi harian)', money(r.upgradeCost, '−')) : null,
          row('Laba kotor (penjualan − modal produk terjual)', money(r.grossProfit, r.grossProfit >= 0 ? '+' : '−')),
        ],
      }),
      ...branchSection(ctx, r, ui),
      r.online
        ? el('h3', { className: 'section-title', text: 'Pesanan online' })
        : null,
      r.online
        ? el('div', {
            className: 'report-grid',
            children: [
              row('Diterima / selesai', `${r.online.accepted} / ${r.online.delivered}${r.online.late ? ` (${r.online.late} terlambat)` : ''}`),
              row('Batal (stok habis / tak terantar)', String(r.online.cancelled), r.online.cancelled ? 'is-bad' : ''),
              row('Ditolak / tidak dijawab', `${r.online.rejected} / ${r.online.expired}`),
              row('Pendapatan bersih online', money(r.online.gross - r.online.commission + r.online.feesKept - r.online.wage, r.online.gross - r.online.commission + r.online.feesKept - r.online.wage >= 0 ? '+' : '−'), 'is-good'),
              row('Rating kemitraan', `${r.online.ratingChange >= 0 ? '+' : ''}${Math.round(r.online.ratingChange)} · popularitas ${r.online.popularityDelta >= 0 ? '+' : ''}${r.online.popularityDelta}`),
            ],
          })
        : null,
      el('h3', { className: 'section-title', text: 'Pelanggan' }),
      el('div', {
        className: 'report-grid',
        children: [
          row('Total pelanggan', `${r.customers} rombongan`),
          row('Berhasil dilayani', String(r.served + r.partial)),
          row('Pelanggan kecewa', String(r.leftEmpty + r.leftWaiting), r.leftEmpty + r.leftWaiting ? 'is-bad' : ''),
          row('Rata-rata kepuasan', `${r.avgSatisfaction}/100`),
          row(
            'Popularitas',
            `${Math.round(r.popularityBefore)} → ${Math.round(r.popularityAfter)} (${delta >= 0 ? '+' : ''}${delta})`,
            delta > 0 ? 'is-good' : delta < 0 ? 'is-bad' : '',
          ),
          row('Status', tierBefore.id === tierAfter.id ? tierAfter.label : `${tierBefore.label} → ${tierAfter.label}`),
          row('Loyalitas pelanggan', `${Math.round(r.loyaltyAfter)}/100`),
        ],
      }),
      el('h3', { className: 'section-title', text: 'Produk terlaris' }),
      chips(r.topSellers.map(([id, n]) => chip(`${name(id)} ${n} porsi`, icon(id)))),
      el('h3', { className: 'section-title', text: 'Kurang diminati' }),
      chips(r.leastSold.map(([id, sold, made]) => chip(`${name(id)} ${sold}/${made} terjual`, icon(id)))),
      el('h3', { className: 'section-title', text: 'Kehabisan stok (dicari pelanggan)' }),
      chips(r.soldOut.map(([id, n]) => chip(`${name(id)} ${n}×`, icon(id)))),
      el('h3', { className: 'section-title', text: 'Produk tersisa' }),
      chips(r.leftovers.map(([id, n]) => chip(`${name(id)} ${n} porsi`, icon(id)))),
      el('h3', { className: 'section-title', text: `Terbuang malam ini${r.wasteCost ? ` (modal ${formatRupiah(r.wasteCost)})` : ''}` }),
      chips(r.wasted.map(([id, n, kind]) => chip(`${name(id, kind)} ${n} ${kind === 'bahan' ? catalog.ingredient(id).unit : 'porsi'}`, icon(id, kind)))),
    ],
  });
}

/** Ringkasan cabang di laporan harian: pendapatan & bersih per cabang + tombol rincian. */
function branchSection(ctx: GameContext, r: DayReport, ui?: UIManager): HTMLElement[] {
  const list = r.branches ?? [];
  if (!list.length) return [];
  const money = (v: number): string => `${v < 0 ? '−' : '+'}${formatRupiah(Math.abs(v))}`;
  const total = list.reduce((s, b) => s + b.net, 0);
  const warnings = list.filter((b) => (b.status !== 'penuh' && b.status !== 'tutup') || b.wageLate || b.staffQuit);
  const nodes: (HTMLElement | null)[] = [
    el('h3', { className: 'section-title', text: 'Cabang' }),
    el('div', {
      className: 'report-grid',
      children: [
        ...list.map((b) =>
          el('div', {
            className: `report-row ${b.net >= 0 ? 'is-good' : 'is-bad'}`,
            children: [
              el('span', { text: `${b.name} · ${locationById(b.mapId).name} — ${b.status === 'tutup' ? 'tutup' : `${b.portions} porsi, pendapatan ${formatRupiah(b.revenue)}`}` }),
              el('strong', { text: money(b.net) }),
            ],
          }),
        ),
        el('div', { className: `report-row ${total >= 0 ? 'is-good' : 'is-bad'}`, children: [el('span', { text: 'Bersih semua cabang (sudah masuk kas)' }), el('strong', { text: money(total) })] }),
      ],
    }),
    ...warnings.map((b) =>
      el('p', {
        className: 'panel-warning',
        text: b.staffQuit
          ? `${b.name}: karyawan keluar karena gaji telat 3× berturut-turut. Rekrut lagi di panel Cabang.`
          : b.wageLate
            ? `${b.name}: gaji telat karena kas kurang — kinerja karyawan turun.`
            : b.status === 'tanpa_produk'
              ? `${b.name}: buka tanpa produk — popularitas cabang turun. Kirim stok besok.`
              : `${b.name}: buka tanpa karyawan — tidak ada yang berjualan.`,
      }),
    ),
    ui
      ? el('button', { className: 'btn btn-secondary btn-sm branch-detail-btn', text: 'Rincian cabang', attrs: { type: 'button' }, onClick: () => openBranchReportDetail(ctx, ui, list) })
      : null,
  ];
  return nodes.filter((n): n is HTMLElement => n !== null);
}
