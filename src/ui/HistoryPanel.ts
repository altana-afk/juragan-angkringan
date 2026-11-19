import { WEATHER_LABELS } from '../config/balanceConfig';
import type { GameContext } from '../core/GameContext';
import type { HistoryEntry, WeatherKind } from '../core/GameState';
import { HISTORY_LIMIT } from '../core/GameState';
import { eventById } from '../data/events';
import { locationById } from '../data/locations';
import { isWeekend } from '../systems/LocationSystem';
import { adById } from '../systems/AdvertisingSystem';
import { BRANCH_STATUS_LABEL } from '../systems/BranchStatusSystem';
import { formatRupiah, formatRupiahShort } from '../utils/formatting';
import { formatDateLong, formatDateShort } from '../utils/calendar';
import { el } from './dom';
import type { UIManager } from './UIManager';
import { tr, trc } from '../i18n/i18n';

type Range = 7 | 30 | 60;
/** Desktop/tablet lebar: daftar + detail berdampingan, tanpa sheet bertumpuk. */
const WIDE = '(min-width: 900px) and (min-height: 520px)';
/** Hari yang dipilih di tampilan lebar. */
let selectedDay: number | null = null;
/** Rentang terakhir yang dipilih (diingat selama permainan berjalan). */
let range: Range = 7;

const WEATHER_ICON: Record<WeatherKind, string> = { cerah: '☀️', berawan: '⛅', hujan: '🌧️', panas: '🔥' };

const signed = (v: number): string => `${v < 0 ? '−' : '+'}${formatRupiahShort(Math.abs(v))}`;

function safeEvent(id: string | null | undefined): { icon: string; name: string } | null {
  if (!id) return null;
  try {
    const e = eventById(id);
    return { icon: e.icon, name: e.name };
  } catch {
    return null;
  }
}

/** Persen perubahan dibanding periode sebelumnya (null jika data periode sebelumnya belum ada). */
function change(cur: number, prev: number | null): string | null {
  if (prev === null || prev === 0) return null;
  const pct = Math.round(((cur - prev) / Math.abs(prev)) * 100);
  if (!Number.isFinite(pct)) return null;
  return tr('{0} {pct}%', { 0: pct >= 0 ? '▲' : '▼', pct: Math.abs(pct) });
}

/**
 * Riwayat penjualan 60 hari (tab di panel Statistik), tiga lapis supaya layar ponsel tidak ramai:
 * ringkasan 3 angka → grafik batang + daftar hari (satu baris per hari) → detail hari di sheet bawah.
 */
export function renderHistory(ctx: GameContext, ui: UIManager): HTMLElement {
  const root = el('div', { className: 'history' });

  const wide = (): boolean => window.matchMedia?.(WIDE).matches ?? false;
  const pick = (h: HistoryEntry): void => {
    if (!wide()) {
      openDay(ctx, ui, h);
      return;
    }
    selectedDay = h.day;
    render();
  };
  const render = (): void => {
    const all = ctx.store.get().history;
    if (!all.length) {
      root.replaceChildren(el('p', { className: 'panel-note muted', text: tr('Belum ada hari yang ditutup. Riwayat muncul setelah hari pertama selesai.') }));
      return;
    }
    const days = all.slice(-range);
    const prev = all.length >= range * 2 ? all.slice(-range * 2, -range) : null;
    const sum = (list: readonly HistoryEntry[], k: 'revenue' | 'netProfit'): number => list.reduce((s, h) => s + h[k], 0);
    const rev = sum(days, 'revenue');
    const profit = sum(days, 'netProfit');
    const avg = profit / days.length;

    // 1. Pilihan rentang
    const seg = el('div', {
      className: 'history-seg',
      attrs: { role: 'radiogroup', 'aria-label': tr('Rentang riwayat') },
      children: ([7, 30, 60] as const).map((r) =>
        el('button', {
          className: `history-seg-btn${range === r ? ' is-active' : ''}`,
          text: tr('{r} hari', { r }),
          attrs: { type: 'button', role: 'radio', 'aria-checked': String(range === r) },
          onClick: () => {
            range = r;
            render();
          },
        }),
      ),
    });

    // 2. Ringkasan maksimal tiga angka
    const tile = (label: string, value: string, delta: string | null, neg = false): HTMLElement =>
      el('div', {
        className: 'history-tile',
        children: [
          el('span', { className: 'history-tile-label', text: label }),
          el('strong', { className: neg ? 'is-bad' : '', text: value }),
          delta ? el('span', { className: `history-delta ${delta.startsWith('▲') ? 'is-up' : 'is-down'}`, text: delta }) : el('span', { className: 'history-delta', text: ' ' }),
        ],
      });
    const tiles = el('div', {
      className: 'history-tiles',
      children: [
        tile(tr('Pendapatan'), formatRupiahShort(rev), change(rev, prev ? sum(prev, 'revenue') : null)),
        tile(profit < 0 ? tr('Rugi') : tr('Laba'), formatRupiahShort(Math.abs(profit)), change(profit, prev ? sum(prev, 'netProfit') : null), profit < 0),
        tile(tr('Rata-rata/hari'), signed(avg), null, avg < 0),
      ],
    });

    // 3. Grafik batang: satu warna, hari rugi merah. Ketuk batang → detail hari.
    const max = Math.max(1, ...days.map((h) => h.revenue));
    const chart = el('div', {
      className: `history-chart${range > 7 ? ' is-dense' : ''}`,
      attrs: { role: 'group', 'aria-label': tr('Grafik pendapatan {range} hari', { range }) },
      children: days.map((h) => {
        const bar = el('button', {
          className: `history-bar${h.netProfit < 0 ? ' is-neg' : ''}`,
          attrs: { type: 'button', 'aria-label': tr('{day}: pendapatan {revenue}, {2} {netProfit}', { day: formatDateShort(h.day), revenue: formatRupiah(h.revenue), 2: h.netProfit < 0 ? tr('rugi') : tr('laba'), netProfit: formatRupiah(Math.abs(h.netProfit)) }) },
          onClick: () => pick(h),
        });
        bar.style.setProperty('--h', `${Math.max(3, (h.revenue / max) * 100)}%`);
        return bar;
      }),
    });
    const axis = el('div', {
      className: 'history-axis',
      children: [el('span', { text: formatDateShort(days[0]!.day) }), el('span', { text: formatDateShort(days[days.length - 1]!.day) })],
    });

    // 4. Daftar hari (terbaru di atas), satu baris per hari.
    const list = el('div', {
      className: 'history-list',
      children: [...days].reverse().map((h) => {
        const ev = safeEvent(h.eventId);
        const sub = [
          ev ? tr('{icon} {name}', { icon: ev.icon, name: ev.name }) : null,
          h.weather ? WEATHER_ICON[h.weather] : null,
          isWeekend(h.day) ? tr('Akhir pekan') : null,
        ]
          .filter(Boolean)
          .join(' · ');
        return el('button', {
          className: `history-row${wide() && h.day === selectedDay ? ' is-selected' : ''}`,
          attrs: { type: 'button', 'aria-label': tr('Detail {day}', { day: formatDateLong(h.day) }) },
          onClick: () => pick(h),
          children: [
            el('span', {
              className: 'history-row-main',
              children: [el('span', { className: 'history-row-date', text: tr('{day} · H{day2}', { day: formatDateShort(h.day), day2: h.day }) }), el('span', { className: 'history-row-sub', text: sub || tr('Hari biasa') })],
            }),
            el('span', {
              className: 'history-row-money',
              children: [
                el('span', { className: 'history-row-rev', text: formatRupiahShort(h.revenue) }),
                el('span', { className: h.netProfit < 0 ? 'is-bad' : 'is-good', text: tr('{0} {netProfit}', { 0: h.netProfit < 0 ? tr('rugi') : tr('laba'), netProfit: formatRupiahShort(Math.abs(h.netProfit)) }) }),
              ],
            }),
            el('span', { className: 'history-row-chev', text: '›', attrs: { 'aria-hidden': 'true' } }),
          ],
        });
      }),
    });

    const main = [
      seg,
      tiles,
      chart,
      axis,
      el('div', { className: 'history-legend', text: tr('Batang = pendapatan · merah = hari rugi · {0} batang/baris untuk detail', { 0: wide() ? tr('klik') : tr('ketuk') }) }),
      list,
      el('p', { className: 'history-note', text: tr('Riwayat {HISTORY_LIMIT} hari terakhir', { HISTORY_LIMIT }) }),
    ];
    if (!wide()) {
      root.classList.remove('is-wide');
      root.replaceChildren(...main);
      return;
    }
    // Tampilan lebar: detail hari terpilih (bawaan: hari terakhir) di kolom kanan yang ikut menempel.
    const sel = days.find((h) => h.day === selectedDay) ?? days[days.length - 1]!;
    selectedDay = sel.day;
    root.classList.add('is-wide');
    root.replaceChildren(el('div', { className: 'history-main', children: main }), el('aside', { className: 'history-side', children: [dayBody(ctx, sel, true)] }));
  };

  // Keyboard (desktop): ↑/↓ pindah antarbaris hari; di layar lebar detail ikut berganti.
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const rows = [...root.querySelectorAll<HTMLButtonElement>('.history-row')];
    const i = rows.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault();
    const next = rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
    if (!next || next === rows[i]) return;
    if (wide()) {
      const idx = rows.indexOf(next);
      next.click();
      root.querySelectorAll<HTMLButtonElement>('.history-row')[idx]?.focus();
    } else next.focus();
  });
  render();
  // Ganti tata letak saat jendela diubah ukurannya (mis. desktop → setengah layar).
  const mq = window.matchMedia?.(WIDE);
  const onChange = (): void => {
    if (root.isConnected) render();
    else mq?.removeEventListener?.('change', onChange);
  };
  mq?.addEventListener?.('change', onChange);
  return root;
}

/** Detail satu hari di sheet bawah (ponsel), dibagi akordeon (Keuangan terbuka, sisanya tertutup). */
function openDay(ctx: GameContext, ui: UIManager, h: HistoryEntry): void {
  ui.openModal({
    title: tr('{day} · Hari {day2}', { day: formatDateLong(h.day), day2: h.day }),
    className: 'sheet sheet-report sheet-history-day',
    closeButton: true,
    body: dayBody(ctx, h, false),
    actions: [{ label: tr('Tutup'), variant: 'primary' }],
  });
}

/** Isi detail satu hari. `wide` = panel samping desktop (Keuangan & Produk terbuka). */
function dayBody(ctx: GameContext, h: HistoryEntry, wide: boolean): HTMLElement {
  const r = h.report ?? null;
  const rp = (v: number): string => formatRupiah(Math.abs(v));
  const row = (label: string, value: string, cls = ''): HTMLElement => el('div', { className: `report-row ${cls}`, children: [el('span', { text: label }), el('strong', { text: value })] });
  const cost = (label: string, v: number | undefined): HTMLElement | null => (v ? row(label, tr('−{v}', { v: rp(v) })) : null);
  const plusMinus = (label: string, v: number | undefined): HTMLElement | null => (v ? row(label, `${v < 0 ? '−' : '+'}${rp(v)}`, v < 0 ? 'is-bad' : '') : null);
  const name = (id: string): string => {
    try {
      return ctx.catalog.recipe(id).name;
    } catch {
      try {
        return ctx.catalog.ingredient(id).name;
      } catch {
        return id;
      }
    }
  };
  /** Bagian akordeon; `meta` = ringkasan singkat di sisi kanan judul supaya isi bisa dibaca tanpa dibuka. */
  const section = (title: string, meta: string, open: boolean, children: (HTMLElement | null)[]): HTMLElement | null => {
    const items = children.filter((c): c is HTMLElement => c !== null);
    if (!items.length) return null;
    const d = el('details', {
      className: 'history-acc',
      children: [el('summary', { children: [el('span', { text: title }), el('span', { className: 'history-acc-meta', text: meta })] }), el('div', { className: 'history-acc-body', children: items })],
    }) as HTMLDetailsElement;
    d.open = open;
    return d;
  };
  /** Satu kelompok produk: judul kecil + chip "Nama ×n". */
  const chips = (title: string, list: [string, string][], tone = ''): HTMLElement | null =>
    list.length
      ? el('div', {
          className: 'history-chipset',
          children: [
            el('span', { className: 'history-chipset-title', text: title }),
            el('div', { className: 'history-chips', children: list.map(([n, v]) => el('span', { className: `history-chip ${tone}`, children: [el('span', { text: n }), el('b', { text: v })] })) }),
          ],
        })
      : null;
  const ev = safeEvent(h.eventId ?? r?.event?.id);
  let loc: string | null = null;
  try {
    loc = h.mapId ? locationById(h.mapId).name : null;
  } catch {
    loc = null;
  }
  const popDelta = r ? Math.round(r.popularityAfter - r.popularityBefore) : null;

  // Kepala: angka utama + tiga fakta kecil.
  const fact = (label: string, value: string, cls = ''): HTMLElement => el('div', { className: 'history-fact', children: [el('span', { text: label }), el('strong', { className: cls, text: value })] });
  const head = el('div', {
    className: 'history-day-head',
    children: [
      el('span', { className: 'history-tile-label', text: h.netProfit < 0 ? tr('Rugi bersih') : tr('Laba bersih') }),
      el('strong', { className: h.netProfit < 0 ? 'is-bad' : 'is-good', text: rp(h.netProfit) }),
      el('span', { className: 'muted', text: tr('Pendapatan {revenue}', { revenue: formatRupiah(h.revenue) }) }),
      el('div', {
        className: 'history-facts',
        children: [
          fact(tr('Pelanggan'), String(h.customers)),
          fact(tr('Kepuasan'), `${Math.round(h.avgSatisfaction)}%`),
          fact(tr('Popularitas'), popDelta === null ? String(Math.round(h.popularity)) : tr('{popularity} ({1}{popDelta})', { popularity: Math.round(h.popularity), 1: popDelta >= 0 ? '+' : '', popDelta }), popDelta !== null && popDelta < 0 ? 'is-bad' : ''),
        ],
      }),
    ],
  });

  // Keuangan
  const finance = section(tr('Keuangan'), `${h.netProfit < 0 ? '−' : '+'}${formatRupiahShort(Math.abs(h.netProfit))}`, true, [
    row(tr('Pendapatan'), formatRupiah(h.revenue)),
    cost(tr('Belanja bahan'), r?.ingredientCost ?? h.ingredientCost),
    cost(tr('Promosi'), r?.promotionCost),
    cost(tr('Operasional & sewa'), r?.operationalCost ?? h.operationalCost),
    cost(tr('Upgrade'), r?.upgradeCost),
    cost(tr('Pindah lokasi'), r?.moveCost),
    r && r.bankIncome ? row(tr('Bunga deposito'), tr('+{bankIncome}', { bankIncome: rp(r.bankIncome) })) : null,
    cost(tr('Cicilan & bunga pinjaman'), r?.loanCost),
    plusMinus(tr('Bersih pesanan online'), h.onlineNet),
    plusMinus(tr('Bersih cabang'), h.branchNet),
    row(h.netProfit < 0 ? tr('Rugi bersih') : tr('Laba bersih'), rp(h.netProfit), `history-total ${h.netProfit < 0 ? 'is-bad' : 'is-good'}`),
    row(tr('Kas akhir hari'), formatRupiah(h.money)),
  ]);

  // Produk: lima kelompok sebagai chip, kelompok kosong disembunyikan.
  const top = r?.topSellers ?? h.topSellers ?? [];
  const productGroups = [
    chips(tr('Terlaris'), top.slice(0, 5).map(([id, n]) => [name(id), `${n}`])),
    chips(tr('Kurang diminati'), (r?.leastSold ?? []).map(([id, sold, made]) => [name(id), tr('{sold}/{made}', { sold, made })]), 'is-warn'),
    chips(tr('Kehabisan stok (dicari)'), (r?.soldOut ?? []).map(([id, n]) => [name(id), tr('{n}×', { n })]), 'is-warn'),
    chips(tr('Tersisa'), (r?.leftovers ?? []).map(([id, n]) => [name(id), `${n}`])),
    chips(tr('Terbuang'), (r?.wasted ?? []).map(([id, n, kind]) => [`${name(id)}${kind === 'bahan' ? tr(' (bahan)') : ''}`, `${n}`]), 'is-bad'),
    r && r.wasteCost ? el('p', { className: 'history-small is-bad', text: tr('Nilai yang terbuang {wasteCost}', { wasteCost: formatRupiah(r.wasteCost) }) }) : null,
  ];
  const soldTotal = top.reduce((n, [, q]) => n + q, 0);
  const products = section(
    tr('Produk'),
    r ? `${r.soldOut.length ? tr('{length} habis · ', { length: r.soldOut.length }) : ''}${r.wasted.length ? tr('{length} terbuang', { length: r.wasted.length }) : tr('tidak ada yang terbuang')}` : soldTotal ? tr('{soldTotal} porsi terlaris', { soldTotal }) : '',
    wide,
    productGroups.some(Boolean) ? productGroups : [el('p', { className: 'history-small muted', text: r ? tr('Tidak ada produk terjual hari ini.') : tr('Tidak tercatat di riwayat lama.') })],
  );

  // Pelanggan
  const customers = section(tr('Pelanggan'), tr('{customers} rombongan', { customers: h.customers }), false, [
    row(tr('Rombongan datang'), String(h.customers)),
    r ? row(tr('Dilayani penuh'), String(r.served)) : h.served !== undefined ? row(tr('Dilayani'), String(h.served)) : null,
    r && r.partial ? row(tr('Dilayani sebagian'), String(r.partial)) : null,
    (r?.leftEmpty ?? h.leftEmpty) ? row(tr('Pergi karena menu habis'), String(r?.leftEmpty ?? h.leftEmpty), 'is-bad') : null,
    r && r.leftWaiting ? row(tr('Pergi karena menunggu lama'), String(r.leftWaiting), 'is-bad') : null,
    row(tr('Rata-rata kepuasan'), `${Math.round(h.avgSatisfaction)}%`),
    r ? row(tr('Popularitas'), tr('{popularityBefore} → {popularityAfter}', { popularityBefore: Math.round(r.popularityBefore), popularityAfter: Math.round(r.popularityAfter) })) : row(tr('Popularitas akhir'), String(Math.round(h.popularity))),
    r ? row(tr('Loyalitas'), tr('{loyaltyAfter}/100', { loyaltyAfter: Math.round(r.loyaltyAfter) })) : null,
    r && r.reviewDelta ? row(tr('Ulasan food vlogger'), tr('{0}{reviewDelta} popularitas', { 0: r.reviewDelta > 0 ? '+' : '', reviewDelta: r.reviewDelta }), r.reviewDelta < 0 ? 'is-bad' : '') : null,
  ]);

  // Pesanan online
  const o = r?.online ?? null;
  const online = o
    ? section(tr('Pesanan online'), tr('{delivered} terantar', { delivered: o.delivered }), false, [
        row(tr('Pesanan masuk'), String(o.generated)),
        row(tr('Diterima / terantar'), tr('{accepted} / {delivered}', { accepted: o.accepted, delivered: o.delivered })),
        o.late ? row(tr('Terlambat'), String(o.late), 'is-bad') : null,
        o.cancelled ? row(tr('Batal (stok habis / tak terantar)'), String(o.cancelled), 'is-bad') : null,
        o.rejected || o.expired ? row(tr('Ditolak / tidak dijawab'), tr('{rejected} / {expired}', { rejected: o.rejected, expired: o.expired })) : null,
        row(tr('Nilai menu terkirim'), formatRupiah(o.gross)),
        cost(tr('Komisi ojol'), o.commission),
        o.feesKept ? row(tr('Ongkir masuk kas'), tr('+{feesKept}', { feesKept: rp(o.feesKept) })) : null,
        cost(tr('Gaji kurir'), o.wage),
        row(tr('Bersih online'), `${h.onlineNet && h.onlineNet < 0 ? '−' : '+'}${rp(h.onlineNet ?? 0)}`, 'history-total'),
        row(tr('Rating kemitraan'), `${o.ratingChange >= 0 ? '+' : ''}${Math.round(o.ratingChange)}`, o.ratingChange < 0 ? 'is-bad' : ''),
      ])
    : h.onlineDelivered
      ? section(tr('Pesanan online'), tr('{onlineDelivered} terantar', { onlineDelivered: h.onlineDelivered }), false, [row(tr('Terantar'), String(h.onlineDelivered)), plusMinus(tr('Bersih online'), h.onlineNet)])
      : null;

  // Cabang: satu kartu kecil per cabang.
  const br = r?.branches ?? [];
  const branches = br.length
    ? section(
        tr('Cabang'),
        `${(h.branchNet ?? 0) < 0 ? '−' : '+'}${formatRupiahShort(Math.abs(h.branchNet ?? 0))}`,
        false,
        br.map((b) => {
          let bl = b.mapId;
          try {
            bl = locationById(b.mapId).name;
          } catch {
            /* lokasi lama */
          }
          const wasted = Object.entries(b.wasted).reduce((n, [, q]) => n + q, 0);
          const left = Object.entries(b.left).reduce((n, [, q]) => n + q, 0);
          // Rincian per produk: diterima, terjual, tersisa, terbuang (sama dengan laporan cabang).
          const ids = [...new Set([...Object.keys(b.received), ...Object.keys(b.sold), ...Object.keys(b.left), ...Object.keys(b.wasted)])].sort(
            (x, y) => (b.sold[y] ?? 0) - (b.sold[x] ?? 0),
          );
          const table = ids.length
            ? el('div', {
                className: 'branch-table history-branch-table',
                attrs: { role: 'table', 'aria-label': tr('Rincian produk {name}', { name: b.name }) },
                children: [
                  el('div', { className: 'branch-tr branch-th', attrs: { role: 'row' }, children: [tr('Produk'), tr('Diterima'), tr('Terjual'), tr('Tersisa'), tr('Terbuang')].map((t) => el('span', { text: t, attrs: { role: 'columnheader' } })) }),
                  ...ids.map((id) =>
                    el('div', {
                      className: 'branch-tr',
                      attrs: { role: 'row' },
                      children: [
                        el('span', { className: 'branch-td-name', text: name(id), attrs: { role: 'cell' } }),
                        ...(
                          [
                            [tr('Diterima'), b.received[id] ?? 0],
                            [tr('Terjual'), b.sold[id] ?? 0],
                            [tr('Tersisa'), b.left[id] ?? 0],
                            [tr('Terbuang'), b.wasted[id] ?? 0],
                          ] as const
                        ).map(([label, v]) => el('span', { className: label === tr('Terbuang') && v ? 'is-bad' : '', text: String(v), attrs: { role: 'cell', 'data-label': label } })),
                      ],
                    }),
                  ),
                ],
              })
            : null;
          const money = b.status === 'tutup'
            ? null
            : el('div', {
                className: 'history-branch-money',
                children: [
                  el('span', { text: tr('Pendapatan {revenue}', { revenue: formatRupiah(b.revenue) }) }),
                  b.shrink ? el('span', { text: tr('Selisih kas −{shrink}', { shrink: formatRupiah(b.shrink) }) }) : null,
                  el('span', { text: tr('Operasional −{operational}', { operational: formatRupiah(b.operational) }) }),
                  b.wage ? el('span', { text: tr('Gaji{0} −{wage}', { 0: b.staffName ? tr(' {staffName}', { staffName: b.staffName }) : '', wage: formatRupiah(b.wage) }) }) : null,
                ].filter((n): n is HTMLElement => n !== null),
              });
          return el('div', {
            className: 'history-branch',
            children: [
              el('div', { className: 'history-branch-head', children: [el('strong', { text: tr('{name} · {bl}', { name: b.name, bl }) }), el('strong', { className: b.net < 0 ? 'is-bad' : 'is-good', text: `${b.net < 0 ? '−' : '+'}${formatRupiahShort(Math.abs(b.net))}` })] }),
              el('span', {
                className: 'history-small muted',
                text:
                  b.status === 'tutup'
                    ? trc('status', 'Tutup')
                    : tr('{0} · {portions} porsi terjual{2}{3}{4}{5}', { 0: BRANCH_STATUS_LABEL[b.status], portions: b.portions, 2: left ? tr(' · sisa {left}', { left }) : '', 3: wasted ? tr(' · terbuang {wasted}', { wasted }) : '', 4: b.wageLate ? tr(' · gaji telat') : '', 5: b.staffQuit ? tr(' · karyawan keluar') : '' }),
              }),
              money,
              table ?? (b.status === 'tutup' ? null : el('p', { className: 'history-small muted', text: tr('Tidak ada produk di cabang hari itu.') })),
            ].filter((n): n is HTMLElement => n !== null),
          });
        }),
      )
    : null;

  // Kejadian
  const bulk = r?.event?.bulk ?? null;
  const events = section(tr('Kejadian'), ev ? tr('{icon} {name}', { icon: ev.icon, name: ev.name }) : h.weather ? `${WEATHER_ICON[h.weather]} ${WEATHER_LABELS[h.weather]}` : '', false, [
    loc ? row(tr('Lokasi'), loc) : null,
    row(tr('Event'), ev ? tr('{icon} {name}', { icon: ev.icon, name: ev.name }) : r || h.weather ? tr('Tidak ada') : '—'),
    bulk ? row(tr('Pesanan borongan {recipeId} ×{qty}', { recipeId: name(bulk.recipeId), qty: bulk.qty }), bulk.status === 'terkirim' ? tr('Terkirim') : bulk.status === 'gagal' ? tr('Gagal') : tr('Menunggu'), bulk.status === 'gagal' ? 'is-bad' : '') : null,
    h.weather ? row(tr('Cuaca'), `${WEATHER_ICON[h.weather]} ${WEATHER_LABELS[h.weather]}`) : null,
    row(tr('Hari'), isWeekend(h.day) ? tr('Akhir pekan') : tr('Hari kerja')),
    r && r.ads.length ? row(tr('Promosi aktif'), r.ads.map((a) => {
      try {
        return adById(a).name;
      } catch {
        return a;
      }
    }).join(', ')) : null,
  ]);

  const body = el('div', {
    className: 'history-day',
    children: [head, finance, products, customers, online, branches, events].filter((n): n is HTMLElement => n !== null),
  });
  if (wide) body.prepend(el('h3', { className: 'history-side-title', text: tr('{day} · Hari {day2}', { day: formatDateLong(h.day), day2: h.day }) }));
  return body;
}
