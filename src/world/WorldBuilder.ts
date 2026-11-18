import { activeObjects } from './MapData';
import { totalEffects } from '../systems/UpgradeSystem';
import * as Phaser from 'phaser';
import { bakeGround, GROUND_BASE_DEPTH } from '../graphics/art/ground';
import { FX_KEYS } from '../graphics/art/effects';
import { customAnimKey, customObjectDefs } from '../graphics/customArt';
import { applyAnchor, getArtInfo, hasArt, registerGround } from '../graphics/TextureFactory';
import { isInsideMap, mapWorldBounds, tileToWorld, worldToTile, type Point, type Rect } from '../iso/IsoMath';
import { hashString } from '../utils/random';
import { DEPTH, entityDepth, objectDepth } from './depth';
import type { WorldLight } from './LightingSystem';
import { terrainAt, type MapData, type MapObjectData } from './MapData';
import { objectType, objectTextureKey } from './objectTypes';

/** Ruang di atas peta untuk objek tinggi (tiang listrik, pohon) — piksel. */
const WORLD_EXTRA_TOP = 120;

export const ANIM_KEYS = {
  stoveFire: 'anim_stove_fire',
  sellerIdle: 'anim_seller_idle',
} as const;

export interface WorldView {
  readonly map: MapData;
  /** Kotak dunia (piksel) yang mencakup seluruh peta & objek tinggi. */
  readonly bounds: Rect;
  /** Titik fokus kamera (dunia). */
  readonly home: Point;
  readonly lights: readonly WorldLight[];
  /** Ubin di bawah titik dunia, atau null jika di luar peta. */
  pickTile(worldX: number, worldY: number): Point | null;
  /** Tampilkan / sembunyikan kursor ubin. */
  setCursor(tile: Point | null): void;
  destroy(): void;
}

export function groundTextureKey(mapId: string): string {
  return `ground_${mapId}`;
}

/** Pastikan tekstur lantai peta sudah dipanggang (dipanggil oleh LoadingScene). */
export function ensureGroundTexture(textures: Phaser.Textures.TextureManager, map: MapData): void {
  const key = groundTextureKey(map.id);
  if (!hasArt(key)) registerGround(textures, key, bakeGround(map));
}

/** Buat animasi global (dipanggil sekali setelah semua tekstur siap). */
export function ensureWorldAnimations(anims: Phaser.Animations.AnimationManager): void {
  if (!anims.exists(ANIM_KEYS.stoveFire)) {
    anims.create({
      key: ANIM_KEYS.stoveFire,
      frames: [0, 1, 2, 1].map((f) => ({ key: objectTextureKey('stove', 'anglo', f) })),
      frameRate: 7,
      repeat: -1,
    });
  }
  if (!anims.exists(ANIM_KEYS.sellerIdle)) {
    anims.create({
      key: ANIM_KEYS.sellerIdle,
      frames: [{ key: objectTextureKey('seller', 'default', 0), duration: 900 }, { key: objectTextureKey('seller', 'default', 1), duration: 700 }],
      repeat: -1,
    });
  }
  // Objek kustom beranimasi (lebih dari satu frame).
  for (const def of customObjectDefs()) {
    const key = customAnimKey(def.id);
    if (def.frames < 2) continue;
    if (anims.exists(key)) anims.remove(key);
    anims.create({
      key,
      frames: Array.from({ length: def.frames }, (_, i) => ({ key: objectTextureKey(def.id, 'default', i) })),
      frameRate: 1000 / def.frameMs,
      repeat: -1,
    });
  }
}

/**
 * Bangun dunia isometrik dari data peta: lantai, objek, kabel listrik, efek,
 * serta daftar sumber cahaya untuk LightingSystem.
 */
export function buildWorld(scene: Phaser.Scene, map: MapData, upgrades: readonly string[] = []): WorldView {
  ensureGroundTexture(scene.textures, map);
  const created: Phaser.GameObjects.GameObject[] = [];

  // Lantai
  const groundKey = groundTextureKey(map.id);
  const ground = getArtInfo(groundKey);
  created.push(scene.add.image(-ground.anchorX, -ground.anchorY, groundKey).setOrigin(0, 0).setDepth(DEPTH.ground));

  const lights: WorldLight[] = [];
  const poles: { obj: MapObjectData; anchors: Point[] }[] = [];

  for (const obj of activeObjects(map.objects, upgrades, totalEffects(upgrades).variants)) {
    const def = objectType(obj.type);
    const pos = tileToWorld(obj.x, obj.y);
    const isCharacter = obj.type === 'seller';
    const key = isCharacter ? objectTextureKey(obj.type, obj.variant, 0) : objectTextureKey(obj.type, obj.variant);
    const depth = isCharacter ? entityDepth(obj.x, obj.y) : objectDepth(def, obj.x, obj.y);

    let display: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
    if (def.fx?.includes('idle')) {
      const sprite = scene.add.sprite(pos.x, pos.y, key);
      sprite.play({ key: ANIM_KEYS.sellerIdle, startFrame: hashString(obj.id) % 2 });
      display = sprite;
    } else if (def.custom && def.custom.frames > 1 && scene.anims.exists(customAnimKey(def.id))) {
      const sprite = scene.add.sprite(pos.x, pos.y, key);
      sprite.play({ key: customAnimKey(def.id), startFrame: hashString(obj.id) % def.custom.frames });
      display = sprite;
    } else {
      display = scene.add.image(pos.x, pos.y, key);
    }
    applyAnchor(display, key);
    display.setDepth(depth);
    created.push(display);

    const info = getArtInfo(key);
    const seed = hashString(obj.id) % 1000;
    for (const [i, l] of (info.meta.lights ?? []).entries()) {
      const p = tileToWorld(obj.x + l.x / 16, obj.y + l.y / 16, l.z);
      lights.push({
        x: p.x,
        y: p.y,
        radius: l.radius,
        color: l.color,
        intensity: l.intensity,
        flicker: l.flicker ?? 0,
        glow: l.glow ?? false,
        glowScale: l.glowScale ?? 1,
        seed: seed + i * 31,
      });
    }

    if (def.fx?.includes('fire')) {
      const fireKey = objectTextureKey(obj.type, obj.variant, 0);
      const fire = scene.add.sprite(pos.x, pos.y, fireKey).play(ANIM_KEYS.stoveFire);
      applyAnchor(fire, fireKey);
      fire.setDepth(depth + 0.5);
      created.push(fire);
    }
    if (def.fx?.includes('smoke') && info.meta.smoke) {
      const s = info.meta.smoke;
      const p = tileToWorld(obj.x + s.x / 16, obj.y + s.y / 16, s.z);
      const emitter = scene.add.particles(p.x, p.y, FX_KEYS.smoke, {
        lifespan: { min: 1800, max: 2600 },
        frequency: 260,
        speedY: { min: -14, max: -8 },
        speedX: { min: -3, max: 5 },
        accelerationX: 2,
        scale: { start: 0.7, end: 2.2 },
        alpha: { start: 0.55, end: 0 },
        quantity: 1,
      });
      // Asap mengepul di atas tenda.
      emitter.setDepth(depth + 400);
      created.push(emitter);
    }
    if (info.meta.cableAnchors) {
      poles.push({
        obj,
        anchors: info.meta.cableAnchors.map((a) => tileToWorld(obj.x + a.x / 16, obj.y + a.y / 16, a.z)),
      });
    }
  }

  // Kabel listrik antar-tiang (urut sepanjang jalan)
  if (poles.length >= 2) {
    const cables = scene.add.graphics().setDepth(DEPTH.cables);
    cables.lineStyle(1, 0x15111a, 0.85);
    poles.sort((a, b) => a.obj.y - b.obj.y || a.obj.x - b.obj.x);
    for (let i = 0; i < poles.length - 1; i++) {
      const a = poles[i];
      const b = poles[i + 1];
      if (!a || !b) continue;
      const count = Math.min(a.anchors.length, b.anchors.length);
      for (let k = 0; k < count; k++) {
        const pa = a.anchors[k] as Point;
        const pb = b.anchors[k] as Point;
        const sag = 8 + Math.hypot(pb.x - pa.x, pb.y - pa.y) * 0.05;
        const curve = new Phaser.Curves.QuadraticBezier(
          new Phaser.Math.Vector2(pa.x, pa.y),
          new Phaser.Math.Vector2((pa.x + pb.x) / 2, (pa.y + pb.y) / 2 + sag * 2),
          new Phaser.Math.Vector2(pb.x, pb.y),
        );
        cables.strokePoints(curve.getPoints(24));
      }
    }
    created.push(cables);
  }

  // Kursor ubin
  const cursor = scene.add.image(0, 0, FX_KEYS.tileCursor).setDepth(DEPTH.tileCursor).setAlpha(0.75).setVisible(false);
  applyAnchor(cursor, FX_KEYS.tileCursor);
  created.push(cursor);

  const bounds = mapWorldBounds(map.width, map.height, WORLD_EXTRA_TOP, GROUND_BASE_DEPTH + 4);
  const home = tileToWorld(map.anchors.cameraHome.x, map.anchors.cameraHome.y);

  return {
    map,
    bounds,
    home,
    lights,
    pickTile(worldX: number, worldY: number): Point | null {
      // Perkiraan pertama tanpa ketinggian, lalu koreksi untuk ubin yang lebih tinggi (trotoar).
      let t = worldToTile(worldX, worldY);
      let tx = Math.floor(t.x);
      let ty = Math.floor(t.y);
      const elev = terrainAt(map, tx, ty)?.elevation ?? 0;
      if (elev > 0) {
        t = worldToTile(worldX, worldY + elev);
        tx = Math.floor(t.x);
        ty = Math.floor(t.y);
      }
      return isInsideMap(tx, ty, map.width, map.height) ? { x: tx, y: ty } : null;
    },
    setCursor(tile: Point | null): void {
      if (!tile) {
        cursor.setVisible(false);
        return;
      }
      const elev = terrainAt(map, tile.x, tile.y)?.elevation ?? 0;
      const p = tileToWorld(tile.x, tile.y, elev);
      cursor.setPosition(p.x, p.y).setVisible(true);
    },
    destroy(): void {
      for (const obj of created) obj.destroy();
      created.length = 0;
    },
  };
}
