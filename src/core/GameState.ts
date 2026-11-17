import { locationById } from '../data/locations';
import { BALANCE_CONFIG } from '../config/balanceConfig';
import { ECONOMY_CONFIG } from '../config/economyConfig';
import { GAME_CONFIG } from '../config/gameConfig';
import { CATALOG, type Catalog } from '../data/catalog';
import type { ChoiceId, EndingId, RelationStage } from '../data/story';
import type { WagePlanId } from '../data/branches';

export type WeatherKind = 'cerah' | 'berawan' | 'hujan' | 'panas';

/** Fase dalam satu hari permainan (lihat siklus harian di dokumen desain). */
export type GamePhase = 'persiapan' | 'berjualan' | 'evaluasi';

export const WEATHER_KINDS: readonly WeatherKind[] = ['cerah', 'berawan', 'hujan', 'panas'];
export const GAME_PHASES: readonly GamePhase[] = ['persiapan', 'berjualan', 'evaluasi'];

export interface PlayerState {
  /** Uang dalam Rupiah (bilangan bulat). */
  money: number;
  /** Popularitas 0–100. */
  popularity: number;
  /** Loyalitas pelanggan 0–100: peluang pelanggan lama kembali (naik jika puas berhari-hari). */
  loyalty: number;
}

export interface CalendarState {
  /** Hari permainan, mulai dari 1. */
  day: number;
  /** Menit sejak 00.00 hari itu. Boleh > 1440 untuk jam lewat tengah malam. */
  clockMinutes: number;
}

/** Satu kelompok stok dengan tanggal kedaluwarsa & modal per satuan yang sama. */
export interface StockBatch {
  qty: number;
  /** Hari terakhir stok masih layak (kedaluwarsa setelah hari ini berakhir); null = awet. */
  expiresDay: number | null;
  /** Modal per satuan (Rupiah, boleh pecahan) — dipakai menghitung HPP. */
  unitCost: number;
}

export interface InventoryState {
  /** Bahan mentah: id bahan → batch (urut dari yang paling cepat kedaluwarsa). */
  ingredients: Record<string, StockBatch[]>;
  /** Produk matang siap jual: id resep → batch. */
  products: Record<string, StockBatch[]>;
}

/** Catatan transaksi hari berjalan (dasar laporan harian di Stage 4). */
export interface DayLedger {
  day: number;
  purchaseTotal: number;
  purchaseCount: number;
  /** id resep → porsi yang dimasak hari ini */
  prepared: Record<string, number>;
  /** Modal bahan yang terpakai untuk memasak hari ini. */
  cookingCost: number;
  /** Pendapatan penjualan hari ini. */
  revenue: number;
  /** Modal (HPP) dari produk yang terjual hari ini. */
  costOfSales: number;
  /** Jumlah rombongan pelanggan yang datang. */
  customers: number;
  /** Mendapat semua pesanan (termasuk pengganti). */
  served: number;
  /** Mendapat sebagian pesanan. */
  partial: number;
  /** Pergi tanpa membeli karena pesanan habis. */
  leftEmpty: number;
  /** Pergi karena tempat penuh / menunggu terlalu lama. */
  leftWaiting: number;
  /** id resep → porsi terjual */
  sold: Record<string, number>;
  /** id resep → porsi yang dicari tapi habis */
  missed: Record<string, number>;
  satisfactionSum: number;
  /** Rombongan sangat puas (≥ 85) — berpotensi merekomendasikan. */
  happy: number;
  /** Rombongan tidak puas (< 40). */
  unhappy: number;
  /** Iklan aktif hari ini. */
  ads: string[];
  promotionCost: number;
  operationalCost: number;
  /** Uang yang dipakai membeli upgrade hari ini (investasi, dicatat terpisah). */
  upgradeCost: number;
  /** Bunga & bonus deposito yang didapat hari ini. */
  bankIncome: number;
  /** Bunga pinjaman yang bertambah hari ini. */
  loanCost: number;
  /** Biaya pindah lokasi hari ini. */
  moveCost: number;
}

/** Event acak hari ini (beserta pesanan borongan jika ada). */
export interface DailyEvent {
  id: string;
  bulk: { recipeId: string; qty: number; unitPrice: number; status: 'menunggu' | 'terkirim' | 'gagal' } | null;
}

export type DepositTerm = 7 | 14 | 28;

export interface Deposit {
  id: number;
  principal: number;
  /** Bunga yang sudah terkumpul (ikut dicairkan). */
  interest: number;
  startDay: number;
  termDays: DepositTerm;
}

export interface Loan {
  /** Sisa pokok. */
  principal: number;
  /** Bunga terutang yang belum dibayar. */
  interest: number;
  borrowed: number;
  startDay: number;
  termDays: DepositTerm;
}

export interface BankState {
  deposits: Deposit[];
  loan: Loan | null;
  nextId: number;
  totalInterestEarned: number;
  totalInterestPaid: number;
  depositsMatured: number;
  loansRepaid: number;
}

/** Laporan keuangan & operasional satu hari (dibuat saat tutup). */
export interface DayReport {
  day: number;
  customers: number;
  served: number;
  partial: number;
  leftEmpty: number;
  leftWaiting: number;
  avgSatisfaction: number;
  revenue: number;
  ingredientCost: number;
  promotionCost: number;
  operationalCost: number;
  /** Arus kas hari ini: penjualan − belanja − promosi − operasional. */
  netProfit: number;
  costOfSales: number;
  grossProfit: number;
  topSellers: [string, number][];
  /** Produk dimasak tapi paling sedikit terjual: [id, terjual, dimasak]. */
  leastSold: [string, number, number][];
  /** Produk yang dicari tapi habis: [id, jumlah dicari]. */
  soldOut: [string, number][];
  leftovers: [string, number][];
  /** Stok yang basi malam ini: [id, jumlah, jenis]. */
  wasted: [string, number, 'produk' | 'bahan'][];
  wasteCost: number;
  popularityBefore: number;
  popularityAfter: number;
  loyaltyAfter: number;
  moneyEnd: number;
  ads: string[];
  upgradeCost: number;
  weather: WeatherKind;
  bankIncome: number;
  loanCost: number;
  /** Deposito jatuh tempo yang dicairkan ke kas malam ini. */
  bankMatured: number;
  /** Pinjaman jatuh tempo yang otomatis dipotong dari kas. */
  loanAutoPaid: number;
  /** Deposito yang dicairkan otomatis untuk menutup kas minus. */
  depositsUsed: number;
  /** Perubahan popularitas dari ulasan food vlogger (event). */
  reviewDelta: number;
  moveCost: number;
  /** Lokasi berjualan hari itu. */
  mapId: string;
  event: DailyEvent | null;
  /** Hari berturut-turut kas minus (peringatan bangkrut). */
  debtDays: number;
  /** Pesanan online hari itu (0.13.0). Tidak ada di laporan lama. */
  online?: OnlineDayReport | null;
  /** Hasil cabang hari ini (0.14.0). */
  branches?: BranchDayReport[] | null;
}

// ---------- Pesanan online (0.13.0) ----------

export type DeliveryMode = 'kurir' | 'ojol';
export type OnlineOrderStatus = 'menunggu' | 'diterima' | 'diantar' | 'selesai' | 'batal' | 'ditolak' | 'kedaluwarsa';

export interface OnlineOrderItem {
  recipeId: string;
  qty: number;
}

export interface OnlineOrder {
  id: number;
  buyer: string;
  area: string;
  km: number;
  items: OnlineOrderItem[];
  note: { id: string; text: string; extraMinutes: number; extraItem: string | null } | null;
  /** Pemain memilih memenuhi catatan saat menerima. */
  noteHonored: boolean;
  /** Nilai menu (setelah diskon event). */
  value: number;
  /** Ongkir dari pembeli. */
  fee: number;
  status: OnlineOrderStatus;
  /** Semua menit adalah menit permainan sesi hari itu (bisa > 1440 lewat tengah malam). */
  createdMinute: number;
  expiresMinute: number;
  acceptedMinute: number | null;
  readyMinute: number | null;
  /** Ojol: jadwal driver tiba. Kurir: saat berangkat. */
  pickupMinute: number | null;
  deliveredMinute: number | null;
  dueMinute: number | null;
  tripId: number | null;
  late: boolean;
  cold: boolean;
  cancelReason: string | null;
  /** Sumber pengiriman (0.15.0): slot cabang, atau tidak ada/null = toko utama. */
  source?: number | null;
}

export interface CourierTrip {
  id: number;
  departMinute: number;
  returnMinute: number;
  orderIds: number[];
}

export interface OnlineDayReport {
  generated: number;
  accepted: number;
  delivered: number;
  late: number;
  cancelled: number;
  rejected: number;
  expired: number;
  /** Nilai menu yang terkirim. */
  gross: number;
  commission: number;
  /** Ongkir yang masuk kas (kurir sendiri). */
  feesKept: number;
  wage: number;
  ratingChange: number;
  popularityDelta: number;
  /** Pesanan yang dikirim dari cabang & biaya antar cabang (0.15.0). */
  fromBranch?: number;
  branchFees?: number;
}

export interface OnlineState {
  /** null = belum memilih cara mengantar (pesanan online belum masuk). */
  mode: DeliveryMode | null;
  /** Pemain bisa mematikan pesanan online sementara (tidak ada pesanan baru). */
  enabled: boolean;
  /** Harga khusus pesanan online per resep. Tidak ada = ikut harga di tempat. */
  prices: Record<string, number>;
  /** Rating kemitraan 0–100. */
  rating: number;
  orders: OnlineOrder[];
  nextId: number;
  trips: CourierTrip[];
  today: OnlineDayReport;
  /** Event pesanan online (terpisah dari event harian). */
  event: { id: string; day: number } | null;
  lastEventDay: number;
  flags: {
    /** Petunjuk pesanan online pertama sudah ditampilkan. */
    orderHint: boolean;
    /** Petunjuk "Upgrade, Promosi, dan Bank kini ada di Usaha" sudah ditampilkan. */
    barHint: boolean;
  };
}

export function emptyOnlineDay(): OnlineDayReport {
  return { generated: 0, accepted: 0, delivered: 0, late: 0, cancelled: 0, rejected: 0, expired: 0, gross: 0, commission: 0, feesKept: 0, wage: 0, ratingChange: 0, popularityDelta: 0 };
}

export type BranchStatus = 'penuh' | 'tanpa_produk' | 'tanpa_karyawan' | 'kosong' | 'tutup';

export interface BranchStaff {
  name: string;
  plan: WagePlanId;
  hiredDay: number;
  /** Pilihan gaji terikat sampai hari ini (mingguan/bulanan). */
  boundUntil: number;
  /** Berapa hari berturut-turut gaji telat. */
  lateStreak: number;
}

export interface Branch {
  slot: number;
  name: string;
  mapId: string;
  open: boolean;
  staff: BranchStaff | null;
  /** Pernah punya karyawan (merekrut lagi kena biaya). */
  everHired: boolean;
  stock: Record<string, StockBatch[]>;
  upgrades: string[];
  popularity: number;
  openedDay: number;
  lastMoveDay: number;
  /** Stok di awal hari & kiriman hari ini, untuk rincian terjual/tersisa/terbuang. */
  dayStart: Record<string, number>;
  shipped: Record<string, number>;
  /** Porsi yang diambil pesanan online hari ini (0.15.0). */
  onlineOut?: Record<string, number>;
}

export interface BranchDayReport {
  slot: number;
  name: string;
  mapId: string;
  status: BranchStatus;
  eventId: string | null;
  staffName: string | null;
  portions: number;
  revenue: number;
  shrink: number;
  operational: number;
  wage: number;
  wageLate: boolean;
  staffQuit: boolean;
  net: number;
  popularityDelta: number;
  received: Record<string, number>;
  sold: Record<string, number>;
  left: Record<string, number>;
  wasted: Record<string, number>;
  /** Porsi yang terkirim lewat pesanan online (sudah termasuk di `sold`). */
  online?: Record<string, number>;
}

export interface BranchesState {
  list: Branch[];
  flags: { hint: boolean };
}

export function createBranchesState(): BranchesState {
  return { list: [], flags: { hint: false } };
}

export function createOnlineState(): OnlineState {
  return {
    mode: null,
    enabled: true,
    prices: {},
    rating: 60,
    orders: [],
    nextId: 1,
    trips: [],
    today: emptyOnlineDay(),
    event: null,
    lastEventDay: 0,
    flags: { orderHint: false, barHint: false },
  };
}

/** Ringkasan per hari untuk statistik jangka panjang. */
export interface HistoryEntry {
  day: number;
  revenue: number;
  netProfit: number;
  customers: number;
  avgSatisfaction: number;
  popularity: number;
  money: number;
  // ---- Ringkasan tambahan untuk Riwayat penjualan (0.14.1). Tidak ada di riwayat lama. ----
  ingredientCost?: number;
  operationalCost?: number;
  served?: number;
  leftEmpty?: number;
  /** 3 menu terlaris: [id resep, porsi]. */
  topSellers?: [string, number][];
  weather?: WeatherKind;
  eventId?: string | null;
  mapId?: string;
  onlineDelivered?: number;
  onlineNet?: number;
  branchNet?: number;
  wasteCost?: number;
  /** Salinan lengkap laporan hari itu (0.14.2) — untuk detail riwayat. Tidak ada di riwayat lama. */
  report?: DayReport;
}

export interface LifetimeStats {
  totalPurchases: number;
  totalPortionsPrepared: number;
  totalRevenue: number;
  totalCustomers: number;
  totalPortionsSold: number;
  /** Pesanan borongan (event) yang berhasil dikirim. */
  bulkDelivered: number;
  /** Hari tanpa satu pun pelanggan kecewa (min. 10 rombongan). */
  perfectDays: number;
}

/** Status satu kabar kampung yang sudah sampai ke pemain. */
export type NewsStatus = 'belum_dibaca' | 'dibaca' | 'diringkas';

export interface NewsRecord {
  status: NewsStatus;
  /** Hari kalender kabar diterima (pembicara mampir / masuk log). */
  receivedDay: number;
}

export interface RelationState {
  /** Poin kedekatan (pelayanan baik, menu favorit, mengobrol). */
  points: number;
  /** Tahap hubungan 0–3 (tidak turun, kecuali karena pilihan cerita). */
  stage: RelationStage;
  /** Berapa kali sudah mengobrol. */
  talks: number;
  /** Hari kalender terakhir mengobrol (maks. satu obrolan per hari). */
  lastTalkDay: number;
  /** Hari kalender terakhir mampir. */
  lastVisitDay: number;
}

/** Cerita "Kabar Kampung & Buku Dapur Kardi". */
export interface StoryState {
  /** Hari kalender saat cerita dimulai (hari cerita 1). Save lama mulai dari hari saat diperbarui. */
  startDay: number;
  news: Record<string, NewsRecord>;
  relations: Record<string, RelationState>;
  /** Bab buku resep yang terbuka: nomor bab → hari kalender dibuka. */
  chapters: Record<number, number>;
  /** Bab yang sudah dibaca pemain (untuk tanda "baru"). */
  chaptersSeen: number[];
  flags: {
    /** Pernah belanja bahan saat berjualan di Pinggir Pasar. */
    pasar: boolean;
    /** Petunjuk "ketuk gelembung" sudah ditampilkan. */
    bubbleHint: boolean;
  };
  choice: ChoiceId | null;
  /** Hari kalender saat memilih keputusan. */
  choiceDay: number;
  ending: EndingId | null;
  /** Layar akhir cerita sudah ditampilkan. */
  endingSeen: boolean;
}

export function createStoryState(startDay = 1): StoryState {
  return {
    startDay,
    news: {},
    relations: {},
    chapters: { 1: startDay },
    chaptersSeen: [],
    flags: { pasar: false, bubbleHint: false },
    choice: null,
    choiceDay: 0,
    ending: null,
    endingSeen: false,
  };
}

export interface GameSettings {
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
}

export interface GameState {
  player: PlayerState;
  calendar: CalendarState;
  weather: WeatherKind;
  phase: GamePhase;
  inventory: InventoryState;
  /** Resep yang sudah terbuka (urutan saat dibuka). */
  unlockedRecipes: string[];
  ledger: DayLedger;
  stats: LifetimeStats;
  settings: GameSettings;
  /** Laporan hari terakhir yang ditutup (ditampilkan lagi jika game dimuat saat evaluasi). */
  lastReport: DayReport | null;
  /** Upgrade yang dimiliki (urut pembelian). */
  upgrades: string[];
  /** Harga jual yang diatur pemain: id resep → Rupiah (tanpa entri = harga default). */
  prices: Record<string, number>;
  /** Berapa hari berturut-turut kas minus saat tutup (3 = bangkrut). */
  debtDays: number;
  /** Usaha sudah bangkrut (permainan selesai). */
  bankrupt: boolean;
  /** Langkah tutorial (TUTORIAL_DONE = selesai/dilewati). */
  tutorial: number;
  /** Lokasi usaha (lihat locations.json). */
  mapId: string;
  /** Hari terakhir pindah lokasi (maksimal sekali sehari). */
  lastMoveDay: number;
  /** Event acak hari ini. */
  event: DailyEvent | null;
  bank: BankState;
  /** Pencapaian: id → hari didapat. */
  achievements: Record<string, number>;
  /** Riwayat harian (maks. HISTORY_LIMIT hari terakhir). */
  history: HistoryEntry[];
  /** Cerita kampung (kabar, hubungan, buku resep). */
  story: StoryState;
  /** Pesanan online & pengantaran (0.13.0). */
  online: OnlineState;
  /** Cabang angkringan (0.14.0). */
  branches: BranchesState;
}

export const HISTORY_LIMIT = 60;

export function createEmptyBank(): BankState {
  return { deposits: [], loan: null, nextId: 1, totalInterestEarned: 0, totalInterestPaid: 0, depositsMatured: 0, loansRepaid: 0 };
}

export function createEmptyLedger(day: number): DayLedger {
  return {
    day, purchaseTotal: 0, purchaseCount: 0, prepared: {}, cookingCost: 0,
    revenue: 0, costOfSales: 0, customers: 0, served: 0, partial: 0, leftEmpty: 0, leftWaiting: 0,
    sold: {}, missed: {}, satisfactionSum: 0, happy: 0, unhappy: 0,
    ads: [], promotionCost: 0, operationalCost: 0, upgradeCost: 0, bankIncome: 0, loanCost: 0, moveCost: 0,
  };
}

export function createInitialState(catalog: Catalog = CATALOG): GameState {
  return {
    player: {
      money: ECONOMY_CONFIG.startingMoney,
      popularity: BALANCE_CONFIG.startingPopularity,
      loyalty: 0,
    },
    calendar: {
      day: 1,
      clockMinutes: GAME_CONFIG.dayCycle.openMinutes,
    },
    weather: BALANCE_CONFIG.startingWeather,
    phase: 'persiapan',
    inventory: { ingredients: {}, products: {} },
    unlockedRecipes: catalog.recipes.filter((r) => r.unlock.type === 'start').map((r) => r.id),
    ledger: createEmptyLedger(1),
    stats: { totalPurchases: 0, totalPortionsPrepared: 0, totalRevenue: 0, totalCustomers: 0, totalPortionsSold: 0, bulkDelivered: 0, perfectDays: 0 },
    settings: { musicVolume: 0.6, sfxVolume: 0.8, muted: false },
    lastReport: null,
    history: [],
    upgrades: [],
    prices: {},
    debtDays: 0,
    bankrupt: false,
    tutorial: 0,
    mapId: 'main-street',
    lastMoveDay: 0,
    event: null,
    bank: createEmptyBank(),
    achievements: {},
    story: createStoryState(1),
    // Pemain baru tidak perlu diberi tahu bahwa tombol pindah ke "Usaha".
    online: { ...createOnlineState(), flags: { orderHint: false, barHint: true } },
    branches: createBranchesState(),
  };
}

/** Batas jam yang valid: 00.00 hari ini sampai sebelum 00.00 lusa. */
export const MAX_CLOCK_MINUTES = 48 * 60;

function validateBatches(group: Record<string, StockBatch[]>, label: string, exists: (id: string) => boolean): void {
  for (const [id, batches] of Object.entries(group)) {
    if (!exists(id)) throw new Error(`${label} tidak dikenal: ${id}`);
    if (!Array.isArray(batches)) throw new Error(`${label} ${id}: batch harus array`);
    for (const b of batches) {
      if (!Number.isInteger(b.qty) || b.qty <= 0) throw new Error(`${label} ${id}: jumlah stok tidak valid (${b.qty})`);
      if (b.expiresDay !== null && !Number.isInteger(b.expiresDay)) throw new Error(`${label} ${id}: tanggal kedaluwarsa tidak valid`);
      if (!Number.isFinite(b.unitCost) || b.unitCost < 0) throw new Error(`${label} ${id}: modal tidak valid`);
    }
  }
}

/**
 * Memeriksa state dan melempar error deskriptif jika ada data tidak valid.
 * Dipanggil setiap kali state diubah agar bug terdeteksi sedini mungkin.
 */
export function validateState(state: GameState, catalog: Catalog = CATALOG): void {
  const { player, calendar } = state;
  if (!Number.isFinite(player.money) || !Number.isInteger(player.money)) {
    throw new Error(`Uang tidak valid: ${player.money}`);
  }
  if (!Number.isFinite(player.popularity)) {
    throw new Error(`Popularitas tidak valid: ${player.popularity}`);
  }
  if (player.popularity < BALANCE_CONFIG.popularityMin || player.popularity > BALANCE_CONFIG.popularityMax) {
    throw new Error(`Popularitas di luar rentang 0–100: ${player.popularity}`);
  }
  if (!Number.isInteger(calendar.day) || calendar.day < 1) {
    throw new Error(`Hari tidak valid: ${calendar.day}`);
  }
  if (!Number.isFinite(calendar.clockMinutes) || calendar.clockMinutes < 0 || calendar.clockMinutes >= MAX_CLOCK_MINUTES) {
    throw new Error(`Jam tidak valid: ${calendar.clockMinutes}`);
  }
  if (!WEATHER_KINDS.includes(state.weather)) {
    throw new Error(`Cuaca tidak dikenal: ${String(state.weather)}`);
  }
  if (!GAME_PHASES.includes(state.phase)) {
    throw new Error(`Fase tidak dikenal: ${String(state.phase)}`);
  }
  if (!Number.isFinite(player.loyalty) || player.loyalty < 0 || player.loyalty > 100) throw new Error(`Loyalitas tidak valid: ${player.loyalty}`);
  if (!Array.isArray(state.history)) throw new Error('Riwayat hilang');
  if (!state.inventory || typeof state.inventory !== 'object') throw new Error('Inventaris hilang');
  validateBatches(state.inventory.ingredients, 'Bahan', (id) => catalog.hasIngredient(id));
  validateBatches(state.inventory.products, 'Produk', (id) => catalog.hasRecipe(id));
  locationById(state.mapId);
  if (state.bank.deposits.some((d) => !Number.isInteger(d.principal) || d.principal <= 0)) throw new Error('Deposito tidak valid');
  for (const [id, price] of Object.entries(state.prices ?? {})) {
    if (!catalog.hasRecipe(id)) throw new Error(`Harga untuk resep tidak dikenal: ${id}`);
    if (!Number.isInteger(price) || price <= 0) throw new Error(`Harga ${id} tidak valid: ${price}`);
  }
  if (!state.online || !Array.isArray(state.online.orders) || !Number.isFinite(state.online.rating)) throw new Error('Data pesanan online hilang');
  if (!state.branches || !Array.isArray(state.branches.list)) throw new Error('Data cabang hilang');
  if (!state.story || typeof state.story.news !== 'object' || !Number.isInteger(state.story.startDay)) throw new Error('Data cerita hilang');
  for (const [id, r] of Object.entries(state.story.relations)) {
    if (!Number.isFinite(r.points) || r.points < 0 || ![0, 1, 2, 3].includes(r.stage)) throw new Error(`Hubungan ${id} tidak valid`);
  }
  for (const id of state.unlockedRecipes) {
    if (!catalog.hasRecipe(id)) throw new Error(`Resep terbuka tidak dikenal: ${id}`);
  }
  const ledger = state.ledger;
  if (
    !ledger ||
    !Number.isInteger(ledger.purchaseTotal) || ledger.purchaseTotal < 0 ||
    !Number.isFinite(ledger.cookingCost) ||
    !Number.isInteger(ledger.revenue) || ledger.revenue < 0 ||
    !Number.isInteger(ledger.customers) || ledger.customers < 0
  ) {
    throw new Error('Catatan harian tidak valid');
  }
}
