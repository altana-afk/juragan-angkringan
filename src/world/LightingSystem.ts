import { GRAPHICS } from '../config/graphicsSettings';
import * as Phaser from 'phaser';
import { FX_KEYS, LIGHT_TEXTURE_SIZE } from '../graphics/art/effects';
import { channels, divide, mix, shade, type Color } from '../graphics/color';
import { DEPTH } from './depth';
import { getAmbientAt, type AmbientState } from './timeOfDay';

export interface WorldLight {
  /** Posisi dunia (piksel) titik lampu. */
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly color: Color;
  readonly intensity: number;
  readonly flicker: number;
  readonly glow: boolean;
  readonly glowScale: number;
  readonly seed: number;
}

/**
 * Pencahayaan malam.
 *
 * WebGL (utama) — light map:
 * 1. RenderTexture seukuran layar diisi warna ambient (mis. biru gelap).
 * 2. Tiap lampu digambar sebagai cahaya radial berwarna (blend SCREEN).
 * 3. RenderTexture ditampilkan di atas dunia dengan blend MULTIPLY.
 * Light map menempel ke layar (scrollFactor 0) dan resolusinya mengikuti zoom kamera,
 * sehingga seluruh layar — termasuk langit di luar peta — selalu tergelapkan merata.
 *
 * Canvas 2D (cadangan untuk perangkat tanpa WebGL) — lapisan gelap semi-transparan
 * ditambah sprite cahaya aditif di sekitar lampu.
 *
 * Keduanya menambahkan sprite pendar (ADD) di titik bohlam dan dikendalikan oleh jam permainan.
 */
export class LightingSystem {
  private readonly webgl: boolean;
  private rt: Phaser.GameObjects.RenderTexture | null = null;
  private brush: Phaser.GameObjects.Image | null = null;
  /** Bidang warna ambient; digambar dengan blend NORMAL agar status blend selalu pasti. */
  private ambientFill: Phaser.GameObjects.Image | null = null;
  private overlay: Phaser.GameObjects.Rectangle | null = null;
  private readonly pools: { light: WorldLight; sprite: Phaser.GameObjects.Image }[] = [];
  private readonly glows: { light: WorldLight; sprite: Phaser.GameObjects.Image }[] = [];
  private ambient: AmbientState = getAmbientAt(17 * 60);
  private minutes = 17 * 60;
  private weatherDim = 1;
  private readonly lights: WorldLight[];
  private readonly minZoom: number;

  constructor(
    private readonly scene: Phaser.Scene,
    lights: readonly WorldLight[],
    options: { minZoom: number },
  ) {
    this.lights = [...lights];
    this.minZoom = Math.max(0.25, options.minZoom);
    this.webgl = scene.sys.game.renderer.type === Phaser.WEBGL;

    if (this.webgl) {
      this.rt = this.createRenderTexture();
      // SCREEN (bukan ADD): mode ADD Phaser memakai DST_ALPHA yang tidak andal di dalam RenderTexture,
      // sedangkan SCREEN = src + dst × (1 − src) — cahaya bertumpuk lembut tanpa bergantung alpha.
      this.brush = scene.make.image({ key: FX_KEYS.light, add: false }).setBlendMode(Phaser.BlendModes.SCREEN);
      this.ambientFill = scene.make.image({ key: FX_KEYS.pixel, add: false }).setOrigin(0, 0).setBlendMode(Phaser.BlendModes.NORMAL);
    } else {
      this.overlay = this.createOverlay();
      for (const light of this.lights) {
        const scale = (light.radius * 2) / LIGHT_TEXTURE_SIZE;
        const sprite = scene.add
          .image(light.x, light.y, FX_KEYS.light)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(DEPTH.lighting + 1)
          .setScale(scale, scale * 0.72);
        this.pools.push({ light, sprite });
      }
    }

    for (const light of this.lights) {
      if (!light.glow) continue;
      const sprite = scene.add
        .image(light.x, light.y, FX_KEYS.glow)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(DEPTH.glow)
        .setTint(light.color)
        .setScale(light.glowScale * 1.4);
      this.glows.push({ light, sprite });
    }
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
  }

  /** Ukuran lapisan yang cukup untuk menutup layar pada zoom terkecil. */
  private coverSize(): { width: number; height: number } {
    const cam = this.scene.cameras.main;
    return { width: Math.ceil(cam.width / this.minZoom) + 4, height: Math.ceil(cam.height / this.minZoom) + 4 };
  }

  private createRenderTexture(): Phaser.GameObjects.RenderTexture {
    const { width, height } = this.coverSize();
    return this.scene.add
      .renderTexture(0, 0, width, height)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH.lighting)
      .setBlendMode(Phaser.BlendModes.MULTIPLY);
  }

  private createOverlay(): Phaser.GameObjects.Rectangle {
    const { width, height } = this.coverSize();
    return this.scene.add.rectangle(0, 0, width, height, 0x000000, 0).setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH.lighting);
  }

  private onResize(): void {
    if (this.rt) {
      this.rt.destroy();
      this.rt = this.createRenderTexture();
    }
    if (this.overlay) {
      this.overlay.destroy();
      this.overlay = this.createOverlay();
      this.applyOverlayStyle();
    }
  }

  /** Atur suasana berdasarkan jam permainan (menit sejak 00.00). */
  setTimeOfDay(minutes: number): void {
    this.minutes = minutes;
    const base = getAmbientAt(minutes);
    // Cuaca mendung/hujan: dunia lebih gelap & kebiruan, lampu lebih terasa.
    this.ambient = this.weatherDim >= 0.999
      ? base
      : {
          ambient: mix(shade(base.ambient, this.weatherDim), 0x6a7a9a, (1 - this.weatherDim) * 0.6),
          sky: mix(shade(base.sky, this.weatherDim), 0x4a5568, (1 - this.weatherDim) * 0.8),
          lampFactor: Math.min(1, base.lampFactor + (1 - this.weatherDim) * 1.2),
        };
    const cam = this.scene.cameras.main;
    if (this.webgl) {
      // Langit juga ikut dikalikan light map, jadi warnanya "dibagi" dulu agar hasil akhirnya tepat.
      cam.setBackgroundColor(divide(this.ambient.sky, this.ambient.ambient));
    } else {
      cam.setBackgroundColor(this.ambient.sky);
      this.applyOverlayStyle();
    }
  }

  private applyOverlayStyle(): void {
    const [r, g, b] = channels(this.ambient.ambient);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    this.overlay?.setFillStyle(shade(this.ambient.ambient, 0.25), Math.min(0.75, Math.max(0, 1 - luminance)));
  }

  /** Redupkan suasana karena cuaca (1 = cerah, 0,7 = hujan). */
  setWeatherDim(factor: number): void {
    if (Math.abs(factor - this.weatherDim) < 1e-3) return;
    this.weatherDim = factor;
    this.setTimeOfDay(this.minutes);
  }

  getAmbient(): AmbientState {
    return this.ambient;
  }

  update(timeMs: number): void {
    const cam = this.scene.cameras.main;
    const zoom = cam.zoom;
    const cx = cam.width * cam.originX;
    const cy = cam.height * cam.originY;
    const { lampFactor } = this.ambient;
    // Posisi lapisan layar agar menutupi viewport pada zoom saat ini
    // (objek scrollFactor 0 tetap ikut di-zoom di sekitar titik tengah kamera).
    const coverX = cx - cx / zoom;
    const coverY = cy - cy / zoom;

    if (this.rt && this.brush && this.ambientFill) {
      this.rt.setPosition(coverX, coverY);
      // Mode hemat: peta cahaya digambar ulang ±15×/detik kecuali kamera bergerak.
      const camKey = `${cam.scrollX.toFixed(1)}|${cam.scrollY.toFixed(1)}|${zoom.toFixed(3)}|${this.ambient.ambient}`;
      if (GRAPHICS.lowPower && camKey === this.lastCamKey && timeMs - this.lastDrawAt < 66) return this.updateGlows(lampFactor, timeMs);
      this.lastCamKey = camKey;
      this.lastDrawAt = timeMs;
      const offsetX = -cam.scrollX - cx + cx / zoom;
      const offsetY = -cam.scrollY - cy + cy / zoom;
      const viewW = cam.width / zoom;
      const viewH = cam.height / zoom;
      // Pass 1: isi warna ambient (blend NORMAL). Pass 2: cahaya lampu (blend SCREEN).
      // Dua pass terpisah karena satu batch tidak boleh mencampur blend mode.
      this.ambientFill.setDisplaySize(this.rt.width, this.rt.height).setTint(this.ambient.ambient);
      this.rt.beginDraw();
      this.rt.batchDraw(this.ambientFill, 0, 0);
      this.rt.endDraw();
      if (lampFactor > 0.001) {
        this.rt.beginDraw();
        for (const light of this.lights) {
          const x = light.x + offsetX;
          const y = light.y + offsetY;
          // Lewati lampu yang jauh di luar layar.
          if (x < -light.radius || y < -light.radius || x > viewW + light.radius || y > viewH + light.radius) continue;
          const strength = light.intensity * lampFactor * flickerFactor(light, timeMs);
          if (strength <= 0.01) continue;
          const scale = (light.radius * 2) / LIGHT_TEXTURE_SIZE;
          this.brush.setScale(scale, scale * 0.72).setTint(light.color).setAlpha(Math.min(1, strength));
          this.rt.batchDraw(this.brush, x, y);
        }
        this.rt.endDraw();
      }
    } else {
      this.overlay?.setPosition(coverX, coverY);
      for (const { light, sprite } of this.pools) {
        sprite.setVisible(lampFactor > 0.01);
        sprite.setAlpha(Math.min(1, light.intensity * lampFactor * 0.3 * flickerFactor(light, timeMs)));
      }
    }

    this.updateGlows(lampFactor, timeMs);
  }

  private lastCamKey = '';
  private lastDrawAt = -1e9;

  private updateGlows(lampFactor: number, timeMs: number): void {
    for (const { light, sprite } of this.glows) {
      sprite.setVisible(lampFactor > 0.01);
      sprite.setAlpha(Math.min(1, light.intensity * lampFactor * 0.8 * flickerFactor(light, timeMs)));
    }
  }

  destroy(): void {
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.rt?.destroy();
    this.brush?.destroy();
    this.ambientFill?.destroy();
    this.overlay?.destroy();
    for (const p of this.pools) p.sprite.destroy();
    for (const g of this.glows) g.sprite.destroy();
    this.pools.length = 0;
    this.glows.length = 0;
  }
}

/** Kedip lampu yang halus (gabungan dua gelombang sinus dengan fase acak per lampu). */
export function flickerFactor(light: Pick<WorldLight, 'flicker' | 'seed'>, timeMs: number): number {
  if (light.flicker <= 0) return 1;
  const t = timeMs + light.seed * 997;
  const wave = 0.5 + 0.35 * Math.sin(t * 0.011 + light.seed) + 0.15 * Math.sin(t * 0.037 + light.seed * 3);
  return 1 - light.flicker * wave;
}
