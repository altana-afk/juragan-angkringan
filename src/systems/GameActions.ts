import { moveLocation } from './LocationSystem';
import type { LocationDef } from '../data/locations';
import { openDeposit, repayLoan, takeLoan, withdrawDeposit } from './BankSystem';
import { deliverBulkOrder, rollEvent, type BulkResult } from './EventSystem';
import { eventById } from '../data/events';
import { discardIngredient, type DiscardResult } from './StorageSystem';
import { advanceTutorial, TUTORIAL_DONE } from './TutorialSystem';
import { buyUpgrade, type UpgradeDef } from './UpgradeSystem';
import { buyBranchUpgrade, moveBranch, openBranch, setBranchOpen } from './BranchSystem';
import { changeWagePlan, dismissStaff, hireStaff } from './BranchStaffSystem';
import { shipToBranch } from './BranchSupplySystem';
import type { OnlineSource } from './BranchOnlineSystem';
import { branchUpgradeById, wagePlanById, type WagePlanId } from '../data/branches';
import { setPrice, setOnlinePrice } from './PricingSystem';
import { WEATHER_EFFECTS, weatherForDay } from './WeatherSystem';
import { GAME_CONFIG } from '../config/gameConfig';
import { createEmptyLedger, type DayReport, type GameState } from '../core/GameState';
import { locationById } from '../data/locations';
import { buyAd, cancelAd, type AdDef } from './AdvertisingSystem';
import { closeDay } from './DayCloseSystem';
import type { SeededRandom } from '../utils/random';
import type { CustomerPlan } from './DemandSystem';
import { removeExpired, totalQty } from './InventorySystem';
import { applySale, applyWalkAway, resolveOrder, type OrderOutcome } from './SalesSystem';
import type { GameStore } from '../core/GameStore';
import type { Catalog, RecipeDef } from '../data/catalog';
import { formatRupiah } from '../utils/formatting';
import { prepareProducts, type CookResult } from './CookingSystem';
import { applyPurchase, type CartLine, type PurchaseQuote } from './EconomySystem';
import { refreshUnlocks, type CookOrder } from './RecipeSystem';
import { GameRuleError } from './rules';
import type { ChoiceId, NamedId, RelationStage } from '../data/story';
import {
  applyChoice,
  applyNamedService,
  applyNamedWalkAway,
  applyTalk,
  markChapterSeen,
  namedArrived,
  readNews,
  refreshStory,
  type NamedVisit,
  type StoryUpdate,
  type TalkResult,
} from './StorySystem';

import { acceptOrder, dispatchCourier, rejectOrder, resetOnlineDay, setDeliveryMode, tickOnline, type OnlineTickEvent } from './OnlineOrderSystem';
import { rollOnlineEvent } from './OnlineEventSystem';
import type { Branch, DeliveryMode, OnlineOrder } from '../core/GameState';
import { tr } from '../i18n/i18n';
import type { ChallengeDay, ChallengeLogEntry } from '../core/GameState';
import {
  allyArrived,
  allyHandles,
  allyTalk,
  catArrives,
  markArrived,
  odgjCalmFailed,
  odgjCalmed,
  odgjLeaves,
  odgjNeighbors,
  ormasCollect,
  ormasDuel,
  ormasAmount,
  ormasPay,
  startChallengeDay,
  type CatResult,
} from './ChallengeEventSystem';

/** Kabar dari sistem cerita untuk UI (bab baru, tahap hubungan naik, akhir cerita). */
export interface StoryNotice {
  readonly update?: StoryUpdate;
  readonly stageUp?: { who: NamedId; stage: RelationStage };
}

export type ActionResult<T> = { ok: true; value: T; message: string } | { ok: false; code: string; message: string; details?: unknown };

/**
 * Pintu masuk aksi pemain yang mengubah data permainan.
 * UI memanggil method di sini; semua perubahan melewati GameStore (tervalidasi & memicu event).
 */
export class GameActions {
  constructor(
    private readonly store: GameStore,
    private readonly catalog: Catalog,
    private readonly onUnlock: (recipes: RecipeDef[]) => void = () => undefined,
    private readonly onStory: (notice: StoryNotice) => void = () => undefined,
  ) {}

  private run<T>(reason: string, apply: (draft: GameState) => T, message: (v: T) => string): ActionResult<T> {
    let value!: T;
    let opened: RecipeDef[] = [];
    let story: StoryUpdate | null = null;
    try {
      this.store.update(reason, (draft) => {
        if (draft.bankrupt) throw new GameRuleError('bankrupt', tr('Usaha sudah bangkrut. Mulai permainan baru.'));
        value = apply(draft);
        story = refreshStory(draft);
        opened = refreshUnlocks(draft, this.catalog);
      });
    } catch (error) {
      if (error instanceof GameRuleError) return { ok: false, code: error.code, message: error.message, details: error.details };
      throw error;
    }
    if (opened.length) this.onUnlock(opened);
    const st = story as StoryUpdate | null;
    if (st && (st.chapters.length || st.ending || st.summarized.length)) this.onStory({ update: st });
    return { ok: true, value, message: message(value) };
  }

  buyIngredients(cart: readonly CartLine[]): ActionResult<PurchaseQuote> {
    return this.run('beli-bahan', (draft) => {
      const quote = applyPurchase(draft, this.catalog, cart);
      if (draft.mapId === 'pasar') draft.story.flags.pasar = true;
      return quote;
    }, (q) => tr('Belanja {length} bahan seharga {total} berhasil.', { length: q.lines.length, total: formatRupiah(q.total) }));
  }

  prepare(orders: readonly CookOrder[]): ActionResult<CookResult> {
    return this.run('masak', (draft) => prepareProducts(draft, this.catalog, orders), (r) => tr('{totalPortions} porsi siap dijual.', { totalPortions: r.totalPortions }));
  }

  /** Mulai fase berjualan: jam diset ke jam buka. */
  startSelling(): ActionResult<{ products: number; bulk: BulkResult | null }> {
    return this.run(
      'mulai-jualan',
      (draft) => {
        if (draft.phase !== 'persiapan') throw new GameRuleError('wrong-phase', tr('Angkringan sudah buka.'));
        draft.phase = 'berjualan';
        draft.calendar.clockMinutes = GAME_CONFIG.dayCycle.openMinutes;
        // Pesanan borongan event diambil saat buka.
        const bulk = deliverBulkOrder(draft);
        startChallengeDay(draft);
        return { products: Object.values(draft.inventory.products).reduce((s, b) => s + totalQty(b), 0), bulk };
      },
      (r) => {
        const base = tr('Angkringan buka! Pelanggan mulai berdatangan.');
        if (!r.bulk) return base;
        const name = this.catalog.recipe(this.store.get().event?.bulk?.recipeId ?? '').name;
        return r.bulk.delivered
          ? tr('{base} Pesanan borongan {qty} {name} terkirim (+{revenue}).', { base, qty: r.bulk.qty, name, revenue: formatRupiah(r.bulk.revenue) })
          : tr('{base} Pesanan borongan {qty} {name} batal — stok hanya {have}.', { base, qty: r.bulk.qty, name, have: r.bulk.have });
      },
    );
  }

  moveLocation(locationId: string): ActionResult<LocationDef> {
    return this.run(
      'pindah-lokasi',
      (d) => moveLocation(d, this.catalog, locationId),
      (loc) => tr('Gerobak pindah ke {name} (biaya {moveCost}).{2}', { name: loc.name, moveCost: formatRupiah(loc.moveCost), 2: this.store.get().event ? tr(' Event di sini: {name}.', { name: eventById(this.store.get().event!.id).name }) : '' }),
    );
  }

  depositMoney(amount: number, term: number): ActionResult<number> {
    return this.run('bank-deposito', (d) => openDeposit(d, amount, term), () => tr('Deposito {amount} tempo {1} minggu dibuka.', { amount: formatRupiah(amount), 1: term / 7 }));
  }

  withdrawDeposit(id: number): ActionResult<number> {
    return this.run('bank-tarik', (d) => withdrawDeposit(d, id), (t) => tr('Deposito dicairkan: {t} masuk ke kas.', { t: formatRupiah(t) }));
  }

  borrow(amount: number, term: number): ActionResult<void> {
    return this.run('bank-pinjam', (d) => takeLoan(d, amount, term), () => tr('Pinjaman {amount} cair ke kas.', { amount: formatRupiah(amount) }));
  }

  repayLoan(amount: number): ActionResult<number> {
    return this.run('bank-bayar', (d) => repayLoan(d, amount), (p) => (this.store.get().bank.loan ? tr('Cicilan {p} dibayar.', { p: formatRupiah(p) }) : tr('Pinjaman lunas! ({p})', { p: formatRupiah(p) })));
  }

  /** Layani satu rombongan: tentukan hasil pesanan dari stok terkini lalu catat penjualannya. */
  serveCustomer(plan: CustomerPlan, waitedMinutes: number, rng: SeededRandom): OrderOutcome {
    let outcome!: OrderOutcome;
    let stageUp: { who: NamedId; stage: RelationStage } | null = null;
    this.store.update('jual', (draft) => {
      outcome = resolveOrder(draft, this.catalog, plan, rng, waitedMinutes);
      applySale(draft, outcome);
      if (plan.namedId) {
        const up = applyNamedService(draft, plan.namedId, outcome.satisfaction, outcome.sold.map((l) => l.recipeId));
        if (up !== null) stageUp = { who: plan.namedId, stage: up };
      }
    });
    if (stageUp) this.onStory({ stageUp });
    return outcome;
  }

  customerWalkedAway(plan: CustomerPlan): void {
    this.store.update('pelanggan-pergi', (draft) => {
      applyWalkAway(draft, plan.wants);
      if (plan.namedId) applyNamedWalkAway(draft, plan.namedId);
    });
  }

  /** Jam permainan bergerak (dipanggil tiap menit permainan selama berjualan). */
  setClock(minutes: number): void {
    if (this.store.get().calendar.clockMinutes === minutes) return;
    this.store.update('jam', (draft) => {
      draft.calendar.clockMinutes = minutes;
    });
  }

  /** Selesai berjualan: tagih operasional, hitung popularitas, buat laporan, masuk fase evaluasi. */
  finishSelling(): DayReport | null {
    if (this.store.get().phase !== 'berjualan') return null;
    const res = this.run(
      'tutup',
      (draft) => {
        draft.phase = 'evaluasi';
        draft.calendar.clockMinutes = GAME_CONFIG.dayCycle.closeMinutes;
        return closeDay(draft, this.catalog);
      },
      () => '',
    );
    return res.ok ? res.value : null;
  }

  buyAd(adId: string): ActionResult<AdDef> {
    return this.run('pasang-iklan', (draft) => buyAd(draft, adId), (ad) => tr('{name} dipasang untuk hari ini ({cost}).', { name: ad.name, cost: formatRupiah(ad.cost) }));
  }

  cancelAd(adId: string): ActionResult<AdDef> {
    return this.run('batal-iklan', (draft) => cancelAd(draft, adId), (ad) => tr('{name} dibatalkan, uang dikembalikan.', { name: ad.name }));
  }

  /**
   * Lanjut ke hari berikutnya: buang stok yang kedaluwarsa, hari +1, kembali ke fase persiapan.
   * (Laporan keuangan lengkap & popularitas ditambahkan di Stage 4.)
   */
  startNextDay(): ActionResult<{ wastedProducts: number; wastedIngredients: number; wasteCost: number }> {
    return this.run(
      'hari-baru',
      (draft) => {
        if (draft.phase === 'berjualan') throw new GameRuleError('wrong-phase', tr('Tutup angkringan dulu sebelum ganti hari.'));
        const nextDay = draft.calendar.day + 1;
        const products = removeExpired(draft.inventory.products, nextDay);
        const ingredients = removeExpired(draft.inventory.ingredients, nextDay);
        const sum = (r: Record<string, { qty: number; cost: number }>, k: 'qty' | 'cost'): number => Object.values(r).reduce((s, v) => s + v[k], 0);
        draft.weather = weatherForDay(nextDay, draft.weather);
        draft.calendar.day = nextDay;
        draft.calendar.clockMinutes = GAME_CONFIG.dayCycle.openMinutes;
        draft.phase = 'persiapan';
        draft.ledger = createEmptyLedger(nextDay);
        draft.event = rollEvent(nextDay, draft.mapId, draft.unlockedRecipes, this.catalog);
        resetOnlineDay(draft);
        rollOnlineEvent(draft);
        return {
          wastedProducts: sum(products, 'qty'),
          wastedIngredients: sum(ingredients, 'qty'),
          wasteCost: Math.round(sum(products, 'cost') + sum(ingredients, 'cost')),
        };
      },
      (r) => tr('Hari {day} dimulai · {label}.{2}{3}', { day: this.store.get().calendar.day, label: WEATHER_EFFECTS[this.store.get().weather].label, 2: this.store.get().event ? tr(' Event: {name}!', { name: eventById(this.store.get().event!.id).name }) : '', 3: r.wastedProducts + r.wastedIngredients > 0 ? tr(' Stok basi dibuang (modal {wasteCost}).', { wasteCost: formatRupiah(r.wasteCost) }) : '' }),
    );
  }

  // ---------- pesanan online ----------

  /** Majukan pesanan online satu menit permainan (dipanggil saat berjualan). */
  onlineTick(minute: number): OnlineTickEvent[] {
    const st = this.store.get();
    if (st.phase !== 'berjualan' || !st.online.mode) return [];
    let events: OnlineTickEvent[] = [];
    this.store.update('online-menit', (draft) => {
      events = tickOnline(draft, this.catalog, minute);
    });
    return events;
  }

  acceptOnline(id: number, honorNote: boolean, source: OnlineSource = 'utama'): ActionResult<OnlineOrder> {
    return this.run(
      'online-terima',
      (draft) => ({ ...acceptOrder(draft, id, honorNote, source, this.catalog) }),
      (o) => (o.source != null ? tr('Pesanan {buyer} dikirim dari {1}.', { buyer: o.buyer, 1: this.store.get().branches.list.find((b) => b.slot === o.source)?.name ?? tr('cabang') }) : tr('Pesanan {buyer} diterima.', { buyer: o.buyer })),
    );
  }

  rejectOnline(id: number): ActionResult<void> {
    return this.run('online-tolak', (draft) => rejectOrder(draft, id), () => tr('Pesanan ditolak.'));
  }

  /** Kurir sendiri berangkat sekarang dengan pesanan yang sudah siap. */
  dispatchNow(): ActionResult<OnlineTickEvent[]> {
    return this.run('online-kirim', (draft) => {
      if (draft.phase !== 'berjualan') throw new GameRuleError('wrong-phase', tr('Kurir hanya mengantar saat berjualan.'));
      const ev = dispatchCourier(draft, this.catalog, draft.calendar.clockMinutes);
      if (!ev.length) throw new GameRuleError('online-nothing', tr('Belum ada pesanan yang siap diantar.'));
      return ev;
    }, (ev) => ev[ev.length - 1]?.message ?? '');
  }

  setDeliveryMode(mode: DeliveryMode): ActionResult<DeliveryMode> {
    return this.run('online-mode', (draft) => {
      setDeliveryMode(draft, mode);
      return mode;
    }, (m) => (m === 'kurir' ? tr('Kurir sendiri siap mengantar mulai hari ini.') : tr('Kemitraan ojol aktif. Pesanan online mulai masuk saat berjualan.')));
  }

  // ---------- Cabang (0.14.0) ----------
  openBranch(mapId: string): ActionResult<Branch> {
    return this.run('cabang-buka', (draft) => openBranch(draft, mapId), (b) => tr('{name} dibuka di {name2}! Rekrut karyawan dan kirim stok supaya bisa berjualan.', { name: b.name, name2: locationById(b.mapId).name }));
  }

  setBranchOpen(slot: number, open: boolean): ActionResult<Branch> {
    return this.run('cabang-status', (draft) => setBranchOpen(draft, slot, open), (b) => (b.open ? tr('{name} dibuka lagi.', { name: b.name }) : tr('{name} ditutup sementara — tanpa biaya operasional.', { name: b.name })));
  }

  moveBranch(slot: number, mapId: string): ActionResult<Branch> {
    return this.run('cabang-pindah', (draft) => moveBranch(draft, slot, mapId), (b) => tr('{name} pindah ke {name2}.', { name: b.name, name2: locationById(b.mapId).name }));
  }

  hireBranchStaff(slot: number, plan: WagePlanId): ActionResult<Branch> {
    return this.run('cabang-rekrut', (draft) => hireStaff(draft, slot, plan), (b) => tr('{name} mulai bekerja di {name2} (gaji {2}).', { name: b.staff!.name, name2: b.name, 2: wagePlanById(plan).name.toLowerCase() }));
  }

  changeBranchWage(slot: number, plan: WagePlanId): ActionResult<Branch> {
    return this.run('cabang-gaji', (draft) => changeWagePlan(draft, slot, plan), (b) => tr('Gaji karyawan {name} jadi {1}.', { name: b.name, 1: wagePlanById(plan).name.toLowerCase() }));
  }

  dismissBranchStaff(slot: number): ActionResult<Branch> {
    return this.run('cabang-berhentikan', (draft) => dismissStaff(draft, slot), (b) => tr('Karyawan {name} diberhentikan.', { name: b.name }));
  }

  shipToBranch(slot: number, items: Record<string, number>): ActionResult<{ qty: number; fee: number }> {
    return this.run('cabang-kirim', (draft) => shipToBranch(draft, this.catalog, slot, items), (r) => tr('{qty} porsi dikirim ke cabang{1}.', { qty: r.qty, 1: r.fee ? tr(' (ongkir {fee})', { fee: formatRupiah(r.fee) }) : tr(' (gratis ongkir)') }));
  }

  buyBranchUpgrade(slot: number, upgradeId: string): ActionResult<Branch> {
    return this.run('cabang-upgrade', (draft) => buyBranchUpgrade(draft, slot, upgradeId), (b) => tr('{name} terpasang di {name2}.', { name: branchUpgradeById(upgradeId).name, name2: b.name }));
  }

  markBranchHint(): void {
    if (this.store.get().branches.flags.hint) return;
    this.store.update('cabang-tanda', (draft) => {
      draft.branches.flags.hint = true;
    });
  }

  markOnlineFlag(flag: 'orderHint' | 'barHint'): void {
    if (this.store.get().online.flags[flag]) return;
    this.store.update('online-tanda', (draft) => {
      draft.online.flags[flag] = true;
    });
  }

  // ---------- cerita ----------

  /** Pelanggan bernama tiba (kabar yang dibawa masuk log). */
  storyArrive(visit: NamedVisit): void {
    this.store.update('cerita-tiba', (draft) => {
      namedArrived(draft, visit);
      allyArrived(draft, visit.who);
    });
  }

  // ---------- Tantangan kampung (0.18.0) ----------

  /** Pastikan rencana tantangan hari ini ada (mis. game dimuat di tengah berjualan dari save lama). */
  challengeStart(): ChallengeDay | null {
    if (this.store.get().phase !== 'berjualan') return null;
    let plan: ChallengeDay | null = null;
    this.store.update('tantangan-mulai', (draft) => {
      plan = startChallengeDay(draft);
    });
    return plan;
  }

  challengeCat(rng: SeededRandom): CatResult | null {
    let result: CatResult | null = null;
    try {
      this.store.update('tantangan-kucing', (draft) => {
        result = catArrives(draft, this.catalog, rng);
      });
    } catch {
      return null;
    }
    return result;
  }

  challengeArrive(kind: 'odgj' | 'ormas'): void {
    this.store.update('tantangan-datang', (draft) => markArrived(draft, kind));
  }

  odgjCalm(gifts: readonly string[], success: boolean): ActionResult<ChallengeLogEntry> {
    return this.run('odgj-halus', (draft) => (success ? odgjCalmed(draft, gifts) : odgjCalmFailed(draft, gifts)), () => '');
  }

  odgjNeighbors(success: boolean): ActionResult<ChallengeLogEntry> {
    return this.run('odgj-warga', (draft) => odgjNeighbors(draft, success), () => '');
  }

  odgjLeaves(): ChallengeLogEntry | null {
    let entry: ChallengeLogEntry | null = null;
    this.store.update('odgj-pergi', (draft) => {
      entry = odgjLeaves(draft);
    });
    return entry;
  }

  ormasPay(): ActionResult<ChallengeLogEntry> {
    return this.run('ormas-bayar', (draft) => ormasPay(draft), (e) => tr('Uang keamanan {cost} dibayar.', { cost: formatRupiah(e.cost) }));
  }

  /** Ormas dibiarkan menunggu terlalu lama: menagih sendiri 15–20% dari hasil kemarin. */
  ormasCollect(): ActionResult<ChallengeLogEntry> {
    return this.run('ormas-tagih', (draft) => ormasCollect(draft), () => '');
  }

  ormasDuel(won: boolean): ActionResult<ChallengeLogEntry> {
    return this.run('ormas-gertak', (draft) => ormasDuel(draft, won), () => '');
  }

  allyHandles(kind: 'odgj' | 'ormas'): ActionResult<ChallengeLogEntry> {
    return this.run('kenalan-tangani', (draft) => allyHandles(draft, kind), () => '');
  }

  /** Mode debug: jadwalkan ODGJ/ormas pada menit tertentu hari ini. */
  debugChallengeAt(kind: 'odgj' | 'ormas', minute: number): void {
    this.store.update('debug-tantangan', (draft) => {
      const t = startChallengeDay(draft);
      if (kind === 'odgj') t.odgj = { minute, status: 'menunggu' };
      else t.ormas = { minute, amount: ormasAmount(draft, 0.125), status: 'menunggu' };
    });
  }

  /** Mode debug: atur hati kenalan (0–5). */
  debugAllyHeart(id: string, heart: number): void {
    this.store.update('debug-hati', (draft) => {
      const a = (draft.challenges.allies[id] ??= { heart: 0, talks: 0, lastTalkDay: 0, lastVisitDay: 0 });
      a.heart = Math.max(0, Math.min(5, Math.round(heart)));
      a.lastTalkDay = 0;
    });
  }

  challengeHintSeen(): void {
    this.store.update('tantangan-tip', (draft) => {
      draft.challenges.flags.hint = true;
    });
  }

  allyTalk(id: string, guessedRight = false): ActionResult<number | null> {
    return this.run('kenalan-obrol', (draft) => allyTalk(draft, id, guessedRight), () => '');
  }

  /** Selesai mengobrol lewat gelembung. */
  storyTalk(who: NamedId, newsId: string | null): ActionResult<TalkResult> {
    const res = this.run('cerita-obrol', (draft) => applyTalk(draft, who, newsId), () => '');
    if (res.ok && res.value.stageUp !== null) this.onStory({ stageUp: { who, stage: res.value.stageUp } });
    return res;
  }

  /** Baca kabar dari log. Mengembalikan true jika kabar membuka keputusan. */
  readNews(id: string): ActionResult<boolean> {
    return this.run('cerita-baca', (draft) => readNews(draft, id), () => '');
  }

  chooseEnding(id: ChoiceId): ActionResult<ChoiceId> {
    return this.run('cerita-keputusan', (draft) => {
      applyChoice(draft, id);
      return id;
    }, () => tr('Keputusan sudah diambil. Kabar akhirnya akan sampai dalam beberapa hari.'));
  }

  markChapterSeen(id: number): void {
    if (this.store.get().story.chaptersSeen.includes(id)) return;
    this.store.update('cerita-bab', (draft) => markChapterSeen(draft, id));
  }

  markStoryFlag(flag: 'bubbleHint' | 'endingSeen'): void {
    this.store.update('cerita-tanda', (draft) => {
      if (flag === 'endingSeen') draft.story.endingSeen = true;
      else draft.story.flags.bubbleHint = true;
    });
  }

  /** Majukan tutorial sesuai state; `skip` melewatinya. */
  updateTutorial(skip = false): void {
    const s = this.store.get();
    if (s.tutorial >= TUTORIAL_DONE) return;
    const next = skip ? TUTORIAL_DONE : advanceTutorial(s);
    if (next !== s.tutorial) this.store.update('tutorial', (d) => {
      d.tutorial = next;
    });
  }

  discardIngredient(ingredientId: string, qty: number): ActionResult<DiscardResult> {
    return this.run(
      'buang-bahan',
      (draft) => discardIngredient(draft, this.catalog, ingredientId, qty),
      (r) => tr('{qty} {unit} {name} dibuang (modal {cost}).', { qty: r.qty, unit: this.catalog.ingredient(r.ingredientId).unit, name: this.catalog.ingredient(r.ingredientId).name, cost: formatRupiah(r.cost) }),
    );
  }

  buyUpgrade(id: string): ActionResult<UpgradeDef> {
    return this.run('beli-upgrade', (draft) => buyUpgrade(draft, id), (u) => tr('{name} terpasang! ({cost})', { name: u.name, cost: formatRupiah(u.cost) }));
  }

  setPrice(recipeId: string, price: number): ActionResult<number> {
    return this.run('atur-harga', (draft) => setPrice(draft, this.catalog.recipe(recipeId), price), (p) => tr('Harga {name} jadi {p}.', { name: this.catalog.recipe(recipeId).name, p: formatRupiah(p) }));
  }

  /** Harga khusus pesanan online (null = ikut harga di tempat). */
  setOnlinePrice(recipeId: string, price: number | null): ActionResult<number> {
    const name = this.catalog.recipe(recipeId).name;
    return this.run('harga-online', (draft) => setOnlinePrice(draft, this.catalog.recipe(recipeId), price), (p) => (price === null ? tr('Harga online {name} ikut harga di tempat.', { name }) : tr('Harga online {name} jadi {p}.', { name, p: formatRupiah(p) })));
  }

  /** Nyalakan / matikan pesanan online (pesanan yang sudah diterima tetap diantar). */
  setOnlineEnabled(enabled: boolean): ActionResult<boolean> {
    return this.run('online-sakelar', (draft) => {
      draft.online.enabled = enabled;
      if (!enabled) for (const o of draft.online.orders) if (o.status === 'menunggu') o.status = 'ditolak';
      return enabled;
    }, (on) => (on ? tr('Pesanan online dibuka.') : tr('Pesanan online ditutup sementara. Pesanan yang sudah diterima tetap diantar.')));
  }

  /** Periksa resep yang terbuka (dipanggil setelah memuat save). */
  syncUnlocks(): void {
    const preview = this.store.snapshot();
    if (refreshUnlocks(preview, this.catalog).length === 0) return;
    this.run('buka-resep', () => undefined, () => '');
  }
}
