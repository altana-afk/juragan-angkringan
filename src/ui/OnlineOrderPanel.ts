import type { GameContext } from '../core/GameContext';
import type { GameState, OnlineOrder } from '../core/GameState';
import { DELIVERY_MODES, ONLINE_RULES, modeById } from '../data/online';
import { activeTrip, readyForCourier } from '../systems/CourierSystem';
import { activeOnlineEvent } from '../systems/OnlineEventSystem';
import { acceptBlocker, acceptedToday, dailyLimit, ratingStars, stockShortfall } from '../systems/OnlineOrderSystem';
import { formatClock, formatRupiah } from '../utils/formatting';
import { el, keepScroll } from './dom';
import { itemIcon } from './itemIcon';
import { PRICE_RULES, onlinePriceOf, priceBounds, priceVerdict, salePriceOf } from '../systems/PricingSystem';
import { isDrink, sortRecipesForMenu } from '../systems/RecipeSystem';
import type { RecipeDef } from '../data/catalog';
import type { ModalHandle, UIManager } from './UIManager';

/**
 * Panel "Pesanan" (saat berjualan): daftar pesanan online, Terima/Tolak, sisa waktu,
 * peringatan stok, status kurir/driver. Jam permainan berhenti selama panel terbuka.
 */

const STATUS: Record<OnlineOrder['status'], string> = {
  menunggu: 'Menunggu jawaban',
  diterima: 'Diterima',
  diantar: 'Dalam perjalanan',
  selesai: 'Selesai',
  batal: 'Batal',
  ditolak: 'Ditolak',
  kedaluwarsa: 'Hangus',
};

export function itemsText(ctx: GameContext, o: OnlineOrder): string {
  return o.items.map((l) => `${l.qty}× ${ctx.catalog.recipe(l.recipeId).name}`).join(', ');
}

function header(s: Readonly<GameState>): HTMLElement {
  const mode = s.online.mode ? modeById(s.online.mode) : null;
  const ev = activeOnlineEvent(s);
  const trip = activeTrip(s, s.calendar.clockMinutes);
  const courier =
    s.online.mode === 'kurir'
      ? trip
        ? `${mode!.courierName} sedang mengantar ${trip.orderIds.length} pesanan, kembali ±${formatClock(trip.returnMinute)}`
        : `${mode!.courierName} siap di warung · maks. ${modeById('kurir').batchSize} pesanan sekali antar, bolak-balik sepanjang hari`
      : s.online.mode === 'ojol'
        ? `Driver ojol menjemput ${modeById('ojol').waitMinutes[0]}–${modeById('ojol').waitMinutes[1]} menit setelah pesanan diterima`
        : 'Belum memilih cara mengantar';
  return el('div', {
    className: 'online-head',
    children: [
      el('div', {
        className: 'online-stats',
        children: [
          el('span', { className: 'online-stat', text: `${mode?.icon ?? '❔'} ${mode?.name ?? 'Belum ada'}` }),
          el('span', { className: 'online-stat', text: `⭐ ${ratingStars(s.online.rating).toFixed(1)}`, attrs: { title: `Rating kemitraan ${Math.round(s.online.rating)}/100` } }),
          el('span', { className: 'online-stat', text: `📦 ${acceptedToday(s)}/${dailyLimit(s)} hari ini` }),
        ],
      }),
      el('p', { className: 'panel-note', text: courier }),
      ev ? el('p', { className: 'panel-note online-event', text: `${ev.icon} ${ev.name}: ${ev.description}` }) : null,
    ],
  });
}

export function openOnlineOrderPanel(ctx: GameContext, ui: UIManager): ModalHandle {
  const body = el('div', { className: 'online-body' });
  let handle: ModalHandle | null = null;
  const honor = new Map<number, boolean>();

  const render = (): void => {
    const s = ctx.store.get();
    const now = s.calendar.clockMinutes;
    const pending = s.online.orders.filter((o) => o.status === 'menunggu');
    const active = s.online.orders.filter((o) => o.status === 'diterima' || o.status === 'diantar');
    const done = s.online.orders.filter((o) => !['menunggu', 'diterima', 'diantar'].includes(o.status)).reverse();
    const parts: (HTMLElement | null)[] = [header(s)];

    if (!s.online.mode) {
      parts.push(el('p', { className: 'panel-warning', text: 'Pesanan online belum aktif. Pilih cara mengantar lewat Usaha → Pengantaran saat persiapan.' }));
    }
    else if (!s.online.enabled) {
      parts.push(el('p', { className: 'panel-warning', text: 'Pesanan online sedang ditutup. Buka lagi lewat Usaha → Pengantaran.' }));
    }

    if (s.online.mode === 'kurir') {
      const ready = readyForCourier(s, now).length;
      const can = ready > 0 && !activeTrip(s, now) && s.phase === 'berjualan';
      if (ready > 0) {
        parts.push(
          el('div', {
            className: 'online-dispatch',
            children: [
              el('span', { text: `${ready} pesanan siap diantar. Kurir berangkat otomatis saat kotak penuh atau pesanan menunggu ${ONLINE_RULES.kurirDispatchWait} menit.` }),
              el('button', {
                className: 'btn btn-secondary btn-sm',
                text: 'Kirim sekarang',
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

    parts.push(el('h3', { className: 'section-title', text: `Pesanan masuk · ${pending.length}` }));
    if (!pending.length) parts.push(el('p', { className: 'muted', text: s.online.mode ? 'Belum ada pesanan baru. Pesanan paling ramai jam 19.00–22.00.' : '—' }));
    for (const o of pending) {
      const blocker = acceptBlocker(s, o);
      const honorNote = honor.get(o.id) ?? true;
      const short = stockShortfall(s, o, honorNote).map((id) => ctx.catalog.recipe(id).name);
      const left = Math.max(0, o.expiresMinute - now);
      const net = Math.round(o.value * (1 - modeById(s.online.mode ?? 'ojol').commission)) + (s.online.mode === 'kurir' ? o.fee : 0);
      parts.push(
        el('article', {
          className: `online-card is-pending${left <= 3 ? ' is-urgent' : ''}`,
          children: [
            el('div', {
              className: 'online-card-head',
              children: [
                el('strong', { text: `${o.buyer} · ${o.area}` }),
                el('span', { className: `guide-badge tone-${left <= 3 ? 'warn' : 'info'}`, text: `⏱ ${left} mnt lagi` }),
              ],
            }),
            el('div', { className: 'online-items', text: itemsText(ctx, o) }),
            el('div', {
              className: 'item-meta',
              text: `${o.km.toFixed(1)} km · nilai ${formatRupiah(o.value)} · ongkir ${formatRupiah(o.fee)} · kamu terima ±${formatRupiah(net)}`,
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
                    el('span', { text: `📝 "${o.note.text}" — penuhi (+${o.note.extraMinutes} mnt${o.note.extraItem ? `, +1 ${ctx.catalog.recipe(o.note.extraItem).name}` : ''}). Kalau diabaikan, rating turun.` }),
                  ],
                })
              : null,
            short.length ? el('p', { className: 'panel-warning', text: `Stok kurang: ${short.join(', ')}. Masak dulu, atau pesanan bisa batal & rating turun.` }) : null,
            blocker ? el('p', { className: 'item-meta online-blocker', text: blocker }) : null,
            el('div', {
              className: 'online-actions',
              children: [
                el('button', {
                  className: 'btn btn-secondary btn-sm',
                  text: 'Tolak',
                  attrs: { type: 'button' },
                  onClick: () => {
                    ctx.actions.rejectOnline(o.id);
                  },
                }),
                el('button', {
                  className: 'btn btn-primary btn-sm',
                  text: 'Terima',
                  attrs: { type: 'button', ...(blocker ? { disabled: '' } : {}) },
                  onClick: () => {
                    const r = ctx.actions.acceptOnline(o.id, honorNote);
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
      parts.push(el('h3', { className: 'section-title', text: `Sedang diproses · ${active.length}` }));
      for (const o of active) {
        const eta =
          o.status === 'diantar'
            ? `tiba ±${formatClock(o.deliveredMinute ?? now)}${o.dueMinute !== null && (o.deliveredMinute ?? 0) > o.dueMinute ? ' (terlambat)' : ''}`
            : s.online.mode === 'ojol'
              ? `driver tiba ±${formatClock(o.pickupMinute ?? now)}`
              : (o.readyMinute ?? now) <= now
                ? 'siap, menunggu kurir'
                : `disiapkan, siap ${formatClock(o.readyMinute ?? now)}`;
        const short = o.status === 'diterima' ? stockShortfall(s, o).map((id) => ctx.catalog.recipe(id).name) : [];
        parts.push(
          el('article', {
            className: 'online-card',
            children: [
              el('div', { className: 'online-card-head', children: [el('strong', { text: o.buyer }), el('span', { className: 'guide-badge tone-good', text: STATUS[o.status] })] }),
              el('div', { className: 'online-items', text: itemsText(ctx, o) }),
              el('div', { className: 'item-meta', text: `${o.km.toFixed(1)} km · ${eta} · janji tiba ${formatClock(o.dueMinute ?? now)}` }),
              short.length ? el('p', { className: 'panel-warning', text: `Stok ${short.join(', ')} kurang! Masak sebelum dijemput.` }) : null,
            ],
          }),
        );
      }
    }

    if (done.length) {
      parts.push(el('h3', { className: 'section-title', text: 'Riwayat hari ini' }));
      parts.push(
        el('ul', {
          className: 'online-history',
          children: done.map((o) =>
            el('li', {
              text: `${STATUS[o.status]} · ${o.buyer} · ${formatRupiah(o.value)}${o.late ? ' · terlambat' : ''}${o.cold ? ' · dingin' : ''}${o.cancelReason ? ` · ${o.cancelReason}` : ''}`,
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
    title: 'Pesanan online',
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
        text: 'Pesanan online masuk saat berjualan dan memakai stok yang sama dengan pembeli di tempat. Pilih cara mengantar — bisa diganti setiap persiapan.',
      }),
      locked ? el('p', { className: 'panel-note', text: 'Cara mengantar hanya bisa diganti saat persiapan.' }) : null,
      ...DELIVERY_MODES.map((m) => {
        const current = s.online.mode === m.id;
        const facts =
          m.id === 'kurir'
            ? [`Gaji ${formatRupiah(m.dailyWage)} per hari (dibayar saat tutup)`, `${m.batchSize} pesanan sekali antar, bolak-balik tanpa batas`, `Ongkir ${formatRupiah(ONLINE_RULES.deliveryFee)} per pesanan masuk kasmu`, 'Tanpa komisi · bisa dipercepat motor & kotak termos']
            : [`Tanpa gaji harian`, `Komisi ${Math.round(m.commission * 100)}% dari nilai pesanan`, `Driver tiba ${m.waitMinutes[0]}–${m.waitMinutes[1]} menit setelah diterima`, 'Ongkir untuk driver · cocok kalau pesanan sedikit'];
        return el('article', {
          className: `guide-card delivery-card${current ? ' is-current' : ''}`,
          children: [
            el('span', { className: 'guide-icon', text: m.icon, attrs: { 'aria-hidden': 'true' } }),
            el('div', {
              className: 'guide-card-body',
              children: [
                el('div', { className: 'guide-card-head', children: [el('strong', { text: m.name }), current ? el('span', { className: 'guide-badge tone-good', text: 'Dipakai' }) : null] }),
                el('p', { className: 'guide-line', text: m.description }),
                el('ul', { className: 'about-list', children: facts.map((f) => el('li', { text: f })) }),
                current
                  ? null
                  : el('button', {
                      className: 'btn btn-primary btn-sm',
                      text: `Pakai ${m.name}`,
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
    title: 'Pengantaran',
    className: 'sheet sheet-online',
    closeButton: true,
    body,
    actions: [{ label: 'Buka Upgrade', onClick: () => void window.setTimeout(() => ctx.bus.emit('ui:open-panel', { panel: 'upgrade' }), 260) }, { label: 'Tutup', variant: 'primary' }],
    onClose: () => {
      off();
      handle = null;
    },
  });
  return handle;
}

/** Label kualitas rating kemitraan. */
function ratingLabel(stars: number): string {
  if (stars >= 4.5) return 'Mitra favorit';
  if (stars >= 3.8) return 'Bagus';
  if (stars >= 3) return 'Cukup';
  if (stars >= 2) return 'Kurang';
  return 'Buruk';
}

/** Bintang 5 dengan isi pecahan (★ berwarna di atas ★ redup). */
function starRow(stars: number): HTMLElement {
  return el('div', {
    className: 'rating-stars',
    attrs: { role: 'img', 'aria-label': `Rating ${stars.toFixed(1)} dari 5` },
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
    attrs: { type: 'button', role: 'switch', 'aria-checked': String(on), 'aria-label': 'Terima pesanan online' },
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
              el('span', { className: 'delivery-rating-label', text: `Rating kemitraan · ${ratingLabel(stars)}` }),
              el('span', { className: 'delivery-rating-hint', text: 'Tepat waktu +1 · telat −2 · batal −3 · catatan diabaikan / dingin / tak dijawab −1' }),
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
              el('strong', { text: on ? '📱 Pesanan online: Buka' : '📴 Pesanan online: Tutup' }),
              el('span', { text: on ? `Batas ${dailyLimit(s)} pesanan per hari` : 'Tidak ada pesanan baru masuk' }),
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
    const minus = el('button', { className: 'step-btn', text: '−', attrs: { type: 'button', 'aria-label': `Turunkan harga online ${r.name}` }, onClick: () => change(price - PRICE_RULES.step) });
    const plus = el('button', { className: 'step-btn', text: '+', attrs: { type: 'button', 'aria-label': `Naikkan harga online ${r.name}` }, onClick: () => change(price + PRICE_RULES.step) });
    minus.disabled = price <= min;
    plus.disabled = price >= max;
    const diff = price - local;
    const reset = el('button', { className: 'link-btn', text: 'Samakan', attrs: { type: 'button', title: `Ikut harga di tempat (${formatRupiah(local)})` }, onClick: () => change(null) });
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
            el('div', { className: 'item-meta', text: `Di tempat ${formatRupiah(local)}${diff ? ` · online ${diff > 0 ? '+' : '−'}${formatRupiah(Math.abs(diff))}` : ' · sama'}` }),
            el('div', {
              className: 'price-control',
              children: [
                el('span', { className: 'item-meta', text: 'Online' }),
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
    attrs: { role: 'group', 'aria-label': 'Saring menu' },
    children: (
      [
        ['semua', 'Semua'],
        ['makanan', 'Makanan'],
        ['minuman', 'Minuman'],
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
  const group = (title: string, list: RecipeDef[]): HTMLElement[] => (list.length ? [el('div', { className: 'recipe-group-title', text: `${title} · ${list.length}` }), ...list.map(card)] : []);
  return [
    el('div', { className: 'menu-head', children: [el('h3', { className: 'section-title', text: 'Harga menu online' }), filter] }),
    el('p', {
      className: 'panel-note',
      text: 'Harga online bisa berbeda dari harga di tempat, misalnya untuk menutup komisi ojol. Harga lebih mahal dari wajar membuat pesanan online lebih jarang masuk.',
    }),
    el('div', {
      className: 'recipe-grid',
      children: shown.length ? [...group('Makanan', shown.filter((r) => !isDrink(r))), ...group('Minuman', shown.filter(isDrink))] : [el('p', { className: 'muted', text: 'Belum ada menu yang terbuka.' })],
    }),
  ];
}
