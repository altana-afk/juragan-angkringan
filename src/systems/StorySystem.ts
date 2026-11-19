import type { GameState, NewsRecord, RelationState } from '../core/GameState';
import { BALANCE_CONFIG } from '../config/balanceConfig';
import {
  CHAPTERS,
  NAMED_CUSTOMERS,
  NEWS,
  namedById,
  newsById,
  type ChoiceId,
  type EndingId,
  type NamedId,
  type NewsDef,
  type RelationStage,
} from '../data/story';
import { formatRupiah } from '../utils/formatting';
import { isAlly } from '../data/challenges';
import { SeededRandom } from '../utils/random';
import { GameRuleError } from './rules';
import { tr } from '../i18n/i18n';

/**
 * Sistem cerita "Kabar Kampung & Buku Dapur Kardi" (tanpa Phaser, bisa diuji di Node).
 *
 * - Kabar sampai ke pemain saat pembicaranya mampir (status `belum_dibaca`, masuk log).
 * - Mengetuk gelembung "..." atau membuka log → `dibaca`.
 * - 5 hari tidak dibaca → `diringkas` ("didengar dari orang lain"), dianggap sudah didengar.
 *   Jadi cerita tidak pernah terkunci; kabar penting hanya menahan kabar yang bergantung padanya.
 * - Permainan (belanja, masak, jualan) tidak pernah diblokir oleh cerita.
 */

export const SUMMARY_AFTER_DAYS = 5;
/** Poin minimal untuk tahap 0, 1, 2, 3. */
export const STAGE_POINTS: readonly number[] = [0, 3, 8, 15];
/** Akhir cerita muncul beberapa hari setelah keputusan (Babak 4). */
export const ENDING_AFTER_DAYS = 3;
export const SELL_PRICE = 3_000_000;
export const RENT_PRICE = 1_500_000;

// ---------- dasar ----------

/** Hari cerita (1 = hari cerita dimulai). */
export function storyDay(state: Readonly<GameState>, day = state.calendar.day): number {
  return day - state.story.startDay + 1;
}

export function newsRecord(state: Readonly<GameState>, id: string): NewsRecord | undefined {
  return state.story.news[id];
}

/** Sudah didengar = dibaca atau diringkas. */
export function isHeard(state: Readonly<GameState>, id: string): boolean {
  const r = state.story.news[id];
  return r !== undefined && r.status !== 'belum_dibaca';
}

export function relationOf(state: Readonly<GameState>, who: NamedId): RelationState {
  return state.story.relations[who] ?? { points: 0, stage: 0, talks: 0, lastTalkDay: 0, lastVisitDay: 0 };
}

function ensureRelation(draft: GameState, who: NamedId): RelationState {
  return (draft.story.relations[who] ??= { points: 0, stage: 0, talks: 0, lastTalkDay: 0, lastVisitDay: 0 });
}

export function stageForPoints(points: number): RelationStage {
  let s: RelationStage = 0;
  STAGE_POINTS.forEach((min, i) => {
    if (points >= min) s = i as RelationStage;
  });
  return s;
}

/** Tambah/kurangi poin. Tahap tidak pernah turun karena poin. Mengembalikan tahap baru jika naik. */
export function addPoints(draft: GameState, who: NamedId, delta: number): RelationStage | null {
  const r = ensureRelation(draft, who);
  r.points = Math.max(0, r.points + delta);
  const next = stageForPoints(r.points);
  if (next > r.stage) {
    r.stage = next;
    return next;
  }
  return null;
}

/** Babak 1–4 dari kabar penting yang sudah didengar & keputusan. */
export function currentAct(state: Readonly<GameState>): 1 | 2 | 3 | 4 {
  if (state.story.choice) return 4;
  if (isHeard(state, 'gusur_14')) return 3;
  if (isHeard(state, 'hendra_ukur')) return 2;
  return 1;
}

export const ACT_TITLES: Record<1 | 2 | 3 | 4, string> = {
  1: tr('Babak 1 · Pembukaan'),
  2: tr('Babak 2 · Tegangan'),
  3: tr('Babak 3 · Klimaks'),
  4: tr('Babak 4 · Penyelesaian'),
};

// ---------- kabar ----------

/** Kabar yang siap disampaikan hari ini (belum pernah diterima, hari & syarat terpenuhi). */
export function pendingNews(state: Readonly<GameState>): NewsDef[] {
  if (state.story.ending) return [];
  const today = storyDay(state);
  return NEWS.filter((n) => {
    if (state.story.news[n.id]) return false;
    if (n.day > today) return false;
    if (!n.requires.every((id) => isHeard(state, id))) return false;
    if (n.requiresStage && relationOf(state, n.requiresStage.who).stage < n.requiresStage.stage) return false;
    return true;
  });
}

/** Kabar diterima (masuk log sebagai belum dibaca). */
export function receiveNews(draft: GameState, id: string): void {
  newsById(id);
  if (!draft.story.news[id]) draft.story.news[id] = { status: 'belum_dibaca', receivedDay: draft.calendar.day };
}

/** Tandai kabar dibaca. Mengembalikan true jika kabar ini membuka keputusan. */
export function readNews(draft: GameState, id: string): boolean {
  const def = newsById(id);
  const rec = draft.story.news[id];
  if (!rec) throw new GameRuleError('story-not-received', tr('Kabar ini belum sampai.'));
  rec.status = 'dibaca';
  return def.opensDecision && !draft.story.choice;
}

export function unreadNews(state: Readonly<GameState>): NewsDef[] {
  return NEWS.filter((n) => state.story.news[n.id]?.status === 'belum_dibaca');
}

export function unreadImportant(state: Readonly<GameState>): NewsDef[] {
  return unreadNews(state).filter((n) => n.important);
}

/** Kabar yang sudah diterima, terbaru dulu (belum dibaca paling atas). */
export function newsLog(state: Readonly<GameState>): { def: NewsDef; rec: NewsRecord }[] {
  return NEWS.filter((n) => state.story.news[n.id])
    .map((def) => ({ def, rec: state.story.news[def.id] as NewsRecord }))
    .sort((a, b) => Number(b.rec.status === 'belum_dibaca') - Number(a.rec.status === 'belum_dibaca') || b.rec.receivedDay - a.rec.receivedDay || b.def.day - a.def.day);
}

/** Kabar yang lewat 5 hari tanpa dibaca menjadi ringkasan. Mengembalikan id yang diringkas. */
export function summarizeStale(draft: GameState): string[] {
  const done: string[] = [];
  for (const [id, rec] of Object.entries(draft.story.news)) {
    if (rec.status === 'belum_dibaca' && draft.calendar.day - rec.receivedDay >= SUMMARY_AFTER_DAYS) {
      rec.status = 'diringkas';
      done.push(id);
    }
  }
  return done;
}

// ---------- kunjungan & obrolan ----------

export interface NamedVisit {
  readonly who: NamedId;
  /** Menit permainan kedatangan. */
  readonly minute: number;
  /** Kabar yang dibawa (null = obrolan ringan). */
  readonly newsId: string | null;
}

/**
 * Jadwal kunjungan pelanggan bernama hari ini (deterministik per hari).
 * Pembicara kabar yang siap pasti mampir; yang lain mampir sesuai peluang.
 * Maksimal satu kabar per pembicara per hari.
 */
export function planVisits(state: Readonly<GameState>): NamedVisit[] {
  const rng = new SeededRandom(`kunjungan-${state.calendar.day}-${state.story.startDay}`);
  const today = storyDay(state);
  const pending = pendingNews(state);
  const visits: NamedVisit[] = [];
  for (const c of NAMED_CUSTOMERS) {
    const news = pending.find((n) => n.speaker === c.id) ?? null;
    const chance = rng.next();
    const minute = Math.round(rng.range(c.visitWindow[0], c.visitWindow[1]));
    if (news || (today >= c.fromDay && chance < c.visitChance)) visits.push({ who: c.id, minute, newsId: news?.id ?? null });
  }
  return visits.sort((a, b) => a.minute - b.minute);
}

/** Pelanggan bernama tiba: kabar yang dibawa masuk log. */
export function namedArrived(draft: GameState, visit: NamedVisit): void {
  // Kenalan tantangan (nakes/polisi) punya hati sendiri, tidak ikut hubungan cerita.
  if (isAlly(visit.who)) return;
  ensureRelation(draft, visit.who).lastVisitDay = draft.calendar.day;
  if (visit.newsId && !draft.story.news[visit.newsId]) receiveNews(draft, visit.newsId);
}

export function canTalkToday(state: Readonly<GameState>, who: NamedId): boolean {
  return relationOf(state, who).lastTalkDay !== state.calendar.day;
}

export interface TalkContent {
  readonly who: NamedId;
  readonly newsId: string | null;
  readonly title: string | null;
  readonly lines: readonly string[];
}

/** Isi obrolan saat gelembung diketuk: kabar belum dibaca dari pembicara ini, atau obrolan ringan. */
export function talkContent(state: Readonly<GameState>, who: NamedId): TalkContent {
  const news = NEWS.find((n) => n.speaker === who && state.story.news[n.id]?.status === 'belum_dibaca');
  if (news) return { who, newsId: news.id, title: news.title, lines: news.lines };
  const def = namedById(who);
  const pool = def.talk[relationOf(state, who).stage];
  const line = pool[(state.calendar.day + who.length) % pool.length] as string;
  return { who, newsId: null, title: null, lines: [line] };
}

export interface TalkResult {
  readonly stageUp: RelationStage | null;
  readonly opensDecision: boolean;
}

/** Selesai mengobrol: kabar dibaca, +1 poin (sekali sehari per pelanggan). */
export function applyTalk(draft: GameState, who: NamedId, newsId: string | null): TalkResult {
  namedById(who);
  let opensDecision = false;
  if (newsId) {
    if (!draft.story.news[newsId]) receiveNews(draft, newsId);
    opensDecision = readNews(draft, newsId);
  }
  const r = ensureRelation(draft, who);
  let stageUp: RelationStage | null = null;
  if (r.lastTalkDay !== draft.calendar.day) {
    r.lastTalkDay = draft.calendar.day;
    r.talks++;
    stageUp = addPoints(draft, who, 1);
  }
  return { stageUp, opensDecision };
}

/** Pelanggan bernama dilayani: puas (+1) dan menu favorit tersedia (+1). */
export function applyNamedService(draft: GameState, who: NamedId, satisfaction: number, soldIds: readonly string[]): RelationStage | null {
  if (isAlly(who)) return null;
  const def = namedById(who);
  let delta = 0;
  if (satisfaction >= 70) delta++;
  if (soldIds.some((id) => def.favorites.includes(id))) delta++;
  if (satisfaction < 40) delta--;
  return delta === 0 ? null : addPoints(draft, who, delta);
}

/** Pelanggan bernama pergi tanpa dilayani. */
export function applyNamedWalkAway(draft: GameState, who: NamedId): void {
  if (isAlly(who)) return;
  namedById(who);
  addPoints(draft, who, -1);
}

// ---------- buku resep ----------

/** Syarat tiap bab (selain bab 1 yang terbuka sejak awal). */
export function chapterMet(state: Readonly<GameState>, id: number): boolean {
  const d = storyDay(state);
  const has = (n: number): boolean => (state.story.chapters[n] ?? 0) > 0;
  switch (id) {
    case 1:
      return true;
    case 2:
      return d >= 8 && isHeard(state, 'gerobak_kosong');
    case 3:
      return d >= 15 && relationOf(state, 'gito').talks > 0;
    case 4:
      // Pengaman: tanpa ke Pinggir Pasar, bab tetap terbuka seminggu kemudian.
      return d >= 32 && isHeard(state, 'gusur_14') && (state.story.flags.pasar || d >= 39);
    case 5:
      return d >= 38 && has(4) && isHeard(state, 'sambal_robek');
    case 6:
      return d >= 42 && has(5) && relationOf(state, 'surti').stage >= 2;
    case 7:
      return state.story.ending !== null;
    default:
      return false;
  }
}

export function isChapterOpen(state: Readonly<GameState>, id: number): boolean {
  return (state.story.chapters[id] ?? 0) > 0;
}

export function unseenChapters(state: Readonly<GameState>): number[] {
  return CHAPTERS.filter((c) => isChapterOpen(state, c.id) && !state.story.chaptersSeen.includes(c.id)).map((c) => c.id);
}

// ---------- keputusan & akhir ----------

export function decisionAvailable(state: Readonly<GameState>): boolean {
  return isHeard(state, 'keputusan') && state.story.choice === null;
}

export function choiceBlocker(state: Readonly<GameState>, id: ChoiceId): string | null {
  switch (id) {
    case 'bertahan':
      return state.player.money >= RENT_PRICE ? null : tr('Kas belum cukup (butuh {RENT_PRICE}).', { RENT_PRICE: formatRupiah(RENT_PRICE) });
    case 'gotong': {
      const sum = (['surti', 'gito', 'bayu'] as const).reduce((s, w) => s + relationOf(state, w).stage, 0);
      if (state.player.popularity < 55) return tr('Popularitas belum cukup ({popularity} dari 55).', { popularity: Math.floor(state.player.popularity) });
      return sum >= 5 ? null : tr('Kedekatan warga belum cukup (total tahap {sum} dari 5).', { sum });
    }
    case 'warisan':
      return relationOf(state, 'bayu').stage >= 2 ? null : tr('Mas Bayu belum cukup dekat (tahap {stage} dari 2).', { stage: relationOf(state, 'bayu').stage });
    case 'jual':
      return null;
  }
}

const clampPop = (v: number): number => Math.max(BALANCE_CONFIG.popularityMin, Math.min(BALANCE_CONFIG.popularityMax, v));

/** Terapkan keputusan hari ke-43. */
export function applyChoice(draft: GameState, id: ChoiceId, coffeeIds: readonly string[] = ['kopi_susu', 'es_kopi_susu', 'kopi_joss']): void {
  if (draft.phase === 'berjualan') throw new GameRuleError('wrong-phase', tr('Putuskan saat persiapan atau setelah tutup.'));
  if (!decisionAvailable(draft)) throw new GameRuleError('no-decision', tr('Belum ada keputusan yang perlu diambil.'));
  const blocker = choiceBlocker(draft, id);
  if (blocker) throw new GameRuleError('choice-blocked', blocker);
  const p = draft.player;
  switch (id) {
    case 'bertahan':
      p.money -= RENT_PRICE;
      p.popularity = clampPop(p.popularity - 3);
      break;
    case 'gotong':
      p.popularity = clampPop(p.popularity + 6);
      p.loyalty = Math.min(100, p.loyalty + 15);
      break;
    case 'warisan':
      p.loyalty = Math.min(100, p.loyalty + 10);
      for (const r of coffeeIds) if (!draft.unlockedRecipes.includes(r)) draft.unlockedRecipes.push(r);
      break;
    case 'jual':
      p.money += SELL_PRICE;
      p.popularity = clampPop(p.popularity - 15);
      for (const who of ['surti', 'gito']) {
        const r = ensureRelation(draft, who);
        r.points = 0;
        r.stage = 0;
      }
      break;
  }
  draft.story.choice = id;
  draft.story.choiceDay = draft.calendar.day;
}

/** Akhir yang dicapai dari keputusan, bab buku, dan hubungan. */
export function endingFor(state: Readonly<GameState>): EndingId | null {
  const choice = state.story.choice;
  if (!choice) return null;
  const allChapters = [1, 2, 3, 4, 5, 6].every((n) => isChapterOpen(state, n));
  if (choice !== 'jual' && allChapters && relationOf(state, 'surti').stage >= 3 && relationOf(state, 'bayu').stage >= 3) return 'lengkap';
  return ({ bertahan: 'bertahan', gotong: 'gotong_royong', warisan: 'warisan', jual: 'kota' } as const)[choice];
}

// ---------- pembaruan berkala ----------

export interface StoryUpdate {
  readonly chapters: number[];
  readonly summarized: string[];
  readonly ending: EndingId | null;
}

/** Dipanggil setelah setiap aksi: bab terbuka, ringkasan 5 hari, dan akhir cerita. */
export function refreshStory(draft: GameState): StoryUpdate {
  const summarized = summarizeStale(draft);
  let ending: EndingId | null = null;
  if (draft.story.choice && !draft.story.ending && draft.calendar.day - draft.story.choiceDay >= ENDING_AFTER_DAYS && draft.phase === 'persiapan') {
    ending = endingFor(draft);
    draft.story.ending = ending;
  }
  const chapters: number[] = [];
  for (const c of CHAPTERS) {
    if (!isChapterOpen(draft, c.id) && chapterMet(draft, c.id)) {
      draft.story.chapters[c.id] = draft.calendar.day;
      chapters.push(c.id);
    }
  }
  return { chapters, summarized, ending };
}

export function markChapterSeen(draft: GameState, id: number): void {
  if (isChapterOpen(draft, id) && !draft.story.chaptersSeen.includes(id)) draft.story.chaptersSeen.push(id);
}
