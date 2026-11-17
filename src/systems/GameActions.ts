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
        if (draft.bankrupt) throw new GameRuleError('bankrupt', 'Usaha sudah bangkrut. Mulai permainan baru.');
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
    }, (q) => `Belanja ${q.lines.length} bahan seharga ${formatRupiah(q.total)} berhasil.`);
  }

  prepare(orders: readonly CookOrder[]): ActionResult<CookResult> {
    return this.run('masak', (draft) => prepareProducts(draft, this.catalog, orders), (r) => `${r.totalPortions} porsi siap dijual.`);
  }

  /** Mulai fase berjualan: jam diset ke jam buka. */
  startSelling(): ActionResult<{ products: number; bulk: BulkResult | null }> {
    return this.run(
      'mulai-jualan',
      (draft) => {
        if (draft.phase !== 'persiapan') throw new GameRuleError('wrong-phase', 'Angkringan sudah buka.');
        draft.phase = 'berjualan';
        draft.calendar.clockMinutes = GAME_CONFIG.dayCycle.openMinutes;
        // Pesanan borongan event diambil saat buka.
        const bulk = deliverBulkOrder(draft);
        return { products: Object.values(draft.inventory.products).reduce((s, b) => s + totalQty(b), 0), bulk };
      },
      (r) => {
        const base = 'Angkringan buka! Pelanggan mulai berdatangan.';
        if (!r.bulk) return base;
        const name = this.catalog.recipe(this.store.get().event?.bulk?.recipeId ?? '').name;
        return r.bulk.delivered
          ? `${base} Pesanan borongan ${r.bulk.qty} ${name} terkirim (+${formatRupiah(r.bulk.revenue)}).`
          : `${base} Pesanan borongan ${r.bulk.qty} ${name} batal — stok hanya ${r.bulk.have}.`;
      },
    );
  }

  moveLocation(locationId: string): ActionResult<LocationDef> {
    return this.run(
      'pindah-lokasi',
      (d) => moveLocation(d, this.catalog, locationId),
      (loc) => `Gerobak pindah ke ${loc.name} (biaya ${formatRupiah(loc.moveCost)}).${this.store.get().event ? ` Event di sini: ${eventById(this.store.get().event!.id).name}.` : ''}`,
    );
  }

  depositMoney(amount: number, term: number): ActionResult<number> {
    return this.run('bank-deposito', (d) => openDeposit(d, amount, term), () => `Deposito ${formatRupiah(amount)} tempo ${term / 7} minggu dibuka.`);
  }

  withdrawDeposit(id: number): ActionResult<number> {
    return this.run('bank-tarik', (d) => withdrawDeposit(d, id), (t) => `Deposito dicairkan: ${formatRupiah(t)} masuk ke kas.`);
  }

  borrow(amount: number, term: number): ActionResult<void> {
    return this.run('bank-pinjam', (d) => takeLoan(d, amount, term), () => `Pinjaman ${formatRupiah(amount)} cair ke kas.`);
  }

  repayLoan(amount: number): ActionResult<number> {
    return this.run('bank-bayar', (d) => repayLoan(d, amount), (p) => (this.store.get().bank.loan ? `Cicilan ${formatRupiah(p)} dibayar.` : `Pinjaman lunas! (${formatRupiah(p)})`));
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
    return this.run('pasang-iklan', (draft) => buyAd(draft, adId), (ad) => `${ad.name} dipasang untuk hari ini (${formatRupiah(ad.cost)}).`);
  }

  cancelAd(adId: string): ActionResult<AdDef> {
    return this.run('batal-iklan', (draft) => cancelAd(draft, adId), (ad) => `${ad.name} dibatalkan, uang dikembalikan.`);
  }

  /**
   * Lanjut ke hari berikutnya: buang stok yang kedaluwarsa, hari +1, kembali ke fase persiapan.
   * (Laporan keuangan lengkap & popularitas ditambahkan di Stage 4.)
   */
  startNextDay(): ActionResult<{ wastedProducts: number; wastedIngredients: number; wasteCost: number }> {
    return this.run(
      'hari-baru',
      (draft) => {
        if (draft.phase === 'berjualan') throw new GameRuleError('wrong-phase', 'Tutup angkringan dulu sebelum ganti hari.');
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
      (r) => `Hari ${this.store.get().calendar.day} dimulai · ${WEATHER_EFFECTS[this.store.get().weather].label}.${this.store.get().event ? ` Event: ${eventById(this.store.get().event!.id).name}!` : ''}${r.wastedProducts + r.wastedIngredients > 0 ? ` Stok basi dibuang (modal ${formatRupiah(r.wasteCost)}).` : ''}`,
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
      (o) => (o.source != null ? `Pesanan ${o.buyer} dikirim dari ${this.store.get().branches.list.find((b) => b.slot === o.source)?.name ?? 'cabang'}.` : `Pesanan ${o.buyer} diterima.`),
    );
  }

  rejectOnline(id: number): ActionResult<void> {
    return this.run('online-tolak', (draft) => rejectOrder(draft, id), () => 'Pesanan ditolak.');
  }

  /** Kurir sendiri berangkat sekarang dengan pesanan yang sudah siap. */
  dispatchNow(): ActionResult<OnlineTickEvent[]> {
    return this.run('online-kirim', (draft) => {
      if (draft.phase !== 'berjualan') throw new GameRuleError('wrong-phase', 'Kurir hanya mengantar saat berjualan.');
      const ev = dispatchCourier(draft, this.catalog, draft.calendar.clockMinutes);
      if (!ev.length) throw new GameRuleError('online-nothing', 'Belum ada pesanan yang siap diantar.');
      return ev;
    }, (ev) => ev[ev.length - 1]?.message ?? '');
  }

  setDeliveryMode(mode: DeliveryMode): ActionResult<DeliveryMode> {
    return this.run('online-mode', (draft) => {
      setDeliveryMode(draft, mode);
      return mode;
    }, (m) => (m === 'kurir' ? 'Kurir sendiri siap mengantar mulai hari ini.' : 'Kemitraan ojol aktif. Pesanan online mulai masuk saat berjualan.'));
  }

  // ---------- Cabang (0.14.0) ----------
  openBranch(mapId: string): ActionResult<Branch> {
    return this.run('cabang-buka', (draft) => openBranch(draft, mapId), (b) => `${b.name} dibuka di ${locationById(b.mapId).name}! Rekrut karyawan dan kirim stok supaya bisa berjualan.`);
  }

  setBranchOpen(slot: number, open: boolean): ActionResult<Branch> {
    return this.run('cabang-status', (draft) => setBranchOpen(draft, slot, open), (b) => (b.open ? `${b.name} dibuka lagi.` : `${b.name} ditutup sementara — tanpa biaya operasional.`));
  }

  moveBranch(slot: number, mapId: string): ActionResult<Branch> {
    return this.run('cabang-pindah', (draft) => moveBranch(draft, slot, mapId), (b) => `${b.name} pindah ke ${locationById(b.mapId).name}.`);
  }

  hireBranchStaff(slot: number, plan: WagePlanId): ActionResult<Branch> {
    return this.run('cabang-rekrut', (draft) => hireStaff(draft, slot, plan), (b) => `${b.staff!.name} mulai bekerja di ${b.name} (gaji ${wagePlanById(plan).name.toLowerCase()}).`);
  }

  changeBranchWage(slot: number, plan: WagePlanId): ActionResult<Branch> {
    return this.run('cabang-gaji', (draft) => changeWagePlan(draft, slot, plan), (b) => `Gaji karyawan ${b.name} jadi ${wagePlanById(plan).name.toLowerCase()}.`);
  }

  dismissBranchStaff(slot: number): ActionResult<Branch> {
    return this.run('cabang-berhentikan', (draft) => dismissStaff(draft, slot), (b) => `Karyawan ${b.name} diberhentikan.`);
  }

  shipToBranch(slot: number, items: Record<string, number>): ActionResult<{ qty: number; fee: number }> {
    return this.run('cabang-kirim', (draft) => shipToBranch(draft, this.catalog, slot, items), (r) => `${r.qty} porsi dikirim ke cabang${r.fee ? ` (ongkir ${formatRupiah(r.fee)})` : ' (gratis ongkir)'}.`);
  }

  buyBranchUpgrade(slot: number, upgradeId: string): ActionResult<Branch> {
    return this.run('cabang-upgrade', (draft) => buyBranchUpgrade(draft, slot, upgradeId), (b) => `${branchUpgradeById(upgradeId).name} terpasang di ${b.name}.`);
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
    this.store.update('cerita-tiba', (draft) => namedArrived(draft, visit));
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
    }, () => 'Keputusan sudah diambil. Kabar akhirnya akan sampai dalam beberapa hari.');
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
      (r) => `${r.qty} ${this.catalog.ingredient(r.ingredientId).unit} ${this.catalog.ingredient(r.ingredientId).name} dibuang (modal ${formatRupiah(r.cost)}).`,
    );
  }

  buyUpgrade(id: string): ActionResult<UpgradeDef> {
    return this.run('beli-upgrade', (draft) => buyUpgrade(draft, id), (u) => `${u.name} terpasang! (${formatRupiah(u.cost)})`);
  }

  setPrice(recipeId: string, price: number): ActionResult<number> {
    return this.run('atur-harga', (draft) => setPrice(draft, this.catalog.recipe(recipeId), price), (p) => `Harga ${this.catalog.recipe(recipeId).name} jadi ${formatRupiah(p)}.`);
  }

  /** Harga khusus pesanan online (null = ikut harga di tempat). */
  setOnlinePrice(recipeId: string, price: number | null): ActionResult<number> {
    const name = this.catalog.recipe(recipeId).name;
    return this.run('harga-online', (draft) => setOnlinePrice(draft, this.catalog.recipe(recipeId), price), (p) => (price === null ? `Harga online ${name} ikut harga di tempat.` : `Harga online ${name} jadi ${formatRupiah(p)}.`));
  }

  /** Nyalakan / matikan pesanan online (pesanan yang sudah diterima tetap diantar). */
  setOnlineEnabled(enabled: boolean): ActionResult<boolean> {
    return this.run('online-sakelar', (draft) => {
      draft.online.enabled = enabled;
      if (!enabled) for (const o of draft.online.orders) if (o.status === 'menunggu') o.status = 'ditolak';
      return enabled;
    }, (on) => (on ? 'Pesanan online dibuka.' : 'Pesanan online ditutup sementara. Pesanan yang sudah diterima tetap diantar.'));
  }

  /** Periksa resep yang terbuka (dipanggil setelah memuat save). */
  syncUnlocks(): void {
    const preview = this.store.snapshot();
    if (refreshUnlocks(preview, this.catalog).length === 0) return;
    this.run('buka-resep', () => undefined, () => '');
  }
}
