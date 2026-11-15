import { LocationPanel } from '../ui/LocationPanel';
import type { PanelId } from '../core/GameEvents';
import { BankPanel } from '../ui/BankPanel';
import { showAchievements } from '../ui/AchievementsPanel';
import { showEventInfo } from '../ui/EventInfo';
import { openGuide } from '../ui/GuidePanel';
import { openStoryPanel, type StoryTab } from '../ui/StoryPanel';
import { openDialogue } from '../ui/DialoguePanel';
import { CHAPTERS, endingById, namedById } from '../data/story';
import type { StoryNotice } from '../systems/GameActions';
import { StockBoard } from '../ui/StockBoard';
import { StoragePanel } from '../ui/StoragePanel';
import { TutorialCoach } from '../ui/TutorialCoach';
import { tileToWorld } from '../iso/IsoMath';
import { FX_KEYS } from '../graphics/art/effects';
import { DEPTH } from '../world/depth';
import { showDayCard } from '../ui/DayCard';
import * as Phaser from 'phaser';
import { GAME_CONFIG, isDebugMode } from '../config/gameConfig';
import type { GameContext } from '../core/GameContext';
import { MAX_CLOCK_MINUTES } from '../core/GameState';
import { ActionBar } from '../ui/ActionBar';
import { showDaySummary } from '../ui/DaySummary';
import { PromoPanel } from '../ui/PromoPanel';
import { UpgradePanel } from '../ui/UpgradePanel';
import { showBankrupt } from '../ui/Bankrupt';
import { WeatherFx } from '../world/WeatherFx';
import { showStats } from '../ui/StatsPanel';
import { SalesController } from '../world/SalesController';
import { CameraControls } from '../ui/CameraControls';
import { KitchenPanel } from '../ui/KitchenPanel';
import { ShopPanel } from '../ui/ShopPanel';
import { el, type UIComponent } from '../ui/dom';
import { HUD } from '../ui/HUD';
import { PauseMenu } from '../ui/PauseMenu';
import { formatDateLong } from '../utils/calendar';
import { formatClock } from '../utils/formatting';
import { CameraController, isTypingTarget } from '../world/CameraController';
import { LightingSystem } from '../world/LightingSystem';
import { getMap } from '../world/maps';
import { terrainAt } from '../world/MapData';
import { buildWorld, type WorldView } from '../world/WorldBuilder';
import { getAudio, getContext, getUI, SCENES } from './sceneKeys';

/**
 * Scene utama permainan: dunia angkringan isometrik + HUD.
 * Stage 2+ akan menambahkan panel belanja, dapur, simulasi pelanggan, dll. di sini.
 */
export class AngkringanScene extends Phaser.Scene {
  private ctx!: GameContext;
  private world!: WorldView;
  private lighting!: LightingSystem;
  private cameraController!: CameraController;
  private components: UIComponent[] = [];
  private unsubscribers: (() => void)[] = [];
  private debugPanel: HTMLElement | null = null;
  private hoveredTile: { x: number; y: number } | null = null;
  private sales: SalesController | null = null;
  private weather: WeatherFx | null = null;
  private bankruptShown = false;

  constructor() {
    super(SCENES.angkringan);
  }

  create(data?: { rebuilt?: { scrollX: number; scrollY: number; zoom: number }; reopen?: PanelId; moved?: boolean }): void {
    this.ctx = getContext(this);
    const rebuilt = data?.rebuilt;
    // Phaser menyimpan data start terakhir; kosongkan agar mulai berikutnya (dari menu) tidak dianggap rebuild.
    this.sys.settings.data = {};
    this.bankruptShown = false;
    const ui = getUI(this);
    const state = this.ctx.store.get();

    this.world = buildWorld(this, getMap(this.ctx.store.get().mapId), getContext(this).store.get().upgrades);
    this.lighting = new LightingSystem(this, this.world.lights, { minZoom: GAME_CONFIG.camera.minZoom });
    this.lighting.setTimeOfDay(state.calendar.clockMinutes);
    this.cameraController = new CameraController(this, { bounds: this.world.bounds, home: this.world.home, bus: this.ctx.bus });

    this.components = [
      new HUD(this.ctx, ui.layers.hud),
      new ActionBar(this.ctx, ui.layers.hud),
      new TutorialCoach(this.ctx, ui.layers.hud),
      new StockBoard(this.ctx, ui.root),
      new CameraControls(this.ctx.bus, ui.layers.hud),
      new PauseMenu(this.ctx, ui, getAudio(this)),
    ];
    this.sales = new SalesController(this, this.ctx, ui, this.world.map);
    const shop = new ShopPanel(this.ctx, ui);
    const kitchen = new KitchenPanel(this.ctx, ui);
    const promo = new PromoPanel(this.ctx, ui);
    const upgrade = new UpgradePanel(this.ctx, ui);
    const storage = new StoragePanel(this.ctx, ui);
    const bank = new BankPanel(this.ctx, ui);
    const location = new LocationPanel(this.ctx, ui);
    this.weather = new WeatherFx(this, state.weather, (f) => this.lighting.setWeatherDim(f));
    const audio = getAudio(this);
    audio?.setAmbience('night', true);
    audio?.setAmbience('rain', state.weather === 'hujan');

    const bus = this.ctx.bus;
    this.unsubscribers = [
      bus.on('state:changed', ({ state: next }) => this.lighting.setTimeOfDay(next.calendar.clockMinutes)),
      bus.on('ui:open-pause-menu', () => this.scene.pause()),
      bus.on('ui:pause-menu-closed', () => {
        if (this.scene.isPaused()) this.scene.resume();
      }),
      bus.on('game:return-to-menu', () => this.returnToMenu()),
      bus.on('story:notice', (notice) => this.onStoryNotice(notice)),
      bus.on('ui:open-panel', ({ panel, tab }) => {
        const phase = this.ctx.store.get().phase;
        // Kabar Kampung boleh dibuka di atas menu jeda / ringkasan hari.
        if (panel === 'story') {
          if (document.querySelector('.sheet-story')) return;
          openStoryPanel(this.ctx, ui, (tab as StoryTab | undefined) ?? 'kabar');
          return;
        }
        // Gudang boleh dibuka di atas panel lain (mis. dari Belanja saat gudang penuh).
        if (panel === 'storage') {
          if (phase !== 'evaluasi') storage.open();
          return;
        }
        if (panel === 'event') {
          if (!ui.hasOpenModal()) showEventInfo(this.ctx, ui);
          return;
        }
        // Panduan boleh dibuka di atas menu jeda / panel lain.
        if (panel === 'guide') {
          openGuide(ui, { catalog: this.ctx.catalog, state: this.ctx.store.get() });
          return;
        }
        if (ui.hasOpenModal()) return;
        if (panel === 'shop') {
          if (phase === 'persiapan') shop.open();
        } else if (panel === 'promo') {
          if (phase === 'persiapan') promo.open();
        } else if (panel === 'location') {
          location.open();
        } else if (panel === 'bank') {
          bank.open();
        } else if (panel === 'achievements') {
          showAchievements(this.ctx, ui);
        } else if (panel === 'upgrade') {
          if (phase === 'persiapan') upgrade.open();
        } else if (panel === 'stats') showStats(this.ctx, ui);
        else kitchen.open();
      }),
      bus.on('sales:ended', () => this.time.delayedCall(600, () => showDaySummary(this.ctx, ui))),
      bus.on('world:rebuild', (opts) => {
        // Bangun ulang dunia (objek & varian upgrade) tanpa kehilangan posisi kamera.
        const cam = this.cameras.main;
        const rebuiltView = { scrollX: cam.scrollX, scrollY: cam.scrollY, zoom: cam.zoom };
        this.time.delayedCall(0, () => this.scene.restart({ rebuilt: rebuiltView, reopen: opts?.reopen, moved: !opts?.reopen }));
      }),
      bus.on('state:changed', ({ state: next, prev }) => {
        if (next.calendar.day > prev.calendar.day && !next.bankrupt) {
          showDayCard(ui, next);
          if (next.story.ending && !next.story.endingSeen) this.time.delayedCall(2600, () => this.showEnding());
        }
        this.weather?.set(next.weather);
        getAudio(this)?.setAmbience('rain', next.weather === 'hujan');
        if (next.bankrupt && !this.bankruptShown) {
          this.bankruptShown = true;
          this.time.delayedCall(400, () => showBankrupt(this.ctx, ui, () => this.newGameAfterBankrupt()));
        }
      }),
    ];

    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.input.on(Phaser.Input.Events.GAME_OUT, () => this.world.setCursor(null));

    if (isDebugMode()) this.setupDebug();

    if (rebuilt) {
      this.cameras.main.setZoom(rebuilt.zoom);
      this.cameras.main.setScroll(rebuilt.scrollX, rebuilt.scrollY);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
      if (data?.reopen === 'upgrade') upgrade.open();
      if (data?.moved) {
        // Pindah lokasi: kamera kembali ke gerobak & kartu hari menampilkan lokasi baru.
        this.cameras.main.fadeIn(450, 20, 15, 31);
        showDayCard(ui, this.ctx.store.get());
      } else this.sparkleAtCart();
      return;
    }
    if (state.bankrupt) {
      this.bankruptShown = true;
      this.time.delayedCall(700, () => showBankrupt(this.ctx, ui, () => this.newGameAfterBankrupt()));
    }
    this.cameras.main.fadeIn(450, 20, 15, 31);
    if (!state.bankrupt && state.phase === 'persiapan') this.time.delayedCall(350, () => showDayCard(ui, this.ctx.store.get()));
    if (!state.bankrupt && state.phase === 'persiapan' && state.story.ending && !state.story.endingSeen) this.time.delayedCall(2600, () => this.showEnding());
    // Dimuat setelah tutup tapi belum ganti hari: tampilkan ringkasan lagi.
    if (state.phase === 'evaluasi') this.time.delayedCall(700, () => showDaySummary(this.ctx, ui));
    this.ctx.notify(`Hari ${state.calendar.day} · ${formatDateLong(state.calendar.day)}. Selamat datang di angkringanmu!`, 'info', 4200);
    const firstTime = state.stats.totalPurchases === 0;
    this.time.delayedCall(900, () => {
      if (firstTime) {
        this.ctx.notify('Mulai dengan Belanja bahan, lalu masak di Persiapan.', 'info', 5000);
      } else {
        const touch = this.sys.game.device.input.touch;
        this.ctx.notify(touch ? 'Geser untuk melihat sekeliling, cubit untuk zoom.' : 'Seret untuk menggeser kamera, scroll untuk zoom.', 'info', 4200);
      }
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
  }

  override update(time: number, delta: number): void {
    this.weather?.update(delta, this.cameras.main);
    this.cameraController.update(delta);
    this.sales?.update(delta);
    this.lighting.update(time);
    if (this.debugPanel) this.updateDebug();
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (pointer.wasTouch || this.cameraController.isDragging()) {
      this.world.setCursor(null);
      this.hoveredTile = null;
      return;
    }
    const worldPoint = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    this.hoveredTile = this.world.pickTile(worldPoint.x, worldPoint.y);
    this.world.setCursor(this.hoveredTile);
  }

  /** Percikan cahaya di sekitar gerobak setelah upgrade terpasang. */
  private sparkleAtCart(): void {
    const cart = getMap(this.ctx.store.get().mapId).objects.find((o) => o.type === 'cart');
    if (!cart) return;
    const c = tileToWorld(cart.x + 1, cart.y + 0.5, 0);
    const colors = [0xffe2a0, 0xf6c453, 0xffffff, 0x9ff0a8];
    for (let i = 0; i < 26; i++) {
      const px = this.add
        .image(c.x + (Math.random() - 0.5) * 50, c.y - Math.random() * 20, FX_KEYS.pixel)
        .setTint(colors[i % colors.length] as number)
        .setScale(Math.random() < 0.3 ? 2 : 1)
        .setDepth(DEPTH.glow + 20)
        .setAlpha(0);
      this.tweens.add({
        targets: px,
        alpha: { from: 1, to: 0 },
        y: px.y - 18 - Math.random() * 22,
        duration: 700 + Math.random() * 600,
        delay: Math.random() * 400,
        ease: 'Quad.easeOut',
        onComplete: () => px.destroy(),
      });
    }
  }

  private newGameAfterBankrupt(): void {
    this.ctx.startNewGame();
    this.cameras.main.fadeOut(300, 20, 15, 31);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.restart());
  }

  /** Toast untuk kabar sistem cerita. */
  private onStoryNotice(notice: StoryNotice): void {
    for (const id of notice.update?.chapters ?? []) {
      if (id === 1 || id === 7) continue;
      const c = CHAPTERS.find((x) => x.id === id);
      if (c) this.ctx.notify(`📖 Bab baru Buku Dapur Kardi: ${c.title}`, 'success', 5000);
    }
    const sum = notice.update?.summarized.length ?? 0;
    if (sum) this.ctx.notify(`📰 ${sum} kabar lama kamu dengar dari warga (ringkasan di Kabar Kampung).`, 'info', 4500);
    if (notice.stageUp) this.ctx.notify(`❤ ${namedById(notice.stageUp.who).name} makin dekat denganmu (tahap ${notice.stageUp.stage}).`, 'success', 4500);
  }

  /** Akhir cerita: dialog penutup, lalu kartu akhir. */
  private showEnding(): void {
    const ui = getUI(this);
    const s = this.ctx.store.get();
    if (!s.story.ending || s.story.endingSeen || ui.hasOpenModal()) return;
    const ending = endingById(s.story.ending);
    openDialogue(ui, {
      who: ending.speaker,
      title: ending.title,
      lines: ending.lines,
      onDone: () => {
        this.ctx.actions.markStoryFlag('endingSeen');
        ui.openModal({
          title: ending.title,
          body: el('div', {
            children: [
              el('p', { className: 'modal-body', text: 'Cerita Gang Melati sudah sampai di akhirnya. Bab 7 Buku Dapur Kardi kini terbuka.' }),
              el('p', { className: 'modal-body muted', text: 'Permainan tetap berlanjut dalam mode bebas: warga masih mampir dan mengobrol, tanpa babak baru.' }),
            ],
          }),
          actions: [
            { label: 'Baca Bab 7', onClick: () => this.ctx.bus.emit('ui:open-panel', { panel: 'story', tab: 'buku' }) },
            { label: 'Lanjut berjualan', variant: 'primary' },
          ],
        });
      },
    });
  }

  private returnToMenu(): void {
    this.ctx.leaveToTitle();
    if (this.scene.isPaused()) this.scene.resume();
    this.cameras.main.fadeOut(300, 20, 15, 31);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(SCENES.mainMenu));
  }

  // ---------- mode debug (?debug di URL) ----------

  private setupDebug(): void {
    const ui = getUI(this);
    this.debugPanel = el('pre', { className: 'debug-panel' });
    ui.layers.hud.append(this.debugPanel);
    window.addEventListener('keydown', this.onDebugKey);
  }

  private readonly onDebugKey = (event: KeyboardEvent): void => {
    if (event.repeat || isTypingTarget(event.target) || !this.scene.isActive()) return;
    const delta = event.key === '[' ? -30 : event.key === ']' ? 30 : 0;
    if (!delta) return;
    this.ctx.store.update('debug-jam', (draft) => {
      const next = draft.calendar.clockMinutes + delta;
      draft.calendar.clockMinutes = Math.max(0, Math.min(MAX_CLOCK_MINUTES - 1, next));
    });
  };

  private updateDebug(): void {
    if (!this.debugPanel) return;
    const cam = this.cameras.main;
    const state = this.ctx.store.get();
    const tile = this.hoveredTile;
    const terrain = tile ? terrainAt(this.world.map, tile.x, tile.y)?.label ?? '-' : '-';
    this.debugPanel.textContent = [
      `FPS ${this.game.loop.actualFps.toFixed(0)} · ${this.game.renderer.type === Phaser.WEBGL ? 'WebGL' : 'Canvas'}`,
      `Zoom ${cam.zoom.toFixed(2)} · pusat ${cam.midPoint.x.toFixed(0)}, ${cam.midPoint.y.toFixed(0)}`,
      `Ubin ${tile ? `${tile.x}, ${tile.y}` : '-'} (${terrain})`,
      `Jam ${formatClock(state.calendar.clockMinutes)} · [ / ] ubah jam`,
    ].join('\n');
  }

  private cleanup(): void {
    for (const off of this.unsubscribers) off();
    this.unsubscribers = [];
    this.sales?.destroy();
    this.sales = null;
    for (const c of this.components) c.destroy();
    this.components = [];
    this.debugPanel?.remove();
    this.debugPanel = null;
    window.removeEventListener('keydown', this.onDebugKey);
    this.input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.input.off(Phaser.Input.Events.GAME_OUT);
    getUI(this).closeAllModals();
    getAudio(this)?.setAmbience('rain', false);
    this.weather?.destroy();
    this.weather = null;
    this.lighting.destroy();
    this.world.destroy();
  }
}
