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
  return `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}%`;
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
      root.replaceChildren(el('p', { className: 'panel-note muted', text: 'Belum ada hari yang ditutup. Riwayat muncul setelah hari pertama selesai.' }));
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
      attrs: { role: 'radiogroup', 'aria-label': 'Rentang riwayat' },
      children: ([7, 30, 60] as const).map((r) =>
        el('button', {
          className: `history-seg-btn${range === r ? ' is-active' : ''}`,
          text: `${r} hari`,
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
        tile('Pendapatan', formatRupiahShort(rev), change(rev, prev ? sum(prev, 'revenue') : null)),
        tile(profit < 0 ? 'Rugi' : 'Laba', formatRupiahShort(Math.abs(profit)), change(profit, prev ? sum(prev, 'netProfit') : null), profit < 0),
        tile('Rata-rata/hari', signed(avg), null, avg < 0),
      ],
    });

    // 3. Grafik batang: satu warna, hari rugi merah. Ketuk batang → detail hari.
    const max = Math.max(1, ...days.map((h) => h.revenue));
    const chart = el('div', {
      className: `history-chart${range > 7 ? ' is-dense' : ''}`,
      attrs: { role: 'group', 'aria-label': `Grafik pendapatan ${range} hari` },
      children: days.map((h) => {
        const bar = el('button', {
          className: `history-bar${h.netProfit < 0 ? ' is-neg' : ''}`,
          attrs: { type: 'button', 'aria-label': `${formatDateShort(h.day)}: pendapatan ${formatRupiah(h.revenue)}, ${h.netProfit < 0 ? 'rugi' : 'laba'} ${formatRupiah(Math.abs(h.netProfit))}` },
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
          ev ? `${ev.icon} ${ev.name}` : null,
          h.weather ? WEATHER_ICON[h.weather] : null,
          isWeekend(h.day) ? 'Akhir pekan' : null,
        ]
          .filter(Boolean)
          .join(' · ');
        return el('button', {
          className: `history-row${wide() && h.day === selectedDay ? ' is-selected' : ''}`,
          attrs: { type: 'button', 'aria-label': `Detail ${formatDateLong(h.day)}` },
          onClick: () => pick(h),
          children: [
            el('span', {
              className: 'history-row-main',
              children: [el('span', { className: 'history-row-date', text: `${formatDateShort(h.day)} · H${h.day}` }), el('span', { className: 'history-row-sub', text: sub || 'Hari biasa' })],
            }),
            el('span', {
              className: 'history-row-money',
              children: [
                el('span', { className: 'history-row-rev', text: formatRupiahShort(h.revenue) }),
                el('span', { className: h.netProfit < 0 ? 'is-bad' : 'is-good', text: `${h.netProfit < 0 ? 'rugi' : 'laba'} ${formatRupiahShort(Math.abs(h.netProfit))}` }),
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
      el('div', { className: 'history-legend', text: `Batang = pendapatan · merah = hari rugi · ${wide() ? 'klik' : 'ketuk'} batang/baris untuk detail` }),
      list,
      el('p', { className: 'history-note', text: `Riwayat ${HISTORY_LIMIT} hari terakhir` }),
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
    title: `${formatDateLong(h.day)} · Hari ${h.day}`,
    className: 'sheet sheet-report sheet-history-day',
    closeButton: true,
    body: dayBody(ctx, h, false),
    actions: [{ label: 'Tutup', variant: 'primary' }],
  });
}

/** Isi detail satu hari. `wide` = panel samping desktop (Keuangan & Produk terbuka). */
function dayBody(ctx: GameContext, h: HistoryEntry, wide: boolean): HTMLElement {
  const r = h.report ?? null;
  const rp = (v: number): string => formatRupiah(Math.abs(v));
  const row = (label: string, value: string, cls = ''): HTMLElement => el('div', { className: `report-row ${cls}`, children: [el('span', { text: label }), el('strong', { text: value })] });
  const cost = (label: string, v: number | undefined): HTMLElement | null => (v ? row(label, `−${rp(v)}`) : null);
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
      el('span', { className: 'history-tile-label', text: h.netProfit < 0 ? 'Rugi bersih' : 'Laba bersih' }),
      el('strong', { className: h.netProfit < 0 ? 'is-bad' : 'is-good', text: rp(h.netProfit) }),
      el('span', { className: 'muted', text: `Pendapatan ${formatRupiah(h.revenue)}` }),
      el('div', {
        className: 'history-facts',
        children: [
          fact('Pelanggan', String(h.customers)),
          fact('Kepuasan', `${Math.round(h.avgSatisfaction)}%`),
          fact('Popularitas', popDelta === null ? String(Math.round(h.popularity)) : `${Math.round(h.popularity)} (${popDelta >= 0 ? '+' : ''}${popDelta})`, popDelta !== null && popDelta < 0 ? 'is-bad' : ''),
        ],
      }),
    ],
  });

  // Keuangan
  const finance = section('Keuangan', `${h.netProfit < 0 ? '−' : '+'}${formatRupiahShort(Math.abs(h.netProfit))}`, true, [
    row('Pendapatan', formatRupiah(h.revenue)),
    cost('Belanja bahan', r?.ingredientCost ?? h.ingredientCost),
    cost('Promosi', r?.promotionCost),
    cost('Operasional & sewa', r?.operationalCost ?? h.operationalCost),
    cost('Upgrade', r?.upgradeCost),
    cost('Pindah lokasi', r?.moveCost),
    r && r.bankIncome ? row('Bunga deposito', `+${rp(r.bankIncome)}`) : null,
    cost('Cicilan & bunga pinjaman', r?.loanCost),
    plusMinus('Bersih pesanan online', h.onlineNet),
    plusMinus('Bersih cabang', h.branchNet),
    row(h.netProfit < 0 ? 'Rugi bersih' : 'Laba bersih', rp(h.netProfit), `history-total ${h.netProfit < 0 ? 'is-bad' : 'is-good'}`),
    row('Kas akhir hari', formatRupiah(h.money)),
  ]);

  // Produk: lima kelompok sebagai chip, kelompok kosong disembunyikan.
  const top = r?.topSellers ?? h.topSellers ?? [];
  const productGroups = [
    chips('Terlaris', top.slice(0, 5).map(([id, n]) => [name(id), `${n}`])),
    chips('Kurang diminati', (r?.leastSold ?? []).map(([id, sold, made]) => [name(id), `${sold}/${made}`]), 'is-warn'),
    chips('Kehabisan stok (dicari)', (r?.soldOut ?? []).map(([id, n]) => [name(id), `${n}×`]), 'is-warn'),
    chips('Tersisa', (r?.leftovers ?? []).map(([id, n]) => [name(id), `${n}`])),
    chips('Terbuang', (r?.wasted ?? []).map(([id, n, kind]) => [`${name(id)}${kind === 'bahan' ? ' (bahan)' : ''}`, `${n}`]), 'is-bad'),
    r && r.wasteCost ? el('p', { className: 'history-small is-bad', text: `Nilai yang terbuang ${formatRupiah(r.wasteCost)}` }) : null,
  ];
  const soldTotal = top.reduce((n, [, q]) => n + q, 0);
  const products = section(
    'Produk',
    r ? `${r.soldOut.length ? `${r.soldOut.length} habis · ` : ''}${r.wasted.length ? `${r.wasted.length} terbuang` : 'tidak ada yang terbuang'}` : soldTotal ? `${soldTotal} porsi terlaris` : '',
    wide,
    productGroups.some(Boolean) ? productGroups : [el('p', { className: 'history-small muted', text: r ? 'Tidak ada produk terjual hari ini.' : 'Tidak tercatat di riwayat lama.' })],
  );

  // Pelanggan
  const customers = section('Pelanggan', `${h.customers} rombongan`, false, [
    row('Rombongan datang', String(h.customers)),
    r ? row('Dilayani penuh', String(r.served)) : h.served !== undefined ? row('Dilayani', String(h.served)) : null,
    r && r.partial ? row('Dilayani sebagian', String(r.partial)) : null,
    (r?.leftEmpty ?? h.leftEmpty) ? row('Pergi karena menu habis', String(r?.leftEmpty ?? h.leftEmpty), 'is-bad') : null,
    r && r.leftWaiting ? row('Pergi karena menunggu lama', String(r.leftWaiting), 'is-bad') : null,
    row('Rata-rata kepuasan', `${Math.round(h.avgSatisfaction)}%`),
    r ? row('Popularitas', `${Math.round(r.popularityBefore)} → ${Math.round(r.popularityAfter)}`) : row('Popularitas akhir', String(Math.round(h.popularity))),
    r ? row('Loyalitas', `${Math.round(r.loyaltyAfter)}/100`) : null,
    r && r.reviewDelta ? row('Ulasan food vlogger', `${r.reviewDelta > 0 ? '+' : ''}${r.reviewDelta} popularitas`, r.reviewDelta < 0 ? 'is-bad' : '') : null,
  ]);

  // Pesanan online
  const o = r?.online ?? null;
  const online = o
    ? section('Pesanan online', `${o.delivered} terantar`, false, [
        row('Pesanan masuk', String(o.generated)),
        row('Diterima / terantar', `${o.accepted} / ${o.delivered}`),
        o.late ? row('Terlambat', String(o.late), 'is-bad') : null,
        o.cancelled ? row('Batal (stok habis / tak terantar)', String(o.cancelled), 'is-bad') : null,
        o.rejected || o.expired ? row('Ditolak / tidak dijawab', `${o.rejected} / ${o.expired}`) : null,
        row('Nilai menu terkirim', formatRupiah(o.gross)),
        cost('Komisi ojol', o.commission),
        o.feesKept ? row('Ongkir masuk kas', `+${rp(o.feesKept)}`) : null,
        cost('Gaji kurir', o.wage),
        row('Bersih online', `${h.onlineNet && h.onlineNet < 0 ? '−' : '+'}${rp(h.onlineNet ?? 0)}`, 'history-total'),
        row('Rating kemitraan', `${o.ratingChange >= 0 ? '+' : ''}${Math.round(o.ratingChange)}`, o.ratingChange < 0 ? 'is-bad' : ''),
      ])
    : h.onlineDelivered
      ? section('Pesanan online', `${h.onlineDelivered} terantar`, false, [row('Terantar', String(h.onlineDelivered)), plusMinus('Bersih online', h.onlineNet)])
      : null;

  // Cabang: satu kartu kecil per cabang.
  const br = r?.branches ?? [];
  const branches = br.length
    ? section(
        'Cabang',
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
                attrs: { role: 'table', 'aria-label': `Rincian produk ${b.name}` },
                children: [
                  el('div', { className: 'branch-tr branch-th', attrs: { role: 'row' }, children: ['Produk', 'Diterima', 'Terjual', 'Tersisa', 'Terbuang'].map((t) => el('span', { text: t, attrs: { role: 'columnheader' } })) }),
                  ...ids.map((id) =>
                    el('div', {
                      className: 'branch-tr',
                      attrs: { role: 'row' },
                      children: [
                        el('span', { className: 'branch-td-name', text: name(id), attrs: { role: 'cell' } }),
                        ...(
                          [
                            ['Diterima', b.received[id] ?? 0],
                            ['Terjual', b.sold[id] ?? 0],
                            ['Tersisa', b.left[id] ?? 0],
                            ['Terbuang', b.wasted[id] ?? 0],
                          ] as const
                        ).map(([label, v]) => el('span', { className: label === 'Terbuang' && v ? 'is-bad' : '', text: String(v), attrs: { role: 'cell', 'data-label': label } })),
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
                  el('span', { text: `Pendapatan ${formatRupiah(b.revenue)}` }),
                  b.shrink ? el('span', { text: `Selisih kas −${formatRupiah(b.shrink)}` }) : null,
                  el('span', { text: `Operasional −${formatRupiah(b.operational)}` }),
                  b.wage ? el('span', { text: `Gaji${b.staffName ? ` ${b.staffName}` : ''} −${formatRupiah(b.wage)}` }) : null,
                ].filter((n): n is HTMLElement => n !== null),
              });
          return el('div', {
            className: 'history-branch',
            children: [
              el('div', { className: 'history-branch-head', children: [el('strong', { text: `${b.name} · ${bl}` }), el('strong', { className: b.net < 0 ? 'is-bad' : 'is-good', text: `${b.net < 0 ? '−' : '+'}${formatRupiahShort(Math.abs(b.net))}` })] }),
              el('span', {
                className: 'history-small muted',
                text:
                  b.status === 'tutup'
                    ? 'Tutup'
                    : `${BRANCH_STATUS_LABEL[b.status]} · ${b.portions} porsi terjual${left ? ` · sisa ${left}` : ''}${wasted ? ` · terbuang ${wasted}` : ''}${b.wageLate ? ' · gaji telat' : ''}${b.staffQuit ? ' · karyawan keluar' : ''}`,
              }),
              money,
              table ?? (b.status === 'tutup' ? null : el('p', { className: 'history-small muted', text: 'Tidak ada produk di cabang hari itu.' })),
            ].filter((n): n is HTMLElement => n !== null),
          });
        }),
      )
    : null;

  // Kejadian
  const bulk = r?.event?.bulk ?? null;
  const events = section('Kejadian', ev ? `${ev.icon} ${ev.name}` : h.weather ? `${WEATHER_ICON[h.weather]} ${WEATHER_LABELS[h.weather]}` : '', false, [
    loc ? row('Lokasi', loc) : null,
    row('Event', ev ? `${ev.icon} ${ev.name}` : r || h.weather ? 'Tidak ada' : '—'),
    bulk ? row(`Pesanan borongan ${name(bulk.recipeId)} ×${bulk.qty}`, bulk.status === 'terkirim' ? 'Terkirim' : bulk.status === 'gagal' ? 'Gagal' : 'Menunggu', bulk.status === 'gagal' ? 'is-bad' : '') : null,
    h.weather ? row('Cuaca', `${WEATHER_ICON[h.weather]} ${WEATHER_LABELS[h.weather]}`) : null,
    row('Hari', isWeekend(h.day) ? 'Akhir pekan' : 'Hari kerja'),
    r && r.ads.length ? row('Promosi aktif', r.ads.map((a) => {
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
  if (wide) body.prepend(el('h3', { className: 'history-side-title', text: `${formatDateLong(h.day)} · Hari ${h.day}` }));
  return body;
}
