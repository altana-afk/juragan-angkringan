import { GAME_CONFIG } from '../config/gameConfig';
import type { AllyKind, AllyState, ChallengeDay, ChallengeKind, ChallengeLogEntry, GameState } from '../core/GameState';
import { ALLIES, CHALLENGE_CONFIG, allyById, allyOfKind, type AllyDef, type FameTier } from '../data/challenges';
import type { Catalog } from '../data/catalog';
import { SeededRandom } from '../utils/random';
import { clampPopularity } from './PopularitySystem';
import { consumeStock, totalQty } from './InventorySystem';
import { GameRuleError } from './rules';
import { effectsOf } from './UpgradeSystem';
import type { NamedVisit } from './StorySystem';
import { TUTORIAL_DONE } from './TutorialSystem';
import { tr } from '../i18n/i18n';

/**
 * Tantangan kampung (0.18.0), tanpa Phaser sehingga bisa diuji di Node.
 *
 * - Kucing liar mengambil 1–2 porsi dari papan Siap Dijual. Kucing peliharaan mencegahnya.
 * - ODGJ datang dari awal buka sampai jam 22.00 dan membuat sebagian pelanggan kabur.
 *   Diatasi dengan cara halus (memberi makanan/minuman) atau meminta bantuan warga. Tidak ada opsi kekerasan.
 * - Ormas meminta uang keamanan 10–15% dari hasil dagang kemarin. Bayar, atau usir (kalah = bayar 20%).
 * - Kenalan nakes & polisi: hati 0–5. Hati penuh = mampir ke semua lokasi, dan jika sedang makan saat
 *   tantangan datang, mereka yang menangani (minigame dilewati).
 *
 * Frekuensi & kesulitan mengikuti tingkat ketenaran (popularitas).
 */

const CFG = CHALLENGE_CONFIG;

// ---------- dasar ----------

export function fameTier(popularity: number): FameTier {
  if (popularity < CFG.tiers.rendah.maxPopularity) return 'rendah';
  if (popularity < CFG.tiers.sedang.maxPopularity) return 'sedang';
  return 'tinggi';
}

export const tierOf = (state: Readonly<GameState>): FameTier => fameTier(state.player.popularity);

export function hasPetCat(state: Readonly<GameState>): boolean {
  return effectsOf(state).petCat > 0;
}

/** Hasil dagang kemarin di toko utama (dasar uang keamanan). */
export function yesterdayRevenue(state: Readonly<GameState>): number {
  const prev = state.history.filter((h) => h.day < state.calendar.day).at(-1);
  return prev?.revenue ?? 0;
}

function roundTo500(n: number): number {
  return Math.max(0, Math.round(n / 500) * 500);
}

export function ormasAmount(state: Readonly<GameState>, rate: number): number {
  return Math.max(CFG.ormas.minAmount, roundTo500(yesterdayRevenue(state) * rate));
}

function log(draft: GameState, entry: Omit<ChallengeLogEntry, 'minute' | 'portions' | 'cost'> & Partial<ChallengeLogEntry>): ChallengeLogEntry {
  const full: ChallengeLogEntry = { minute: draft.calendar.clockMinutes, portions: {}, cost: 0, ...entry };
  draft.challenges.today?.log.push(full);
  return full;
}

function today(draft: GameState): ChallengeDay {
  const t = draft.challenges.today;
  if (!t || t.day !== draft.calendar.day) throw new GameRuleError('challenge-none', tr('Tidak ada tantangan hari ini.'));
  return t;
}

// ---------- rencana harian ----------

/**
 * Susun tantangan hari ini saat mulai berjualan. Tanpa tantangan di hari-hari awal dan selama tutorial.
 * Hasilnya ditentukan oleh hari (seed), jadi memuat ulang permainan tidak mengubah rencana.
 */
export function planChallengeDay(state: Readonly<GameState>): ChallengeDay {
  const day = state.calendar.day;
  const plan: ChallengeDay = { day, cats: [], odgj: null, ormas: null, log: [] };
  if (day <= CFG.graceDays || state.tutorial < TUTORIAL_DONE) return plan;
  const rng = new SeededRandom(`tantangan-${day}-${state.mapId}`);
  const tier = tierOf(state);
  const open = GAME_CONFIG.dayCycle.openMinutes;
  const close = GAME_CONFIG.dayCycle.closeMinutes;

  for (const chance of CFG.cat.chances[tier]) {
    if (rng.chance(chance)) plan.cats.push(Math.round(rng.range(open + 20, close - 30)));
  }
  plan.cats.sort((a, b) => a - b);

  const c = state.challenges;
  if (day - c.lastOdgjDay >= CFG.odgj.minGapDays && rng.chance(CFG.odgj.chance[tier])) {
    plan.odgj = { minute: Math.round(rng.range(open + 15, CFG.odgj.untilMinute - 60)), status: 'menunggu' };
  }
  if (day - c.lastOrmasDay >= CFG.ormas.minGapDays && yesterdayRevenue(state) > 0 && rng.chance(CFG.ormas.chance[tier])) {
    let minute = Math.round(rng.range(open + 30, close - 60));
    // Jangan bersamaan dengan ODGJ: beri jarak minimal 40 menit.
    if (plan.odgj && Math.abs(plan.odgj.minute - minute) < 40) minute = Math.min(close - 30, plan.odgj.minute + 60);
    const rate = rng.range(CFG.ormas.rateMin, CFG.ormas.rateMax);
    plan.ormas = { minute, amount: ormasAmount(state, rate), status: 'menunggu' };
  }
  return plan;
}

/** Dipanggil saat mulai berjualan. */
export function startChallengeDay(draft: GameState): ChallengeDay {
  const existing = draft.challenges.today;
  if (existing && existing.day === draft.calendar.day) return existing;
  draft.challenges.today = planChallengeDay(draft);
  return draft.challenges.today;
}

// ---------- kucing liar ----------

export interface CatResult {
  readonly blocked: boolean;
  readonly taken: Record<string, number>;
}

/** Kucing liar sampai di gerobak: ambil 1–2 porsi (FEFO), kecuali ada kucing peliharaan. */
export function catArrives(draft: GameState, catalog: Catalog, rng: SeededRandom): CatResult {
  today(draft);
  if (hasPetCat(draft)) {
    draft.challenges.stats.catsBlocked += 1;
    log(draft, { kind: 'kucing', result: 'dicegah' });
    return { blocked: true, taken: {} };
  }
  const [lo, hi] = CFG.cat.portions[tierOf(draft)];
  let want = rng.int(lo, hi);
  const taken: Record<string, number> = {};
  // Kucing lebih suka lauk & makanan daripada minuman.
  const pool = Object.keys(draft.inventory.products)
    .filter((id) => totalQty(draft.inventory.products[id]) > 0)
    .sort((a, b) => Number(catalog.recipe(a).category === 'minuman') - Number(catalog.recipe(b).category === 'minuman'));
  for (const id of pool) {
    if (want <= 0) break;
    const qty = Math.min(want, totalQty(draft.inventory.products[id]));
    if (qty <= 0) continue;
    consumeStock(draft.inventory.products, id, qty);
    taken[id] = qty;
    want -= qty;
  }
  const lost = Object.values(taken).reduce((s, n) => s + n, 0);
  draft.challenges.stats.catsStolen += lost;
  log(draft, { kind: 'kucing', result: lost > 0 ? 'dicuri' : 'kosong', portions: taken });
  return { blocked: false, taken };
}

// ---------- ODGJ ----------

export function odgjPresent(state: Readonly<GameState>): boolean {
  const t = state.challenges.today;
  return !!t && t.day === state.calendar.day && t.odgj?.status === 'datang';
}

export function ormasPresent(state: Readonly<GameState>): boolean {
  const t = state.challenges.today;
  return !!t && t.day === state.calendar.day && t.ormas?.status === 'datang';
}

/** Pengali peluang kedatangan pelanggan (ODGJ di dekat gerobak = lebih sepi). */
export function arrivalFactor(state: Readonly<GameState>): number {
  return odgjPresent(state) ? CFG.odgj.arrivalFactor : 1;
}

export function markArrived(draft: GameState, kind: 'odgj' | 'ormas'): void {
  const t = today(draft);
  const entry = kind === 'odgj' ? t.odgj : t.ormas;
  if (!entry || entry.status !== 'menunggu') return;
  entry.status = 'datang';
  if (kind === 'odgj') draft.challenges.lastOdgjDay = draft.calendar.day;
  else draft.challenges.lastOrmasDay = draft.calendar.day;
}

function finish(draft: GameState, kind: 'odgj' | 'ormas'): void {
  const t = today(draft);
  const entry = kind === 'odgj' ? t.odgj : t.ormas;
  if (!entry || entry.status !== 'datang') throw new GameRuleError('challenge-gone', tr('Kejadian ini sudah selesai.'));
  entry.status = 'selesai';
}

/** Porsi yang bisa diberikan untuk menenangkan: 'minum' = minuman hangat/apa saja, 'makan' = makanan. */
export function giftFor(state: Readonly<GameState>, catalog: Catalog, kind: 'minum' | 'makan'): string | null {
  const warm = ['teh_hangat', 'wedang_jahe', 'susu_jahe', 'kopi_panas', 'teh_tarik'];
  const food = ['nasi_kucing', 'sego_bakar', 'nasi_goreng', 'mi_rebus', 'mi_goreng', 'roti_bakar'];
  const has = (id: string): boolean => totalQty(state.inventory.products[id]) > 0;
  const prefer = kind === 'minum' ? warm : food;
  const first = prefer.find(has);
  if (first) return first;
  const any = Object.keys(state.inventory.products).filter(has);
  return any.find((id) => (catalog.recipe(id).category === 'minuman') === (kind === 'minum')) ?? null;
}

/** ODGJ pergi dengan tenang setelah ditawari yang hangat. `gifts` = porsi yang diberikan. */
export function odgjCalmed(draft: GameState, gifts: readonly string[]): ChallengeLogEntry {
  finish(draft, 'odgj');
  const portions: Record<string, number> = {};
  for (const id of gifts) {
    if (totalQty(draft.inventory.products[id]) <= 0) continue;
    consumeStock(draft.inventory.products, id, 1);
    portions[id] = (portions[id] ?? 0) + 1;
  }
  draft.challenges.stats.odgjCalmed += 1;
  return log(draft, { kind: 'odgj', result: 'halus', portions });
}

/** Warga mengantar ODGJ pergi (berhasil) atau terjadi keributan (gagal). */
export function odgjNeighbors(draft: GameState, success: boolean): ChallengeLogEntry {
  if (success) {
    finish(draft, 'odgj');
    draft.challenges.stats.odgjCalmed += 1;
    return log(draft, { kind: 'odgj', result: 'warga' });
  }
  // Gagal: keributan kecil. ODGJ tetap di tempat dan popularitas turun sedikit.
  draft.player.popularity = Math.round(clampPopularity(draft.player.popularity - 1) * 10) / 10;
  return log(draft, { kind: 'odgj', result: 'ribut' });
}

/** Cara halus gagal: ODGJ tetap di tempat (porsi yang sudah diberikan tetap berkurang). */
export function odgjCalmFailed(draft: GameState, gifts: readonly string[]): ChallengeLogEntry {
  today(draft);
  const portions: Record<string, number> = {};
  for (const id of gifts) {
    if (totalQty(draft.inventory.products[id]) <= 0) continue;
    consumeStock(draft.inventory.products, id, 1);
    portions[id] = (portions[id] ?? 0) + 1;
  }
  return log(draft, { kind: 'odgj', result: 'gagal', portions });
}

/** Jam 22.00: ODGJ pergi sendiri. */
export function odgjLeaves(draft: GameState): ChallengeLogEntry | null {
  const t = draft.challenges.today;
  if (!t?.odgj || t.odgj.status !== 'datang') return null;
  t.odgj.status = 'selesai';
  return log(draft, { kind: 'odgj', result: 'pergi' });
}

// ---------- ormas ----------

function pay(draft: GameState, amount: number): void {
  draft.player.money -= amount;
  draft.ledger.securityCost = (draft.ledger.securityCost ?? 0) + amount;
  draft.challenges.stats.totalPaid += amount;
}

/** Bayar uang keamanan (juga dipakai tombol Lewati & saat ormas dibiarkan menunggu terlalu lama). */
export function ormasPay(draft: GameState): ChallengeLogEntry {
  const t = today(draft);
  const amount = t.ormas?.amount ?? 0;
  finish(draft, 'ormas');
  pay(draft, amount);
  draft.challenges.stats.ormasPaid += 1;
  return log(draft, { kind: 'ormas', result: 'bayar', cost: amount });
}

/** Hasil adu gertak. Kalah = bayar 20% dari hasil dagang kemarin. */
export function ormasDuel(draft: GameState, won: boolean): ChallengeLogEntry {
  finish(draft, 'ormas');
  if (won) {
    draft.challenges.stats.ormasRepelled += 1;
    return log(draft, { kind: 'ormas', result: 'usir' });
  }
  const amount = ormasAmount(draft, CFG.ormas.failRate);
  pay(draft, amount);
  draft.challenges.stats.ormasPaid += 1;
  return log(draft, { kind: 'ormas', result: 'kalah', cost: amount });
}

/**
 * Ormas dibiarkan menunggu terlalu lama (atau sampai tutup): mereka mengambil sendiri 15–20%
 * dari hasil dagang kemarin. Persen ditentukan hari (seed) supaya sama walau dimuat ulang.
 */
export function ormasLateRate(state: Readonly<GameState>): number {
  const rng = new SeededRandom(`tagih-${state.calendar.day}`);
  return Math.round(rng.range(CFG.ormas.lateRateMin, CFG.ormas.lateRateMax) * 100) / 100;
}

export function ormasCollect(draft: GameState): ChallengeLogEntry {
  finish(draft, 'ormas');
  const amount = ormasAmount(draft, ormasLateRate(draft));
  pay(draft, amount);
  draft.challenges.stats.ormasPaid += 1;
  return log(draft, { kind: 'ormas', result: 'tagih', cost: amount });
}

// ---------- kenalan nakes & polisi ----------

export function allyState(state: Readonly<GameState>, id: string): AllyState {
  return state.challenges.allies[id] ?? { heart: 0, talks: 0, lastTalkDay: 0, lastVisitDay: 0 };
}

function ensureAlly(draft: GameState, id: string): AllyState {
  return (draft.challenges.allies[id] ??= { heart: 0, talks: 0, lastTalkDay: 0, lastVisitDay: 0 });
}

export function allyHeart(state: Readonly<GameState>, kind: AllyKind): number {
  return allyState(state, allyOfKind(kind).id).heart;
}

export function allyReady(state: Readonly<GameState>, kind: AllyKind): boolean {
  return allyHeart(state, kind) >= CFG.allies.maxHeart;
}

/** Kenalan yang mampir hari ini. Hati belum penuh: hanya di lokasi asalnya. Hati penuh: di mana saja. */
export function planAllyVisits(state: Readonly<GameState>): NamedVisit[] {
  const rng = new SeededRandom(`kenalan-${state.calendar.day}-${state.mapId}`);
  const visits: NamedVisit[] = [];
  for (const a of ALLIES) {
    const roll = rng.next();
    const minute = Math.round(rng.range(a.visitWindow[0], a.visitWindow[1]));
    const home = state.mapId === a.homeLocation;
    const ready = allyState(state, a.id).heart >= CFG.allies.maxHeart;
    const chance = home ? CFG.allies.homeVisitChance : ready ? CFG.allies.awayVisitChance : 0;
    if (roll < chance) visits.push({ who: a.id, minute, newsId: null });
  }
  return visits;
}

export function allyArrived(draft: GameState, id: string): void {
  if (!allyById(id)) return;
  ensureAlly(draft, id).lastVisitDay = draft.calendar.day;
}

export function canTalkAlly(state: Readonly<GameState>, id: string): boolean {
  return allyState(state, id).lastTalkDay !== state.calendar.day;
}

export function allyTalkLines(state: Readonly<GameState>, ally: AllyDef): readonly string[] {
  const heart = allyState(state, ally.id).heart;
  const pool = ally.hearts[heart] ?? ally.hearts[0] ?? [];
  const line = pool[(state.calendar.day + ally.id.length) % Math.max(1, pool.length)];
  return line ? [line] : [];
}

/**
 * Mengobrol (sekali sehari) lalu menebak pesanan kesukaannya: benar = hati +2, salah/tanpa tebakan = +1.
 * Maksimal 5. Mengembalikan hati baru jika naik.
 */
export function allyTalk(draft: GameState, id: string, guessedRight = false): number | null {
  const def = allyById(id);
  if (!def) throw new GameRuleError('ally-unknown', tr('Kenalan tidak dikenal.'));
  const a = ensureAlly(draft, id);
  if (a.lastTalkDay === draft.calendar.day) throw new GameRuleError('ally-talked', tr('Sudah mengobrol hari ini.'));
  a.lastTalkDay = draft.calendar.day;
  a.talks += 1;
  if (a.heart >= CFG.allies.maxHeart) return null;
  a.heart = Math.min(CFG.allies.maxHeart, a.heart + (guessedRight ? 2 : 1));
  return a.heart;
}

/** Kenalan yang hatinya penuh menangani ODGJ (ambulans) atau ormas (mobil polisi). */
export function allyHandles(draft: GameState, kind: 'odgj' | 'ormas'): ChallengeLogEntry {
  finish(draft, kind);
  draft.challenges.stats.arrests += 1;
  if (kind === 'odgj') draft.challenges.stats.odgjCalmed += 1;
  else draft.challenges.stats.ormasRepelled += 1;
  return log(draft, { kind, result: 'ditangani' });
}

// ---------- laporan ----------

export function challengeReport(state: Readonly<GameState>): { log: ChallengeLogEntry[]; cost: number } | null {
  const t = state.challenges.today;
  if (!t || t.day !== state.calendar.day || t.log.length === 0) return null;
  return { log: t.log.map((e) => ({ ...e, portions: { ...e.portions } })), cost: t.log.reduce((s, e) => s + e.cost, 0) };
}

const KIND_LABEL: Record<ChallengeKind, string> = { kucing: '🐈', odgj: '🧍', ormas: '🧥' };

/** Satu baris ringkas untuk laporan & notifikasi. */
export function describeLog(e: ChallengeLogEntry, recipeName: (id: string) => string): string {
  const items = Object.entries(e.portions).map(([id, n]) => `${n}× ${recipeName(id)}`).join(', ');
  const icon = KIND_LABEL[e.kind];
  switch (`${e.kind}:${e.result}`) {
    case 'kucing:dicuri':
      return tr('{icon} Kucing liar mencuri {items}', { icon, items });
    case 'kucing:kosong':
      return tr('{icon} Kucing liar datang, tapi tidak ada yang bisa dicuri', { icon });
    case 'kucing:dicegah':
      return tr('{icon} Si Belang mengusir kucing liar', { icon });
    case 'odgj:halus':
      return items ? tr('{icon} ODGJ pergi dengan tenang setelah diberi {items}', { icon, items }) : tr('{icon} ODGJ pergi dengan tenang', { icon });
    case 'odgj:gagal':
      return items ? tr('{icon} Cara halus belum berhasil ({items} sudah diberikan)', { icon, items }) : tr('{icon} Cara halus belum berhasil', { icon });
    case 'odgj:warga':
      return tr('{icon} Warga mengantar ODGJ pulang', { icon });
    case 'odgj:ribut':
      return tr('{icon} Warga datang terlambat, sempat ribut (popularitas −1)', { icon });
    case 'odgj:pergi':
      return tr('{icon} ODGJ pergi sendiri jam 22.00', { icon });
    case 'odgj:ditangani':
      return tr('{icon} Tim nakes membawa ODGJ ke ambulans', { icon });
    case 'ormas:bayar':
      return tr('{icon} Membayar uang keamanan', { icon });
    case 'ormas:usir':
      return tr('{icon} Ormas berhasil diusir', { icon });
    case 'ormas:tagih':
      return tr('{icon} Ormas menagih sendiri karena dibiarkan menunggu', { icon });
    case 'ormas:kalah':
      return tr('{icon} Kalah adu gertak, membayar 20%', { icon });
    case 'ormas:ditangani':
      return tr('{icon} Polisi membawa ormas ke mobil patroli', { icon });
    default:
      return `${icon} ${e.result}`;
  }
}
