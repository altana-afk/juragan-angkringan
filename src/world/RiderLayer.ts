import * as Phaser from 'phaser';
import type { GameState } from '../core/GameState';
import { RIDER_KEYS } from '../graphics/art/props';
import { applyAnchor } from '../graphics/TextureFactory';
import { tileToWorld } from '../iso/IsoMath';
import { activeTrip } from '../systems/CourierSystem';
import { entityDepth } from './depth';
import { terrainAt, type MapData } from './MapData';

/** Kecepatan motor di layar (ubin per detik nyata). */
const RIDE_SPEED = 5;
/** Paling cepat sekian ms berhenti di samping gerobak sebelum berangkat lagi. */
const MIN_PARK_MS = 2500;
/** Driver ojol mulai muncul sekian menit permainan sebelum jadwal jemput. */
const OJOL_LEAD_MINUTES = 2;
/** Panjang motor (ubin) — dipakai untuk menggeser titik awal gambar ke tengah motor. */
const BIKE_LEN = 22 / 16;

type Phase = 'arrive' | 'park' | 'leave';

interface Rider {
  sprite: Phaser.GameObjects.Image;
  /** Posisi di sepanjang jalan (ubin, pada sumbu jalan). */
  t: number;
  phase: Phase;
  parkedMs: number;
  slot: number;
  /** Arah keluar: +1 atau −1 sepanjang sumbu jalan. */
  exitDir: 1 | -1;
  /** Sudah boleh pergi (pesanan dijemput / kurir berangkat). */
  released: boolean;
}

interface RoadLine {
  axis: 'x' | 'y';
  /** Koordinat tetap (tengah lajur) pada sumbu tegak lurus. */
  lane: number;
  /** Titik berhenti di samping gerobak (koordinat pada sumbu jalan). */
  stop: number;
  min: number;
  max: number;
}

/**
 * Motor pengantar pesanan online: driver ojol datang ke samping gerobak, menunggu pesanan
 * lalu berangkat; kurir sendiri berangkat saat mengantar dan kembali siaga di samping gerobak.
 * Murni tampilan — dibaca dari state tiap frame.
 */
export class RiderLayer {
  private readonly riders = new Map<string, Rider>();
  private readonly road: RoadLine | null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly map: MapData,
  ) {
    this.road = findRoad(map);
  }

  sync(state: Readonly<GameState>, deltaMs: number): void {
    const road = this.road;
    if (!road) return;
    const now = state.calendar.clockMinutes;
    const online = state.online;
    const wanted = new Map<string, boolean>(); // id → masih menunggu (belum boleh pergi)

    if (state.phase === 'berjualan') {
      for (const o of online.orders) {
        if (o.pickupMinute === null || online.mode !== 'ojol') continue;
        const id = `ojol-${o.id}`;
        if (o.status === 'diterima' && now >= o.pickupMinute - OJOL_LEAD_MINUTES) wanted.set(id, true);
        else if (this.riders.has(id)) wanted.set(id, false);
      }
      if (online.mode === 'kurir' && (online.enabled || online.orders.some((o) => o.status === 'diterima' || o.status === 'diantar'))) wanted.set('kurir', !activeTrip(state, now));
    }

    for (const [id, waiting] of wanted) {
      let r = this.riders.get(id);
      if (!r) {
        if (!waiting) continue;
        r = this.spawn(id, road);
      }
      r.released = !waiting;
    }
    for (const [id, r] of this.riders) if (!wanted.has(id)) r.released = true;

    const step = (deltaMs / 1000) * RIDE_SPEED;
    for (const [id, r] of this.riders) {
      const target = road.stop - r.slot * (BIKE_LEN + 0.3) * r.exitDir;
      if (r.phase === 'arrive') {
        const dir = Math.sign(target - r.t);
        r.t += dir * step;
        if (Math.sign(target - r.t) !== dir || dir === 0) {
          r.t = target;
          r.phase = 'park';
        }
      } else if (r.phase === 'park') {
        r.parkedMs += deltaMs;
        r.t = target;
        if (r.released && r.parkedMs >= MIN_PARK_MS) r.phase = 'leave';
      } else {
        r.t += r.exitDir * step;
        if (r.t < road.min - 2 || r.t > road.max + 2) {
          r.sprite.destroy();
          this.riders.delete(id);
          continue;
        }
      }
      this.place(r, road);
    }
  }

  clear(): void {
    for (const r of this.riders.values()) r.sprite.destroy();
    this.riders.clear();
  }

  private spawn(id: string, road: RoadLine): Rider {
    const key = id === 'kurir' ? RIDER_KEYS.kurir : RIDER_KEYS.ojol;
    const sprite = this.scene.add.image(0, 0, key);
    applyAnchor(sprite, key);
    const used = new Set([...this.riders.values()].filter((r) => r.phase !== 'leave').map((r) => r.slot));
    let slot = id === 'kurir' ? 0 : 1;
    while (used.has(slot)) slot++;
    // Datang dari ujung jalan yang lebih jauh, lalu pergi ke arah berlawanan.
    const fromMin = road.stop - road.min > road.max - road.stop;
    const exitDir: 1 | -1 = fromMin ? 1 : -1;
    const rider: Rider = { sprite, t: fromMin ? road.min - 1.5 : road.max + 1.5, phase: 'arrive', parkedMs: 0, slot, exitDir, released: false };
    this.riders.set(id, rider);
    return rider;
  }

  private place(r: Rider, road: RoadLine): void {
    // Gambar motor membujur ke sumbu x; untuk jalan bersumbu y cukup dicerminkan.
    const half = BIKE_LEN / 2;
    const [x, y] = road.axis === 'x' ? [r.t - half, road.lane] : [road.lane, r.t - half];
    const cx = road.axis === 'x' ? r.t : road.lane;
    const cy = road.axis === 'x' ? road.lane : r.t;
    const elev = terrainAt(this.map, Math.floor(cx), Math.floor(cy))?.elevation ?? 0;
    const p = tileToWorld(x, y, elev);
    r.sprite.setPosition(Math.round(p.x), Math.round(p.y));
    r.sprite.setFlipX(road.axis === 'y');
    const depth = entityDepth(cx, cy);
    if (r.sprite.depth !== depth) r.sprite.setDepth(depth);
  }
}

/** Cari jalan raya terdekat dari pintu masuk lapak dan bentangannya. */
export function findRoad(map: MapData): RoadLine | null {
  const entry = map.customers?.lotEntry ?? map.anchors.cameraHome;
  const isRoad = (x: number, y: number): boolean => terrainAt(map, x, y)?.road === true;
  let best: { x: number; y: number; d: number } | null = null;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (!isRoad(x, y)) continue;
      const d = Math.hypot(x + 0.5 - entry.x, y + 0.5 - entry.y);
      if (!best || d < best.d) best = { x, y, d };
    }
  }
  if (!best || best.d > 8) return null;
  const run = (dx: number, dy: number): [number, number] => {
    let a = 0;
    let b = 0;
    while (isRoad(best!.x - dx * (a + 1), best!.y - dy * (a + 1))) a++;
    while (isRoad(best.x + dx * (b + 1), best.y + dy * (b + 1))) b++;
    return [a, b];
  };
  const [xa, xb] = run(1, 0);
  const [ya, yb] = run(0, 1);
  const axis: 'x' | 'y' = xa + xb >= ya + yb ? 'x' : 'y';
  // Lajur paling dekat ke gerobak: geser ke tepi jalan di sisi lapak.
  const perp = axis === 'x' ? best.y : best.x;
  const entryPerp = axis === 'x' ? entry.y : entry.x;
  const lane = perp + 0.5 + (entryPerp > perp + 0.5 ? 0.25 : -0.25);
  const [a, b] = axis === 'x' ? [xa, xb] : [ya, yb];
  const base = axis === 'x' ? best.x : best.y;
  const along = axis === 'x' ? entry.x : entry.y;
  return { axis, lane, stop: Math.min(base + b + 0.5, Math.max(base - a + 0.5, along + 1.2)), min: base - a, max: base + b + 1 };
}
