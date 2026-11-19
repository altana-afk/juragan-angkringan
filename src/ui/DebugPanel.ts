import type { GameContext } from '../core/GameContext';
import { WEATHER_KINDS, type GameState, type WeatherKind } from '../core/GameState';
import { ALLIES, allyOfKind } from '../data/challenges';
import { EVENTS } from '../data/events';
import { LOCATIONS } from '../data/locations';
import { CHAPTERS, NAMED_CUSTOMERS, type RelationStage } from '../data/story';
import { ACHIEVEMENTS } from '../systems/AchievementSystem';
import { totalQty } from '../systems/InventorySystem';
import { createOrder } from '../systems/OnlineOrderSystem';
import { storyDay } from '../systems/StorySystem';
import { TUTORIAL_DONE } from '../systems/TutorialSystem';
import { UPGRADES } from '../systems/UpgradeSystem';
import { formatClock, formatRupiah } from '../utils/formatting';
import { SeededRandom } from '../utils/random';
import { el } from './dom';
import type { ModalHandle, UIManager } from './UIManager';
import { tr } from '../i18n/i18n';

/**
 * Panel mode debug (?debug di alamat): mengatur stok, uang, waktu, cuaca, upgrade, lokasi, event,
 * pesanan online, cerita, dan tantangan secara langsung untuk menguji semua fitur tanpa menunggu.
 * Hanya dibuat saat mode debug aktif, jadi pemain biasa tidak pernah melihatnya.
 */

export interface DebugHooks {
  /** Munculkan tantangan/kenalan sekarang (SalesController). Mengembalikan pesan. */
  challenge(kind: 'kucing' | 'odgj' | 'ormas' | 'ratna' | 'bram'): string;
  /** Panggil pelanggan bernama cerita sekarang. */
  callNamed(who: string): string;
  /** Muat ulang adegan (setelah ganti lokasi). */
  reloadScene(): void;
}

type Tab = 'stok' | 'pemain' | 'usaha' | 'event' | 'cerita' | 'tantangan';

const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'stok', label: tr('🍢 Stok') },
  { id: 'pemain', label: tr('💰 Pemain & waktu') },
  { id: 'usaha', label: tr('🏪 Usaha') },
  { id: 'event', label: tr('📅 Event & online') },
  { id: 'cerita', label: tr('📖 Cerita') },
  { id: 'tantangan', label: tr('⚠️ Tantangan') },
];

const WEATHER_LABEL: Record<WeatherKind, string> = { cerah: tr('☀️ Cerah'), berawan: tr('⛅ Berawan'), hujan: tr('🌧️ Hujan'), panas: tr('🔥 Panas') };

let lastTab: Tab = 'stok';

export function openDebugPanel(ui: UIManager, ctx: GameContext, hooks: DebugHooks): ModalHandle {
  const tabsBar = el('div', { className: 'tab-row debug-tabs', attrs: { role: 'tablist' } });
  const body = el('div', { className: 'debug-body' });
  let tab: Tab = lastTab;

  const say = (msg: string, kind: 'info' | 'success' | 'warning' = 'info'): void => {
    if (msg) ctx.notify(msg, kind, 2200);
  };
  const edit = (label: string, fn: (d: GameState) => void): void => {
    ctx.store.update(`debug-${label}`, fn);
    render();
  };

  const button = (label: string, onClick: () => void, variant = 'secondary'): HTMLButtonElement =>
    el('button', { className: `btn btn-${variant} debug-btn`, text: label, attrs: { type: 'button' }, onClick });
  const row = (label: string, ...children: (HTMLElement | null)[]): HTMLElement =>
    el('div', { className: 'debug-row', children: [el('span', { className: 'debug-label', text: label }), el('div', { className: 'debug-controls', children }) ] });
  const section = (title: string, ...children: (HTMLElement | null)[]): HTMLElement =>
    el('section', { className: 'debug-section', children: [el('h3', { className: 'section-title', text: title }), ...children] });
  const numberInput = (value: number, onCommit: (n: number) => void, opts: { min?: number; max?: number; step?: number; width?: string } = {}): HTMLInputElement => {
    const input = el('input', {
      className: 'debug-input',
      attrs: { type: 'number', value: String(value), min: String(opts.min ?? 0), ...(opts.max !== undefined ? { max: String(opts.max) } : {}), step: String(opts.step ?? 1), inputmode: 'numeric' },
    }) as HTMLInputElement;
    if (opts.width) input.style.width = opts.width;
    const commit = (): void => {
      const n = Number(input.value);
      if (Number.isFinite(n)) onCommit(n);
    };
    input.addEventListener('change', commit);
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') commit();
    });
    return input;
  };
  const select = <T extends string>(value: T, options: readonly { value: T; label: string }[], onChange: (v: T) => void): HTMLSelectElement => {
    const s = el('select', { className: 'debug-select' }) as HTMLSelectElement;
    for (const o of options) s.append(el('option', { text: o.label, attrs: { value: o.value } }));
    s.value = value;
    s.addEventListener('change', () => onChange(s.value as T));
    return s;
  };

  // ---------- Stok ----------

  const setPortions = (d: GameState, id: string, qty: number): void => {
    const q = Math.max(0, Math.floor(qty));
    if (q === 0) delete d.inventory.products[id];
    else {
      const r = ctx.catalog.recipe(id);
      d.inventory.products[id] = [{ qty: q, expiresDay: d.calendar.day + r.shelfLifeDays, unitCost: Math.round(r.salePrice * 0.45) }];
    }
  };

  const tabStok = (s: Readonly<GameState>): HTMLElement[] => {
    const unlocked = new Set(s.unlockedRecipes);
    const recipes = [...ctx.catalog.recipes].sort((a, b) => Number(unlocked.has(b.id)) - Number(unlocked.has(a.id)));
    const list = el('div', { className: 'debug-grid' });
    for (const r of recipes) {
      const qty = totalQty(s.inventory.products[r.id]);
      const open = unlocked.has(r.id);
      const step = (delta: number): void => edit('stok', (d) => setPortions(d, r.id, totalQty(d.inventory.products[r.id]) + delta));
      list.append(
        el('div', {
          className: `debug-item ${open ? '' : 'is-locked'}`,
          children: [
            el('span', { className: 'debug-item-name', text: open ? r.name : tr('🔒 {name}', { name: r.name }) }),
            button('−', () => step(-1)),
            numberInput(qty, (n) => edit('stok', (d) => setPortions(d, r.id, n)), { width: '58px' }),
            button('+', () => step(1)),
            button('+10', () => step(10)),
          ],
        }),
      );
    }
    const ingTotal = Object.values(s.inventory.ingredients).reduce((n, b) => n + totalQty(b), 0);
    return [
      section(
        tr('Papan Siap Dijual'),
        el('p', { className: 'debug-note', text: tr('Ubah jumlah porsi lalu tekan Enter. Menu terkunci ikut terbuka jika diberi stok.') }),
        el('div', {
          className: 'debug-actions',
          children: [
            button(tr('Isi semua menu terbuka: 10'), () => edit('stok', (d) => d.unlockedRecipes.forEach((id) => setPortions(d, id, 10)))),
            button(tr('Isi semua menu terbuka: 50'), () => edit('stok', (d) => d.unlockedRecipes.forEach((id) => setPortions(d, id, 50)))),
            button(tr('Kosongkan papan'), () => edit('stok', (d) => (d.inventory.products = {}))),
            button(tr('Buka semua menu'), () =>
              edit('menu', (d) => {
                for (const r of ctx.catalog.recipes) if (!d.unlockedRecipes.includes(r.id)) d.unlockedRecipes.push(r.id);
              }),
            ),
          ],
        }),
        list,
      ),
      section(
        tr('Gudang bahan ({count} satuan)', { count: ingTotal }),
        el('div', {
          className: 'debug-actions',
          children: [
            button(tr('Isi semua bahan (3 kemasan)'), () =>
              edit('bahan', (d) => {
                for (const ing of ctx.catalog.ingredients) {
                  d.inventory.ingredients[ing.id] = [
                    { qty: ing.packSize * 3, expiresDay: ing.shelfLifeDays === null ? null : d.calendar.day + ing.shelfLifeDays, unitCost: ing.basePrice / ing.packSize },
                  ];
                }
              }),
            ),
            button(tr('Kosongkan gudang'), () => edit('bahan', (d) => (d.inventory.ingredients = {}))),
          ],
        }),
      ),
    ];
  };

  // ---------- Pemain & waktu ----------

  const tabPemain = (s: Readonly<GameState>): HTMLElement[] => [
    section(
      tr('Kas & reputasi'),
      row(
        tr('Kas'),
        numberInput(s.player.money, (n) => edit('kas', (d) => (d.player.money = Math.round(n))), { min: -10_000_000, step: 1000, width: '120px' }),
        button('+100rb', () => edit('kas', (d) => (d.player.money += 100_000))),
        button('+1jt', () => edit('kas', (d) => (d.player.money += 1_000_000))),
        button('+10jt', () => edit('kas', (d) => (d.player.money += 10_000_000))),
      ),
      row(tr('Popularitas'), numberInput(Math.round(s.player.popularity), (n) => edit('pop', (d) => (d.player.popularity = Math.max(0, Math.min(100, n)))), { max: 100 }), button('0', () => edit('pop', (d) => (d.player.popularity = 0))), button('50', () => edit('pop', (d) => (d.player.popularity = 50))), button('100', () => edit('pop', (d) => (d.player.popularity = 100)))),
      row(tr('Loyalitas'), numberInput(Math.round(s.player.loyalty), (n) => edit('loyal', (d) => (d.player.loyalty = Math.max(0, Math.min(100, n)))), { max: 100 }), button('100', () => edit('loyal', (d) => (d.player.loyalty = 100)))),
      row(tr('Bangkrut'), el('span', { className: 'debug-note', text: tr('{days} hari kas minus', { days: s.debtDays }) }), button(tr('Pulihkan'), () => edit('bangkrut', (d) => ((d.debtDays = 0), (d.bankrupt = false))))),
    ),
    section(
      tr('Waktu & cuaca'),
      row(tr('Hari'), numberInput(s.calendar.day, (n) => edit('hari', (d) => (d.calendar.day = Math.max(1, Math.floor(n)))), { min: 1 }), button('+1', () => edit('hari', (d) => (d.calendar.day += 1))), button('+7', () => edit('hari', (d) => (d.calendar.day += 7)))),
      row(
        tr('Jam {time}', { time: formatClock(s.calendar.clockMinutes) }),
        button('−30', () => edit('jam', (d) => (d.calendar.clockMinutes = Math.max(0, d.calendar.clockMinutes - 30)))),
        button('+30', () => edit('jam', (d) => (d.calendar.clockMinutes += 30))),
        button('22.00', () => edit('jam', (d) => (d.calendar.clockMinutes = Math.max(d.calendar.clockMinutes, 22 * 60)))),
        button(tr('Jelang tutup'), () => edit('jam', (d) => (d.calendar.clockMinutes = Math.max(d.calendar.clockMinutes, 23 * 60 + 50)))),
      ),
      row(tr('Cuaca'), select(s.weather, WEATHER_KINDS.map((w) => ({ value: w, label: WEATHER_LABEL[w] })), (w) => edit('cuaca', (d) => (d.weather = w)))),
      el('p', { className: 'debug-note', text: tr('Fase: {phase}. Jam hanya maju saat berjualan; tombol [ dan ] di keyboard juga mengubah jam.', { phase: s.phase }) }),
    ),
    section(
      tr('Tutorial & pencapaian'),
      el('div', {
        className: 'debug-actions',
        children: [
          button(tr('Lewati tutorial'), () => edit('tutorial', (d) => (d.tutorial = TUTORIAL_DONE))),
          button(tr('Ulang tutorial'), () => edit('tutorial', (d) => (d.tutorial = 0))),
          button(tr('Buka semua pencapaian ({n})', { n: ACHIEVEMENTS.length }), () =>
            edit('capai', (d) => {
              for (const a of ACHIEVEMENTS) d.achievements[a.id] ??= d.calendar.day;
            }),
          ),
          button(tr('Hapus pencapaian'), () => edit('capai', (d) => (d.achievements = {}))),
        ],
      }),
    ),
  ];

  // ---------- Usaha ----------

  const tabUsaha = (s: Readonly<GameState>): HTMLElement[] => {
    const owned = new Set(s.upgrades);
    const list = el('div', { className: 'debug-checks' });
    for (const u of UPGRADES) {
      const id = `dbg-up-${u.id}`;
      const box = el('input', { attrs: { type: 'checkbox', id } }) as HTMLInputElement;
      box.checked = owned.has(u.id);
      box.addEventListener('change', () =>
        edit('upgrade', (d) => {
          const i = d.upgrades.indexOf(u.id);
          if (box.checked && i < 0) d.upgrades.push(u.id);
          if (!box.checked && i >= 0) d.upgrades.splice(i, 1);
        }),
      );
      list.append(el('label', { className: 'debug-check', attrs: { for: id }, children: [box, el('span', { text: u.name })] }));
    }
    return [
      section(
        tr('Lokasi'),
        row(
          tr('Toko utama'),
          select(s.mapId, LOCATIONS.map((l) => ({ value: l.id, label: l.name })), (id) => {
            if (s.phase !== 'persiapan') return say(tr('Pindah lokasi hanya saat persiapan.'), 'warning');
            ctx.store.update('debug-lokasi', (d) => {
              d.mapId = id;
              d.lastMoveDay = 0;
            });
            ui.closeAllModals();
            hooks.reloadScene();
          }),
        ),
      ),
      section(
        tr('Upgrade ({owned}/{total})', { owned: s.upgrades.length, total: UPGRADES.length }),
        el('div', {
          className: 'debug-actions',
          children: [
            button(tr('Miliki semua'), () => edit('upgrade', (d) => (d.upgrades = UPGRADES.map((u) => u.id)))),
            button(tr('Hapus semua'), () => edit('upgrade', (d) => (d.upgrades = []))),
          ],
        }),
        list,
      ),
      section(
        tr('Cabang'),
        el('p', { className: 'debug-note', text: tr('Penuhi syarat lalu buka cabang dari lembar Usaha → Cabang saat persiapan. Cabang sekarang: {n}.', { n: s.branches.list.length }) }),
        el('div', {
          className: 'debug-actions',
          children: [
            button(tr('Penuhi syarat 3 cabang'), () =>
              edit('cabang', (d) => {
                d.upgrades = UPGRADES.map((u) => u.id);
                d.player.popularity = Math.max(d.player.popularity, 80);
                d.player.money = Math.max(d.player.money, 15_000_000);
              }),
            ),
            button(tr('Hapus semua cabang'), () => edit('cabang', (d) => (d.branches.list = []))),
          ],
        }),
      ),
    ];
  };

  // ---------- Event & online ----------

  const tabEvent = (s: Readonly<GameState>): HTMLElement[] => {
    const evOptions = [{ value: '', label: tr('(tidak ada event)') }, ...EVENTS.map((e) => ({ value: e.id, label: `${e.icon} ${e.name}` }))];
    const pending = s.online.orders.filter((o) => o.status === 'menunggu').length;
    return [
      section(
        tr('Event harian'),
        row(
          tr('Hari ini'),
          select(s.event?.id ?? '', evOptions, (id) =>
            edit('event', (d) => {
              d.event = id ? { id, bulk: null } : null;
            }),
          ),
        ),
        el('p', { className: 'debug-note', text: tr('Event berlaku langsung. Pesanan borongan hanya muncul dari event yang terpilih otomatis di awal hari.') }),
      ),
      section(
        tr('Pesanan online ({pending} menunggu)', { pending }),
        row(
          tr('Cara antar'),
          select(s.online.mode ?? '', [{ value: '', label: tr('(belum dipilih)') }, { value: 'kurir', label: tr('Kurir sendiri') }, { value: 'ojol', label: tr('Ojol') }], (m) =>
            edit('online', (d) => {
              d.online.mode = m === '' ? null : (m as 'kurir' | 'ojol');
              d.online.enabled = true;
            }),
          ),
        ),
        row(tr('Rating'), numberInput(Math.round(s.online.rating), (n) => edit('rating', (d) => (d.online.rating = Math.max(0, Math.min(100, n)))), { max: 100 })),
        el('div', {
          className: 'debug-actions',
          children: [
            button(tr('Pesanan masuk sekarang'), () => {
              if (s.phase !== 'berjualan') return say(tr('Mulai berjualan dulu, lalu coba lagi.'), 'warning');
              let made = false;
              ctx.store.update('debug-pesanan', (d) => {
                if (!d.online.mode) d.online.mode = 'ojol';
                d.online.enabled = true;
                const rng = new SeededRandom(`debug-online-${Date.now()}`);
                for (let i = 0; i < 20 && !made; i++) {
                  const order = createOrder(d, ctx.catalog, rng, Math.floor(d.calendar.clockMinutes), d.online.nextId);
                  if (order) {
                    d.online.orders.push(order);
                    d.online.nextId += 1;
                    made = true;
                  }
                }
              });
              say(made ? tr('Pesanan online baru masuk. Buka tombol Pesanan.') : tr('Belum bisa membuat pesanan (stok atau menu belum cukup).'), made ? 'success' : 'warning');
              render();
            }),
          ],
        }),
      ),
    ];
  };

  // ---------- Cerita ----------

  const tabCerita = (s: Readonly<GameState>): HTMLElement[] => {
    const rows = NAMED_CUSTOMERS.map((c) => {
      const rel = s.story.relations[c.id];
      return row(
        c.name,
        select(String(rel?.stage ?? 0) as '0' | '1' | '2' | '3', (['0', '1', '2', '3'] as const).map((v) => ({ value: v, label: tr('Tahap {n}', { n: v }) })), (v) =>
          edit('relasi', (d) => {
            const r = (d.story.relations[c.id] ??= { points: 0, stage: 0, talks: 0, lastTalkDay: 0, lastVisitDay: 0 });
            r.stage = Number(v) as RelationStage;
            r.lastTalkDay = 0;
          }),
        ),
        button(tr('Panggil'), () => say(hooks.callNamed(c.id))),
      );
    });
    return [
      section(
        tr('Hari cerita {n}', { n: storyDay(s) }),
        row(
          tr('Lompat ke'),
          ...[8, 15, 32, 38, 42, 43].map((day) =>
            button(tr('H{n}', { n: day }), () =>
              edit('hari-cerita', (d) => {
                d.calendar.day = d.story.startDay + day - 1;
              }),
            ),
          ),
        ),
        el('p', { className: 'debug-note', text: tr('Hari 43 = keputusan Pak Hendra. Kabar & bab baru dicek saat hari berganti atau saat persiapan dimuat ulang.') }),
        el('div', {
          className: 'debug-actions',
          children: [
            button(tr('Buka semua bab Buku Dapur'), () =>
              edit('bab', (d) => {
                for (const ch of CHAPTERS) d.story.chapters[ch.id] ??= d.calendar.day;
              }),
            ),
            button(tr('Semua tokoh tahap 3'), () =>
              edit('relasi', (d) => {
                for (const c of NAMED_CUSTOMERS) {
                  const r = (d.story.relations[c.id] ??= { points: 0, stage: 0, talks: 0, lastTalkDay: 0, lastVisitDay: 0 });
                  r.stage = 3;
                }
              }),
            ),
          ],
        }),
      ),
      section(tr('Pelanggan bernama'), ...rows),
    ];
  };

  // ---------- Tantangan ----------

  const tabTantangan = (s: Readonly<GameState>): HTMLElement[] => {
    const allyRow = (kind: 'nakes' | 'polisi'): HTMLElement => {
      const a = allyOfKind(kind);
      const heart = s.challenges.allies[a.id]?.heart ?? 0;
      return row(
        tr('{name} ♥ {heart}/5', { name: a.name, heart }),
        ...[0, 3, 5].map((h) =>
          button(String(h), () =>
            edit('hati', (d) => {
              const st = (d.challenges.allies[a.id] ??= { heart: 0, talks: 0, lastTalkDay: 0, lastVisitDay: 0 });
              st.heart = h;
              st.lastTalkDay = 0;
            }),
          ),
        ),
        button(tr('Panggil'), () => say(hooks.challenge(a.id as 'ratna' | 'bram'))),
      );
    };
    const pet = s.upgrades.includes('kucing_peliharaan');
    return [
      section(
        tr('Munculkan sekarang (saat berjualan)'),
        el('div', {
          className: 'debug-actions',
          children: [
            button(tr('🐈 Kucing liar'), () => say(hooks.challenge('kucing'))),
            button(tr('🧍 ODGJ'), () => say(hooks.challenge('odgj'))),
            button(tr('🧥 Ormas'), () => say(hooks.challenge('ormas'))),
            button(pet ? tr('🐱 Lepas Si Belang') : tr('🐱 Pasang Si Belang'), () =>
              edit('kucing', (d) => {
                const i = d.upgrades.indexOf('kucing_peliharaan');
                if (i >= 0) d.upgrades.splice(i, 1);
                else d.upgrades.push('kucing_peliharaan');
              }),
            ),
          ],
        }),
        el('p', { className: 'debug-note', text: tr('Ambulans/mobil patroli: atur hati 5, panggil kenalannya, lalu munculkan ODGJ/ormas.') }),
      ),
      section(tr('Kenalan'), ...ALLIES.map((a) => allyRow(a.kind))),
      section(
        tr('Batas frekuensi'),
        row(
          tr('Ormas terakhir hari {n}', { n: s.challenges.lastOrmasDay }),
          button(tr('Reset'), () =>
            edit('freq', (d) => {
              d.challenges.lastOrmasDay = 0;
              d.challenges.lastOdgjDay = 0;
            }),
          ),
        ),
        el('p', { className: 'debug-note', text: tr('Total uang keamanan dibayar: {cost}', { cost: formatRupiah(s.challenges.stats.totalPaid) }) }),
      ),
    ];
  };

  const render = (): void => {
    const s = ctx.store.get();
    const scroll = body.scrollTop;
    tabsBar.replaceChildren(
      ...TABS.map((t) =>
        el('button', {
          className: `tab-btn ${t.id === tab ? 'is-active' : ''}`,
          text: t.label,
          attrs: { type: 'button', role: 'tab', 'aria-selected': String(t.id === tab) },
          onClick: () => {
            tab = lastTab = t.id;
            body.scrollTop = 0;
            render();
          },
        }),
      ),
    );
    const content =
      tab === 'stok' ? tabStok(s) : tab === 'pemain' ? tabPemain(s) : tab === 'usaha' ? tabUsaha(s) : tab === 'event' ? tabEvent(s) : tab === 'cerita' ? tabCerita(s) : tabTantangan(s);
    body.replaceChildren(...content);
    body.scrollTop = scroll;
  };

  render();
  return ui.openModal({
    title: tr('🧪 Mode debug'),
    className: 'debug-modal',
    closeButton: true,
    body: el('div', { className: 'debug-wrap', children: [tabsBar, body] }),
    actions: [],
  });
}
