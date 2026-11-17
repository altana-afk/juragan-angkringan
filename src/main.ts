import './styles/main.css';
import * as Phaser from 'phaser';
import { GAME_CONFIG, isDebugMode } from './config/gameConfig';
import { GRAPHICS } from './config/graphicsSettings';
import { CONTEXT_REGISTRY_KEY, GameContext } from './core/GameContext';
import { AngkringanScene } from './scenes/AngkringanScene';
import { BootScene } from './scenes/BootScene';
import { LoadingScene } from './scenes/LoadingScene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { UI_REGISTRY_KEY, UIManager } from './ui/UIManager';
import { AUDIO_REGISTRY_KEY, AudioSystem } from './audio/AudioSystem';
import { attachSoundDirector } from './audio/SoundDirector';
import { initPwa } from './pwa/pwa';
import { initAnalytics } from './analytics/analytics';

function requireElement(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Elemen #${id} tidak ditemukan di index.html`);
  return node;
}

/** Batasi FPS saat mode hemat (bisa diubah tanpa memuat ulang). */
function applyFpsLimit(game: Phaser.Game, lowPower: boolean): void {
  const loop = game.loop as unknown as { fpsLimit: number; hasFpsLimit: boolean; _limitRate: number };
  loop.fpsLimit = lowPower ? 30 : 0;
  loop.hasFpsLimit = lowPower;
  loop._limitRate = lowPower ? 1000 / 30 : 0;
}

function bootstrap(): Phaser.Game {
  GRAPHICS.init();
  const ctx = new GameContext();
  // PWA: offline + tombol "Pasang game". Dipanggil sedini mungkin agar prompt install tidak terlewat.
  initPwa((message, kind, durationMs) => ctx.notify(message, kind, durationMs));
  const ui = new UIManager(requireElement('ui-root'), ctx.bus);
  initAnalytics(ctx);
  const audio = new AudioSystem();
  attachSoundDirector(ctx, audio, requireElement('ui-root'));

  const game = new Phaser.Game({
    // ?renderer=canvas memaksa Canvas 2D (untuk menguji perangkat tanpa WebGL).
    type: new URLSearchParams(window.location.search).get('renderer') === 'canvas' ? Phaser.CANVAS : Phaser.AUTO,
    parent: 'game-root',
    backgroundColor: GAME_CONFIG.backgroundColor,
    pixelArt: true,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: '100%',
      height: '100%',
      fullscreenTarget: 'app',
    },
    input: { activePointers: 3 },
    fps: GRAPHICS.lowPower ? { target: 60, limit: 30 } : { target: 60 },
    disableContextMenu: true,
    banner: false,
    scene: [BootScene, LoadingScene, MainMenuScene, AngkringanScene],
    callbacks: {
      preBoot: (g) => {
        g.registry.set(CONTEXT_REGISTRY_KEY, ctx);
        g.registry.set(UI_REGISTRY_KEY, ui);
        g.registry.set(AUDIO_REGISTRY_KEY, audio);
      },
    },
  });

  ctx.bus.on('settings:graphics-changed', ({ lowPower }) => applyFpsLimit(game, lowPower));

  // Layar penuh: dipicu dari UI lewat event bus (harus berasal dari klik pengguna).
  ctx.bus.on('system:toggle-fullscreen', () => {
    if (!game.scale.fullscreen.available) {
      ctx.notify('Layar penuh tidak didukung di perangkat atau browser ini.', 'warning');
      return;
    }
    game.scale.toggleFullscreen();
  });
  const emitFullscreen = (): void => ctx.bus.emit('system:fullscreen-changed', { active: game.scale.isFullscreen });
  game.scale.on(Phaser.Scale.Events.ENTER_FULLSCREEN, emitFullscreen);
  game.scale.on(Phaser.Scale.Events.LEAVE_FULLSCREEN, emitFullscreen);
  game.scale.on(Phaser.Scale.Events.FULLSCREEN_FAILED, () => ctx.notify('Gagal masuk mode layar penuh.', 'error'));
  game.scale.on(Phaser.Scale.Events.FULLSCREEN_UNSUPPORTED, () => ctx.notify('Layar penuh tidak didukung di perangkat ini.', 'warning'));

  // Jaga ukuran kanvas tetap sama dengan wadahnya. Pada rotasi ponsel, Phaser kadang memproses
  // event orientationchange sebelum layout berubah sehingga ukurannya tertinggal; ResizeObserver
  // memastikan kanvas disegarkan setelah ukuran wadah benar-benar berubah.
  const gameRoot = requireElement('game-root');
  const syncCanvasSize = (): void => {
    const width = gameRoot.clientWidth;
    const height = gameRoot.clientHeight;
    if (!game.isBooted || width <= 0 || height <= 0) return;
    if (Math.round(game.scale.width) !== width || Math.round(game.scale.height) !== height) {
      game.scale.getParentBounds();
      game.scale.refresh();
    }
  };
  if ('ResizeObserver' in window) new ResizeObserver(() => requestAnimationFrame(syncCanvasSize)).observe(gameRoot);
  window.addEventListener('orientationchange', () => window.setTimeout(syncCanvasSize, 200));

  // Simpan saat tab ditutup / disembunyikan (penting di ponsel).
  window.addEventListener('pagehide', () => ctx.flushSave());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') ctx.flushSave();
  });

  // Tangkap error tak terduga agar terlihat oleh pemain & mudah dilaporkan.
  window.addEventListener('error', (event) => {
    console.error(event.error ?? event.message);
    ctx.notify('Terjadi kesalahan. Detail ada di console browser.', 'error', 6000);
  });
  window.addEventListener('unhandledrejection', (event) => {
    console.error(event.reason);
    ctx.notify('Terjadi kesalahan. Detail ada di console browser.', 'error', 6000);
  });

  return game;
}

const game = bootstrap();

// Mode debug: buka akses ke instance game dari console browser (window.__game).
if (isDebugMode()) (window as unknown as { __game?: Phaser.Game }).__game = game;

// Bersihkan saat hot-reload Vite agar tidak ada dua instance game.
if (import.meta.hot) {
  import.meta.hot.dispose(() => game.destroy(true));
}
