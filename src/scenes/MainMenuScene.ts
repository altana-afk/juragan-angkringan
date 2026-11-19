import { openAccountPanel } from '../ui/AccountPanel';
import { track } from '../analytics/analytics';
import { openAudioSettings } from '../ui/AudioSettingsPanel';
import * as Phaser from 'phaser';
import { GAME_CONFIG } from '../config/gameConfig';
import { MainMenuUI } from '../ui/MainMenuUI';
import { CameraController } from '../world/CameraController';
import { LightingSystem } from '../world/LightingSystem';
import { getMap } from '../world/maps';
import { buildWorld, type WorldView } from '../world/WorldBuilder';
import { getAudio, getContext, getUI, SCENES } from './sceneKeys';
import { tr } from '../i18n/i18n';

/** Menu utama dengan latar angkringan pada malam hari dan kamera yang bergerak pelan. */
export class MainMenuScene extends Phaser.Scene {
  private world!: WorldView;
  private lighting!: LightingSystem;
  private menu!: MainMenuUI;
  private starting = false;

  constructor() {
    super(SCENES.mainMenu);
  }

  create(): void {
    getAudio(this)?.setAmbience('night', false);
    const ctx = getContext(this);
    const ui = getUI(this);
    this.starting = false;

    this.world = buildWorld(this, getMap(GAME_CONFIG.world.mapId));
    this.lighting = new LightingSystem(this, this.world.lights, { minZoom: GAME_CONFIG.camera.minZoom });
    this.lighting.setTimeOfDay(GAME_CONFIG.mainMenuPreviewMinutes);
    const camera = new CameraController(this, { bounds: this.world.bounds, home: this.world.home, interactive: false });
    this.cameras.main.setZoom(camera.zoom + 0.5);

    this.menu = new MainMenuUI(ui, {
      onNewGame: () => this.startGame('new'),
      onContinue: () => this.startGame('continue'),
      onDeleteSave: () => {
        ctx.saves.clear();
        ctx.notify(tr('Data simpanan dihapus.'), 'info');
      },
      onToggleFullscreen: () => ctx.bus.emit('system:toggle-fullscreen'),
      onAudioSettings: () => {
        const audio = getAudio(this);
        if (audio) openAudioSettings(ui, audio, (lowPower) => ctx.bus.emit('settings:graphics-changed', { lowPower }), () => ctx.flushSave());
      },
      getSave: () => ctx.saves.summary(),
      cloud: ctx.cloud,
      persistent: ctx.persistentStorage,
    });

    this.cameras.main.fadeIn(500, 20, 15, 31);
    // Progres dari akun dimuat / status login berubah → perbarui tombol Lanjutkan & ikon akun.
    const offCloud = ctx.bus.on('cloud:save-replaced', () => this.menu.renderSaveButtons());
    let askedName = false;
    const offUser =
      ctx.cloud?.onChange(() => {
        this.menu.setSignedIn(Boolean(ctx.cloud?.user));
        // Baru login & belum punya username → minta sekali (mis. setelah login lewat redirect).
        if (ctx.cloud?.needsUsername && !askedName && !ui.hasOpenModal()) {
          askedName = true;
          openAccountPanel(ui, ctx.cloud);
        }
      }) ?? (() => undefined);
    this.menu.setSignedIn(Boolean(ctx.cloud?.user));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      offCloud();
      offUser();
      this.menu.destroy();
      this.lighting.destroy();
      this.world.destroy();
    });
  }

  override update(time: number): void {
    // Kamera melayang pelan di sekitar gerobak.
    const { home } = this.world;
    this.cameras.main.centerOn(home.x + Math.sin(time / 5200) * 34, home.y - 12 + Math.cos(time / 7300) * 12);
    this.lighting.update(time);
  }

  private startGame(mode: 'new' | 'continue'): void {
    if (this.starting) return;
    const ctx = getContext(this);
    if (mode === 'continue') {
      const result = ctx.continueGame();
      if (!result.ok) {
        getUI(this).openModal({
          title: tr('Simpanan tidak bisa dimuat'),
          body: tr('{message} Data lama akan dicadangkan, lalu kamu bisa mulai permainan baru.', { message: result.message }),
          actions: [
            { label: tr('Batal') },
            {
              label: tr('Mulai baru'),
              variant: 'primary',
              onClick: () => {
                ctx.saves.quarantine();
                this.startGame('new');
              },
            },
          ],
        });
        this.menu.renderSaveButtons();
        return;
      }
      track('game_continue', { day: ctx.store.get().calendar.day });
    } else {
      ctx.startNewGame();
      track('game_new');
    }
    this.starting = true;
    this.menu.setBusy(true);
    this.menu.hide();
    this.cameras.main.fadeOut(380, 20, 15, 31);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(SCENES.angkringan, {}));
  }
}
