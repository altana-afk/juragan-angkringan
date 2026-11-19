import * as Phaser from 'phaser';
import { BUBBLE_KEY, catKey, customerTextureKey, emoteKey } from '../graphics/art/customers';
import { VEHICLE_KEYS } from '../graphics/art/props';
import { applyAnchor } from '../graphics/TextureFactory';
import { tileToWorld, type Point } from '../iso/IsoMath';
import { DEPTH, entityDepth } from './depth';
import { terrainAt, type MapData } from './MapData';
import { findRoad } from './RiderLayer';
import { tr } from '../i18n/i18n';

/**
 * Tampilan tantangan kampung (0.18.0): kucing liar & kucing peliharaan, ODGJ, ormas,
 * dan adegan penangkapan (kendaraan berhenti di samping gerobak, dua orang turun, membawa target).
 * Murni tampilan: keputusan & perubahan data ada di SalesController + GameActions.
 */

/** Kecepatan jalan di layar (ubin per detik nyata pada kecepatan 1×). */
const WALK = 1.9;
const RUN = 4.2;
const DRIVE = 6;

type Look = { tex: string; frames: number };

interface Actor {
  sprite: Phaser.GameObjects.Sprite;
  look: Look;
  x: number;
  y: number;
  path: Point[];
  speed: number;
  done: (() => void) | null;
  elapsed: number;
  facingLeft: boolean;
}

export interface Guest {
  readonly actors: Actor[];
  readonly bubble: Phaser.GameObjects.Image;
  readonly icon: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text | null;
  arrived: boolean;
  leaving: boolean;
}

export interface ChallengeHooks {
  onTapGuest(kind: 'odgj' | 'ormas'): void;
}

const human = (id: string, palette = 0): Look => ({ tex: `${id}|${palette}`, frames: 3 });
const textureOf = (look: Look, frame: number): string => {
  if (look.tex.startsWith('cat:')) return catKey(look.tex.slice(4) as 'liar' | 'belang', frame);
  const [id, p] = look.tex.split('|');
  return customerTextureKey(id as string, Number(p), frame);
};

export class ChallengeLayer {
  private readonly actors = new Set<Actor>();
  private readonly guests = new Map<'odgj' | 'ormas', Guest>();
  private pet: Phaser.GameObjects.Sprite | null = null;
  private vehicles: { sprite: Phaser.GameObjects.Image; t: number; target: number; dir: 1 | -1; phase: 'arrive' | 'wait' | 'leave'; onPark: () => void; released: boolean }[] = [];
  private readonly cart: Point;
  private readonly entry: Point;
  private readonly spawns: (readonly Point[])[];
  private elapsed = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly map: MapData,
    private readonly hooks: ChallengeHooks,
  ) {
    const cart = map.objects.find((o) => o.type === 'cart');
    this.entry = map.customers?.lotEntry ?? map.anchors.cameraHome;
    this.cart = cart ? { x: cart.x + 1, y: cart.y + 0.9 } : this.entry;
    this.spawns = (map.customers?.spawns ?? []).map((s) => s.path);
  }

  private worldPos(x: number, y: number): { x: number; y: number } {
    const elev = terrainAt(this.map, Math.floor(x), Math.floor(y))?.elevation ?? 0;
    const p = tileToWorld(x, y, elev);
    return { x: Math.round(p.x), y: Math.round(p.y) };
  }

  /** Jalur masuk acak dari tepi peta ke pintu masuk lapak. */
  private routeIn(seed: number): Point[] {
    const path: readonly Point[] = this.spawns.length ? (this.spawns[seed % this.spawns.length] as readonly Point[]) : [this.entry];
    return [...path];
  }

  private spawnActor(look: Look, at: Point, path: Point[], speed: number, done: (() => void) | null = null): Actor {
    const key = textureOf(look, 0);
    const sprite = this.scene.add.sprite(0, 0, key);
    applyAnchor(sprite, key);
    sprite.setAlpha(0);
    this.scene.tweens.add({ targets: sprite, alpha: 1, duration: 300 });
    const a: Actor = { sprite, look, x: at.x, y: at.y, path, speed, done, elapsed: 0, facingLeft: false };
    this.actors.add(a);
    this.place(a, false);
    return a;
  }

  private place(a: Actor, moving: boolean): void {
    const p = this.worldPos(a.x, a.y);
    const frame = moving ? (Math.floor(a.elapsed / (a.look.tex.startsWith('cat:') ? 90 : 170)) % 2 === 0 ? 1 : 2) : 0;
    const key = textureOf(a.look, frame);
    if (a.sprite.texture.key !== key) a.sprite.setTexture(key);
    a.sprite.setPosition(p.x, p.y - (frame === 1 && !a.look.tex.startsWith('cat:') ? 1 : 0)).setFlipX(a.facingLeft);
    const depth = entityDepth(a.x, a.y);
    if (a.sprite.depth !== depth) a.sprite.setDepth(depth);
  }

  private step(a: Actor, dt: number): void {
    a.elapsed += dt * 1000;
    let budget = a.speed * dt;
    const moving = a.path.length > 0;
    while (budget > 0 && a.path.length) {
      const t = a.path[0] as Point;
      const dx = t.x - a.x;
      const dy = t.y - a.y;
      const dist = Math.hypot(dx, dy);
      if (Math.abs(dx - dy) > 1e-3) a.facingLeft = dx - dy < 0;
      if (dist <= budget) {
        a.x = t.x;
        a.y = t.y;
        a.path.shift();
        budget -= dist;
      } else {
        a.x += (dx / dist) * budget;
        a.y += (dy / dist) * budget;
        budget = 0;
      }
    }
    this.place(a, moving && a.path.length > 0);
    if (moving && a.path.length === 0 && a.done) {
      const done = a.done;
      a.done = null;
      done();
    }
  }

  private removeActor(a: Actor): void {
    this.scene.tweens.add({ targets: a.sprite, alpha: 0, duration: 250, onComplete: () => a.sprite.destroy() });
    this.actors.delete(a);
  }

  // ---------- kucing ----------

  /** Kucing peliharaan duduk di samping gerobak (jika upgrade dimiliki). */
  syncPet(owned: boolean): void {
    if (owned && !this.pet) {
      const key = catKey('belang', 0);
      const pos = { x: this.cart.x - 1.4, y: this.cart.y + 0.4 };
      const p = this.worldPos(pos.x, pos.y);
      this.pet = this.scene.add.sprite(p.x, p.y, key).setDepth(entityDepth(pos.x, pos.y));
      applyAnchor(this.pet, key);
    } else if (!owned && this.pet) {
      this.pet.destroy();
      this.pet = null;
    }
  }

  /** Kucing liar berlari ke gerobak. `onReach` dipanggil saat sampai; `blocked` = kucing peliharaan mengusir. */
  cat(seed: number, onReach: () => { blocked: boolean; taken: number }): void {
    const route = this.routeIn(seed);
    const start = route[0] ?? this.entry;
    const near = { x: this.cart.x - 0.6, y: this.cart.y + 0.8 };
    const back = [...route].reverse();
    const actor = this.spawnActor({ tex: 'cat:liar', frames: 3 }, start, [...route.slice(1), this.entry, near], RUN, () => {
      const res = onReach();
      if (res.blocked && this.pet) {
        this.float(near, tr('Hus!'), '#ffe08a');
        this.scene.tweens.add({ targets: this.pet, y: this.pet.y - 6, duration: 140, yoyo: true, repeat: 1 });
      } else if (res.taken > 0) this.float(near, tr('−{taken} porsi', { taken: res.taken }), '#ff8a7a');
      actor.path = [this.entry, ...back];
      actor.speed = RUN * 1.2;
      actor.done = () => this.removeActor(actor);
    });
  }

  // ---------- tamu tantangan (ODGJ & ormas) ----------

  hasGuest(kind: 'odgj' | 'ormas'): boolean {
    return this.guests.has(kind);
  }

  /** Tamu datang dan berdiri di dekat lapak dengan balon "!!!" yang bisa diketuk. */
  guest(kind: 'odgj' | 'ormas', seed: number, onArrive: () => void, immediate = false): void {
    if (this.guests.has(kind)) return;
    const route = this.routeIn(seed + (kind === 'ormas' ? 1 : 0));
    const spot = kind === 'odgj' ? { x: this.entry.x + 1.2, y: this.entry.y + 1.1 } : { x: this.entry.x - 0.4, y: this.entry.y + 1.3 };
    const looks = kind === 'odgj' ? [human('odgj')] : [human('ormas', 0), human('ormas', 1)];
    const bubble = this.scene.add.image(0, 0, BUBBLE_KEY).setVisible(false);
    applyAnchor(bubble, BUBBLE_KEY);
    const icon = this.scene.add.image(0, 0, emoteKey('alert')).setVisible(false);
    bubble.setInteractive(new Phaser.Geom.Rectangle(-8, -8, 40, 40), Phaser.Geom.Rectangle.Contains);
    if (bubble.input) bubble.input.cursor = 'pointer';
    bubble.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, (pointer: Phaser.Input.Pointer) => {
      if (pointer.getDistance() < 12) this.hooks.onTapGuest(kind);
    });
    const guest: Guest = { actors: [], bubble, icon, label: null, arrived: false, leaving: false };
    looks.forEach((look, i) => {
      const target = { x: spot.x + i * 0.55, y: spot.y + i * 0.35 };
      const start = immediate ? target : (route[0] ?? this.entry);
      const path = immediate ? [] : [...route.slice(1), this.entry, target];
      const actor = this.spawnActor(look, start, path, WALK, i === 0 ? () => arrive() : null);
      // Ketuk tokohnya juga membuka pilihan (area sentuh lebih besar dari balon saja).
      actor.sprite.setInteractive({ useHandCursor: true });
      actor.sprite.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, (pointer: Phaser.Input.Pointer) => {
        if (pointer.getDistance() < 12 && guest.arrived && !guest.leaving) this.hooks.onTapGuest(kind);
      });
      guest.actors.push(actor);
    });
    const arrive = (): void => {
      guest.arrived = true;
      bubble.setVisible(true).setScale(0.4);
      icon.setVisible(true).setScale(0.4);
      this.scene.tweens.add({ targets: [bubble, icon], scale: 1, duration: 240, ease: 'Back.easeOut' });
      onArrive();
    };
    this.guests.set(kind, guest);
    if (immediate) arrive();
  }

  /** Tamu pergi lewat jalan masuk (tenang/diantar warga/selesai). */
  dismiss(kind: 'odgj' | 'ormas', withNeighbors = false): void {
    const g = this.guests.get(kind);
    if (!g || g.leaving) return;
    g.leaving = true;
    this.hideBubble(g);
    const route = [...this.routeIn(kind === 'ormas' ? 3 : 2)].reverse();
    const leader = g.actors[0];
    if (withNeighbors && leader) {
      // Dua warga datang dan mengantar pulang.
      const start = route[route.length - 1] ?? this.entry;
      for (let i = 0; i < 2; i++) {
        const w = this.spawnActor(human('tetap', i), start, [...this.routeIn(4).slice(1), { x: leader.x + 0.4 * (i ? 1 : -1), y: leader.y + 0.3 }], WALK * 1.3, () => {
          w.path = [this.entry, ...route];
          w.done = () => this.removeActor(w);
        });
      }
    }
    g.actors.forEach((a, i) => {
      a.path = [this.entry, ...route];
      a.speed = WALK * (withNeighbors ? 0.9 : 1);
      a.done = () => {
        this.removeActor(a);
        if (i === 0) this.dropGuest(kind);
      };
      // Tunggu warga datang sebelum ikut berjalan.
      if (withNeighbors) {
        const path = a.path;
        a.path = [];
        this.scene.time.delayedCall(2200, () => (a.path = path));
      }
    });
  }

  /**
   * Kenalan menolong: ambulans (nakes) atau mobil patroli (polisi) berhenti di samping gerobak,
   * dua orang turun, membawa tamu ke kendaraan, lalu pergi.
   */
  rescue(kind: 'odgj' | 'ormas', onDone: () => void): void {
    const g = this.guests.get(kind);
    const road = findRoad(this.map);
    if (!g || g.leaving || !road) {
      if (g) this.dismiss(kind);
      onDone();
      return;
    }
    g.leaving = true;
    this.hideBubble(g);
    const key = kind === 'odgj' ? VEHICLE_KEYS.ambulans : VEHICLE_KEYS.polisi;
    const crew = kind === 'odgj' ? 'nakes' : 'polisi';
    const sprite = this.scene.add.image(0, 0, key);
    applyAnchor(sprite, key);
    const fromMin = road.stop - road.min > road.max - road.stop;
    const dir: 1 | -1 = fromMin ? 1 : -1;
    const v = { sprite, t: fromMin ? road.min - 2 : road.max + 2, target: road.stop, dir, phase: 'arrive' as 'arrive' | 'wait' | 'leave', released: false, onPark: () => undefined as void };
    const doorAt = (): Point => (road.axis === 'x' ? { x: road.stop, y: road.lane + (this.entry.y > road.lane ? 0.8 : -0.8) } : { x: road.lane + (this.entry.x > road.lane ? 0.8 : -0.8), y: road.stop });
    v.onPark = () => {
      const door = doorAt();
      const targets = g.actors.filter((a) => a.sprite.active);
      let returned = 0;
      const total = 2 + targets.length;
      const back = (): void => {
        returned++;
        if (returned >= total) {
          v.released = true;
          this.dropGuest(kind);
          onDone();
        }
      };
      for (let i = 0; i < 2; i++) {
        const tgt = targets[Math.min(i, targets.length - 1)];
        const goal = tgt ? { x: tgt.x + (i ? 0.45 : -0.45), y: tgt.y + 0.2 } : this.entry;
        const crewActor = this.spawnActor(human(crew), door, [goal], WALK * 1.2, () => {
          this.scene.time.delayedCall(600, () => {
            crewActor.path = [door];
            crewActor.done = () => {
              this.removeActor(crewActor);
              back();
            };
            if (i === 0) {
              targets.forEach((t, k) => {
                t.path = [{ x: door.x + k * 0.3, y: door.y }];
                t.speed = WALK * 1.1;
                t.done = () => {
                  this.removeActor(t);
                  back();
                };
              });
            }
          });
        });
      }
    };
    this.vehicles.push(v);
  }

  private hideBubble(g: Guest): void {
    g.bubble.setVisible(false);
    g.icon.setVisible(false);
    if (g.bubble.input) g.bubble.input.enabled = false;
  }

  private dropGuest(kind: 'odgj' | 'ormas'): void {
    const g = this.guests.get(kind);
    if (!g) return;
    g.bubble.destroy();
    g.icon.destroy();
    g.label?.destroy();
    this.guests.delete(kind);
  }

  /**
   * Geser kamera supaya tamu & petunjuk di atas kepalanya terlihat di atas panel (layar sempit).
   * `panelTop` = tepi atas panel dalam piksel layar.
   */
  focusGuest(kind: 'odgj' | 'ormas', panelTop: number): void {
    const g = this.guests.get(kind);
    const leader = g?.actors[0];
    if (!leader) return;
    const cam = this.scene.cameras.main;
    const p = this.worldPos(leader.x, leader.y);
    const screenY = (p.y - 40 - cam.worldView.y) * cam.zoom;
    if (screenY + 20 < panelTop) return;
    // Taruh kepala tamu di tengah ruang yang tersisa di atas panel (di bawah HUD ± 120 px).
    const targetY = Math.max(130, (120 + panelTop) / 2);
    const centerY = p.y - 30 + (cam.height / 2 - targetY) / cam.zoom;
    cam.pan(p.x, centerY, 320, 'Sine.easeInOut');
  }

  /** Posisi layar balon "!!!" (untuk uji & petunjuk). */
  guestScreenPositions(): { kind: string; x: number; y: number }[] {
    const cam = this.scene.cameras.main;
    return [...this.guests.entries()]
      .filter(([, g]) => g.bubble.visible)
      .map(([kind, g]) => ({ kind, x: (g.bubble.x - cam.worldView.x) * cam.zoom, y: (g.bubble.y - 12 - cam.worldView.y) * cam.zoom }));
  }

  private float(at: Point, text: string, color: string): void {
    const p = this.worldPos(at.x, at.y);
    const label = this.scene.add
      .text(p.x, p.y - 18, text, { fontFamily: 'system-ui, sans-serif', fontSize: '9px', fontStyle: 'bold', color, stroke: '#1b1220', strokeThickness: 3, resolution: 4 })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.glow + 10);
    this.scene.tweens.add({ targets: label, y: p.y - 34, alpha: 0, duration: 1400, ease: 'Sine.easeOut', onComplete: () => label.destroy() });
  }

  /** Dipanggil tiap frame. `deltaMs` = waktu terlihat (0 saat jeda). */
  update(deltaMs: number): void {
    this.elapsed += deltaMs;
    const dt = Math.min(deltaMs, 100) / 1000;
    for (const a of [...this.actors]) this.step(a, dt);
    for (const g of this.guests.values()) {
      const leader = g.actors[0];
      if (!leader || !g.bubble.visible) continue;
      const p = this.worldPos(leader.x, leader.y);
      const bob = Math.round(Math.sin(this.elapsed / 220) * 1.2);
      g.bubble.setPosition(p.x + 10, p.y - 25 + bob).setDepth(DEPTH.cables - 7);
      g.icon.setPosition(p.x + 10, p.y - 37 + bob).setDepth(DEPTH.cables - 6);
    }
    if (this.pet && deltaMs > 0) {
      // Sesekali menoleh.
      this.pet.setFlipX(Math.floor(this.elapsed / 2600) % 2 === 1);
    }
    const road = findRoadCache.get(this.map) ?? findRoadCache.set(this.map, findRoad(this.map)).get(this.map) ?? null;
    if (!road) return;
    for (const v of [...this.vehicles]) {
      const step = dt * DRIVE;
      if (v.phase === 'arrive') {
        const d = Math.sign(v.target - v.t);
        v.t += d * step;
        if (Math.sign(v.target - v.t) !== d || d === 0) {
          v.t = v.target;
          v.phase = 'wait';
          v.onPark();
        }
      } else if (v.phase === 'wait') {
        if (v.released) v.phase = 'leave';
      } else {
        v.t += v.dir * step;
        if (v.t < road.min - 3 || v.t > road.max + 3) {
          v.sprite.destroy();
          this.vehicles.splice(this.vehicles.indexOf(v), 1);
          continue;
        }
      }
      const half = 34 / 16 / 2;
      const [x, y] = road.axis === 'x' ? [v.t - half, road.lane] : [road.lane, v.t - half];
      const cx = road.axis === 'x' ? v.t : road.lane;
      const cy = road.axis === 'x' ? road.lane : v.t;
      const elev = terrainAt(this.map, Math.floor(cx), Math.floor(cy))?.elevation ?? 0;
      const p = tileToWorld(x, y, elev);
      v.sprite.setPosition(Math.round(p.x), Math.round(p.y)).setFlipX(road.axis === 'y').setDepth(entityDepth(cx, cy));
    }
  }

  clear(): void {
    for (const a of this.actors) a.sprite.destroy();
    this.actors.clear();
    for (const kind of [...this.guests.keys()]) this.dropGuest(kind);
    for (const v of this.vehicles) v.sprite.destroy();
    this.vehicles = [];
  }

  destroy(): void {
    this.clear();
    this.pet?.destroy();
    this.pet = null;
  }
}

const findRoadCache = new Map<MapData, ReturnType<typeof findRoad>>();
