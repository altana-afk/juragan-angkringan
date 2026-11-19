import { activeAnchors } from './MapData';
import type * as Phaser from 'phaser';
import type { GameContext } from '../core/GameContext';
import type { SimSpeed } from '../core/GameEvents';
import { CUSTOMER_TYPES } from '../data/customers';
import { SalesSimulation, SIM_CONFIG } from '../systems/SalesSimulation';
import type { UIManager } from '../ui/UIManager';
import { RiderLayer } from './RiderLayer';
import { CustomerLayer, type TalkMark } from './CustomerLayer';
import { canTalkToday, planVisits, talkContent } from '../systems/StorySystem';
import { closeDialogue, isDialogueOpen, openDialogue } from '../ui/DialoguePanel';
import type { Group } from '../systems/SalesSimulation';
import { getAudio } from '../scenes/sceneKeys';
import type { MapData } from './MapData';
import { tr } from '../i18n/i18n';
import { NAMED_CUSTOMERS, namedById } from '../data/story';
import { contactOnlineChance, favoriteRound, type PhoneContact } from '../systems/MinigameSystem';
import { openFavoriteQuiz } from '../ui/FavoriteQuiz';
import { formatRupiah } from '../utils/formatting';
import { ChallengeLayer } from './ChallengeLayer';
import { closeChallenge, isChallengeOpen, openChallenge, type ChallengeResult } from '../ui/ChallengePanel';
import {
  allyReady,
  allyTalkLines,
  canTalkAlly,
  describeLog,
  hasPetCat,
  odgjPresent,
  ormasPresent,
  planAllyVisits,
  tierOf,
  yesterdayRevenue,
} from '../systems/ChallengeEventSystem';
import { CHALLENGE_CONFIG, allyById, allyOfKind } from '../data/challenges';
import { totalQty } from '../systems/InventorySystem';
import { SeededRandom } from '../utils/random';
import type { ChallengeLogEntry } from '../core/GameState';

/**
 * Menghubungkan simulasi berjualan dengan scene: menjalankan jam sesuai kecepatan,
 * berhenti saat ada panel/menu terbuka (waktu tidak berjalan di menu), dan menggambar pelanggan.
 */
export class SalesController {
  private sim: SalesSimulation | null = null;
  private readonly layer: CustomerLayer;
  private readonly riders: RiderLayer;
  private readonly challenges: ChallengeLayer;
  /** Menit terakhir yang sudah diperiksa untuk tantangan. */
  private challengeMinute = -1;
  private ormasSince = -1;
  private rescuing = new Set<'odgj' | 'ormas'>();
  private speed: SimSpeed = 1;
  private readonly offs: (() => void)[] = [];
  private statusTimer = 0;
  private petTimer = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly ctx: GameContext,
    private readonly ui: UIManager,
    private readonly map: MapData,
  ) {
    this.layer = new CustomerLayer(scene, map, {
      mark: (group) => this.talkMark(group),
      onTap: (group) => this.talk(group),
    });
    this.riders = new RiderLayer(scene, map);
    this.challenges = new ChallengeLayer(scene, map, { onTapGuest: (kind) => this.openChallengePanel(kind) });
    this.challenges.syncPet(hasPetCat(ctx.store.get()));
    this.offs.push(
      ctx.bus.on('sales:set-speed', ({ speed }) => this.setSpeed(speed)),
      ctx.bus.on('sales:start-request', () => this.requestStart()),
    );
    window.addEventListener('keydown', this.onKey);
    // Permainan dimuat saat fase berjualan: lanjutkan dari jam tersimpan.
    if (ctx.store.get().phase === 'berjualan') this.createSim(ctx.store.get().calendar.clockMinutes);
  }

  get running(): boolean {
    return this.sim !== null;
  }

  private requestStart(): void {
    if (this.sim) return;
    const state = this.ctx.store.get();
    const products = Object.values(state.inventory.products).reduce((s, b) => s + b.reduce((n, x) => n + x.qty, 0), 0);
    const start = (): void => {
      const res = this.ctx.actions.startSelling();
      if (!res.ok) {
        this.ctx.notify(res.message, 'error');
        return;
      }
      this.ctx.notify(res.message, 'success');
      this.createSim(this.ctx.store.get().calendar.clockMinutes);
    };
    if (products === 0) {
      this.ui.openModal({
        title: tr('Belum ada yang dijual'),
        body: tr('Stok produk matang masih kosong. Pelanggan yang datang akan kecewa dan popularitas bisa turun. Tetap buka?'),
        actions: [{ label: tr('Siapkan dulu'), variant: 'primary', onClick: () => this.ctx.bus.emit('ui:open-panel', { panel: 'kitchen' }) }, { label: tr('Tetap buka'), variant: 'danger', onClick: start }],
      });
      return;
    }
    start();
  }

  private createSim(startMinutes: number): void {
    const anchors = this.map.customers;
    if (!anchors) {
      this.ctx.notify(tr('Peta ini tidak mendukung simulasi pelanggan.'), 'error');
      return;
    }
    const day = this.ctx.store.get().calendar.day;
    this.ctx.actions.challengeStart();
    const visits = [...planVisits(this.ctx.store.get()), ...planAllyVisits(this.ctx.store.get())].sort((a, b) => a.minute - b.minute);
    this.sim = new SalesSimulation(
      activeAnchors(anchors, this.ctx.store.get().upgrades),
      this.ctx.catalog,
      CUSTOMER_TYPES,
      {
        getState: () => this.ctx.store.get(),
        order: (plan, waited, rng) => this.ctx.actions.serveCustomer(plan, waited, rng),
        walkAway: (plan) => this.ctx.actions.customerWalkedAway(plan),
        setClock: (minutes) => this.ctx.actions.setClock(minutes),
      },
      { seed: `hari-${day}-${startMinutes}`, startMinutes, namedVisits: visits },
    );
    this.challengeMinute = Math.floor(startMinutes);
    this.restoreGuests();
    this.setSpeed(1);
  }

  setSpeed(speed: SimSpeed): void {
    this.speed = speed;
    this.ctx.bus.emit('sales:speed-changed', { speed });
  }

  private readonly onKey = (event: KeyboardEvent): void => {
    if (!this.sim || event.repeat || event.defaultPrevented) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [role="dialog"]') || !this.scene.scene.isActive()) return;
    if (event.key === ' ') this.setSpeed(this.speed === 0 ? 1 : 0);
    else if (event.key === '1' || event.key === '2' || event.key === '3') this.setSpeed(Number(event.key) as SimSpeed);
    else return;
    event.preventDefault();
  };

  update(deltaMs: number): void {
    // Kucing peliharaan terlihat sejak dibeli (juga saat persiapan).
    this.petTimer -= deltaMs;
    if (this.petTimer <= 0) {
      this.petTimer = 500;
      this.challenges.syncPet(hasPetCat(this.ctx.store.get()));
    }
    const sim = this.sim;
    if (!sim) return;
    // Waktu berhenti saat jeda atau saat panel/menu terbuka.
    if (this.speed > 0 && !this.ui.isTimeHeld()) {
      const minutes = (Math.min(deltaMs, 100) / 1000) * SIM_CONFIG.minutesPerSecond * this.speed;
      const events = sim.advance(minutes);
      this.tickOnline();
      this.tickChallenges();
      this.layer.handleEvents(events);
      for (const e of events) {
        if (e.type === 'named-arrive') this.namedArrived(e.visit);
        if (e.type === 'closed') this.ctx.notify(tr('Sudah jam tutup — pelanggan terakhir sedang dilayani.'), 'info');
        if (e.type === 'ended') this.end();
      }
    }
    const visibleDelta = this.speed > 0 && !this.ui.isTimeHeld() ? deltaMs : 0;
    this.layer.sync(this.sim?.groups ?? [], visibleDelta);
    // Motor ikut kecepatan permainan agar datang/pergi selaras dengan jadwal pesanan.
    this.riders.sync(this.ctx.store.get(), visibleDelta * Math.min(this.speed, 2));
    this.challenges.update(visibleDelta * Math.min(this.speed, 2));
    if (this.sim) this.checkRescue();
    this.statusTimer -= deltaMs;
    if (this.sim && this.statusTimer <= 0) {
      this.statusTimer = 250;
      this.ctx.bus.emit('sales:status', { seatsTaken: this.sim.seatsTaken, seatsTotal: this.sim.seatsTotal, groups: this.sim.groups.length });
    }
  }

  /** Pesanan online berjalan per menit permainan, mengikuti jam simulasi. */
  private onlineMinute = -1;
  private tickOnline(): void {
    const now = this.ctx.store.get().calendar.clockMinutes;
    if (this.onlineMinute < 0) this.onlineMinute = now - 1;
    for (let m = this.onlineMinute + 1; m <= now; m++) {
      for (const e of this.ctx.actions.onlineTick(m)) {
        if (e.kind === 'baru') {
          getAudio(this.scene)?.play('chime');
          // Pelankan ke 1× agar pemain sempat membaca pesanan sebelum waktunya habis.
          const slowed = this.speed > 1;
          if (slowed) this.setSpeed(1);
          this.ctx.notify(tr('📱 {message} Ketuk Pesanan untuk menjawab.{1}', { message: e.message, 1: slowed ? tr(' Kecepatan diturunkan ke 1×.') : '' }), 'info', 4000);
          if (!this.ctx.store.get().online.flags.orderHint) this.ctx.bus.emit('story:hint', { show: true, kind: 'order' });
        } else if (e.kind === 'batal') this.ctx.notify(tr('❌ {message}', { message: e.message }), 'error', 5000);
        else if (e.kind === 'kedaluwarsa') this.ctx.notify(tr('⌛ {message}', { message: e.message }), 'warning', 3500);
        else if (e.kind === 'berangkat') this.ctx.notify(tr('🛵 {message}', { message: e.message }), 'info', 3000);
        else if (e.kind === 'selesai' && e.order.late) this.ctx.notify(tr('🐢 {message} Rating turun.', { message: e.message }), 'warning', 3500);
      }
    }
    this.onlineMinute = now;
  }

  private talkMark(group: Group): TalkMark {
    if (!group.named || isDialogueOpen()) return null;
    const state = this.ctx.store.get();
    if (allyById(group.named.who)) return canTalkAlly(state, group.named.who) ? 'chat' : null;
    if (!canTalkToday(state, group.named.who)) return null;
    return talkContent(state, group.named.who).newsId ? 'news' : 'chat';
  }

  private namedArrived(visit: NonNullable<Group['named']>): void {
    this.ctx.actions.storyArrive(visit);
    if (!this.ctx.store.get().story.flags.bubbleHint) this.ctx.bus.emit('story:hint', { show: true });
  }

  /** Pemain mengetuk gelembung "...": buka panel dialog, lalu catat obrolannya. */
  private talk(group: Group): void {
    if (!group.named || isDialogueOpen() || this.ui.hasOpenModal() || isChallengeOpen()) return;
    const who = group.named.who;
    const ally = allyById(who);
    if (ally) {
      if (!canTalkAlly(this.ctx.store.get(), who)) return;
      getAudio(this.scene)?.play('click');
      openDialogue(this.ui, {
        who,
        lines: allyTalkLines(this.ctx.store.get(), ally),
        onDone: () => {
          const state = this.ctx.store.get();
          const round = favoriteRound(new SeededRandom(`kesukaan-${state.calendar.day}-${who}`), ally.favoriteHints, state.unlockedRecipes);
          const reward = (right: boolean): string => {
            const res = this.ctx.actions.allyTalk(who, right);
            const max = CHALLENGE_CONFIG.allies.maxHeart;
            if (!res.ok) return '';
            if (res.value === null) return tr('Hatinya sudah penuh.');
            if (res.value >= max) {
              const help = ally.kind === 'nakes' ? tr('Kalau ada ODGJ saat dia sedang makan, tim nakes yang menangani.') : tr('Kalau ormas datang saat dia sedang ngopi, polisi yang menangani.');
              this.ctx.notify(tr('❤️ {name} sudah akrab ({heart}/{max})! Sekarang dia mampir ke angkringanmu di lokasi mana pun. {help}', { name: ally.name, heart: res.value, max, help }), 'success', 7000);
            }
            return tr('❤️ {heart}/{max}', { heart: res.value, max });
          };
          // Menu kesukaannya belum terbuka: cukup mengobrol (hati +1).
          if (!round) {
            const text = reward(false);
            if (text) this.ctx.notify(tr('{name} {text}', { name: ally.name, text }), 'success', 3000);
            return;
          }
          openFavoriteQuiz(this.ui, { name: ally.name, round, recipeName: (id) => this.ctx.catalog.recipe(id).name, onAnswer: reward });
        },
      });
      return;
    }
    const content = talkContent(this.ctx.store.get(), who);
    this.ctx.bus.emit('story:hint', { show: false });
    getAudio(this.scene)?.play('click');
    openDialogue(this.ui, {
      who,
      title: content.title,
      lines: content.lines,
      onDone: () => {
        const res = this.ctx.actions.storyTalk(who, content.newsId);
        if (res.ok && res.value.opensDecision) {
          this.ctx.notify(tr('Saatnya mengambil keputusan. Buka Kabar Kampung → Keputusan setelah tutup.'), 'warning', 6000);
        }
      },
    });
  }

  // ---------- Tantangan kampung (0.18.0) ----------

  /** Game dimuat saat ODGJ/ormas sudah berdiri di dekat gerobak: tampilkan langsung. */
  private restoreGuests(): void {
    const state = this.ctx.store.get();
    if (odgjPresent(state)) this.challenges.guest('odgj', state.calendar.day, () => undefined, true);
    if (ormasPresent(state)) {
      this.ormasSince = state.calendar.clockMinutes;
      this.challenges.guest('ormas', state.calendar.day, () => undefined, true);
    }
  }

  private tickChallenges(): void {
    const state = this.ctx.store.get();
    const plan = state.challenges.today;
    const now = Math.floor(state.calendar.clockMinutes);
    if (!plan || plan.day !== state.calendar.day) return;
    for (let m = this.challengeMinute + 1; m <= now; m++) {
      plan.cats.forEach((minute, i) => {
        if (minute === m) this.spawnCat(i);
      });
      if (plan.odgj?.status === 'menunggu' && plan.odgj.minute === m && !this.challenges.hasGuest('odgj')) {
        this.challenges.guest('odgj', state.calendar.day, () => {
          this.ctx.actions.challengeArrive('odgj');
          if (this.sim) this.layer.handleEvents(this.sim.scare(CHALLENGE_CONFIG.odgj.fleeChance));
          this.alert(tr('🧍 Ada ODGJ berdiri di dekat gerobak. Beberapa pelanggan menjauh. Ketuk balon "!!!" untuk menanganinya.'));
        });
      }
      if (plan.ormas?.status === 'menunggu' && plan.ormas.minute === m && !this.challenges.hasGuest('ormas')) {
        this.challenges.guest('ormas', state.calendar.day + 1, () => {
          this.ctx.actions.challengeArrive('ormas');
          this.ormasSince = this.ctx.store.get().calendar.clockMinutes;
          this.alert(tr('🧥 Ormas datang meminta uang keamanan. Ketuk balon "!!!" untuk menjawab.'));
        });
      }
    }
    this.challengeMinute = now;
    // ODGJ pergi sendiri jam 22.00.
    if (odgjPresent(state) && now >= CHALLENGE_CONFIG.odgj.untilMinute && !this.rescuing.has('odgj') && !isChallengeOpen()) {
      const entry = this.ctx.actions.odgjLeaves();
      this.challenges.dismiss('odgj');
      if (entry) this.ctx.notify(this.logText(entry), 'info', 3500);
    }
    // Ormas yang dibiarkan terlalu lama mengambil uangnya sendiri.
    if (ormasPresent(state) && this.ormasSince >= 0 && now - this.ormasSince >= CHALLENGE_CONFIG.ormas.patienceMinutes && !this.rescuing.has('ormas') && !isChallengeOpen()) {
      const res = this.ctx.actions.ormasPay();
      this.challenges.dismiss('ormas');
      if (res.ok) this.ctx.notify(tr('🧥 Ormas menunggu terlalu lama dan menagih {cost}.', { cost: formatRupiah(res.value.cost) }), 'warning', 5000);
    }
  }

  private spawnCat(i: number): void {
    const day = this.ctx.store.get().calendar.day;
    this.challenges.cat(day + i, () => {
      const res = this.ctx.actions.challengeCat(new SeededRandom(`kucing-${day}-${i}`));
      if (!res) return { blocked: false, taken: 0 };
      const taken = Object.values(res.taken).reduce((n, q) => n + q, 0);
      const entry = this.ctx.store.get().challenges.today?.log.at(-1);
      if (entry) this.ctx.notify(this.logText(entry), res.blocked ? 'success' : taken ? 'warning' : 'info', 3500);
      if (!res.blocked && taken && !hasPetCat(this.ctx.store.get())) this.firstHint(tr('Tip: beli upgrade "Pelihara kucing" supaya kucing liar tidak berani mencuri.'));
      return { blocked: res.blocked, taken };
    });
  }

  /**
   * Mode debug (?debug): munculkan tantangan atau kenalan sekarang juga, tanpa menunggu jadwal.
   * Mengembalikan pesan untuk ditampilkan.
   */
  debugChallenge(kind: 'kucing' | 'odgj' | 'ormas' | 'ratna' | 'bram'): string {
    const sim = this.sim;
    if (!sim) return tr('Mulai berjualan dulu, lalu coba lagi.');
    this.ctx.actions.challengeStart();
    const state = this.ctx.store.get();
    const now = Math.floor(state.calendar.clockMinutes);
    if (kind === 'kucing') {
      this.spawnCat(Math.floor(Math.random() * 1000) + 10);
      return tr('Kucing liar sedang menuju gerobak.');
    }
    if (kind === 'odgj' || kind === 'ormas') {
      if (this.challenges.hasGuest(kind) || (kind === 'odgj' ? odgjPresent(state) : ormasPresent(state))) return tr('Tamu itu sudah ada di dekat gerobak.');
      this.ctx.actions.debugChallengeAt(kind, now + 1);
      return kind === 'odgj' ? tr('ODGJ sedang berjalan ke gerobak.') : tr('Ormas sedang berjalan ke gerobak.');
    }
    const ally = allyById(kind);
    if (!ally) return '';
    if (sim.hasNamedGroup(ally.id)) return tr('{name} sudah ada di angkringan.', { name: ally.name });
    sim.addNamedVisit({ who: ally.id, minute: now + 1, newsId: null });
    return tr('{name} sedang berjalan ke angkringan.', { name: ally.name });
  }

  /** Mode debug: panggil pelanggan bernama cerita sekarang juga. */
  debugCallNamed(who: string): string {
    const sim = this.sim;
    if (!sim) return tr('Mulai berjualan dulu, lalu coba lagi.');
    const name = namedById(who).name;
    if (sim.hasNamedGroup(who)) return tr('{name} sudah ada di angkringan.', { name });
    sim.addNamedVisit({ who, minute: Math.floor(this.ctx.store.get().calendar.clockMinutes) + 1, newsId: null });
    return tr('{name} sedang berjalan ke angkringan.', { name });
  }

  /** Kenalan berhati penuh yang sedang makan menangani tamu (minigame dilewati). */
  private checkRescue(): void {
    const sim = this.sim;
    if (!sim || isChallengeOpen()) return;
    const state = this.ctx.store.get();
    const pairs: ['odgj' | 'ormas', 'nakes' | 'polisi', boolean][] = [
      ['odgj', 'nakes', odgjPresent(state)],
      ['ormas', 'polisi', ormasPresent(state)],
    ];
    for (const [kind, allyKind, present] of pairs) {
      if (!present || this.rescuing.has(kind) || !allyReady(state, allyKind)) continue;
      const ally = allyOfKind(allyKind);
      if (!sim.seatedNamed(ally.id)) continue;
      this.rescuing.add(kind);
      this.ctx.notify(
        kind === 'odgj' ? tr('🚑 {name} melihatnya dan memanggil ambulans RSJ.', { name: ally.name }) : tr('🚓 {name} berdiri dan memanggil mobil patroli.', { name: ally.name }),
        'success',
        4000,
      );
      this.challenges.rescue(kind, () => {
        this.rescuing.delete(kind);
        const res = this.ctx.actions.allyHandles(kind);
        if (res.ok) this.ctx.notify(this.logText(res.value), 'success', 3500);
      });
    }
  }

  private alert(message: string): void {
    getAudio(this.scene)?.play('chime');
    const slowed = this.speed > 1;
    if (slowed) this.setSpeed(1);
    this.ctx.notify(message, 'warning', 5000);
  }

  private firstHint(message: string): void {
    if (this.ctx.store.get().challenges.flags.hint) return;
    this.ctx.actions.challengeHintSeen();
    this.ctx.notify(message, 'info', 6000);
  }

  private logText(entry: ChallengeLogEntry): string {
    return describeLog(entry, (id) => this.ctx.catalog.recipe(id).name);
  }

  /** Porsi yang bisa diberikan, memperhitungkan yang sudah dipilih di minigame. */
  private giftFor(kind: 'minum' | 'makan', exclude: readonly string[]): string | null {
    const state = this.ctx.store.get();
    const warm = kind === 'minum' ? ['teh_hangat', 'wedang_jahe', 'susu_jahe', 'kopi_panas', 'teh_tarik'] : ['nasi_kucing', 'sego_bakar', 'nasi_goreng', 'mi_rebus', 'mi_goreng', 'roti_bakar'];
    const left = (id: string): number => totalQty(state.inventory.products[id]) - exclude.filter((x) => x === id).length;
    const pick = warm.find((id) => left(id) > 0);
    if (pick) return pick;
    return Object.keys(state.inventory.products).find((id) => left(id) > 0 && (this.ctx.catalog.recipe(id).category === 'minuman') === (kind === 'minum')) ?? null;
  }

  private openChallengePanel(kind: 'odgj' | 'ormas'): void {
    const state = this.ctx.store.get();
    if (isChallengeOpen() || isDialogueOpen() || this.ui.hasOpenModal() || this.rescuing.has(kind)) return;
    if (kind === 'odgj' ? !odgjPresent(state) : !ormasPresent(state)) return;
    getAudio(this.scene)?.play('click');
    const amount = state.challenges.today?.ormas?.amount ?? 0;
    const base = yesterdayRevenue(state);
    openChallenge(this.ui, {
      kind,
      tier: tierOf(state),
      amount,
      percent: base > 0 ? Math.round((amount / base) * 100) : 10,
      seed: `minigame-${state.calendar.day}-${kind}-${state.challenges.today?.log.length ?? 0}`,
      giftFor: (k, exclude) => this.giftFor(k, exclude),
      giftName: (id) => this.ctx.catalog.recipe(id).name,
      contacts: this.phoneContacts(),
      crowd: this.crowdHere(),
      audio: getAudio(this.scene),
      onResolve: (result) => this.resolveChallenge(result),
    });
    // Panel muncul di bawah adegan: pastikan tamu dan petunjuk di atas kepalanya tetap terlihat.
    requestAnimationFrame(() => {
      const panel = document.querySelector('.challenge-panel');
      const canvas = this.scene.game.canvas.getBoundingClientRect();
      if (panel) this.challenges.focusGuest(kind, panel.getBoundingClientRect().top - canvas.top);
    });
  }

  /** Kontak untuk Telepon berantai: tokoh kampung (peluang online naik dengan tahap hubungan) + RT & puskesmas. */
  private phoneContacts(): PhoneContact[] {
    const state = this.ctx.store.get();
    const stage = (id: string): number => state.story.relations[id]?.stage ?? 0;
    const list: PhoneContact[] = NAMED_CUSTOMERS.filter((c) => c.id !== 'hendra').map((c) => ({ id: c.id, name: c.name, onlineChance: contactOnlineChance(stage(c.id)) }));
    list.push({ id: 'rt', name: tr('Pak RT'), onlineChance: contactOnlineChance(1) });
    const nakes = allyOfKind('nakes');
    const heart = state.challenges.allies[nakes.id]?.heart ?? 0;
    list.push(heart >= 3 ? { id: nakes.id, name: nakes.name, onlineChance: contactOnlineChance(3) } : { id: 'puskesmas', name: tr('Puskesmas'), onlineChance: contactOnlineChance(0) });
    return list.slice(0, 6);
  }

  /** Pelanggan bernama (cerita) yang sedang ada di angkringan, dengan tahap hubungannya. */
  private crowdHere(): { name: string; stage: number }[] {
    const sim = this.sim;
    if (!sim) return [];
    const state = this.ctx.store.get();
    const seen = new Set<string>();
    const out: { name: string; stage: number }[] = [];
    for (const c of NAMED_CUSTOMERS) {
      if (c.id === 'hendra' || seen.has(c.id) || !sim.hasNamedGroup(c.id)) continue;
      seen.add(c.id);
      out.push({ name: c.name, stage: state.story.relations[c.id]?.stage ?? 0 });
    }
    return out;
  }

  private resolveChallenge(result: ChallengeResult): string {
    const scare = (chance: number, seated: boolean): void => {
      if (this.sim) this.layer.handleEvents(this.sim.scare(chance, seated));
    };
    let entry: ChallengeLogEntry | null = null;
    if (result.kind === 'odgj' && result.method === 'halus') {
      const res = this.ctx.actions.odgjCalm(result.gifts, result.success);
      entry = res.ok ? res.value : null;
      if (result.success) this.challenges.dismiss('odgj');
      else scare(CHALLENGE_CONFIG.odgj.failFleeChance, false);
    } else if (result.kind === 'odgj') {
      const res = this.ctx.actions.odgjNeighbors(result.success);
      entry = res.ok ? res.value : null;
      if (result.success) this.challenges.dismiss('odgj', true);
      else scare(CHALLENGE_CONFIG.odgj.failFleeChance, true);
    } else if (result.method === 'bayar') {
      const res = this.ctx.actions.ormasPay();
      entry = res.ok ? res.value : null;
      this.challenges.dismiss('ormas');
    } else {
      const res = this.ctx.actions.ormasDuel(result.won);
      entry = res.ok ? res.value : null;
      this.challenges.dismiss('ormas');
    }
    if (!entry) return tr('Kejadian ini sudah selesai.');
    const line = this.logText(entry);
    if (entry.cost > 0) return tr('{line}: {cost}.', { line, cost: formatRupiah(entry.cost) });
    if (result.kind === 'odgj' && !result.success) return tr('{line}. Dia masih di dekat gerobak. Coba lagi dengan mengetuk balon "!!!".', { line });
    return `${line}.`;
  }

  private end(): void {
    this.sim = null;
    closeChallenge();
    this.challenges.clear();
    this.rescuing.clear();
    this.layer.clear();
    this.riders.clear();
    this.ctx.actions.finishSelling();
    this.ctx.bus.emit('sales:ended');
  }

  destroy(): void {
    for (const off of this.offs) off();
    window.removeEventListener('keydown', this.onKey);
    closeDialogue();
    closeChallenge();
    this.challenges.destroy();
    this.layer.clear();
    this.riders.clear();
    this.sim = null;
  }
}

