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
import { formatClock, formatRupiah, formatDecimal } from '../utils/formatting';
import { el } from './dom';
import { itemIcon } from './itemIcon';
import type { ModalHandle, UIManager } from './UIManager';
import { tr } from '../i18n/i18n';
import { CHALLENGE_CONFIG, allyOfKind, type FameTier } from '../data/challenges';
import { fameTier, hasPetCat } from '../systems/ChallengeEventSystem';

/**
 * Panel "Panduan & Info": ensiklopedia semua informasi game (cara main, event, cuaca, lokasi, pelanggan,
 * menu, upgrade, bank & promosi, pencapaian, kontrol). Isinya dibaca langsung dari data game
 * (src/data/*.json & konfigurasi), jadi selalu sesuai dengan aturan yang berlaku.
 * Bisa dibuka dari menu utama (tanpa save) atau saat bermain (menandai kondisi hari ini).
 */

export type GuideTab = 'panduan' | 'event' | 'cuaca' | 'tantangan' | 'lokasi' | 'pelanggan' | 'menu' | 'upgrade' | 'bank' | 'pencapaian' | 'kontrol';

export const GUIDE_TABS: readonly { id: GuideTab; label: string }[] = [
  { id: 'panduan', label: tr('📖 Cara main') },
  { id: 'event', label: tr('🎉 Event') },
  { id: 'cuaca', label: tr('🌦️ Cuaca') },
  { id: 'tantangan', label: tr('⚠️ Tantangan') },
  { id: 'lokasi', label: tr('📍 Lokasi') },
  { id: 'pelanggan', label: tr('👥 Pelanggan') },
  { id: 'menu', label: tr('🍚 Menu') },
  { id: 'upgrade', label: tr('🔨 Upgrade') },
  { id: 'bank', label: tr('🏦 Bank & promosi') },
  { id: 'pencapaian', label: tr('🏆 Pencapaian') },
  { id: 'kontrol', label: tr('🎮 Kontrol') },
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
  makanan: tr('Makanan'),
  gorengan: tr('Gorengan'),
  sate: tr('Sate & bakaran'),
  minuman: tr('Minuman'),
};

const TAG_LABEL: Record<string, string> = {
  murah: tr('murah'),
  mengenyangkan: tr('mengenyangkan'),
  hangat: tr('hangat'),
  dingin: tr('dingin'),
  praktis: tr('praktis'),
  spesial: tr('spesial'),
};

const WEATHER_ICON: Record<WeatherKind, string> = { cerah: '☀️', berawan: '⛅', hujan: '🌧️', panas: '🔥' };

// ---------- helper teks (diekspor untuk unit test) ----------

/** 1.3 → "+30%", 0.75 → "−25%". */
export function pct(factor: number): string {
  const v = Math.round((factor - 1) * 100);
  return v >= 0 ? tr('+{v}%', { v }) : tr('−{v}%', { v: Math.abs(v) });
}

/** Seperti pct(), tetapi pengali 1 ditulis "normal". */
export function pctOrNormal(factor: number): string {
  return Math.round((factor - 1) * 100) === 0 ? tr('normal') : pct(factor);
}

/** Jam desimal (21.5 → "21.30"; 25 → "01.00"). */
export function hourText(hour: number): string {
  return formatClock(Math.round(hour * 60));
}

/** Ringkasan efek event dalam kalimat pendek. */
export function describeEventEffects(ev: EventDef, catalog: Catalog): string[] {
  const e = ev.effects;
  const out: string[] = [];
  if (e.arrival && e.arrival !== 1) out.push(tr('Pengunjung {arrival}', { arrival: pct(e.arrival) }));
  if (e.typeWeights) {
    const names = Object.entries(e.typeWeights)
      .filter(([, m]) => m > 1)
      .map(([id]) => CUSTOMER_TYPES.find((t) => t.id === id)?.name.toLowerCase() ?? id);
    if (names.length) out.push(tr('Lebih banyak {0}', { 0: names.join(' & ') }));
  }
  if (e.budget && e.budget !== 1) out.push(tr('Anggaran pelanggan {budget}', { budget: pct(e.budget) }));
  for (const [id, m] of Object.entries(e.ingredientPrices ?? {})) {
    const name = catalog.hasIngredient(id) ? catalog.ingredient(id).name : id;
    out.push(tr('Harga {0} {m}', { 0: name.toLowerCase(), m: pct(m) }));
  }
  if (e.bulkOrder) {
    const b = e.bulkOrder;
    const kind = b.category === 'minuman' ? tr('minuman') : tr('makanan');
    out.push(tr('Pesanan borongan {min}–{max} porsi {kind} (menu yang sudah terbuka), dibayar {priceFactor} dari harga wajar', { min: b.min, max: b.max, kind, priceFactor: pct(b.priceFactor) }));
  }
  if (e.fee) out.push(tr('Biaya tambahan {fee} saat tutup', { fee: formatRupiah(e.fee) }));
  if (e.review) out.push(tr('Kepuasan rata-rata ≥ {threshold}: popularitas +{good}; kalau kurang: {bad}', { threshold: e.review.threshold, good: e.review.good, bad: e.review.bad }));
  return out;
}

/** Di mana & kapan event bisa muncul. */
export function eventWhere(ev: EventDef): string {
  const where = ev.maps?.length ? ev.maps.map((id) => LOCATIONS.find((l) => l.id === id)?.name ?? id).join(', ') : tr('Semua lokasi');
  const when = ev.daysOfMonth?.length ? tr(' · hanya tanggal {0}', { 0: ev.daysOfMonth.join(', ') }) : '';
  return `${where}${when}`;
}

function upgradeRequirement(u: UpgradeDef): string {
  const r = u.requires;
  const parts: string[] = [];
  if (r.upgrades?.length) parts.push(tr('punya {0}', { 0: r.upgrades.map((id) => upgradeById(id).name).join(' & ') }));
  if (r.popularity) parts.push(tr('popularitas ≥ {popularity}', { popularity: r.popularity }));
  if (r.day) parts.push(tr('mulai Hari {day}', { day: r.day }));
  return parts.length ? tr('Syarat: {0}', { 0: parts.join(', ') }) : tr('Tanpa syarat');
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
    p(tr('Kamu mulai dengan modal {startingMoney} dan satu gerobak sederhana. Tujuannya: bikin angkringan makin ramai, untung, dan terkenal.', { startingMoney: formatRupiah(ECONOMY_CONFIG.startingMoney) })),
    h(tr('Alur satu hari')),
    card({
      icon: '🛒',
      title: tr('1. Persiapan (sebelum buka)'),
      lines: [
        tr('Belanja bahan (B) — harga bahan berubah sedikit tiap hari dan naik pelan-pelan.'),
        tr('Masak di Persiapan (P) — pelanggan hanya bisa membeli produk yang sudah matang.'),
        tr('Atur harga jual di Persiapan. Upgrade, Promosi, Pengantaran, Statistik, dan Bank ada di tombol Usaha (bar bawah).'),
        tr('Bank juga bisa dibuka dengan mengetuk kas di pojok kiri atas.'),
        tr('Kalau perlu, pindah lokasi lewat chip 📍 di bawah jam (sekali sehari).'),
        tr('Kalau ada pesanan borongan dari event, siapkan porsinya sebelum menekan Mulai Berjualan.'),
      ],
    }),
    card({
      icon: '🏮',
      title: tr('2. Berjualan ({open}–{close})', { open, close }),
      lines: [
        tr('Pelanggan datang, duduk, memesan, dan membayar otomatis. Kalau kursi penuh mereka antre; kalau terlalu lama menunggu, mereka pergi.'),
        tr('Kalau menu yang dicari habis, sebagian pelanggan mau diganti menu lain sekategori, sebagian pergi kecewa.'),
        tr('Masak lagi lewat Persiapan kapan saja — jam berhenti selama panel terbuka.'),
        tr('Atur kecepatan waktu: jeda, 1×, 2×, atau 3×.'),
      ],
    }),
    card({
      icon: '📊',
      title: tr('3. Evaluasi (setelah tutup)'),
      lines: [
        tr('Laporan harian: omzet, modal, laba, menu terlaris, yang habis, dan stok yang basi.'),
        tr('Sewa/operasional lokasi ditagih saat tutup. Popularitas & loyalitas dihitung dari pelayanan hari itu.'),
        tr('Lanjut ke hari berikutnya — cuaca dan event baru muncul.'),
      ],
    }),
    card({
      icon: '📱',
      title: tr('Pesanan online'),
      lines: [
        tr('Pilih cara mengantar di Usaha → Pengantaran: kurir sendiri (gaji Rp40.000/hari, 3 pesanan sekali antar, bolak-balik tanpa batas, ongkir masuk kas) atau kemitraan ojol (tanpa gaji, komisi 20%, driver tiba 5–12 menit).'),
        tr('Saat berjualan, pesanan masuk lewat tombol Pesanan (atau tombol O). Jawab sebelum waktunya habis: Terima atau Tolak.'),
        tr('Pesanan memakai stok yang sama dengan pembeli di tempat. Stok diambil saat driver tiba / kurir berangkat — kalau keburu habis, pesanan batal dan rating turun.'),
        tr('Catatan pembeli ("tanpa sambal") bisa dipenuhi dengan sedikit waktu ekstra. Diabaikan = rating turun. Hujan memperlambat perjalanan.'),
        tr('Rating kemitraan memengaruhi jumlah pesanan dan popularitas. Batas awal 5 pesanan per hari, bisa dinaikkan dengan upgrade Sistem pemesanan.'),
      ],
    }),
    card({
      icon: '🏪',
      title: tr('Cabang'),
      lines: [
        tr('Buka sampai 3 cabang lewat Usaha → Cabang. Cabang 1/2/3 butuh level usaha 2/3/4 (gerobak standar/modern/premium), popularitas 40/55/70, dan kas Rp1,5 jt/Rp3 jt/Rp5 jt.'),
        tr('Cabang berjualan sendiri selama jam jualan toko utama. Butuh karyawan dan produk siap jual yang kamu kirim dari toko utama saat persiapan.'),
        tr('Setiap cabang buka membayar sewa lokasi + Rp10.000 dan gaji karyawan setiap hari. Tutup cabang yang tidak dipakai supaya tidak rugi.'),
        tr('Gaji harian Rp30.000, mingguan Rp180.000 (±Rp25.700/hari, terikat 7 hari), bulanan Rp700.000 (±Rp23.300/hari, terikat 30 hari). Gaji telat menurunkan kinerja; telat 3× berturut-turut karyawan keluar.'),
        tr('Satu lokasi hanya untuk satu angkringan yang buka. Cabang mengikuti event harian di lokasinya.'),
        tr('Pesanan online bisa dikirim dari cabang yang punya karyawan jaga. Cabang menyisakan 2 porsi atau 30% stok tiap menu untuk pembeli di tempat. Biaya antar Rp2.000 per pesanan (Rp1.000 dengan motor cabang), tanpa komisi, ongkir pembeli masuk kas.'),
      ],
    }),
    card({
      icon: '📰',
      title: tr('Kabar Kampung & Buku Dapur Kardi'),
      lines: [
        tr('Pelanggan bernama (Pak Gito, Bu Surti, Mas Bayu, dan lainnya) kadang mampir saat berjualan. Ketuk gelembung "..." di atas mereka untuk mengobrol — waktu berhenti selama dialog.'),
        tr('Kabar yang terlewat tetap masuk log di tombol Kabar Kampung (pojok kanan atas, atau tombol N). Setelah 5 hari tidak dibaca, kabar menjadi ringkasan "didengar dari warga".'),
        tr('Layani mereka dengan baik, sediakan menu favoritnya, dan ajak mengobrol agar makin dekat (tahap 0–3). Kedekatan membuka cerita pribadi dan pilihan di akhir.'),
        tr('Bab Buku Dapur Kardi terbuka seiring cerita. Cerita tidak pernah menghalangi belanja, memasak, atau berjualan.'),
      ],
    }),
    h(tr('Angka penting')),
    card({
      icon: '⭐',
      title: tr('Popularitas (0–100)'),
      lines: [
        tr('Makin populer, makin banyak pelanggan datang (popularitas 50 ± 2,6× lebih ramai dari popularitas 10).'),
        tr('Naik dari pelanggan yang terlayani & puas; turun kalau pelanggan pergi tanpa membeli, menunggu terlalu lama, kecewa, atau menu sering habis.'),
        tr('Perubahan maksimal ±{maxDailyPopularityChange} per hari, dan makin sulit naik saat sudah tinggi. Iklan tidak menaikkan popularitas.', { maxDailyPopularityChange: BALANCE_CONFIG.maxDailyPopularityChange }),
        tr('Tingkatan: {0}.', { 0: BALANCE_CONFIG.popularityTiers.map((t) => tr('{label} ({min}–{max})', { label: t.label, min: t.min, max: t.max })).join(', ') }),
      ],
    }),
    card({
      icon: '❤️',
      title: tr('Loyalitas (0–100)'),
      lines: [
        tr('Bergerak pelan mengikuti rata-rata kepuasan. Loyalitas 100 menambah pengunjung sampai +{0}%.', { 0: Math.round(DEMAND_CONFIG.loyaltyArrivalBoost * 100) }),
        tr('Pindah lokasi membuat sebagian pelanggan tetap tertinggal (loyalitas ×{0}).', { 0: formatDecimal(MOVE_LOYALTY_KEEP) }),
      ],
    }),
    card({
      icon: '😊',
      title: tr('Kepuasan pelanggan'),
      lines: [
        tr('Naik jika semua pesanan tersedia, plus bonus dari upgrade kenyamanan.'),
        tr('Turun karena menu habis, menunggu tempat duduk terlalu lama, atau harga kemahalan.'),
      ],
    }),
    card({
      icon: '📦',
      title: tr('Stok & kedaluwarsa'),
      lines: [
        tr('Bahan dipakai dari yang paling cepat basi lebih dulu. Bahan & produk yang lewat tanggal dibuang otomatis.'),
        tr('Produk matang biasanya basi di akhir hari — masak secukupnya. Lemari pendingin & kulkas membuatnya lebih awet.'),
        tr('Gudang awal {BASE_STORAGE} satuan; maksimal {BASE_MAX_PORTIONS} porsi per menu sekali masak (bisa ditambah upgrade).', { BASE_STORAGE, BASE_MAX_PORTIONS }),
      ],
    }),
    card({
      icon: '⚠️',
      title: tr('Bangkrut'),
      badge: tr('Hati-hati'),
      badgeTone: 'warn',
      lines: [
        tr('Jika kas minus saat tutup {BANKRUPT_AFTER_DAYS} hari berturut-turut, usaha bangkrut dan permainan berakhir.', { BANKRUPT_AFTER_DAYS }),
        tr('Deposito otomatis dicairkan untuk menutup kas minus. Pinjaman yang jatuh tempo dipotong langsung dari kas.'),
      ],
    }),
    h(tr('Tips')),
    list([
      tr('Hari kerja dan akhir pekan ramainya beda di tiap lokasi — ketuk chip hari ini di bawah jam sebelum belanja.'),
      tr('Saat hujan siapkan menu hangat; saat panas terik perbanyak es.'),
      tr('Lewat jam 22.00 menu mengenyangkan lebih dicari.'),
      tr('Tambah kursi kalau banyak pelanggan pergi karena penuh; tambah kesabaran (dekorasi, Wi-Fi, bangku antre) kalau antrean sering bubar.'),
      tr('Progres tersimpan otomatis di browser ini.'),
    ]),
  ];
}

function tabEvent(catalog: Catalog, state: Readonly<GameState> | null): HTMLElement[] {
  const todayId = state?.event?.id ?? null;
  const sorted = [...EVENTS].sort((a, b) => Number(b.id === todayId) - Number(a.id === todayId));
  return [
    p(tr('Setiap hari (mulai Hari 2) ada peluang {0}% muncul satu kejadian acak. Event dipilih dari daftar yang cocok dengan lokasi & tanggal; pindah lokasi saat persiapan akan mengganti event hari itu.', { 0: Math.round(EVENT_CHANCE * 100) })),
    p(tr('Pesanan borongan: siapkan porsinya sebelum menekan Mulai Berjualan. Kalau stok kurang saat buka, pesanan batal dan popularitas turun sedikit.'), 'panel-note'),
    state && !todayId ? p(tr('Hari ini tidak ada event.'), 'panel-note') : null,
    ...sorted.map((ev) =>
      card({
        icon: ev.icon,
        title: ev.name,
        badge: ev.id === todayId ? tr('Hari ini') : undefined,
        badgeTone: 'good',
        meta: eventWhere(ev),
        lines: [ev.description, ...describeEventEffects(ev, catalog).map((t) => tr('• {t}', { t }))],
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
    p(tr('Cuaca berganti setiap hari dan memengaruhi jumlah pengunjung serta menu yang dicari. Hari 1 selalu cerah. Kalau kemarin hujan, ada tambahan peluang {0}% hujan berlanjut.', { 0: Math.round(RAIN_STREAK_CHANCE * 100) })),
    ...WEATHER_WEIGHTS.map(({ item, weight }) => {
      const fx = WEATHER_EFFECTS[item];
      return card({
        icon: WEATHER_ICON[item],
        title: fx.label,
        badge: state?.weather === item ? tr('Hari ini') : undefined,
        badgeTone: 'good',
        meta: tr('Peluang ±{0}% per hari', { 0: Math.round((weight / total) * 100) }),
        lines: [
          fx.hint,
          tr('• Pengunjung {arrival}', { arrival: pctOrNormal(fx.arrival) }),
          tr('• Minat menu hangat {warm} · menu dingin {cold}', { warm: pctOrNormal(fx.warm), cold: pctOrNormal(fx.cold) }),
        ],
      });
    }),
    h(tr('Menu hangat')),
    p(warm.join(', ') || '—'),
    h(tr('Menu dingin')),
    p(cold.join(', ') || '—'),
    h(tr('Upgrade penangkal cuaca')),
    ...helpers.map((u) => card({ icon: '🔧', title: u.name, meta: formatRupiah(u.cost), lines: [describeEffects(u.effects).join(' · ')], dim: state ? !state.upgrades.includes(u.id) : false, badge: state?.upgrades.includes(u.id) ? tr('Terpasang') : undefined, badgeTone: 'good' })),
  ];
}

function tabLokasi(state: Readonly<GameState> | null): HTMLElement[] {
  const dayRow = (w: readonly number[]): string => [tr('Sen'), tr('Sel'), tr('Rab'), tr('Kam'), tr('Jum'), tr('Sab'), tr('Min')].map((d, i) => tr('{d} {1}', { d, 1: pct(w[(i + 1) % 7] ?? 1) })).join(' · ');
  return [
    p(tr('Ada {length} lokasi berjualan. Pindah lokasi hanya saat persiapan, maksimal sekali sehari, bayar biaya pindah, dan sebagian pelanggan tetap tertinggal. Upgrade ikut terbawa.', { length: LOCATIONS.length })),
    ...LOCATIONS.map((loc) =>
      card({
        icon: '📍',
        title: loc.name,
        badge: state?.mapId === loc.id ? tr('Lokasimu') : undefined,
        badgeTone: 'good',
        meta: tr('{tagline} · sewa {rent}/hari · pindah ke sini {moveCost}', { tagline: loc.tagline, rent: formatRupiah(loc.rent), moveCost: formatRupiah(loc.moveCost) }),
        lines: [
          loc.description,
          ...loc.perks.map((t) => tr('• {t}', { t })),
          ...loc.hours.map((x) => tr('• {from}–{to}: pengunjung {factor}', { from: formatClock(x.from), to: formatClock(x.to), factor: pct(x.factor) })),
          tr('Ramai per hari: {weekday}', { weekday: dayRow(loc.weekday) }),
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
    return top.length ? top.join(', ') : tr('tidak pilih-pilih');
  };
  return [
    p(tr('Ada {length} tipe pelanggan. Lokasi dan event mengubah tipe mana yang paling sering datang.', { length: CUSTOMER_TYPES.length })),
    ...CUSTOMER_TYPES.map((t) =>
      card({
        icon: '🧑',
        title: t.name,
        meta: tr('Rombongan {0} orang · ramai sekitar jam {peakHour}', { 0: t.party[0] === t.party[1] ? t.party[0] : `${t.party[0]}–${t.party[1]}`, peakHour: hourText(t.peakHour) }),
        lines: [
          tr('Uang per orang {0}–{1}', { 0: formatRupiah(t.budget[0]), 1: formatRupiah(t.budget[1]) }),
          tr('Sabar menunggu tempat ±{patience} menit', { patience: t.patience }),
          tr('Suka: {0}', { 0: fav({ ...t.categoryWeights, ...t.tagWeights }) }),
          tr('Pesan {0}–{1} makanan per orang, {2}% ikut pesan minuman', { 0: t.foodItems[0], 1: t.foodItems[1], 2: Math.round(t.drinkChance * 100) }),
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
      .map(([id, n]) => `${catalog.ingredient(id).name}${n > 1 ? tr(' ×{n}', { n }) : ''}`)
      .join(', ');
    const price = state?.prices[r.id];
    return card({
      icon: itemIcon(r.icon),
      title: r.name,
      badge: open.has(r.id) ? tr('Terbuka') : tr('🔒 Terkunci'),
      badgeTone: open.has(r.id) ? 'good' : 'warn',
      dim: !open.has(r.id),
      meta: tr('{0} · harga wajar {salePrice}{2}{3}', { 0: CATEGORY_LABEL[r.category], salePrice: formatRupiah(r.salePrice), 2: price ? tr(' (hargamu {price})', { price: formatRupiah(price) }) : '', 3: r.tags.length ? ` · ${r.tags.map((t) => TAG_LABEL[t] ?? t).join(', ')}` : '' }),
      lines: [tr('Bahan: {ings}', { ings }), open.has(r.id) ? tr('Basi {0}', { 0: r.shelfLifeDays === 0 ? tr('di akhir hari') : tr('setelah {0} hari', { 0: r.shelfLifeDays + 1 }) }) : describeUnlock(r.unlock)],
    });
  };
  const opened = sorted.filter((r) => open.has(r.id));
  const locked = sorted.filter((r) => !open.has(r.id));
  return [
    p(tr('Ada {length} menu. Menu baru terbuka otomatis saat syaratnya terpenuhi (popularitas, kas, atau level usaha dari upgrade gerobak) dan tidak terkunci lagi.', { length: catalog.recipes.length })),
    p(tr('Harga jual bisa diatur {0}–{1}% dari harga wajar (kelipatan {step}). Lebih murah = lebih laris tapi untung tipis; lebih mahal = peminat turun dan pelanggan bisa kecewa.', { 0: Math.round(PRICE_RULES.minRatio * 100), 1: Math.round(PRICE_RULES.maxRatio * 100), step: formatRupiah(PRICE_RULES.step) }), 'panel-note'),
    opened.length ? h(tr('Sudah terbuka · {length}', { length: opened.length })) : null,
    ...opened.map(recipeCard),
    locked.length ? h(tr('Masih terkunci · {length}', { length: locked.length })) : null,
    ...locked.map(recipeCard),
  ].filter((x): x is HTMLElement => x !== null);
}

function tabUpgrade(state: Readonly<GameState> | null): HTMLElement[] {
  const out: HTMLElement[] = [
    p(tr('Ada {length} upgrade. Dibeli saat persiapan, dibayar sekali, dan langsung berlaku. Gerobak yang lebih baik menaikkan level usaha dan membuka menu baru.', { length: UPGRADES.length })),
  ];
  for (const c of UPGRADE_CATEGORIES) {
    const items = UPGRADES.filter((u) => u.category === c.id);
    out.push(h(tr('{label} · {length}', { label: c.label, length: items.length })));
    for (const u of items) {
      const owned = state?.upgrades.includes(u.id) ?? false;
      out.push(
        card({
          icon: '🔨',
          title: u.name,
          badge: owned ? tr('Terpasang') : formatRupiah(u.cost),
          badgeTone: owned ? 'good' : 'info',
          meta: upgradeRequirement(u),
          lines: [u.description, tr('Efek: {0}', { 0: describeEffects(u.effects).join(' · ') || '—' })],
        }),
      );
    }
  }
  return out;
}

function tabBank(): HTMLElement[] {
  const daily = (r: number): string => `${formatDecimal(r * 100)}%`;
  return [
    h(tr('Deposito')),
    list([
      tr('Simpan minimal {minDeposit}, maksimal {maxDeposits} deposito aktif.', { minDeposit: formatRupiah(BANK_RULES.minDeposit), maxDeposits: BANK_RULES.maxDeposits }),
      tr('Bunga {depositDailyRate} per hari dari pokok, ditambahkan setiap tutup hari.', { depositDailyRate: daily(BANK_RULES.depositDailyRate) }),
      tr('Tempo 1, 2, atau 4 minggu. Bonus jatuh tempo: {0}.', { 0: BANK_RULES.terms.map((t) => tr('{0} mgg +{1}', { 0: t / 7, 1: daily(BANK_RULES.maturityBonus[t] ?? 0) })).join(', ') }),
      tr('Bisa ditarik kapan saja saat persiapan (pokok + bunga, tanpa bonus). Saat jatuh tempo uang cair otomatis ke kas.'),
      tr('Kalau kas minus saat tutup, deposito dicairkan otomatis untuk menutupnya.'),
    ]),
    h(tr('Pinjaman')),
    list([
      tr('Satu pinjaman aktif, minimal {minLoan}. Plafon naik dengan level usaha & popularitas.', { minLoan: formatRupiah(BANK_RULES.minLoan) }),
      tr('Bunga {loanDailyRate} per hari dari sisa pokok. Bisa dicicil/dilunasi kapan saja saat persiapan.', { loanDailyRate: daily(BANK_RULES.loanDailyRate) }),
      tr('Saat jatuh tempo, sisa utang langsung dipotong dari kas — hati-hati kas jadi minus.'),
    ]),
    h(tr('Promosi (berlaku satu hari)')),
    p(tr('Iklan menambah calon pelanggan hari itu saja, tidak menaikkan popularitas. Memasang beberapa iklan sekaligus hasilnya makin berkurang (iklan ke-2 efeknya 70%, ke-3 49%, dst.). Iklan bisa dibatalkan sebelum buka (uang kembali).')),
    table(
      [tr('Iklan'), tr('Biaya'), tr('Pengunjung'), tr('Keterangan')],
      ADS.map((a) => [a.name, formatRupiah(a.cost), `+${Math.round(a.arrivalBonus * 100)}%`, a.description]),
    ),
    h(tr('Biaya & harga')),
    list([
      tr('Sewa/operasional harian tergantung lokasi, ditagih saat tutup.'),
      tr('Harga bahan naik ±{0}% per hari dan bergoyang hingga ±{1}% — lihat panah naik/turun di Belanja.', { 0: formatDecimal(ECONOMY_CONFIG.ingredientPrices.dailyInflation * 100), 1: Math.round(ECONOMY_CONFIG.ingredientPrices.priceSwing * 100) }),
      tr('Maksimal {maxPacksPerLine} kemasan per bahan dalam sekali belanja.', { maxPacksPerLine: ECONOMY_CONFIG.maxPacksPerLine }),
    ]),
  ];
}

function tabPencapaian(state: Readonly<GameState> | null): HTMLElement[] {
  const got = state ? ACHIEVEMENTS.filter((a) => state.achievements[a.id] !== undefined).length : 0;
  return [
    p(tr('{length} pencapaian, masing-masing memberi hadiah uang tunai.{1}', { length: ACHIEVEMENTS.length, 1: state ? tr(' Kamu sudah mendapat {got}.', { got }) : '' })),
    ...ACHIEVEMENTS.map((a) => {
      const day = state?.achievements[a.id];
      return card({
        icon: a.icon,
        title: a.name,
        badge: day !== undefined ? tr('✓ Hari {day}', { day }) : formatRupiah(a.reward),
        badgeTone: day !== undefined ? 'good' : 'info',
        lines: [a.description, day !== undefined ? tr('Hadiah {reward} sudah diterima', { reward: formatRupiah(a.reward) }) : ''].filter(Boolean),
      });
    }),
  ];
}

function tabKontrol(): HTMLElement[] {
  return [
    h(tr('Kamera')),
    list([
      tr('Geser layar (mouse / satu jari) untuk menggeser kamera.'),
      tr('Scroll mouse atau cubit dua jari untuk zoom.'),
      tr('WASD / panah: geser · Q / E: zoom · F: fokus ke gerobak.'),
    ]),
    h(tr('Pintasan keyboard')),
    table(
      [tr('Tombol'), tr('Fungsi')],
      [
        ['B', tr('Belanja (persiapan)')],
        ['P', tr('Persiapan / masak')],
        ['I', tr('Promosi (persiapan, juga di Usaha)')],
        ['U', tr('Upgrade (persiapan, juga di Usaha)')],
        ['K', tr('Bank (persiapan, juga di Usaha / ketuk kas)')],
        ['S', tr('Statistik (persiapan, juga di Usaha)')],
        ['O', tr('Pesanan online (saat berjualan)')],
        ['H', tr('Panduan & Info (ini)')],
        ['N', tr('Kabar Kampung (cerita)')],
        [tr('Enter / Spasi (saat dialog)'), tr('Lanjut obrolan')],
        ['Enter', tr('Mulai berjualan')],
        [tr('Spasi · 1 · 2 · 3'), tr('Jeda · kecepatan waktu')],
        ['Esc', tr('Menu jeda / tutup panel')],
      ],
    ),
    h(tr('Lainnya')),
    list([
      tr('Ketuk chip hari ini di bawah jam untuk melihat ramai-sepi & event hari ini.'),
      tr('Ketuk chip 📍 di bawah jam untuk pindah lokasi saat persiapan.'),
      tr('Tombol "Pasang game" di menu utama memasang game ke layar utama HP/desktop (bisa main offline).'),
      tr('Mode hemat baterai ada di Pengaturan.'),
    ]),
  ];
}

function tabTantangan(state: Readonly<GameState> | null): HTMLElement[] {
  const tier = state ? fameTier(state.player.popularity) : null;
  const tierLabel: Record<FameTier, string> = { rendah: tr('Rendah'), sedang: tr('Sedang'), tinggi: tr('Tinggi') };
  const heart = (kind: 'nakes' | 'polisi'): string => {
    if (!state) return '';
    const a = allyOfKind(kind);
    const n = state.challenges.allies[a.id]?.heart ?? 0;
    return tr('{name}: {hearts} {heart}/5', { name: a.name, hearts: '♥'.repeat(n) + '♡'.repeat(5 - n), heart: n });
  };
  const nakes = allyOfKind('nakes');
  const polisi = allyOfKind('polisi');
  return [
    p(tr('Mulai hari ke-{0}, kejadian tak terduga bisa datang saat berjualan. Makin terkenal angkringanmu, makin sering dan makin sulit. Setiap tantangan punya jalan pintas (tombol Lewati) dan solusi jangka panjang.', { 0: CHALLENGE_CONFIG.graceDays + 1 })),
    tier ? p(tr('Ketenaranmu sekarang: {tier}.', { tier: tierLabel[tier] })) : null,
    card({
      icon: '🐈',
      title: tr('Kucing bandit'),
      lines: [
        tr('Di jam acak, kucing liar mengambil 1–2 porsi dari papan Siap Dijual.'),
        tr('Solusi: beli upgrade "Pelihara kucing". Si Belang siaga di samping gerobak dan mengusir kucing liar.'),
      ],
      badge: state && hasPetCat(state) ? tr('Terlindungi') : undefined,
      badgeTone: 'good',
    }),
    card({
      icon: '🧍',
      title: tr('ODGJ'),
      lines: [
        tr('Dari awal buka sampai jam 22.00, ODGJ bisa berdiri di dekat gerobak dan membuat sebagian pelanggan menjauh. Ketuk balon "!!!" di atas kepalanya.'),
        tr('Usir secara halus (Ikuti iramanya): dia bersenandung lagu dolanan. Ketuk saat not masuk lingkaran sampai meter Tenang penuh. Setelah separuh tenang, kamu bisa memberi teh hangat dari stok untuk menutupnya.'),
        tr('Minta bantuan warga (Telepon berantai): ketuk kontak yang sedang online. Kontak sibuk membuatmu menunggu. Makin akrab tokohnya, makin sering dia online.'),
        tr('Solusi jangka panjang: berjualan di {location}, berkenalan dengan {name} sampai hati penuh. Jika dia sedang makan saat ODGJ datang, tim nakes membawanya dengan ambulans.', { location: locationById(nakes.homeLocation).name, name: nakes.name }),
        heart('nakes'),
      ].filter(Boolean),
    }),
    card({
      icon: '🧥',
      title: tr('Ormas'),
      lines: [
        tr('Ormas meminta uang keamanan 10–15% dari hasil dagang kemarin, paling sering sekali dalam 3 hari. Dibiarkan {0} menit atau sampai tutup, mereka mengambil sendiri 15–20%.', { 0: CHALLENGE_CONFIG.ormas.patienceMinutes }),
        tr('Usir (Kumpulkan warga): ketuk tangan kuning warga dalam 10 detik sampai cukup orang berdiri di belakangmu. Tangan merah = anggota ormas yang menyamar (−1). Pelanggan bernama tahap 2+ yang sedang di angkringan langsung membela. Gagal: bayar 20%.'),
        tr('Solusi jangka panjang: berjualan di {location}, berkenalan dengan {name} sampai hati penuh. Jika dia sedang ngopi saat ormas datang, polisi membawa mereka ke mobil patroli.', { location: locationById(polisi.homeLocation).name, name: polisi.name }),
        heart('polisi'),
      ].filter(Boolean),
    }),
    h(tr('Hati kenalan')),
    p(tr('Kenalan hanya mampir di lokasi asalnya sampai hatinya penuh. Ketuk gelembung "..." di atas kepalanya untuk mengobrol (sekali sehari), lalu tebak pesanan kesukaannya: benar hati +2, salah hati +1. Setelah 5 hati, dia mampir ke angkringanmu di lokasi mana pun.')),
  ].filter((x): x is HTMLElement => x !== null);
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
    case 'tantangan':
      return tabTantangan(state);
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
  const tabs = el('div', { className: 'tab-row guide-tabs', attrs: { role: 'tablist', 'aria-label': tr('Topik panduan') } });
  const content = el('div', { className: 'guide-content', attrs: { role: 'tabpanel' } });
  const where = state ? tr('Hari {day} · {name}', { day: state.calendar.day, name: locationById(state.mapId).name }) : tr('Versi {version}', { version: GAME_CONFIG.version });

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
    title: tr('Panduan & Info'),
    className: `sheet sheet-guide${options.centered ? ' sheet-centered' : ''}`,
    closeButton: true,
    headerExtra: el('span', { className: 'guide-where', text: where }),
    body: el('div', { className: 'guide-body', children: [tabs, content] }),
    actions: [],
  });
}
