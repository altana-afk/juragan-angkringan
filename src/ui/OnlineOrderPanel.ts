import type { GameContext } from '../core/GameContext';
import type { GameState, OnlineOrder } from '../core/GameState';
import { DELIVERY_MODES, ONLINE_RULES, modeById } from '../data/online';
import { activeTrip, readyForCourier } from '../systems/CourierSystem';
import { activeOnlineEvent } from '../systems/OnlineEventSystem';
import { acceptBlocker, acceptedToday, dailyLimit, orderNeeds, ratingStars, stockShortfall } from '../systems/OnlineOrderSystem';
import { formatClock, formatRupiah } from '../utils/formatting';
import { el, keepScroll } from './dom';
import { bestSource, branchSourcesUnlocked, sourceOptions, type OnlineSource, type SourceOption } from '../systems/BranchOnlineSystem';
import { itemIcon } from './itemIcon';
import { PRICE_RULES, onlinePriceOf, priceBounds, priceVerdict, salePriceOf } from '../systems/PricingSystem';
import { isDrink, sortRecipesForMenu } from '../systems/RecipeSystem';
import type { RecipeDef } from '../data/catalog';
import type { ModalHandle, UIManager } from './UIManager';
import { tr, trc } from '../i18n/i18n';

/**
 * Panel "Pesanan" (saat berjualan): daftar pesanan online, Terima/Tolak, sisa waktu,
 * peringatan stok, status kurir/driver. Jam permainan berhenti selama panel terbuka.
 */

const STATUS: Record<OnlineOrder['status'], string> = {
  menunggu: tr('Menunggu jawaban'),
  diterima: trc('status', 'Diterima'),
  diantar: tr('Dalam perjalanan'),
  selesai: trc('status', 'Selesai'),
  batal: trc('status', 'Batal'),
  ditolak: tr('Ditolak'),
  kedaluwarsa: tr('Hangus'),
};

export function itemsText(ctx: GameContext, o: OnlineOrder): string {
  return o.items.map((l) => tr('{qty}× {name}', { qty: l.qty, name: ctx.catalog.recipe(l.recipeId).name })).join(', ');
}

function header(s: Readonly<GameState>): HTMLElement {
  const mode = s.online.mode ? modeById(s.online.mode) : null;
  const ev = activeOnlineEvent(s);
  const trip = activeTrip(s, s.calendar.clockMinutes);
  const courier =
    s.online.mode === 'kurir'
      ? trip
        ? tr('{courierName} sedang mengantar {length} pesanan, kembali ±{returnMinute}', { courierName: mode!.courierName, length: trip.orderIds.length, returnMinute: formatClock(trip.returnMinute) })
        : tr('{courierName} siap di warung · maks. {batchSize} pesanan sekali antar, bolak-balik sepanjang hari', { courierName: mode!.courierName, batchSize: modeById('kurir').batchSize })
      : s.online.mode === 'ojol'
        ? tr('Driver ojol menjemput {0}–{1} menit setelah pesanan diterima', { 0: modeById('ojol').waitMinutes[0], 1: modeById('ojol').waitMinutes[1] })
        : tr('Belum memilih cara mengantar');
  return el('div', {
    className: 'online-head',
    children: [
      el('div', {
        className: 'online-stats',
        children: [
          el('span', { className: 'online-stat', text: `${mode?.icon ?? '❔'} ${mode?.name ?? tr('Belum ada')}` }),
          el('span', { className: 'online-stat', text: `⭐ ${ratingStars(s.online.rating).toFixed(1)}`, attrs: { title: tr('Rating kemitraan {rating}/100', { rating: Math.round(s.online.rating) }) } }),
          el('span', { className: 'online-stat', text: tr('📦 {s}/{s2} hari ini', { s: acceptedToday(s), s2: dailyLimit(s) }) }),
        ],
      }),
      el('p', { className: 'panel-note', text: courier }),
      ev ? el('p', { className: 'panel-note online-event', text: tr('{icon} {name}: {description}', { icon: ev.icon, name: ev.name, description: ev.description }) }) : null,
    ],
  });
}

export function openOnlineOrderPanel(ctx: GameContext, ui: UIManager): ModalHandle {
  const body = el('div', { className: 'online-body' });
  let handle: ModalHandle | null = null;
  const honor = new Map<number, boolean>();
  /** Sumber pengiriman yang dipilih per pesanan & apakah daftar cabang dibuka penuh. */
  const sourceSel = new Map<number, OnlineSource>();
  const showAll = new Set<number>();

  /**
   * Pilih sumber pengiriman (toko utama / cabang). Ponsel: 3 pilihan teratas + "Lihat semua cabang".
   * Desktop: dua kolom — pilihan di kiri, tabel stok per menu di kanan.
   */
  const sourcePicker = (o: OnlineOrder, honorNote: boolean): { node: HTMLElement; chosen: OnlineSource; options: SourceOption[] } => {
    const s = ctx.store.get();
    const options = sourceOptions(s, ctx.catalog, o, honorNote);
    const best = bestSource(s, ctx.catalog, o, honorNote);
    let chosen = sourceSel.get(o.id) ?? best ?? 'utama';
    if (!options.some((x) => x.source === chosen && (x.ok || x.source === 'utama'))) chosen = best ?? 'utama';
    const expanded = showAll.has(o.id);
    const visible = expanded ? options : options.slice(0, 3);
    const optionBtn = (x: SourceOption): HTMLElement =>
      el('button', {
        className: `source-opt${x.source === chosen ? ' is-active' : ''}${x.ok ? '' : ' is-off'}`,
        attrs: { type: 'button', role: 'radio', 'aria-checked': String(x.source === chosen), ...(x.ok || x.source === 'utama' ? {} : { disabled: '' }) },
        onClick: () => {
          sourceSel.set(o.id, x.source);
          render();
        },
        children: [
          el('span', { className: 'source-opt-name', text: x.label }),
          el('span', { className: 'source-opt-meta', text: x.ok ? tr('±{eta} mnt{1}', { eta: x.eta, 1: x.fee ? tr(' · antar {fee}', { fee: formatRupiah(x.fee) }) : '' }) : (x.reason ?? '') }),
        ],
      });
    const list = el('div', {
      className: 'source-list',
      attrs: { role: 'radiogroup', 'aria-label': tr('Kirim dari') },
      children: [
        ...visible.map(optionBtn),
        options.length > 3
          ? el('button', {
              className: 'link-btn source-more',
              text: expanded ? tr('Sembunyikan') : tr('Lihat semua cabang ({0})', { 0: options.length - 1 }),
              attrs: { type: 'button' },
              onClick: () => {
                if (expanded) showAll.delete(o.id);
                else showAll.add(o.id);
                render();
              },
            })
          : null,
      ].filter((n): n is HTMLElement => n !== null),
    });
    const needs = [...orderNeeds(o, honorNote)];
    const table = el('div', {
      className: 'source-table',
      attrs: { role: 'table', 'aria-label': tr('Stok per menu tiap sumber') },
      children: [
        el('div', { className: 'source-tr source-th', attrs: { role: 'row' }, children: [el('span', { text: tr('Menu') }), ...options.map((x) => el('span', { text: x.label }))] }),
        ...needs.map(([id, n]) =>
          el('div', {
            className: 'source-tr',
            attrs: { role: 'row' },
            children: [
              el('span', { text: tr('{name} ×{n}', { name: ctx.catalog.recipe(id).name, n }) }),
              ...options.map((x) => el('span', { className: (x.available[id] ?? 0) < n ? 'is-bad' : '', text: String(x.available[id] ?? 0) })),
            ],
          }),
        ),
      ],
    });
    table.style.setProperty('--cols', String(options.length));
    const node = el('div', {
      className: 'source-picker',
      children: [
        el('div', {
          className: 'source-head',
          children: [
            el('span', { className: 'source-title', text: tr('Kirim dari') }),
            el('button', {
              className: 'btn btn-secondary btn-sm',
              text: tr('Pilih terbaik'),
              attrs: { type: 'button', ...(best === null ? { disabled: '' } : {}), title: tr('Sumber tercepat dengan stok cukup') },
              onClick: () => {
                if (best !== null) sourceSel.set(o.id, best);
                render();
              },
            }),
          ],
        }),
        el('div', { className: 'source-cols', children: [list, table] }),
        el('p', { className: 'source-note', text: tr('Cabang menyisakan 2 porsi atau 30% stok tiap menu untuk pembeli di tempat. Angka tabel = stok yang boleh dipakai.') }),
      ],
    });
    return { node, chosen, options };
  };

  const render = (): void => {
    const s = ctx.store.get();
    const now = s.calendar.clockMinutes;
    const pending = s.online.orders.filter((o) => o.status === 'menunggu');
    const active = s.online.orders.filter((o) => o.status === 'diterima' || o.status === 'diantar');
    const done = s.online.orders.filter((o) => !['menunggu', 'diterima', 'diantar'].includes(o.status)).reverse();
    const parts: (HTMLElement | null)[] = [header(s)];

    if (!s.online.mode) {
      parts.push(el('p', { className: 'panel-warning', text: tr('Pesanan online belum aktif. Pilih cara mengantar lewat Usaha → Pengantaran saat persiapan.') }));
    }
    else if (!s.online.enabled) {
      parts.push(el('p', { className: 'panel-warning', text: tr('Pesanan online sedang ditutup. Buka lagi lewat Usaha → Pengantaran.') }));
    }

    if (s.online.mode === 'kurir') {
      const ready = readyForCourier(s, now).length;
      const can = ready > 0 && !activeTrip(s, now) && s.phase === 'berjualan';
      if (ready > 0) {
        parts.push(
          el('div', {
            className: 'online-dispatch',
            children: [
              el('span', { text: tr('{ready} pesanan siap diantar. Kurir berangkat otomatis saat kotak penuh atau pesanan menunggu {kurirDispatchWait} menit.', { ready, kurirDispatchWait: ONLINE_RULES.kurirDispatchWait }) }),
              el('button', {
                className: 'btn btn-secondary btn-sm',
                text: tr('Kirim sekarang'),
                attrs: { type: 'button', ...(can ? {} : { disabled: '' }) },
                onClick: () => {
                  const r = ctx.actions.dispatchNow();
                  ctx.notify(r.message, r.ok ? 'success' : 'error');
                },
              }),
            ],
          }),
        );
      }
    }

    parts.push(el('h3', { className: 'section-title', text: tr('Pesanan masuk · {length}', { length: pending.length }) }));
    if (!pending.length) parts.push(el('p', { className: 'muted', text: s.online.mode ? tr('Belum ada pesanan baru. Pesanan paling ramai jam 19.00–22.00.') : '—' }));
    for (const o of pending) {
      const blocker = acceptBlocker(s, o);
      const honorNote = honor.get(o.id) ?? true;
      const short = stockShortfall(s, o, honorNote).map((id) => ctx.catalog.recipe(id).name);
      const left = Math.max(0, o.expiresMinute - now);
      const picker = branchSourcesUnlocked(s) && s.online.mode ? sourcePicker(o, honorNote) : null;
      const chosen: OnlineSource = picker?.chosen ?? 'utama';
      const net =
        chosen === 'utama'
          ? Math.round(o.value * (1 - modeById(s.online.mode ?? 'ojol').commission)) + (s.online.mode === 'kurir' ? o.fee : 0)
          : o.value + o.fee - (picker?.options.find((x) => x.source === chosen)?.fee ?? 0);
      const chosenOk = chosen === 'utama' || (picker?.options.find((x) => x.source === chosen)?.ok ?? false);
      parts.push(
        el('article', {
          className: `online-card is-pending${left <= 3 ? ' is-urgent' : ''}`,
          children: [
            el('div', {
              className: 'online-card-head',
              children: [
                el('strong', { text: tr('{buyer} · {area}', { buyer: o.buyer, area: o.area }) }),
                el('span', { className: `guide-badge tone-${left <= 3 ? 'warn' : 'info'}`, text: tr('⏱ {left} mnt lagi', { left }) }),
              ],
            }),
            el('div', { className: 'online-items', text: itemsText(ctx, o) }),
            el('div', {
              className: 'item-meta',
              text: tr('{0} km · nilai {value} · ongkir {fee} · kamu terima ±{net}', { 0: o.km.toFixed(1), value: formatRupiah(o.value), fee: formatRupiah(o.fee), net: formatRupiah(net) }),
            }),
            o.note
              ? el('label', {
                  className: 'online-note',
                  children: [
                    el('input', {
                      attrs: { type: 'checkbox', ...(honorNote ? { checked: '' } : {}) },
                      onClick: (e) => {
                        honor.set(o.id, (e.target as HTMLInputElement).checked);
                        render();
                      },
                    }),
                    el('span', { text: tr('📝 "{text}" — penuhi (+{extraMinutes} mnt{2}). Kalau diabaikan, rating turun.', { text: o.note.text, extraMinutes: o.note.extraMinutes, 2: o.note.extraItem ? tr(', +1 {name}', { name: ctx.catalog.recipe(o.note.extraItem).name }) : '' }) }),
                  ],
                })
              : null,
            picker?.node ?? null,
            short.length && chosen === 'utama' ? el('p', { className: 'panel-warning', text: tr('Stok kurang: {0}. Masak dulu, atau pesanan bisa batal & rating turun.', { 0: short.join(', ') }) }) : null,
            blocker ? el('p', { className: 'item-meta online-blocker', text: blocker }) : null,
            el('div', {
              className: 'online-actions',
              children: [
                el('button', {
                  className: 'btn btn-secondary btn-sm',
                  text: tr('Tolak'),
                  attrs: { type: 'button' },
                  onClick: () => {
                    ctx.actions.rejectOnline(o.id);
                  },
                }),
                el('button', {
                  className: 'btn btn-primary btn-sm',
                  text: chosen === 'utama' ? tr('Terima') : tr('Kirim dari {0}', { 0: s.branches.list.find((b) => b.slot === chosen)?.name ?? tr('cabang') }),
                  attrs: { type: 'button', ...(blocker || !chosenOk ? { disabled: '' } : {}) },
                  onClick: () => {
                    const r = ctx.actions.acceptOnline(o.id, honorNote, chosen);
                    ctx.notify(r.message, r.ok ? 'success' : 'error');
                  },
                }),
              ],
            }),
          ],
        }),
      );
    }

    if (active.length) {
      parts.push(el('h3', { className: 'section-title', text: tr('Sedang diproses · {length}', { length: active.length }) }));
      for (const o of active) {
        const eta =
          o.status === 'diantar'
            ? tr('tiba ±{0}{1}', { 0: formatClock(o.deliveredMinute ?? now), 1: o.dueMinute !== null && (o.deliveredMinute ?? 0) > o.dueMinute ? tr(' (terlambat)') : '' })
            : s.online.mode === 'ojol'
              ? tr('driver tiba ±{0}', { 0: formatClock(o.pickupMinute ?? now) })
              : (o.readyMinute ?? now) <= now
                ? tr('siap, menunggu kurir')
                : tr('disiapkan, siap {0}', { 0: formatClock(o.readyMinute ?? now) });
        const short = o.status === 'diterima' ? stockShortfall(s, o).map((id) => ctx.catalog.recipe(id).name) : [];
        parts.push(
          el('article', {
            className: 'online-card',
            children: [
              el('div', {
                className: 'online-card-head',
                children: [
                  el('strong', { text: o.buyer }),
                  el('span', {
                    className: 'guide-badge tone-good',
                    text: o.source != null ? tr('{0} · dari {1}', { 0: STATUS[o.status], 1: s.branches.list.find((b) => b.slot === o.source)?.name ?? tr('cabang') }) : STATUS[o.status],
                  }),
                ],
              }),
              el('div', { className: 'online-items', text: itemsText(ctx, o) }),
              el('div', { className: 'item-meta', text: tr('{0} km · {eta} · janji tiba {2}', { 0: o.km.toFixed(1), eta, 2: formatClock(o.dueMinute ?? now) }) }),
              short.length ? el('p', { className: 'panel-warning', text: tr('Stok {0} kurang! Masak sebelum dijemput.', { 0: short.join(', ') }) }) : null,
            ],
          }),
        );
      }
    }

    if (done.length) {
      parts.push(el('h3', { className: 'section-title', text: tr('Riwayat hari ini') }));
      parts.push(
        el('ul', {
          className: 'online-history',
          children: done.map((o) =>
            el('li', {
              text: tr('{0} · {buyer} · {value}{3}{4}{5}', { 0: STATUS[o.status], buyer: o.buyer, value: formatRupiah(o.value), 3: o.late ? tr(' · terlambat') : '', 4: o.cold ? tr(' · dingin') : '', 5: o.cancelReason ? tr(' · {cancelReason}', { cancelReason: o.cancelReason }) : '' }),
            }),
          ),
        }),
      );
    }
    keepScroll(body, () => body.replaceChildren(...parts.filter((p): p is HTMLElement => p !== null)));
  };

  const off = ctx.bus.on('state:changed', () => {
    if (handle) render();
  });
  render();
  handle = ui.openModal({
    title: tr('Pesanan online'),
    className: 'sheet sheet-online',
    closeButton: true,
    body,
    actions: [],
    onClose: () => {
      off();
      handle = null;
    },
  });
  return handle;
}

/** Panel "Pengantaran" (dari lembar Usaha): pilih kurir sendiri atau kemitraan ojol. */
export function openDeliveryPanel(ctx: GameContext, ui: UIManager): ModalHandle {
  const body = el('div', { className: 'online-body' });
  let handle: ModalHandle | null = null;
  const render = (): void => {
    const s = ctx.store.get();
    const locked = s.phase === 'berjualan';
    const nodes: (HTMLElement | null)[] = [
      deliveryHeader(ctx, s),
      el('p', {
        className: 'guide-text',
        text: tr('Pesanan online masuk saat berjualan dan memakai stok yang sama dengan pembeli di tempat. Pilih cara mengantar — bisa diganti setiap persiapan.'),
      }),
      locked ? el('p', { className: 'panel-note', text: tr('Cara mengantar hanya bisa diganti saat persiapan.') }) : null,
      ...DELIVERY_MODES.map((m) => {
        const current = s.online.mode === m.id;
        const facts =
          m.id === 'kurir'
            ? [tr('Gaji {dailyWage} per hari (dibayar saat tutup)', { dailyWage: formatRupiah(m.dailyWage) }), tr('{batchSize} pesanan sekali antar, bolak-balik tanpa batas', { batchSize: m.batchSize }), tr('Ongkir {deliveryFee} per pesanan masuk kasmu', { deliveryFee: formatRupiah(ONLINE_RULES.deliveryFee) }), tr('Tanpa komisi · bisa dipercepat motor & kotak termos')]
            : [tr('Tanpa gaji harian'), tr('Komisi {0}% dari nilai pesanan', { 0: Math.round(m.commission * 100) }), tr('Driver tiba {0}–{1} menit setelah diterima', { 0: m.waitMinutes[0], 1: m.waitMinutes[1] }), tr('Ongkir untuk driver · cocok kalau pesanan sedikit')];
        return el('article', {
          className: `guide-card delivery-card${current ? ' is-current' : ''}`,
          children: [
            el('span', { className: 'guide-icon', text: m.icon, attrs: { 'aria-hidden': 'true' } }),
            el('div', {
              className: 'guide-card-body',
              children: [
                el('div', { className: 'guide-card-head', children: [el('strong', { text: m.name }), current ? el('span', { className: 'guide-badge tone-good', text: tr('Dipakai') }) : null] }),
                el('p', { className: 'guide-line', text: m.description }),
                el('ul', { className: 'about-list', children: facts.map((f) => el('li', { text: f })) }),
                current
                  ? null
                  : el('button', {
                      className: 'btn btn-primary btn-sm',
                      text: tr('Pakai {name}', { name: m.name }),
                      attrs: { type: 'button', ...(locked ? { disabled: '' } : {}) },
                      onClick: () => {
                        const r = ctx.actions.setDeliveryMode(m.id);
                        ctx.notify(r.message, r.ok ? 'success' : 'error');
                      },
                    }),
              ],
            }),
          ],
        });
      }),
      ...onlinePriceList(ctx, s, render),
    ];
    keepScroll(body, () => body.replaceChildren(...nodes.filter((n): n is HTMLElement => n !== null)));
  };
  const off = ctx.bus.on('state:changed', () => {
    if (handle) render();
  });
  render();
  handle = ui.openModal({
    title: tr('Pengantaran'),
    className: 'sheet sheet-online',
    closeButton: true,
    body,
    actions: [{ label: tr('Buka Upgrade'), onClick: () => void window.setTimeout(() => ctx.bus.emit('ui:open-panel', { panel: 'upgrade' }), 260) }, { label: tr('Tutup'), variant: 'primary' }],
    onClose: () => {
      off();
      handle = null;
    },
  });
  return handle;
}

/** Label kualitas rating kemitraan. */
function ratingLabel(stars: number): string {
  if (stars >= 4.5) return tr('Mitra favorit');
  if (stars >= 3.8) return tr('Bagus');
  if (stars >= 3) return tr('Cukup');
  if (stars >= 2) return tr('Kurang');
  return tr('Buruk');
}

/** Bintang 5 dengan isi pecahan (★ berwarna di atas ★ redup). */
function starRow(stars: number): HTMLElement {
  return el('div', {
    className: 'rating-stars',
    attrs: { role: 'img', 'aria-label': tr('Rating {0} dari 5', { 0: stars.toFixed(1) }) },
    children: [0, 1, 2, 3, 4].map((i) => {
      const fill = Math.max(0, Math.min(1, stars - i));
      const star = el('span', { className: 'rating-star', text: '★' });
      star.append(el('span', { className: 'rating-star-fill', text: '★', attrs: { style: `width:${Math.round(fill * 100)}%` } }));
      return star;
    }),
  });
}

/** Kepala panel: rating kemitraan & sakelar buka/tutup pesanan online. */
function deliveryHeader(ctx: GameContext, s: Readonly<GameState>): HTMLElement {
  const stars = ratingStars(s.online.rating);
  const on = s.online.enabled;
  const toggle = el('button', {
    className: `online-switch${on ? ' is-on' : ''}`,
    attrs: { type: 'button', role: 'switch', 'aria-checked': String(on), 'aria-label': tr('Terima pesanan online') },
    children: [el('span', { className: 'online-switch-knob', attrs: { 'aria-hidden': 'true' } })],
    onClick: () => {
      const r = ctx.actions.setOnlineEnabled(!on);
      ctx.notify(r.message, r.ok ? 'info' : 'error');
    },
  });
  return el('div', {
    className: 'delivery-head',
    children: [
      el('div', {
        className: 'delivery-rating',
        children: [
          el('span', { className: 'delivery-rating-num', text: stars.toFixed(1) }),
          el('div', {
            className: 'delivery-rating-body',
            children: [
              starRow(stars),
              el('span', { className: 'delivery-rating-label', text: tr('Rating kemitraan · {stars}', { stars: ratingLabel(stars) }) }),
              el('span', { className: 'delivery-rating-hint', text: tr('Tepat waktu +1 · telat −2 · batal −3 · catatan diabaikan / dingin / tak dijawab −1') }),
            ],
          }),
        ],
      }),
      el('div', {
        className: 'delivery-toggle',
        children: [
          el('div', {
            className: 'delivery-toggle-text',
            children: [
              el('strong', { text: on ? tr('📱 Pesanan online: Buka') : tr('📴 Pesanan online: Tutup') }),
              el('span', { text: on ? tr('Batas {s} pesanan per hari', { s: dailyLimit(s) }) : tr('Tidak ada pesanan baru masuk') }),
            ],
          }),
          toggle,
        ],
      }),
    ],
  });
}

/** Saringan daftar harga online (diingat selama permainan berjalan). */
let priceFilter: 'semua' | 'makanan' | 'minuman' = 'semua';

/** Daftar harga khusus pesanan online — tata letak sama dengan menu di Persiapan Dapur, hanya harga. */
function onlinePriceList(ctx: GameContext, s: Readonly<GameState>, rerender: () => void): HTMLElement[] {
  const recipes = sortRecipesForMenu(ctx.catalog.recipes, s.unlockedRecipes).filter((r) => s.unlockedRecipes.includes(r.id));
  const card = (r: RecipeDef): HTMLElement => {
    const price = onlinePriceOf(s, r);
    const local = salePriceOf(s, r);
    const custom = s.online.prices[r.id] !== undefined;
    const { min, max } = priceBounds(r);
    const verdict = priceVerdict(price / r.salePrice);
    const change = (next: number | null): void => {
      const res = ctx.actions.setOnlinePrice(r.id, next);
      if (!res.ok) ctx.notify(res.message, 'error');
    };
    const minus = el('button', { className: 'step-btn', text: '−', attrs: { type: 'button', 'aria-label': tr('Turunkan harga online {name}', { name: r.name }) }, onClick: () => change(price - PRICE_RULES.step) });
    const plus = el('button', { className: 'step-btn', text: '+', attrs: { type: 'button', 'aria-label': tr('Naikkan harga online {name}', { name: r.name }) }, onClick: () => change(price + PRICE_RULES.step) });
    minus.disabled = price <= min;
    plus.disabled = price >= max;
    const diff = price - local;
    const reset = el('button', { className: 'link-btn', text: tr('Samakan'), attrs: { type: 'button', title: tr('Ikut harga di tempat ({local})', { local: formatRupiah(local) }) }, onClick: () => change(null) });
    reset.hidden = !custom;
    return el('div', {
      className: 'recipe-card',
      attrs: { 'data-anchor': `harga-${r.id}` },
      children: [
        itemIcon(r.icon),
        el('div', {
          className: 'recipe-info',
          children: [
            el('div', { className: 'item-name', text: r.name }),
            el('div', { className: 'item-meta', text: tr('Di tempat {local}{1}', { local: formatRupiah(local), 1: diff ? tr(' · online {0}{diff}', { 0: diff > 0 ? '+' : '−', diff: formatRupiah(Math.abs(diff)) }) : tr(' · sama') }) }),
            el('div', {
              className: 'price-control',
              children: [
                el('span', { className: 'item-meta', text: tr('Online') }),
                minus,
                el('strong', { className: `price-value${custom ? ' is-custom' : ''}`, text: formatRupiah(price) }),
                plus,
                reset,
                el('span', { className: `price-verdict tone-${verdict.tone}`, text: verdict.label }),
              ],
            }),
          ],
        }),
      ],
    });
  };
  const filter = el('div', {
    className: 'menu-filter',
    attrs: { role: 'group', 'aria-label': tr('Saring menu') },
    children: (
      [
        ['semua', tr('Semua')],
        ['makanan', tr('Makanan')],
        ['minuman', tr('Minuman')],
      ] as const
    ).map(([id, label]) =>
      el('button', {
        className: `filter-btn${priceFilter === id ? ' is-active' : ''}`,
        text: label,
        attrs: { type: 'button', 'aria-pressed': String(priceFilter === id) },
        onClick: () => {
          if (priceFilter === id) return;
          priceFilter = id;
          rerender();
          document.querySelector('.sheet-online .menu-head')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
      }),
    ),
  });
  const shown = recipes.filter((r) => priceFilter === 'semua' || (priceFilter === 'minuman') === isDrink(r));
  const group = (title: string, list: RecipeDef[]): HTMLElement[] => (list.length ? [el('div', { className: 'recipe-group-title', text: tr('{title} · {length}', { title, length: list.length }) }), ...list.map(card)] : []);
  return [
    el('div', { className: 'menu-head', children: [el('h3', { className: 'section-title', text: tr('Harga menu online') }), filter] }),
    el('p', {
      className: 'panel-note',
      text: tr('Harga online bisa berbeda dari harga di tempat, misalnya untuk menutup komisi ojol. Harga lebih mahal dari wajar membuat pesanan online lebih jarang masuk.'),
    }),
    el('div', {
      className: 'recipe-grid',
      children: shown.length ? [...group(tr('Makanan'), shown.filter((r) => !isDrink(r))), ...group(tr('Minuman'), shown.filter(isDrink))] : [el('p', { className: 'muted', text: tr('Belum ada menu yang terbuka.') })],
    }),
  ];
}
