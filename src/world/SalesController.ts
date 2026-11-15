import { activeAnchors } from './MapData';
import type * as Phaser from 'phaser';
import type { GameContext } from '../core/GameContext';
import type { SimSpeed } from '../core/GameEvents';
import { CUSTOMER_TYPES } from '../data/customers';
import { SalesSimulation, SIM_CONFIG } from '../systems/SalesSimulation';
import type { UIManager } from '../ui/UIManager';
import { CustomerLayer, type TalkMark } from './CustomerLayer';
import { canTalkToday, planVisits, talkContent } from '../systems/StorySystem';
import { closeDialogue, isDialogueOpen, openDialogue } from '../ui/DialoguePanel';
import type { Group } from '../systems/SalesSimulation';
import { getAudio } from '../scenes/sceneKeys';
import type { MapData } from './MapData';

/**
 * Menghubungkan simulasi berjualan dengan scene: menjalankan jam sesuai kecepatan,
 * berhenti saat ada panel/menu terbuka (waktu tidak berjalan di menu), dan menggambar pelanggan.
 */
export class SalesController {
  private sim: SalesSimulation | null = null;
  private readonly layer: CustomerLayer;
  private speed: SimSpeed = 1;
  private readonly offs: (() => void)[] = [];
  private statusTimer = 0;

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
        title: 'Belum ada yang dijual',
        body: 'Stok produk matang masih kosong. Pelanggan yang datang akan kecewa dan popularitas bisa turun. Tetap buka?',
        actions: [{ label: 'Siapkan dulu', variant: 'primary', onClick: () => this.ctx.bus.emit('ui:open-panel', { panel: 'kitchen' }) }, { label: 'Tetap buka', variant: 'danger', onClick: start }],
      });
      return;
    }
    start();
  }

  private createSim(startMinutes: number): void {
    const anchors = this.map.customers;
    if (!anchors) {
      this.ctx.notify('Peta ini tidak mendukung simulasi pelanggan.', 'error');
      return;
    }
    const day = this.ctx.store.get().calendar.day;
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
      { seed: `hari-${day}-${startMinutes}`, startMinutes, namedVisits: planVisits(this.ctx.store.get()) },
    );
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
    const sim = this.sim;
    if (!sim) return;
    // Waktu berhenti saat jeda atau saat panel/menu terbuka.
    if (this.speed > 0 && !this.ui.isTimeHeld()) {
      const minutes = (Math.min(deltaMs, 100) / 1000) * SIM_CONFIG.minutesPerSecond * this.speed;
      const events = sim.advance(minutes);
      this.layer.handleEvents(events);
      for (const e of events) {
        if (e.type === 'named-arrive') this.namedArrived(e.visit);
        if (e.type === 'closed') this.ctx.notify('Sudah jam tutup — pelanggan terakhir sedang dilayani.', 'info');
        if (e.type === 'ended') this.end();
      }
    }
    this.layer.sync(this.sim?.groups ?? [], this.speed > 0 && !this.ui.isTimeHeld() ? deltaMs : 0);
    this.statusTimer -= deltaMs;
    if (this.sim && this.statusTimer <= 0) {
      this.statusTimer = 250;
      this.ctx.bus.emit('sales:status', { seatsTaken: this.sim.seatsTaken, seatsTotal: this.sim.seatsTotal, groups: this.sim.groups.length });
    }
  }

  private talkMark(group: Group): TalkMark {
    if (!group.named || isDialogueOpen()) return null;
    const state = this.ctx.store.get();
    if (!canTalkToday(state, group.named.who)) return null;
    return talkContent(state, group.named.who).newsId ? 'news' : 'chat';
  }

  private namedArrived(visit: NonNullable<Group['named']>): void {
    this.ctx.actions.storyArrive(visit);
    if (!this.ctx.store.get().story.flags.bubbleHint) this.ctx.bus.emit('story:hint', { show: true });
  }

  /** Pemain mengetuk gelembung "...": buka panel dialog, lalu catat obrolannya. */
  private talk(group: Group): void {
    if (!group.named || isDialogueOpen() || this.ui.hasOpenModal()) return;
    const who = group.named.who;
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
          this.ctx.notify('Saatnya mengambil keputusan. Buka Kabar Kampung → Keputusan setelah tutup.', 'warning', 6000);
        }
      },
    });
  }

  private end(): void {
    this.sim = null;
    this.layer.clear();
    this.ctx.actions.finishSelling();
    this.ctx.bus.emit('sales:ended');
  }

  destroy(): void {
    for (const off of this.offs) off();
    window.removeEventListener('keydown', this.onKey);
    closeDialogue();
    this.layer.clear();
    this.sim = null;
  }
}

