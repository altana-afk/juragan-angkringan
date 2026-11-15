import { GRAPHICS } from '../config/graphicsSettings';
import * as Phaser from 'phaser';
import type { WeatherKind } from '../core/GameState';

interface Drop {
  u: number;
  v: number;
  speed: number;
  len: number;
}

const DIM: Readonly<Record<WeatherKind, number>> = { cerah: 1, berawan: 0.9, hujan: 0.72, panas: 1 };

/**
 * Efek cuaca di layar: rintik hujan (garis miring) dan percikan, plus kabut panas tipis.
 * Digambar di ruang layar (tidak ikut geser kamera) di atas peta cahaya.
 */
export class WeatherFx {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly drops: Drop[] = [];
  private kind: WeatherKind;
  private readonly onDim: (factor: number) => void;

  constructor(scene: Phaser.Scene, kind: WeatherKind, onDim: (factor: number) => void) {
    this.gfx = scene.add.graphics().setScrollFactor(0).setDepth(1e9);
    this.kind = kind;
    this.onDim = onDim;
    for (let i = 0; i < 140; i++) this.drops.push({ u: Math.random(), v: Math.random(), speed: 0.9 + Math.random() * 0.6, len: 8 + Math.random() * 8 });
    onDim(DIM[kind]);
  }

  set(kind: WeatherKind): void {
    if (kind === this.kind) return;
    this.kind = kind;
    this.onDim(DIM[kind]);
    if (kind !== 'hujan') this.gfx.clear();
  }

  update(deltaMs: number, cam: Phaser.Cameras.Scene2D.Camera): void {
    if (this.kind !== 'hujan' && this.kind !== 'panas') return;
    const g = this.gfx;
    g.clear();
    const z = cam.zoom;
    const w = cam.width / z;
    const h = cam.height / z;
    const cx = cam.width * cam.originX;
    const cy = cam.height * cam.originY;
    const toX = (u: number): number => cx + (u - 0.5) * w;
    const toY = (v: number): number => cy + (v - 0.5) * h;
    if (this.kind === 'panas') {
      // Pendar panas tipis di atas layar.
      g.fillStyle(0xffb04a, 0.06);
      g.fillRect(toX(0), toY(0), w, h * 0.35);
      return;
    }
    const dt = Math.min(0.05, deltaMs / 1000);
    g.lineStyle(1 / z, 0xcfe0ff, 0.45);
    g.beginPath();
    const active = GRAPHICS.lowPower ? 50 : this.drops.length;
    for (let i = 0; i < active; i++) {
      const d = this.drops[i] as Drop;
      d.v += d.speed * dt;
      d.u -= d.speed * dt * 0.18;
      if (d.v > 1.05) {
        d.v = -0.05;
        d.u = Math.random() * 1.2;
      }
      if (d.u < -0.05) d.u += 1.1;
      const x = toX(d.u);
      const y = toY(d.v);
      const len = d.len / z;
      g.moveTo(x, y);
      g.lineTo(x - len * 0.25, y + len);
    }
    g.strokePath();
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
