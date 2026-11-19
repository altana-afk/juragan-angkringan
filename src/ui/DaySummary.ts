import { eventById } from '../data/events';
import { WEATHER_EFFECTS } from '../systems/WeatherSystem';
import { BANKRUPT_AFTER_DAYS } from '../systems/DayCloseSystem';
import type { GameContext } from '../core/GameContext';
import type { DayReport } from '../core/GameState';
import { adById } from '../systems/AdvertisingSystem';
import { getPopularityTier } from '../systems/PopularitySystem';
import { formatClock, formatRupiah } from '../utils/formatting';
import { el } from './dom';
import { itemIcon } from './itemIcon';
import type { UIManager } from './UIManager';
import { openBranchReportDetail } from './BranchPanel';
import { locationById } from '../data/locations';
import { decisionAvailable, unreadImportant, unreadNews } from '../systems/StorySystem';
import type { GameState } from '../core/GameState';
import { tr } from '../i18n/i18n';
import { describeLog } from '../systems/ChallengeEventSystem';

/** Pengingat kabar kampung di laporan harian (kabar penting yang belum dibaca / keputusan menunggu). */
export function storyReminder(ctx: GameContext, state: Readonly<GameState>): HTMLElement | null {
  const important = unreadImportant(state);
  const unread = unreadNews(state).length;
  const decide = decisionAvailable(state);
  if (!important.length && !decide && !unread) return null;
  const text = decide
    ? tr('Pak Hendra menunggu keputusanmu tentang gerobak. Buka Kabar Kampung → Keputusan.')
    : important.length
      ? tr('Ada kabar penting yang belum kamu dengar: "{0}". Cerita belum bisa berlanjut sebelum kabar ini didengar.', { 0: important.map((n) => n.title).join('", "') })
      : tr('{unread} kabar kampung belum dibaca.', { unread });
  return el('div', {
    className: `story-reminder${important.length || decide ? ' is-important' : ''}`,
    children: [
      el('span', { text: '📰', attrs: { 'aria-hidden': 'true' } }),
      el('p', { text }),
      el('button', {
        className: 'btn btn-secondary btn-sm',
        text: tr('Buka Kabar Kampung'),
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
      title: tr('Hari {day} selesai', { day: state.calendar.day }),
      body: tr('Laporan hari ini tidak tersedia (data dari versi sebelumnya).'),
      dismissible: false,
      actions: [{ label: tr('Lanjutkan ke Hari {0}', { 0: state.calendar.day + 1 }), variant: 'primary', onClick: () => void ctx.actions.startNextDay() }],
    });
    return;
  }
  ui.openModal({
    title: tr('Laporan Hari {day}', { day: report.day }),
    className: 'sheet sheet-report',
    dismissible: false,
    body: el('div', { children: [storyReminder(ctx, state), renderReport(ctx, report, ui)] }),
    actions: [
      {
        label: tr('Lanjutkan ke Hari {0}', { 0: report.day + 1 }),
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
          el('span', { text: r.netProfit >= 0 ? tr('Keuntungan bersih') : tr('Kerugian bersih') }),
          el('strong', { text: money(r.netProfit, r.netProfit >= 0 ? '+' : '−') }),
          el('small', { text: tr('Kas sekarang {moneyEnd} · cuaca {1}', { moneyEnd: formatRupiah(r.moneyEnd), 1: WEATHER_EFFECTS[r.weather].label.toLowerCase() }) }),
        ],
      }),
      r.debtDays > 0
        ? el('p', {
            className: 'panel-warning',
            text: tr('Kas minus {debtDays}/{BANKRUPT_AFTER_DAYS} hari berturut-turut! Jika masih minus saat tutup {2} hari lagi, angkringan bangkrut.', { debtDays: r.debtDays, BANKRUPT_AFTER_DAYS, 2: BANKRUPT_AFTER_DAYS - r.debtDays }),
          })
        : null,
      el('h3', { className: 'section-title', text: tr('Keuangan') }),
      el('div', {
        className: 'report-grid',
        children: [
          row(tr('Total penjualan'), money(r.revenue, '+'), 'is-good'),
          row(tr('Biaya bahan baku'), money(r.ingredientCost, '−')),
          row(tr('Biaya promosi{0}', { 0: r.ads.length ? ` (${r.ads.map((a) => adById(a).name).join(', ')})` : '' }), money(r.promotionCost, '−')),
          row(tr('Biaya operasional / sewa'), money(r.operationalCost, '−')),
          r.online?.commission ? row(tr('Komisi ojol'), money(r.online.commission, '−')) : null,
          r.online?.wage ? row(tr('Gaji kurir'), money(r.online.wage, '−')) : null,
          r.online?.feesKept ? row(tr('Ongkir pesanan online'), money(r.online.feesKept, '+'), 'is-good') : null,
          r.bankIncome ? row(tr('Bunga & bonus deposito'), money(r.bankIncome, '+'), 'is-good') : null,
          r.loanCost ? row(tr('Bunga pinjaman'), money(r.loanCost, '−'), 'is-bad') : null,
          r.challenges?.cost ? row(tr('Uang keamanan ormas'), money(r.challenges.cost, '−'), 'is-bad') : null,
          row(tr('Keuntungan bersih'), money(r.netProfit, r.netProfit >= 0 ? '+' : '−'), r.netProfit >= 0 ? 'is-good' : 'is-bad'),
          r.bankMatured ? row(tr('Deposito jatuh tempo cair ke kas'), money(r.bankMatured, '+'), 'is-good') : null,
          r.loanAutoPaid ? row(tr('Pinjaman jatuh tempo dipotong dari kas'), money(r.loanAutoPaid, '−'), 'is-bad') : null,
          r.depositsUsed ? row(tr('Deposito dicairkan untuk menutup kas minus'), money(r.depositsUsed, '+')) : null,
          r.event ? row(tr('Event hari ini'), tr('{icon} {name}{2}', { icon: eventById(r.event.id).icon, name: eventById(r.event.id).name, 2: r.event.bulk ? tr(' · borongan {status}', { status: r.event.bulk.status }) : '' })) : null,
          r.reviewDelta ? row(tr('Ulasan food vlogger'), tr('{0}{reviewDelta} popularitas', { 0: r.reviewDelta > 0 ? '+' : '', reviewDelta: r.reviewDelta }), r.reviewDelta > 0 ? 'is-good' : 'is-bad') : null,
          r.upgradeCost ? row(tr('Investasi upgrade (tidak dihitung rugi harian)'), money(r.upgradeCost, '−')) : null,
          row(tr('Laba kotor (penjualan − modal produk terjual)'), money(r.grossProfit, r.grossProfit >= 0 ? '+' : '−')),
        ],
      }),
      ...branchSection(ctx, r, ui),
      r.online
        ? el('h3', { className: 'section-title', text: tr('Pesanan online') })
        : null,
      r.online
        ? el('div', {
            className: 'report-grid',
            children: [
              row(tr('Diterima / selesai'), tr('{accepted} / {delivered}{2}', { accepted: r.online.accepted, delivered: r.online.delivered, 2: r.online.late ? tr(' ({late} terlambat)', { late: r.online.late }) : '' })),
              row(tr('Batal (stok habis / tak terantar)'), String(r.online.cancelled), r.online.cancelled ? 'is-bad' : ''),
              row(tr('Ditolak / tidak dijawab'), tr('{rejected} / {expired}', { rejected: r.online.rejected, expired: r.online.expired })),
              r.online.fromBranch ? row(tr('Dikirim dari cabang'), tr('{fromBranch} (biaya antar {1})', { fromBranch: r.online.fromBranch, 1: formatRupiah(r.online.branchFees ?? 0) })) : null,
              row(tr('Pendapatan bersih online'), money((r.online.gross - r.online.commission + r.online.feesKept - r.online.wage - (r.online.branchFees ?? 0)), (r.online.gross - r.online.commission + r.online.feesKept - r.online.wage - (r.online.branchFees ?? 0)) >= 0 ? '+' : '−'), 'is-good'),
              row(tr('Rating kemitraan'), tr('{0}{ratingChange} · popularitas {2}{popularityDelta}', { 0: r.online.ratingChange >= 0 ? '+' : '', ratingChange: Math.round(r.online.ratingChange), 2: r.online.popularityDelta >= 0 ? '+' : '', popularityDelta: r.online.popularityDelta })),
            ],
          })
        : null,
      r.challenges?.log.length ? el('h3', { className: 'section-title', text: tr('Tantangan kampung') }) : null,
      r.challenges?.log.length
        ? el('ul', { className: 'report-list', children: r.challenges.log.map((e) => el('li', { text: tr('{time} · {text}', { time: formatClock(e.minute), text: describeLog(e, (id) => name(id)) }) })) })
        : null,
      el('h3', { className: 'section-title', text: tr('Pelanggan') }),
      el('div', {
        className: 'report-grid',
        children: [
          row(tr('Total pelanggan'), tr('{customers} rombongan', { customers: r.customers })),
          row(tr('Berhasil dilayani'), String(r.served + r.partial)),
          row(tr('Pelanggan kecewa'), String(r.leftEmpty + r.leftWaiting), r.leftEmpty + r.leftWaiting ? 'is-bad' : ''),
          row(tr('Rata-rata kepuasan'), tr('{avgSatisfaction}/100', { avgSatisfaction: r.avgSatisfaction })),
          row(
            tr('Popularitas'),
            tr('{popularityBefore} → {popularityAfter} ({2}{delta})', { popularityBefore: Math.round(r.popularityBefore), popularityAfter: Math.round(r.popularityAfter), 2: delta >= 0 ? '+' : '', delta }),
            delta > 0 ? 'is-good' : delta < 0 ? 'is-bad' : '',
          ),
          row(tr('Status'), tierBefore.id === tierAfter.id ? tierAfter.label : tr('{label} → {label2}', { label: tierBefore.label, label2: tierAfter.label })),
          row(tr('Loyalitas pelanggan'), tr('{loyaltyAfter}/100', { loyaltyAfter: Math.round(r.loyaltyAfter) })),
        ],
      }),
      el('h3', { className: 'section-title', text: tr('Produk terlaris') }),
      chips(r.topSellers.map(([id, n]) => chip(tr('{id} {n} porsi', { id: name(id), n }), icon(id)))),
      el('h3', { className: 'section-title', text: tr('Kurang diminati') }),
      chips(r.leastSold.map(([id, sold, made]) => chip(tr('{id} {sold}/{made} terjual', { id: name(id), sold, made }), icon(id)))),
      el('h3', { className: 'section-title', text: tr('Kehabisan stok (dicari pelanggan)') }),
      chips(r.soldOut.map(([id, n]) => chip(tr('{id} {n}×', { id: name(id), n }), icon(id)))),
      el('h3', { className: 'section-title', text: tr('Produk tersisa') }),
      chips(r.leftovers.map(([id, n]) => chip(tr('{id} {n} porsi', { id: name(id), n }), icon(id)))),
      el('h3', { className: 'section-title', text: tr('Terbuang malam ini{0}', { 0: r.wasteCost ? tr(' (modal {wasteCost})', { wasteCost: formatRupiah(r.wasteCost) }) : '' }) }),
      chips(r.wasted.map(([id, n, kind]) => chip(tr('{0} {n} {2}', { 0: name(id, kind), n, 2: kind === 'bahan' ? catalog.ingredient(id).unit : tr('porsi') }), icon(id, kind)))),
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
    el('h3', { className: 'section-title', text: tr('Cabang') }),
    el('div', {
      className: 'report-grid',
      children: [
        ...list.map((b) =>
          el('div', {
            className: `report-row ${b.net >= 0 ? 'is-good' : 'is-bad'}`,
            children: [
              el('span', { text: tr('{name} · {name2} — {2}', { name: b.name, name2: locationById(b.mapId).name, 2: b.status === 'tutup' ? tr('tutup') : tr('{portions} porsi, pendapatan {revenue}', { portions: b.portions, revenue: formatRupiah(b.revenue) }) }) }),
              el('strong', { text: money(b.net) }),
            ],
          }),
        ),
        el('div', { className: `report-row ${total >= 0 ? 'is-good' : 'is-bad'}`, children: [el('span', { text: tr('Bersih semua cabang (sudah masuk kas)') }), el('strong', { text: money(total) })] }),
      ],
    }),
    ...warnings.map((b) =>
      el('p', {
        className: 'panel-warning',
        text: b.staffQuit
          ? tr('{name}: karyawan keluar karena gaji telat 3× berturut-turut. Rekrut lagi di panel Cabang.', { name: b.name })
          : b.wageLate
            ? tr('{name}: gaji telat karena kas kurang — kinerja karyawan turun.', { name: b.name })
            : b.status === 'tanpa_produk'
              ? tr('{name}: buka tanpa produk — popularitas cabang turun. Kirim stok besok.', { name: b.name })
              : tr('{name}: buka tanpa karyawan — tidak ada yang berjualan.', { name: b.name }),
      }),
    ),
    ui
      ? el('button', { className: 'btn btn-secondary btn-sm branch-detail-btn', text: tr('Rincian cabang'), attrs: { type: 'button' }, onClick: () => openBranchReportDetail(ctx, ui, list) })
      : null,
  ];
  return nodes.filter((n): n is HTMLElement => n !== null);
}
