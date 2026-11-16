import { BALANCE_CONFIG } from '../config/balanceConfig';
import { DEMAND_CONFIG } from '../config/demandConfig';
import { ECONOMY_CONFIG } from '../config/economyConfig';
import { GAME_CONFIG } from '../config/gameConfig';
import type { GameState, WeatherKind } from '../core/GameState';
import type { Catalog, RecipeCategory, RecipeDef } from '../data/catalog';
import { CUSTOMER_TYPES } from '../data/customers';
import { EVENT_CHANCE, EVENTS, type EventDef } from '../data/events';
import { LOCATIONS, locationById } from '../data/locations';
import { ACHIEVEMENTS } from '../systems/AchievementSystem';
import { ADS } from '../systems/AdvertisingSystem';
import { BANK_RULES } from '../systems/BankSystem';
import { BASE_MAX_PORTIONS } from '../systems/CookingSystem';
import { BANKRUPT_AFTER_DAYS } from '../systems/DayCloseSystem';
import { BASE_STORAGE } from '../systems/EconomySystem';
import { MOVE_LOYALTY_KEEP } from '../systems/LocationSystem';
import { PRICE_RULES } from '../systems/PricingSystem';
import { describeUnlock, sortRecipesForMenu } from '../systems/RecipeSystem';
import { UPGRADE_CATEGORIES, UPGRADES, describeEffects, upgradeById, type UpgradeDef } from '../systems/UpgradeSystem';
import { RAIN_STREAK_CHANCE, WEATHER_EFFECTS, WEATHER_WEIGHTS } from '../systems/WeatherSystem';
import { formatClock, formatRupiah } from '../utils/formatting';
import { el } from './dom';
import { itemIcon } from './itemIcon';
import type { ModalHandle, UIManager } from './UIManager';

/**
 * Panel "Panduan & Info": ensiklopedia semua informasi game (cara main, event, cuaca, lokasi, pelanggan,
 * menu, upgrade, bank & promosi, pencapaian, kontrol). Isinya dibaca langsung dari data game
 * (src/data/*.json & konfigurasi), jadi selalu sesuai dengan aturan yang berlaku.
 * Bisa dibuka dari menu utama (tanpa save) atau saat bermain (menandai kondisi hari ini).
 */

export type GuideTab = 'panduan' | 'event' | 'cuaca' | 'lokasi' | 'pelanggan' | 'menu' | 'upgrade' | 'bank' | 'pencapaian' | 'kontrol';

export const GUIDE_TABS: readonly { id: GuideTab; label: string }[] = [
  { id: 'panduan', label: '📖 Cara main' },
  { id: 'event', label: '🎉 Event' },
  { id: 'cuaca', label: '🌦️ Cuaca' },
  { id: 'lokasi', label: '📍 Lokasi' },
  { id: 'pelanggan', label: '👥 Pelanggan' },
  { id: 'menu', label: '🍚 Menu' },
  { id: 'upgrade', label: '🔨 Upgrade' },
  { id: 'bank', label: '🏦 Bank & promosi' },
  { id: 'pencapaian', label: '🏆 Pencapaian' },
  { id: 'kontrol', label: '🎮 Kontrol' },
];

export interface GuideOptions {
  catalog: Catalog;
  /** Keadaan permainan saat ini (null jika dibuka dari menu utama). */
  state?: Readonly<GameState> | null;
  tab?: GuideTab;
  /** Panel di tengah layar (tidak bergeser memberi ruang papan stok) — untuk menu utama. */
  centered?: boolean;
}

const CATEGORY_LABEL: Record<RecipeCategory, string> = {
  makanan: 'Makanan',
  gorengan: 'Gorengan',
  sate: 'Sate & bakaran',
  minuman: 'Minuman',
};

const TAG_LABEL: Record<string, string> = {
  murah: 'murah',
  mengenyangkan: 'mengenyangkan',
  hangat: 'hangat',
  dingin: 'dingin',
  praktis: 'praktis',
  spesial: 'spesial',
};

const WEATHER_ICON: Record<WeatherKind, string> = { cerah: '☀️', berawan: '⛅', hujan: '🌧️', panas: '🔥' };

// ---------- helper teks (diekspor untuk unit test) ----------

/** 1.3 → "+30%", 0.75 → "−25%". */
export function pct(factor: number): string {
  const v = Math.round((factor - 1) * 100);
  return v >= 0 ? `+${v}%` : `−${Math.abs(v)}%`;
}

/** Seperti pct(), tetapi pengali 1 ditulis "normal". */
export function pctOrNormal(factor: number): string {
  return Math.round((factor - 1) * 100) === 0 ? 'normal' : pct(factor);
}

/** Jam desimal (21.5 → "21.30"; 25 → "01.00"). */
export function hourText(hour: number): string {
  return formatClock(Math.round(hour * 60));
}

/** Ringkasan efek event dalam kalimat pendek. */
export function describeEventEffects(ev: EventDef, catalog: Catalog): string[] {
  const e = ev.effects;
  const out: string[] = [];
  if (e.arrival && e.arrival !== 1) out.push(`Pengunjung ${pct(e.arrival)}`);
  if (e.typeWeights) {
    const names = Object.entries(e.typeWeights)
      .filter(([, m]) => m > 1)
      .map(([id]) => CUSTOMER_TYPES.find((t) => t.id === id)?.name.toLowerCase() ?? id);
    if (names.length) out.push(`Lebih banyak ${names.join(' & ')}`);
  }
  if (e.budget && e.budget !== 1) out.push(`Anggaran pelanggan ${pct(e.budget)}`);
  for (const [id, m] of Object.entries(e.ingredientPrices ?? {})) {
    const name = catalog.hasIngredient(id) ? catalog.ingredient(id).name : id;
    out.push(`Harga ${name.toLowerCase()} ${pct(m)}`);
  }
  if (e.bulkOrder) {
    const b = e.bulkOrder;
    const kind = b.category === 'minuman' ? 'minuman' : 'makanan';
    out.push(`Pesanan borongan ${b.min}–${b.max} porsi ${kind} (menu yang sudah terbuka), dibayar ${pct(b.priceFactor)} dari harga wajar`);
  }
  if (e.fee) out.push(`Biaya tambahan ${formatRupiah(e.fee)} saat tutup`);
  if (e.review) out.push(`Kepuasan rata-rata ≥ ${e.review.threshold}: popularitas +${e.review.good}; kalau kurang: ${e.review.bad}`);
  return out;
}

/** Di mana & kapan event bisa muncul. */
export function eventWhere(ev: EventDef): string {
  const where = ev.maps?.length ? ev.maps.map((id) => LOCATIONS.find((l) => l.id === id)?.name ?? id).join(', ') : 'Semua lokasi';
  const when = ev.daysOfMonth?.length ? ` · hanya tanggal ${ev.daysOfMonth.join(', ')}` : '';
  return `${where}${when}`;
}

function upgradeRequirement(u: UpgradeDef): string {
  const r = u.requires;
  const parts: string[] = [];
  if (r.upgrades?.length) parts.push(`punya ${r.upgrades.map((id) => upgradeById(id).name).join(' & ')}`);
  if (r.popularity) parts.push(`popularitas ≥ ${r.popularity}`);
  if (r.day) parts.push(`mulai Hari ${r.day}`);
  return parts.length ? `Syarat: ${parts.join(', ')}` : 'Tanpa syarat';
}

// ---------- komponen kecil ----------

const p = (text: string, className = 'guide-text'): HTMLElement => el('p', { className, text });
const h = (text: string): HTMLElement => el('h3', { className: 'section-title', text });
const list = (items: readonly string[]): HTMLElement => el('ul', { className: 'about-list', children: items.map((t) => el('li', { text: t })) });

function card(opts: { icon?: string | HTMLElement; title: string; badge?: string; badgeTone?: 'good' | 'warn' | 'info'; meta?: string; lines?: readonly string[]; dim?: boolean }): HTMLElement {
  const icon = typeof opts.icon === 'string' ? el('span', { className: 'guide-icon', text: opts.icon, attrs: { 'aria-hidden': 'true' } }) : opts.icon ?? null;
  return el('div', {
    className: `guide-card${opts.dim ? ' is-dim' : ''}`,
    children: [
      icon,
      el('div', {
        className: 'guide-card-body',
        children: [
          el('div', {
            className: 'guide-card-head',
            children: [el('strong', { text: opts.title }), opts.badge ? el('span', { className: `guide-badge tone-${opts.badgeTone ?? 'info'}`, text: opts.badge }) : null],
          }),
          opts.meta ? el('div', { className: 'item-meta', text: opts.meta }) : null,
          ...(opts.lines ?? []).map((t) => el('div', { className: 'guide-line', text: t })),
        ],
      }),
    ],
  });
}

function table(head: readonly string[], rows: readonly (readonly string[])[]): HTMLElement {
  return el('div', {
    className: 'guide-table-wrap',
    children: [
      el('table', {
        className: 'guide-table',
        children: [
          el('thead', { children: [el('tr', { children: head.map((t) => el('th', { text: t })) })] }),
          el('tbody', { children: rows.map((r) => el('tr', { children: r.map((t) => el('td', { text: t })) })) }),
        ],
      }),
    ],
  });
}

// ---------- isi tiap tab ----------

function tabPanduan(): HTMLElement[] {
  const open = formatClock(GAME_CONFIG.dayCycle.openMinutes);
  const close = formatClock(GAME_CONFIG.dayCycle.closeMinutes);
  return [
    p(`Kamu mulai dengan modal ${formatRupiah(ECONOMY_CONFIG.startingMoney)} dan satu gerobak sederhana. Tujuannya: bikin angkringan makin ramai, untung, dan terkenal.`),
    h('Alur satu hari'),
    card({
      icon: '🛒',
      title: '1. Persiapan (sebelum buka)',
      lines: [
        'Belanja bahan (B) — harga bahan berubah sedikit tiap hari dan naik pelan-pelan.',
        'Masak di Persiapan (P) — pelanggan hanya bisa membeli produk yang sudah matang.',
        'Atur harga jual di Persiapan. Upgrade, Promosi, Pengantaran, Statistik, dan Bank ada di tombol Usaha (bar bawah).',
        'Bank juga bisa dibuka dengan mengetuk kas di pojok kiri atas.',
        'Kalau perlu, pindah lokasi lewat chip 📍 di bawah jam (sekali sehari).',
        'Kalau ada pesanan borongan dari event, siapkan porsinya sebelum menekan Mulai Berjualan.',
      ],
    }),
    card({
      icon: '🏮',
      title: `2. Berjualan (${open}–${close})`,
      lines: [
        'Pelanggan datang, duduk, memesan, dan membayar otomatis. Kalau kursi penuh mereka antre; kalau terlalu lama menunggu, mereka pergi.',
        'Kalau menu yang dicari habis, sebagian pelanggan mau diganti menu lain sekategori, sebagian pergi kecewa.',
        'Masak lagi lewat Persiapan kapan saja — jam berhenti selama panel terbuka.',
        'Atur kecepatan waktu: jeda, 1×, 2×, atau 3×.',
      ],
    }),
    card({
      icon: '📊',
      title: '3. Evaluasi (setelah tutup)',
      lines: [
        'Laporan harian: omzet, modal, laba, menu terlaris, yang habis, dan stok yang basi.',
        'Sewa/operasional lokasi ditagih saat tutup. Popularitas & loyalitas dihitung dari pelayanan hari itu.',
        'Lanjut ke hari berikutnya — cuaca dan event baru muncul.',
      ],
    }),
    card({
      icon: '📱',
      title: 'Pesanan online',
      lines: [
        'Pilih cara mengantar di Usaha → Pengantaran: kurir sendiri (gaji Rp40.000/hari, 3 pesanan sekali antar, bolak-balik tanpa batas, ongkir masuk kas) atau kemitraan ojol (tanpa gaji, komisi 20%, driver tiba 5–12 menit).',
        'Saat berjualan, pesanan masuk lewat tombol Pesanan (atau tombol O). Jawab sebelum waktunya habis: Terima atau Tolak.',
        'Pesanan memakai stok yang sama dengan pembeli di tempat. Stok diambil saat driver tiba / kurir berangkat — kalau keburu habis, pesanan batal dan rating turun.',
        'Catatan pembeli ("tanpa sambal") bisa dipenuhi dengan sedikit waktu ekstra. Diabaikan = rating turun. Hujan memperlambat perjalanan.',
        'Rating kemitraan memengaruhi jumlah pesanan dan popularitas. Batas awal 5 pesanan per hari, bisa dinaikkan dengan upgrade Sistem pemesanan.',
      ],
    }),
    card({
      icon: '🏪',
      title: 'Cabang',
      lines: [
        'Buka sampai 3 cabang lewat Usaha → Cabang. Cabang 1/2/3 butuh level usaha 2/3/4 (gerobak standar/modern/premium), popularitas 40/55/70, dan kas Rp1,5 jt/Rp3 jt/Rp5 jt.',
        'Cabang berjualan sendiri selama jam jualan toko utama. Butuh karyawan dan produk siap jual yang kamu kirim dari toko utama saat persiapan.',
        'Setiap cabang buka membayar sewa lokasi + Rp10.000 dan gaji karyawan setiap hari. Tutup cabang yang tidak dipakai supaya tidak rugi.',
        'Gaji harian Rp30.000, mingguan Rp180.000 (±Rp25.700/hari, terikat 7 hari), bulanan Rp700.000 (±Rp23.300/hari, terikat 30 hari). Gaji telat menurunkan kinerja; telat 3× berturut-turut karyawan keluar.',
        'Satu lokasi hanya untuk satu angkringan yang buka. Cabang mengikuti event harian di lokasinya.',
      ],
    }),
    card({
      icon: '📰',
      title: 'Kabar Kampung & Buku Dapur Kardi',
      lines: [
        'Pelanggan bernama (Pak Gito, Bu Surti, Mas Bayu, dan lainnya) kadang mampir saat berjualan. Ketuk gelembung "..." di atas mereka untuk mengobrol — waktu berhenti selama dialog.',
        'Kabar yang terlewat tetap masuk log di tombol Kabar Kampung (pojok kanan atas, atau tombol N). Setelah 5 hari tidak dibaca, kabar menjadi ringkasan "didengar dari warga".',
        'Layani mereka dengan baik, sediakan menu favoritnya, dan ajak mengobrol agar makin dekat (tahap 0–3). Kedekatan membuka cerita pribadi dan pilihan di akhir.',
        'Bab Buku Dapur Kardi terbuka seiring cerita. Cerita tidak pernah menghalangi belanja, memasak, atau berjualan.',
      ],
    }),
    h('Angka penting'),
    card({
      icon: '⭐',
      title: 'Popularitas (0–100)',
      lines: [
        'Makin populer, makin banyak pelanggan datang (popularitas 50 ± 2,6× lebih ramai dari popularitas 10).',
        'Naik dari pelanggan yang terlayani & puas; turun kalau pelanggan pergi tanpa membeli, menunggu terlalu lama, kecewa, atau menu sering habis.',
        `Perubahan maksimal ±${BALANCE_CONFIG.maxDailyPopularityChange} per hari, dan makin sulit naik saat sudah tinggi. Iklan tidak menaikkan popularitas.`,
        `Tingkatan: ${BALANCE_CONFIG.popularityTiers.map((t) => `${t.label} (${t.min}–${t.max})`).join(', ')}.`,
      ],
    }),
    card({
      icon: '❤️',
      title: 'Loyalitas (0–100)',
      lines: [
        `Bergerak pelan mengikuti rata-rata kepuasan. Loyalitas 100 menambah pengunjung sampai +${Math.round(DEMAND_CONFIG.loyaltyArrivalBoost * 100)}%.`,
        `Pindah lokasi membuat sebagian pelanggan tetap tertinggal (loyalitas ×${String(MOVE_LOYALTY_KEEP).replace('.', ',')}).`,
      ],
    }),
    card({
      icon: '😊',
      title: 'Kepuasan pelanggan',
      lines: [
        'Naik jika semua pesanan tersedia, plus bonus dari upgrade kenyamanan.',
        'Turun karena menu habis, menunggu tempat duduk terlalu lama, atau harga kemahalan.',
      ],
    }),
    card({
      icon: '📦',
      title: 'Stok & kedaluwarsa',
      lines: [
        'Bahan dipakai dari yang paling cepat basi lebih dulu. Bahan & produk yang lewat tanggal dibuang otomatis.',
        'Produk matang biasanya basi di akhir hari — masak secukupnya. Lemari pendingin & kulkas membuatnya lebih awet.',
        `Gudang awal ${BASE_STORAGE} satuan; maksimal ${BASE_MAX_PORTIONS} porsi per menu sekali masak (bisa ditambah upgrade).`,
      ],
    }),
    card({
      icon: '⚠️',
      title: 'Bangkrut',
      badge: 'Hati-hati',
      badgeTone: 'warn',
      lines: [
        `Jika kas minus saat tutup ${BANKRUPT_AFTER_DAYS} hari berturut-turut, usaha bangkrut dan permainan berakhir.`,
        'Deposito otomatis dicairkan untuk menutup kas minus. Pinjaman yang jatuh tempo dipotong langsung dari kas.',
      ],
    }),
    h('Tips'),
    list([
      'Hari kerja dan akhir pekan ramainya beda di tiap lokasi — ketuk chip hari ini di bawah jam sebelum belanja.',
      'Saat hujan siapkan menu hangat; saat panas terik perbanyak es.',
      'Lewat jam 22.00 menu mengenyangkan lebih dicari.',
      'Tambah kursi kalau banyak pelanggan pergi karena penuh; tambah kesabaran (dekorasi, Wi-Fi, bangku antre) kalau antrean sering bubar.',
      'Progres tersimpan otomatis di browser ini.',
    ]),
  ];
}

function tabEvent(catalog: Catalog, state: Readonly<GameState> | null): HTMLElement[] {
  const todayId = state?.event?.id ?? null;
  const sorted = [...EVENTS].sort((a, b) => Number(b.id === todayId) - Number(a.id === todayId));
  return [
    p(`Setiap hari (mulai Hari 2) ada peluang ${Math.round(EVENT_CHANCE * 100)}% muncul satu kejadian acak. Event dipilih dari daftar yang cocok dengan lokasi & tanggal; pindah lokasi saat persiapan akan mengganti event hari itu.`),
    p('Pesanan borongan: siapkan porsinya sebelum menekan Mulai Berjualan. Kalau stok kurang saat buka, pesanan batal dan popularitas turun sedikit.', 'panel-note'),
    state && !todayId ? p('Hari ini tidak ada event.', 'panel-note') : null,
    ...sorted.map((ev) =>
      card({
        icon: ev.icon,
        title: ev.name,
        badge: ev.id === todayId ? 'Hari ini' : undefined,
        badgeTone: 'good',
        meta: eventWhere(ev),
        lines: [ev.description, ...describeEventEffects(ev, catalog).map((t) => `• ${t}`)],
      }),
    ),
  ].filter((x): x is HTMLElement => x !== null);
}

function tabCuaca(catalog: Catalog, state: Readonly<GameState> | null): HTMLElement[] {
  const total = WEATHER_WEIGHTS.reduce((s, w) => s + w.weight, 0);
  const warm = catalog.recipes.filter((r) => r.tags.includes('hangat')).map((r) => r.name);
  const cold = catalog.recipes.filter((r) => r.tags.includes('dingin')).map((r) => r.name);
  const helpers = UPGRADES.filter((u) => u.effects.rainShelter || u.effects.rainComfort || u.effects.heatComfort);
  return [
    p(`Cuaca berganti setiap hari dan memengaruhi jumlah pengunjung serta menu yang dicari. Hari 1 selalu cerah. Kalau kemarin hujan, ada tambahan peluang ${Math.round(RAIN_STREAK_CHANCE * 100)}% hujan berlanjut.`),
    ...WEATHER_WEIGHTS.map(({ item, weight }) => {
      const fx = WEATHER_EFFECTS[item];
      return card({
        icon: WEATHER_ICON[item],
        title: fx.label,
        badge: state?.weather === item ? 'Hari ini' : undefined,
        badgeTone: 'good',
        meta: `Peluang ±${Math.round((weight / total) * 100)}% per hari`,
        lines: [
          fx.hint,
          `• Pengunjung ${pctOrNormal(fx.arrival)}`,
          `• Minat menu hangat ${pctOrNormal(fx.warm)} · menu dingin ${pctOrNormal(fx.cold)}`,
        ],
      });
    }),
    h('Menu hangat'),
    p(warm.join(', ') || '—'),
    h('Menu dingin'),
    p(cold.join(', ') || '—'),
    h('Upgrade penangkal cuaca'),
    ...helpers.map((u) => card({ icon: '🔧', title: u.name, meta: formatRupiah(u.cost), lines: [describeEffects(u.effects).join(' · ')], dim: state ? !state.upgrades.includes(u.id) : false, badge: state?.upgrades.includes(u.id) ? 'Terpasang' : undefined, badgeTone: 'good' })),
  ];
}

function tabLokasi(state: Readonly<GameState> | null): HTMLElement[] {
  const dayRow = (w: readonly number[]): string => ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((d, i) => `${d} ${pct(w[(i + 1) % 7] ?? 1)}`).join(' · ');
  return [
    p(`Ada ${LOCATIONS.length} lokasi berjualan. Pindah lokasi hanya saat persiapan, maksimal sekali sehari, bayar biaya pindah, dan sebagian pelanggan tetap tertinggal. Upgrade ikut terbawa.`),
    ...LOCATIONS.map((loc) =>
      card({
        icon: '📍',
        title: loc.name,
        badge: state?.mapId === loc.id ? 'Lokasimu' : undefined,
        badgeTone: 'good',
        meta: `${loc.tagline} · sewa ${formatRupiah(loc.rent)}/hari · pindah ke sini ${formatRupiah(loc.moveCost)}`,
        lines: [
          loc.description,
          ...loc.perks.map((t) => `• ${t}`),
          ...loc.hours.map((x) => `• ${formatClock(x.from)}–${formatClock(x.to)}: pengunjung ${pct(x.factor)}`),
          `Ramai per hari: ${dayRow(loc.weekday)}`,
        ],
      }),
    ),
  ];
}

function tabPelanggan(): HTMLElement[] {
  const fav = (weights: Readonly<Record<string, number>>): string => {
    const top = Object.entries(weights)
      .filter(([, m]) => m > 1.1)
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => TAG_LABEL[k] ?? CATEGORY_LABEL[k as RecipeCategory]?.toLowerCase() ?? k);
    return top.length ? top.join(', ') : 'tidak pilih-pilih';
  };
  return [
    p(`Ada ${CUSTOMER_TYPES.length} tipe pelanggan. Lokasi dan event mengubah tipe mana yang paling sering datang.`),
    ...CUSTOMER_TYPES.map((t) =>
      card({
        icon: '🧑',
        title: t.name,
        meta: `Rombongan ${t.party[0] === t.party[1] ? t.party[0] : `${t.party[0]}–${t.party[1]}`} orang · ramai sekitar jam ${hourText(t.peakHour)}`,
        lines: [
          `Uang per orang ${formatRupiah(t.budget[0])}–${formatRupiah(t.budget[1])}`,
          `Sabar menunggu tempat ±${t.patience} menit`,
          `Suka: ${fav({ ...t.categoryWeights, ...t.tagWeights })}`,
          `Pesan ${t.foodItems[0]}–${t.foodItems[1]} makanan per orang, ${Math.round(t.drinkChance * 100)}% ikut pesan minuman`,
        ],
      }),
    ),
  ];
}

function tabMenu(catalog: Catalog, state: Readonly<GameState> | null): HTMLElement[] {
  const unlocked = state?.unlockedRecipes ?? catalog.recipes.filter((r) => r.unlock.type === 'start').map((r) => r.id);
  const sorted = sortRecipesForMenu(catalog.recipes, unlocked);
  const open = new Set(unlocked);
  const recipeCard = (r: RecipeDef): HTMLElement => {
    const ings = Object.entries(r.ingredients)
      .map(([id, n]) => `${catalog.ingredient(id).name}${n > 1 ? ` ×${n}` : ''}`)
      .join(', ');
    const price = state?.prices[r.id];
    return card({
      icon: itemIcon(r.icon),
      title: r.name,
      badge: open.has(r.id) ? 'Terbuka' : '🔒 Terkunci',
      badgeTone: open.has(r.id) ? 'good' : 'warn',
      dim: !open.has(r.id),
      meta: `${CATEGORY_LABEL[r.category]} · harga wajar ${formatRupiah(r.salePrice)}${price ? ` (hargamu ${formatRupiah(price)})` : ''}${r.tags.length ? ` · ${r.tags.map((t) => TAG_LABEL[t] ?? t).join(', ')}` : ''}`,
      lines: [`Bahan: ${ings}`, open.has(r.id) ? `Basi ${r.shelfLifeDays === 0 ? 'di akhir hari' : `setelah ${r.shelfLifeDays + 1} hari`}` : describeUnlock(r.unlock)],
    });
  };
  const opened = sorted.filter((r) => open.has(r.id));
  const locked = sorted.filter((r) => !open.has(r.id));
  return [
    p(`Ada ${catalog.recipes.length} menu. Menu baru terbuka otomatis saat syaratnya terpenuhi (popularitas, kas, atau level usaha dari upgrade gerobak) dan tidak terkunci lagi.`),
    p(`Harga jual bisa diatur ${Math.round(PRICE_RULES.minRatio * 100)}–${Math.round(PRICE_RULES.maxRatio * 100)}% dari harga wajar (kelipatan ${formatRupiah(PRICE_RULES.step)}). Lebih murah = lebih laris tapi untung tipis; lebih mahal = peminat turun dan pelanggan bisa kecewa.`, 'panel-note'),
    opened.length ? h(`Sudah terbuka · ${opened.length}`) : null,
    ...opened.map(recipeCard),
    locked.length ? h(`Masih terkunci · ${locked.length}`) : null,
    ...locked.map(recipeCard),
  ].filter((x): x is HTMLElement => x !== null);
}

function tabUpgrade(state: Readonly<GameState> | null): HTMLElement[] {
  const out: HTMLElement[] = [
    p(`Ada ${UPGRADES.length} upgrade. Dibeli saat persiapan, dibayar sekali, dan langsung berlaku. Gerobak yang lebih baik menaikkan level usaha dan membuka menu baru.`),
  ];
  for (const c of UPGRADE_CATEGORIES) {
    const items = UPGRADES.filter((u) => u.category === c.id);
    out.push(h(`${c.label} · ${items.length}`));
    for (const u of items) {
      const owned = state?.upgrades.includes(u.id) ?? false;
      out.push(
        card({
          icon: '🔨',
          title: u.name,
          badge: owned ? 'Terpasang' : formatRupiah(u.cost),
          badgeTone: owned ? 'good' : 'info',
          meta: upgradeRequirement(u),
          lines: [u.description, `Efek: ${describeEffects(u.effects).join(' · ') || '—'}`],
        }),
      );
    }
  }
  return out;
}

function tabBank(): HTMLElement[] {
  const daily = (r: number): string => `${String(r * 100).replace('.', ',')}%`;
  return [
    h('Deposito'),
    list([
      `Simpan minimal ${formatRupiah(BANK_RULES.minDeposit)}, maksimal ${BANK_RULES.maxDeposits} deposito aktif.`,
      `Bunga ${daily(BANK_RULES.depositDailyRate)} per hari dari pokok, ditambahkan setiap tutup hari.`,
      `Tempo 1, 2, atau 4 minggu. Bonus jatuh tempo: ${BANK_RULES.terms.map((t) => `${t / 7} mgg +${daily(BANK_RULES.maturityBonus[t] ?? 0)}`).join(', ')}.`,
      'Bisa ditarik kapan saja saat persiapan (pokok + bunga, tanpa bonus). Saat jatuh tempo uang cair otomatis ke kas.',
      'Kalau kas minus saat tutup, deposito dicairkan otomatis untuk menutupnya.',
    ]),
    h('Pinjaman'),
    list([
      `Satu pinjaman aktif, minimal ${formatRupiah(BANK_RULES.minLoan)}. Plafon naik dengan level usaha & popularitas.`,
      `Bunga ${daily(BANK_RULES.loanDailyRate)} per hari dari sisa pokok. Bisa dicicil/dilunasi kapan saja saat persiapan.`,
      'Saat jatuh tempo, sisa utang langsung dipotong dari kas — hati-hati kas jadi minus.',
    ]),
    h('Promosi (berlaku satu hari)'),
    p('Iklan menambah calon pelanggan hari itu saja, tidak menaikkan popularitas. Memasang beberapa iklan sekaligus hasilnya makin berkurang (iklan ke-2 efeknya 70%, ke-3 49%, dst.). Iklan bisa dibatalkan sebelum buka (uang kembali).'),
    table(
      ['Iklan', 'Biaya', 'Pengunjung', 'Keterangan'],
      ADS.map((a) => [a.name, formatRupiah(a.cost), `+${Math.round(a.arrivalBonus * 100)}%`, a.description]),
    ),
    h('Biaya & harga'),
    list([
      'Sewa/operasional harian tergantung lokasi, ditagih saat tutup.',
      `Harga bahan naik ±${String(ECONOMY_CONFIG.ingredientPrices.dailyInflation * 100).replace('.', ',')}% per hari dan bergoyang hingga ±${Math.round(ECONOMY_CONFIG.ingredientPrices.priceSwing * 100)}% — lihat panah naik/turun di Belanja.`,
      `Maksimal ${ECONOMY_CONFIG.maxPacksPerLine} kemasan per bahan dalam sekali belanja.`,
    ]),
  ];
}

function tabPencapaian(state: Readonly<GameState> | null): HTMLElement[] {
  const got = state ? ACHIEVEMENTS.filter((a) => state.achievements[a.id] !== undefined).length : 0;
  return [
    p(`${ACHIEVEMENTS.length} pencapaian, masing-masing memberi hadiah uang tunai.${state ? ` Kamu sudah mendapat ${got}.` : ''}`),
    ...ACHIEVEMENTS.map((a) => {
      const day = state?.achievements[a.id];
      return card({
        icon: a.icon,
        title: a.name,
        badge: day !== undefined ? `✓ Hari ${day}` : formatRupiah(a.reward),
        badgeTone: day !== undefined ? 'good' : 'info',
        lines: [a.description, day !== undefined ? `Hadiah ${formatRupiah(a.reward)} sudah diterima` : ''].filter(Boolean),
      });
    }),
  ];
}

function tabKontrol(): HTMLElement[] {
  return [
    h('Kamera'),
    list([
      'Geser layar (mouse / satu jari) untuk menggeser kamera.',
      'Scroll mouse atau cubit dua jari untuk zoom.',
      'WASD / panah: geser · Q / E: zoom · F: fokus ke gerobak.',
    ]),
    h('Pintasan keyboard'),
    table(
      ['Tombol', 'Fungsi'],
      [
        ['B', 'Belanja (persiapan)'],
        ['P', 'Persiapan / masak'],
        ['I', 'Promosi (persiapan, juga di Usaha)'],
        ['U', 'Upgrade (persiapan, juga di Usaha)'],
        ['K', 'Bank (persiapan, juga di Usaha / ketuk kas)'],
        ['S', 'Statistik (persiapan, juga di Usaha)'],
        ['O', 'Pesanan online (saat berjualan)'],
        ['H', 'Panduan & Info (ini)'],
        ['N', 'Kabar Kampung (cerita)'],
        ['Enter / Spasi (saat dialog)', 'Lanjut obrolan'],
        ['Enter', 'Mulai berjualan'],
        ['Spasi · 1 · 2 · 3', 'Jeda · kecepatan waktu'],
        ['Esc', 'Menu jeda / tutup panel'],
      ],
    ),
    h('Lainnya'),
    list([
      'Ketuk chip hari ini di bawah jam untuk melihat ramai-sepi & event hari ini.',
      'Ketuk chip 📍 di bawah jam untuk pindah lokasi saat persiapan.',
      'Tombol "Pasang game" di menu utama memasang game ke layar utama HP/desktop (bisa main offline).',
      'Mode hemat baterai ada di Pengaturan.',
    ]),
  ];
}

/** Isi satu tab (dipisah agar bisa diuji tanpa membuka modal). */
export function renderGuideTab(tab: GuideTab, catalog: Catalog, state: Readonly<GameState> | null): HTMLElement[] {
  switch (tab) {
    case 'panduan':
      return tabPanduan();
    case 'event':
      return tabEvent(catalog, state);
    case 'cuaca':
      return tabCuaca(catalog, state);
    case 'lokasi':
      return tabLokasi(state);
    case 'pelanggan':
      return tabPelanggan();
    case 'menu':
      return tabMenu(catalog, state);
    case 'upgrade':
      return tabUpgrade(state);
    case 'bank':
      return tabBank();
    case 'pencapaian':
      return tabPencapaian(state);
    case 'kontrol':
      return tabKontrol();
  }
}

/** Buka panel Panduan & Info. */
export function openGuide(ui: UIManager, options: GuideOptions): ModalHandle {
  const state = options.state ?? null;
  let tab: GuideTab = options.tab ?? 'panduan';
  const tabs = el('div', { className: 'tab-row guide-tabs', attrs: { role: 'tablist', 'aria-label': 'Topik panduan' } });
  const content = el('div', { className: 'guide-content', attrs: { role: 'tabpanel' } });
  const where = state ? `Hari ${state.calendar.day} · ${locationById(state.mapId).name}` : `Versi ${GAME_CONFIG.version}`;

  const render = (): void => {
    tabs.replaceChildren(
      ...GUIDE_TABS.map((t) =>
        el('button', {
          className: `tab-btn${t.id === tab ? ' is-active' : ''}`,
          text: t.label,
          attrs: { type: 'button', role: 'tab', 'aria-selected': String(t.id === tab), 'data-tab': t.id },
          onClick: () => {
            tab = t.id;
            render();
            content.parentElement?.closest('.modal-content')?.scrollTo({ top: 0 });
          },
        }),
      ),
    );
    content.replaceChildren(...renderGuideTab(tab, options.catalog, state));
    (tabs.querySelector('.is-active') as HTMLElement | null)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  };
  render();

  return ui.openModal({
    title: 'Panduan & Info',
    className: `sheet sheet-guide${options.centered ? ' sheet-centered' : ''}`,
    closeButton: true,
    headerExtra: el('span', { className: 'guide-where', text: where }),
    body: el('div', { className: 'guide-body', children: [tabs, content] }),
    actions: [],
  });
}
