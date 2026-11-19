import * as Phaser from 'phaser';
import { GAME_CONFIG } from '../config/gameConfig';
import { ART_JOBS } from '../graphics/art/catalog';
import { FX_KEYS } from '../graphics/art/effects';
import { queueCustomImages, registerCustomArt } from '../graphics/customArt';
import { registerArt } from '../graphics/TextureFactory';
import { getMap } from '../world/maps';
import { ensureGroundTexture, ensureWorldAnimations } from '../world/WorldBuilder';
import { SCENES } from './sceneKeys';
import { tr } from '../i18n/i18n';

/**
 * Membuat semua aset placeholder secara prosedural, sedikit demi sedikit per frame
 * agar progress bar tetap bergerak. Aset PNG/audio (Stage 6) dimuat di sini juga lewat this.load.
 */
export class LoadingScene extends Phaser.Scene {
  private bar!: Phaser.GameObjects.Graphics;
  private label!: Phaser.GameObjects.Text;
  private jobIndex = 0;
  private readonly totalJobs = ART_JOBS.length + 1;

  constructor() {
    super(SCENES.loading);
  }

  /** PNG objek kustom buatan editor peta (aset lain dibuat prosedural). */
  preload(): void {
    queueCustomImages(this.load);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(GAME_CONFIG.backgroundColor);
    this.bar = this.add.graphics();
    this.label = this.add
      .text(0, 0, tr('Menyiapkan angkringan…'), { fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#f3e3c3' })
      .setOrigin(0.5, 1);
    this.jobIndex = 0;
    this.layout(0);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this));
  }

  override update(): void {
    // Kerjakan beberapa tugas per frame, maksimal ~12 ms agar tidak macet.
    const start = performance.now();
    while (this.jobIndex < this.totalJobs && performance.now() - start < 12) {
      this.runJob(this.jobIndex);
      this.jobIndex++;
    }
    this.layout(this.jobIndex / this.totalJobs);
    if (this.jobIndex >= this.totalJobs) {
      // Cahaya & pendar memakai filter halus; aset lain tetap tajam (pixel art).
      for (const key of [FX_KEYS.light, FX_KEYS.glow]) this.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
      registerCustomArt(this.textures);
      ensureWorldAnimations(this.anims);
      this.scene.start(SCENES.mainMenu);
    }
  }

  private runJob(index: number): void {
    const job = ART_JOBS[index];
    if (job) {
      this.label.setText(tr('Menyiapkan {0}…', { 0: job.label.toLowerCase() }));
      for (const entry of job.build()) registerArt(this.textures, entry);
      return;
    }
    this.label.setText(tr('Menata jalanan…'));
    ensureGroundTexture(this.textures, getMap(GAME_CONFIG.world.mapId));
  }

  private onResize(): void {
    this.layout(this.jobIndex / this.totalJobs);
  }

  private layout(progress: number): void {
    const { width, height } = this.scale;
    const w = Math.min(320, width * 0.7);
    const x = (width - w) / 2;
    const y = height / 2;
    this.bar.clear();
    this.bar.fillStyle(0x2a2035, 1).fillRoundedRect(x, y, w, 12, 6);
    this.bar.fillStyle(0xf2b544, 1).fillRoundedRect(x + 2, y + 2, Math.max(8, (w - 4) * progress), 8, 4);
    this.label.setPosition(width / 2, y - 10);
  }
}
