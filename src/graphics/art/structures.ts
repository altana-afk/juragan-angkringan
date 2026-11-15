import { objectTextureKey } from '../../world/objectTypes';
import { hashNoise, SeededRandom } from '../../utils/random';
import { shade, type Color } from '../color';
import { paintIsoSprite, type IsoPainter, type Vec3 } from '../IsoPainter';
import { PAL } from '../palette';
import { foliageBlob } from './helpers';
import type { ArtEntry, LightAnchor } from './types';

const WINDOW_LIGHT = 0xffcf7a;

type Facing = 'x' | 'y';

/**
 * Gambar persegi pada muka depan bangunan.
 * facing 'x' → bidang x = plane, posisi sepanjang sumbu y; facing 'y' → bidang y = plane, sepanjang x.
 * `along` diukur dari kiri layar ke kanan (untuk 'x' artinya dari y besar ke kecil).
 */
function frontRect(p: IsoPainter, facing: Facing, plane: number, span: number, along: number, z: number, length: number, h: number, color: Color, alpha = 255): void {
  if (facing === 'x') p.faceX(plane, span - along - length, z, length, h, color, alpha);
  else p.faceY(plane, along, z, length, h, color, alpha);
}

function windowOn(p: IsoPainter, facing: Facing, plane: number, span: number, along: number, z: number, w: number, h: number, lit: boolean): void {
  frontRect(p, facing, plane, span, along - 1, z - 1, w + 2, h + 2, PAL.frame);
  frontRect(p, facing, plane, span, along, z, w, h, lit ? WINDOW_LIGHT : PAL.windowDark);
  if (lit) frontRect(p, facing, plane, span, along, z, w, Math.max(1, Math.floor(h / 3)), shade(WINDOW_LIGHT, 1.08));
  frontRect(p, facing, plane, span, along + w / 2 - 0.5, z, 1, h, PAL.frame);
  frontRect(p, facing, plane, span, along, z + h / 2 - 0.5, w, 1, PAL.frame);
}

/** Koordinat lampu tepat di depan jendela (untuk cahaya dari dalam rumah). */
function windowLight(facing: Facing, plane: number, span: number, along: number, z: number, w: number, h: number): LightAnchor {
  const center = along + w / 2;
  const base = { z: z + h / 2 - 2, radius: 30, color: WINDOW_LIGHT, intensity: 0.55, flicker: 0.02 };
  return facing === 'x' ? { x: plane + 3, y: span - center, ...base } : { x: center, y: plane + 3, ...base };
}

interface HouseOptions {
  readonly w: number;
  readonly d: number;
  readonly facing: Facing;
  readonly wall: Color;
  readonly roof: Color;
  readonly seed: number;
  readonly lit: readonly boolean[];
}

function drawPitchedRoof(p: IsoPainter, w: number, d: number, H: number, R: number, o: number, ridgeAlong: Facing, roof: Color, wall: Color, bands = 6, corrugated = false): void {
  const dark = shade(roof, 0.62);
  const edge = shade(roof, 0.5);
  if (ridgeAlong === 'y') {
    // lereng belakang (menghadap x−)
    p.poly([{ x: -o, y: -o, z: H - 1 }, { x: w / 2, y: -o, z: H + R }, { x: w / 2, y: d + o, z: H + R }, { x: -o, y: d + o, z: H - 1 }], dark);
    // segitiga gable di sisi y+
    p.poly([{ x: 0, y: d, z: H }, { x: w, y: d, z: H }, { x: w / 2, y: d, z: H + R }], shade(wall, 0.82));
    p.poly([{ x: -o, y: d + o, z: H - 1 }, { x: w / 2, y: d + o, z: H + R }, { x: w / 2, y: d + o, z: H + R - 2 }, { x: -o, y: d + o, z: H - 3 }], edge);
    for (let i = 0; i < bands; i++) {
      const t0 = i / bands;
      const t1 = (i + 1) / bands;
      const x0 = w / 2 + t0 * (w / 2 + o);
      const x1 = w / 2 + t1 * (w / 2 + o);
      const z0 = H + R - t0 * (R + 1);
      const z1 = H + R - t1 * (R + 1);
      const color = corrugated ? (i % 2 ? roof : shade(roof, 1.12)) : i % 2 ? shade(roof, 0.88) : roof;
      p.poly([{ x: x0, y: -o, z: z0 }, { x: x1, y: -o, z: z1 }, { x: x1, y: d + o, z: z1 }, { x: x0, y: d + o, z: z0 }], p.noisy(color, 0.04, 300 + i));
    }
    p.poly([{ x: w / 2, y: d + o, z: H + R }, { x: w + o, y: d + o, z: H - 1 }, { x: w + o, y: d + o, z: H - 3 }, { x: w / 2, y: d + o, z: H + R - 2 }], edge);
    p.poly([{ x: w + o, y: -o, z: H - 1 }, { x: w + o, y: d + o, z: H - 1 }, { x: w + o, y: d + o, z: H - 3 }, { x: w + o, y: -o, z: H - 3 }], edge);
    p.line3({ x: w / 2, y: -o, z: H + R }, { x: w / 2, y: d + o, z: H + R }, shade(roof, 1.2));
  } else {
    p.poly([{ x: -o, y: -o, z: H - 1 }, { x: w + o, y: -o, z: H - 1 }, { x: w + o, y: d / 2, z: H + R }, { x: -o, y: d / 2, z: H + R }], dark);
    p.poly([{ x: w, y: 0, z: H }, { x: w, y: d, z: H }, { x: w, y: d / 2, z: H + R }], shade(wall, 0.66));
    p.poly([{ x: w + o, y: -o, z: H - 1 }, { x: w + o, y: d / 2, z: H + R }, { x: w + o, y: d / 2, z: H + R - 2 }, { x: w + o, y: -o, z: H - 3 }], edge);
    for (let i = 0; i < bands; i++) {
      const t0 = i / bands;
      const t1 = (i + 1) / bands;
      const y0 = d / 2 + t0 * (d / 2 + o);
      const y1 = d / 2 + t1 * (d / 2 + o);
      const z0 = H + R - t0 * (R + 1);
      const z1 = H + R - t1 * (R + 1);
      const color = corrugated ? (i % 2 ? roof : shade(roof, 1.12)) : i % 2 ? shade(roof, 0.88) : roof;
      p.poly([{ x: -o, y: y0, z: z0 }, { x: w + o, y: y0, z: z0 }, { x: w + o, y: y1, z: z1 }, { x: -o, y: y1, z: z1 }], p.noisy(color, 0.04, 400 + i));
    }
    p.poly([{ x: w + o, y: d / 2, z: H + R }, { x: w + o, y: d + o, z: H - 1 }, { x: w + o, y: d + o, z: H - 3 }, { x: w + o, y: d / 2, z: H + R - 2 }], edge);
    p.poly([{ x: -o, y: d + o, z: H - 1 }, { x: w + o, y: d + o, z: H - 1 }, { x: w + o, y: d + o, z: H - 3 }, { x: -o, y: d + o, z: H - 3 }], edge);
    p.line3({ x: -o, y: d / 2, z: H + R }, { x: w + o, y: d / 2, z: H + R }, shade(roof, 1.2));
  }
}

function paintHouse(o: HouseOptions): { art: ReturnType<typeof paintIsoSprite>; lights: LightAnchor[] } {
  const H = 30;
  const R = 16;
  const overhang = 4;
  const lights: LightAnchor[] = [];
  const art = paintIsoSprite({ footW: o.w, footD: o.d, height: H + R + 4, margin: 14 }, (p) => {
    p.box(0, 0, 0, o.w, o.d, H, o.wall, { noise: 0.03, seed: o.seed, top: false });
    p.faceY(o.d, 0, 0, o.w, 3, PAL.wallBase);
    p.faceX(o.w, 0, 0, o.d, 3, shade(PAL.wallBase, 0.8));

    const frontPlane = o.facing === 'x' ? o.w : o.d;
    const frontSpan = o.facing === 'x' ? o.d : o.w;
    // pintu di tengah
    const doorW = 10;
    const doorAlong = frontSpan / 2 - doorW / 2;
    frontRect(p, o.facing, frontPlane, frontSpan, doorAlong - 1, 0, doorW + 2, 21, PAL.frame);
    frontRect(p, o.facing, frontPlane, frontSpan, doorAlong, 0, doorW, 20, PAL.woodDark);
    frontRect(p, o.facing, frontPlane, frontSpan, doorAlong + doorW / 2 - 0.5, 0, 1, 20, shade(PAL.woodDark, 0.8));
    frontRect(p, o.facing, frontPlane, frontSpan, doorAlong + doorW - 2.5, 10, 1, 1, PAL.emberHot);
    // jendela kiri & kanan pintu
    const winW = 10;
    const winH = 10;
    const positions = [frontSpan * 0.22 - winW / 2, frontSpan * 0.78 - winW / 2];
    positions.forEach((along, i) => {
      const lit = o.lit[i] ?? false;
      windowOn(p, o.facing, frontPlane, frontSpan, along, 10, winW, winH, lit);
      if (lit) lights.push(windowLight(o.facing, frontPlane, frontSpan, along, 10, winW, winH));
    });
    // jendela samping
    const sideFacing: Facing = o.facing === 'x' ? 'y' : 'x';
    const sidePlane = o.facing === 'x' ? o.d : o.w;
    const sideSpan = o.facing === 'x' ? o.w : o.d;
    const sideLit = o.lit[2] ?? false;
    windowOn(p, sideFacing, sidePlane, sideSpan, sideSpan / 2 - 4, 11, 8, 9, sideLit);
    if (sideLit) lights.push(windowLight(sideFacing, sidePlane, sideSpan, sideSpan / 2 - 4, 11, 8, 9));

    drawPitchedRoof(p, o.w, o.d, H, R, overhang, o.facing === 'x' ? 'y' : 'x', o.roof, o.wall);
  });
  return { art, lights };
}

export function paintHouses(): ArtEntry[] {
  const entries: ArtEntry[] = [];
  const xVariants: [string, Color, boolean[]][] = [
    ['cream', PAL.wallCream, [true, false, true]],
    ['mint', PAL.wallMint, [false, true, true]],
    ['peach', PAL.wallPeach, [true, true, false]],
  ];
  xVariants.forEach(([variant, wall, lit], i) => {
    const { art, lights } = paintHouse({ w: 48, d: 64, facing: 'x', wall, roof: PAL.roofTile, seed: 50 + i, lit });
    entries.push({ key: objectTextureKey('house_x', variant), art, meta: { lights } });
  });
  const yVariants: [string, Color, boolean[]][] = [
    ['blue', PAL.wallBlue, [true, false, true]],
    ['cream', PAL.wallCream, [false, true, false]],
  ];
  yVariants.forEach(([variant, wall, lit], i) => {
    const { art, lights } = paintHouse({ w: 64, d: 48, facing: 'y', wall, roof: PAL.roofTile, seed: 60 + i, lit });
    entries.push({ key: objectTextureKey('house_y', variant), art, meta: { lights } });
  });
  return entries;
}

const SHOP_VARIANTS: Record<string, { sign: string; color: Color; wall: Color }> = {
  warung: { sign: 'WARUNG', color: 0xb83a2e, wall: 0xe4d2a8 },
  laundry: { sign: 'LAUNDRY', color: 0x2e78b0, wall: 0xd7dde2 },
  pulsa: { sign: 'PULSA', color: 0x2f9a58, wall: 0xe8d9b8 },
  fotokopi: { sign: 'FOTOKOPI', color: 0x7d4596, wall: 0xdcd0c0 },
};

/** Ruko dua lantai dengan rolling door terbuka, papan nama, dan etalase menyala. */
export function paintShops(): ArtEntry[] {
  return Object.entries(SHOP_VARIANTS).map(([variant, cfg], index) => {
    const w = 64;
    const d = 64;
    const H = 50;
    const lights: LightAnchor[] = [];
    const art = paintIsoSprite({ footW: w, footD: d, height: H + 8, margin: 14 }, (p) => {
      const rng = new SeededRandom(`shop-${variant}`);
      p.box(0, 0, 0, w, d, H, cfg.wall, { noise: 0.03, seed: 70 + index, top: false });
      p.faceY(d, 0, 0, w, 3, PAL.wallBase);
      p.faceX(w, 0, 0, d, 3, shade(PAL.wallBase, 0.8));
      // atap datar + dinding pembatas (parapet)
      p.top(0, 0, H, w, d, shade(cfg.wall, 0.72));
      p.box(0, 0, H, w, 2, 4, cfg.wall);
      p.box(0, 0, H, 2, d, 4, cfg.wall);
      p.box(w - 2, 0, H, 2, d, 4, cfg.wall);
      p.box(0, d - 2, H, w, 2, 4, cfg.wall);
      // pembatas lantai
      p.faceX(w, 0, 33, d, 1.5, shade(cfg.wall, 0.7));
      p.faceY(d, 0, 33, w, 1.5, shade(cfg.wall, 0.85));

      // etalase lantai bawah (bidang x = w)
      const openY = 6;
      const openD = d - 12;
      p.faceX(w, openY, 0, openD, 20, (px, py) => {
        const n = hashNoise(px, py, 501 + index);
        return n > 0.97 ? 0xffe2a8 : 0x5a4636;
      });
      for (const z of [5, 10, 15]) {
        p.faceX(w - 0.01, openY + 2, z, openD - 4, 1, PAL.woodLight);
        for (let k = 0; k < openD - 6; k += 2) {
          if (rng.chance(0.75)) {
            const goods = rng.pick([0xe74c3c, 0xf1c40f, 0x3498db, 0x2ecc71, 0xecf0f1, 0xe67e22]);
            p.faceX(w - 0.02, openY + 3 + k, z + 1, 1.5, rng.int(2, 3), goods);
          }
        }
      }
      // rolling door tergulung di atas
      p.faceX(w, openY, 20, openD, 4, PAL.steelLight);
      for (let z = 20.5; z < 24; z += 1.5) p.faceX(w + 0.01, openY, z, openD, 0.6, PAL.steel);
      // papan nama menonjol
      p.box(w, 3, 24, 2, d - 6, 8, cfg.color);
      p.textXCentered(w + 2, 3, d - 6, 30.5, cfg.sign, PAL.white);
      lights.push({ x: w + 6, y: d / 2, z: 8, radius: 70, color: 0xffd9a0, intensity: 0.75, flicker: 0.02 });

      // jendela lantai atas (depan & samping)
      [0.2, 0.5, 0.8].forEach((t, i) => {
        const lit = rng.chance(0.5);
        windowOn(p, 'x', w, d, d * t - 5, 38, 10, 9, lit);
        if (lit && i !== 1) lights.push(windowLight('x', w, d, d * t - 5, 38, 10, 9));
      });
      p.faceX(w + 0.02, 6, 37, d - 12, 1, PAL.steelDark);
      [0.3, 0.7].forEach((t) => windowOn(p, 'y', d, w, w * t - 4, 38, 8, 9, rng.chance(0.4)));
      windowOn(p, 'y', d, w, w * 0.5 - 4, 10, 8, 9, false);
      // unit AC di samping
      p.box(w * 0.15, d, 40, 7, 3, 5, PAL.white);
      p.faceY(d + 3, w * 0.15 + 1, 41, 5, 3, PAL.steel);
    });
    return { key: objectTextureKey('shop', variant), art, meta: { lights } };
  });
}

/** Pos ronda: balai kayu beratap seng, kentongan, dan lampu bohlam. */
export function paintPosRonda(): ArtEntry {
  const w = 40;
  const d = 24;
  const H = 30;
  const art = paintIsoSprite({ footW: w, footD: d, height: H + 12, margin: 12 }, (p) => {
    const post = (x: number, y: number): void => p.box(x, y, 0, 1.5, 1.5, H, PAL.woodDark);
    post(0, 0);
    post(w - 1.5, 0);
    for (const [x, y] of [[3, 3], [w - 4.5, 3], [3, d - 4.5], [w - 4.5, d - 4.5]] as const) p.box(x, y, 0, 1.5, 1.5, 6, PAL.woodDark);
    p.box(1, 1, 6, w - 2, d - 2, 2, PAL.woodLight, { noise: 0.05, seed: 91 });
    for (let y = 4; y < d - 2; y += 4) p.line3({ x: 1, y, z: 8 }, { x: w - 1, y, z: 8 }, shade(PAL.woodLight, 0.78));
    post(0, d - 1.5);
    post(w - 1.5, d - 1.5);
    // kentongan
    p.line3({ x: 2.5, y: d, z: 26 }, { x: 2.5, y: d, z: 23 }, PAL.black);
    p.box(1.5, d - 0.5, 15, 2, 2, 8, PAL.wood);
    p.faceY(d + 1.5, 2, 18, 1, 3, PAL.black);
    // papan nama
    p.faceY(d + 0.2, 4, 20, w - 8, 7, PAL.frame);
    p.textYCentered(d + 0.2, 4, w - 8, 25.5, 'POS RONDA', 0x3a2a20);
    // bohlam
    p.line3({ x: w / 2, y: d / 2, z: H + 4 }, { x: w / 2, y: d / 2, z: H - 2 }, PAL.black);
    p.box(w / 2 - 0.8, d / 2 - 0.8, H - 4.5, 1.6, 1.6, 2.5, { top: 0xfff6c8, left: 0xffe08a, right: 0xffd06a });
    drawPitchedRoof(p, w, d, H, 8, 3, 'x', PAL.zinc, PAL.woodLight, 10, true);
  });
  return {
    key: objectTextureKey('pos_ronda', 'default'),
    art,
    meta: { lights: [{ x: w / 2, y: d / 2, z: H - 4, radius: 70, color: 0xfff0c0, intensity: 0.8, flicker: 0.04, glow: true, glowScale: 0.6 }] },
  };
}

export function paintStreetLamp(): ArtEntry {
  const art = paintIsoSprite({ footW: 4, footD: 4, height: 72, margin: 24 }, (p) => {
    p.box(0, 0, 0, 4, 4, 4, PAL.steelDark);
    p.box(1, 1, 4, 2, 2, 60, PAL.steel);
    p.box(-14, 1.4, 62, 15.5, 1.2, 1.4, PAL.steelDark);
    p.box(-17, 0.5, 59, 6, 3, 3, PAL.steelDark);
    p.faceY(3.52, -16.5, 59, 5, 1, 0xfff2c4);
  });
  return {
    key: objectTextureKey('street_lamp', 'default'),
    art,
    meta: { lights: [{ x: -14, y: 2, z: 57, radius: 130, color: 0xffe6bb, intensity: 0.9, flicker: 0.01, glow: true, glowScale: 0.8 }] },
  };
}

export function paintPowerPole(): ArtEntry {
  const art = paintIsoSprite({ footW: 3, footD: 3, height: 92, margin: 14 }, (p) => {
    p.box(0, 0, 0, 3, 3, 86, PAL.concrete, { noise: 0.04, seed: 13 });
    p.faceY(3, 0, 0, 3, 6, PAL.concreteDark);
    p.faceX(3, 0, 0, 3, 6, shade(PAL.concreteDark, 0.8));
    p.faceY(3.01, 0.3, 28, 2.4, 6, 0xd9c35a);
    p.faceY(3.02, 0.3, 40, 2.4, 4, 0xe9e2d0);
    p.box(-8, 0.9, 78, 19, 1.2, 2, PAL.steelDark);
    p.box(-7, 1, 80, 1.2, 1, 2.2, PAL.white);
    p.box(9, 1, 80, 1.2, 1, 2.2, PAL.white);
  });
  return {
    key: objectTextureKey('power_pole', 'concrete'),
    art,
    meta: { cableAnchors: [{ x: -6.4, y: 1.5, z: 82 }, { x: 9.6, y: 1.5, z: 82 }] },
  };
}

export function paintTrees(): ArtEntry[] {
  const round = paintIsoSprite({ footW: 16, footD: 16, height: 70, margin: 16 }, (p) => {
    p.box(6, 6, 0, 4, 4, 24, PAL.woodDark, { noise: 0.08, seed: 15 });
    const c = p.project(8, 8, 30);
    const blobs: [number, number, number][] = [[-5, -18, 8], [6, -17, 8], [0, -12, 11], [-9, -6, 8], [9, -7, 8], [0, -2, 8]];
    blobs.forEach(([dx, dy, r], i) => foliageBlob(p.canvas, c.x + dx, c.y + dy, r, 120 + i));
  });
  const tall = paintIsoSprite({ footW: 16, footD: 16, height: 86, margin: 16 }, (p) => {
    p.box(6.5, 6.5, 0, 3, 3, 34, PAL.woodDark, { noise: 0.08, seed: 16 });
    const c = p.project(8, 8, 36);
    const blobs: [number, number, number][] = [[0, -32, 5], [-4, -26, 6], [4, -27, 6], [0, -19, 8], [-5, -12, 7], [5, -13, 7], [0, -6, 7]];
    blobs.forEach(([dx, dy, r], i) => foliageBlob(p.canvas, c.x + dx, c.y + dy, r, 140 + i, { dark: 0x27482a, mid: 0x3a6a3a, light: 0x5a8f4a }));
  });
  return [
    { key: objectTextureKey('tree', 'round'), art: round },
    { key: objectTextureKey('tree', 'tall'), art: tall },
  ];
}

/**
 * Gedung kampus tiga lantai memanjang menghadap jalan: dinding krem bergaris bata, deretan jendela,
 * lobi berpilar di tengah, papan nama "KAMPUS", dan jam dinding. Hanya ada di peta "Dekat Kampus".
 */
export function paintCampus(): ArtEntry {
  const w = 64;
  const d = 176;
  const H = 70;
  const wall = 0xe6dcc4;
  const brick = 0xb55a3c;
  const lights: LightAnchor[] = [];
  const art = paintIsoSprite({ footW: w, footD: d, height: H + 20, margin: 16 }, (p) => {
    const rng = new SeededRandom('campus');
    p.box(0, 0, 0, w, d, H, wall, { noise: 0.025, seed: 801, top: false });
    p.top(0, 0, H, w, d, shade(wall, 0.7));
    // parapet & atap teknis
    p.box(0, 0, H, w, 2, 5, brick);
    p.box(w - 2, 0, H, 2, d, 5, brick);
    p.box(0, d - 2, H, w, 2, 5, brick);
    p.box(10, 30, H, 18, 24, 8, PAL.steelLight);
    p.box(10, 120, H, 14, 14, 6, PAL.steel);
    // pita bata per lantai
    for (const z of [0, 23, 46]) {
      p.faceX(w, 0, z, d, 3, brick);
      p.faceY(d, 0, z, w, 3, shade(brick, 0.85));
    }
    // jendela 3 lantai di sisi depan (bidang x = w), dilewati di area lobi
    const lobbyA = d / 2 - 22;
    const lobbyB = d / 2 + 22;
    for (const z of [7, 30, 53]) {
      for (let y = 6; y + 10 < d - 4; y += 15) {
        if (z === 7 && y + 10 > lobbyA && y < lobbyB) continue;
        const lit = rng.chance(z === 7 ? 0.55 : 0.4);
        windowOn(p, 'x', w, d, y, z, 10, 12, lit);
        if (lit && rng.chance(0.35)) lights.push(windowLight('x', w, d, y, z, 10, 12));
      }
    }
    // jendela samping
    for (const z of [7, 30, 53]) windowOn(p, 'y', d, w, w / 2 - 6, z, 12, 12, rng.chance(0.5));
    // lobi: kanopi + pilar + pintu kaca
    p.faceX(w, lobbyA + 6, 0, lobbyB - lobbyA - 12, 18, 0x3a4a56);
    p.faceX(w + 0.01, lobbyA + 8, 0, lobbyB - lobbyA - 16, 16, (px, py) => (hashNoise(px, py, 811) > 0.93 ? 0xcfe8ff : 0x6f8ea6));
    p.box(w, lobbyA, 20, 12, lobbyB - lobbyA, 3, 0xd9d2c0);
    for (const y of [lobbyA + 1, lobbyA + 15, lobbyB - 17, lobbyB - 3]) p.box(w + 8, y, 0, 2.5, 2.5, 20, PAL.white);
    // papan nama di atas lobi
    p.box(w + 0.5, lobbyA + 2, 34, 2, lobbyB - lobbyA - 4, 9, 0x1f4e79);
    p.textXCentered(w + 2.6, lobbyA + 2, lobbyB - lobbyA - 4, 41, 'KAMPUS', PAL.white);
    // jam dinding
    p.box(w + 0.3, d / 2 - 3, 58, 1, 6, 6, PAL.white);
    p.faceX(w + 1.35, d / 2 - 0.5, 60, 1, 3, PAL.black);
    lights.push({ x: w + 12, y: d / 2, z: 18, radius: 90, color: 0xfff1d6, intensity: 0.9, flicker: 0.01 });
  });
  return { key: objectTextureKey('campus', 'default'), art, meta: { lights } };
}

const STALL_TARPS: Record<string, Color> = { merah: 0xc8423a, biru: 0x2f6fb0, hijau: 0x3f8f4a, kuning: 0xe0a92e };

/** Lapak pasar: meja kayu penuh dagangan, terpal miring di atas tiang bambu. Varian warna terpal. */
export function paintMarketStalls(): ArtEntry[] {
  return Object.entries(STALL_TARPS).map(([variant, tarp], vi) => {
    const w = 32;
    const d = 24;
    const art = paintIsoSprite({ footW: w, footD: d, height: 34, margin: 10 }, (p) => {
      const rng = new SeededRandom(`stall-${variant}`);
      for (const [x, y] of [[0, 0], [w - 1.5, 0], [0, d - 1.5], [w - 1.5, d - 1.5]] as const) p.box(x, y, 0, 1.5, 1.5, 24, PAL.bamboo);
      p.box(1, 2, 0, w - 2, d - 4, 10, PAL.wood, { noise: 0.05, seed: 900 + vi });
      // dagangan: sayur, buah, bumbu
      for (let x = 2; x < w - 3; x += 3.2) {
        for (let y = 3; y < d - 5; y += 3.2) {
          const c = rng.pick([0x6aa84f, 0xe06666, 0xf6b26b, 0xffd966, 0x93c47d, 0xcc4125, 0xb45f06]);
          p.box(x, y, 10, 2.6, 2.6, rng.int(1, 3), c);
        }
      }
      // terpal miring
      p.poly([{ x: -2, y: -2, z: 27 }, { x: w + 2, y: -2, z: 27 }, { x: w + 2, y: d + 3, z: 21 }, { x: -2, y: d + 3, z: 21 }], tarp);
      p.poly([{ x: -2, y: d + 3, z: 21 }, { x: w + 2, y: d + 3, z: 21 }, { x: w + 2, y: d + 3, z: 18.5 }, { x: -2, y: d + 3, z: 18.5 }], shade(tarp, 0.75));
      for (let x = 0; x < w; x += 8) p.line3({ x, y: -2, z: 27 }, { x, y: d + 3, z: 21 }, shade(tarp, 1.2));
      // keranjang di depan
      p.box(w - 8, d - 1, 0, 6, 5, 5, 0x8a5a34);
      p.box(w - 7.5, d - 0.5, 5, 5, 4, 1.5, rng.pick([0xe06666, 0x6aa84f]));
    });
    return { key: objectTextureKey('market_stall', variant), art, meta: { lights: [{ x: w / 2, y: d / 2, z: 20, radius: 40, color: 0xffd28a, intensity: 0.55, flicker: 0.05 }] } };
  });
}

/** Rel kereta (dekal tanah): kerikil, bantalan kayu, dua batang rel baja. Membujur sepanjang sumbu y. */
export function paintRail(): ArtEntry {
  const w = 16;
  const d = 64;
  const art = paintIsoSprite({ footW: w, footD: d, height: 2, margin: 4, outline: false }, (p) => {
    p.top(0, 0, 0, w, d, (x, y) => (hashNoise(x, y, 913) > 0.5 ? 0x8a8478 : 0x6f6a60));
    for (let y = 1; y < d; y += 4) p.box(1.5, y, 0, w - 3, 1.6, 0.6, 0x5a3a24);
    for (const x of [4, w - 5]) {
      p.box(x, 0, 0.6, 1, d, 0.8, 0xb8bec6);
      p.line3({ x, y: 0, z: 1.4 }, { x, y: d, z: 1.4 }, 0xe6eaee);
    }
  });
  return { key: objectTextureKey('rail', 'default'), art };
}

/** Stasiun kereta: bangunan kolonial putih-hijau, atap peron, jam besar, papan "STASIUN". */
export function paintStation(): ArtEntry {
  const w = 64;
  const d = 176;
  const H = 44;
  const wall = 0xf0ece0;
  const trim = 0x2f7a6a;
  const lights: LightAnchor[] = [];
  const art = paintIsoSprite({ footW: w + 14, footD: d, height: H + 30, margin: 16 }, (p) => {
    const rng = new SeededRandom('station');
    p.box(0, 0, 0, w, d, H, wall, { noise: 0.02, seed: 931, top: false });
    // atap pelana panjang hijau
    p.poly([{ x: -3, y: -3, z: H }, { x: w + 3, y: -3, z: H }, { x: w / 2, y: -3, z: H + 18 }], shade(trim, 0.8));
    p.poly([{ x: w + 3, y: -3, z: H }, { x: w + 3, y: d + 3, z: H }, { x: w / 2, y: d + 3, z: H + 18 }, { x: w / 2, y: -3, z: H + 18 }], trim);
    p.poly([{ x: -3, y: d + 3, z: H }, { x: w + 3, y: d + 3, z: H }, { x: w / 2, y: d + 3, z: H + 18 }], shade(trim, 0.7));
    p.faceX(w, 0, 0, d, 3, trim);
    p.faceY(d, 0, 0, w, 3, shade(trim, 0.85));
    p.faceX(w, 0, H - 4, d, 4, trim);
    // jendela tinggi berlengkung
    for (let y = 8; y < d - 14; y += 18) {
      if (y > d / 2 - 30 && y < d / 2 + 20) continue;
      const lit = rng.chance(0.6);
      windowOn(p, 'x', w, d, y, 8, 10, 22, lit);
      if (lit && rng.chance(0.4)) lights.push(windowLight('x', w, d, y, 8, 10, 22));
    }
    // pintu masuk utama + menara jam
    const cy = d / 2;
    p.box(w - 6, cy - 24, 0, 8, 48, H + 10, wall, { noise: 0.02, seed: 932 });
    p.faceX(w + 2, cy - 14, 0, 28, 26, 0x3a4a56);
    p.faceX(w + 2.01, cy - 12, 0, 24, 24, (px, py) => (hashNoise(px, py, 933) > 0.94 ? 0xfff2c4 : 0x7a5a3a));
    p.box(w - 6, cy - 24, H + 10, 8, 48, 3, trim);
    p.box(w + 2, cy - 22, 30, 1.5, 44, 9, trim);
    p.textXCentered(w + 3.6, cy - 22, 44, 37.5, 'STASIUN', PAL.white);
    p.box(w + 2, cy - 5, 43, 1, 10, 10, PAL.white);
    p.faceX(w + 3.1, cy - 0.5, 47, 1, 4, PAL.black);
    p.faceX(w + 3.1, cy - 0.5, 47.5, 3, 1, PAL.black);
    // kanopi peron di depan pintu
    p.box(w, cy - 34, 22, 14, 68, 2, shade(trim, 1.1));
    for (const y of [cy - 32, cy - 12, cy + 10, cy + 30]) p.box(w + 12, y, 0, 1.5, 1.5, 22, PAL.steelLight);
    lights.push({ x: w + 14, y: cy, z: 18, radius: 110, color: 0xfff1d6, intensity: 0.95, flicker: 0.01 });
  });
  return { key: objectTextureKey('station', 'default'), art, meta: { lights } };
}

/** Bianglala pasar malam: rangka baja, 8 gondola warna-warni, lampu di ujung jari-jari. Menghadap pemain. */
export function paintFerrisWheel(): ArtEntry {
  const lights: LightAnchor[] = [];
  const colors = [0xe0453a, 0xf6c453, 0x3fa0d8, 0x6ac15a, 0xd85ab8, 0xff8a2f, 0x9a6ae0, 0x3fd0b8];
  const art = paintIsoSprite({ footW: 48, footD: 32, height: 110, margin: 14 }, (p) => {
    const cx = 24;
    const cy = 16;
    const cz = 58;
    const R = 46;
    // kaki penyangga
    for (const dx of [-16, 16]) {
      p.line3({ x: cx + dx, y: cy - 6, z: 0 }, { x: cx, y: cy, z: cz }, PAL.steelDark);
      p.line3({ x: cx + dx, y: cy + 6, z: 0 }, { x: cx, y: cy, z: cz }, PAL.steelDark);
      p.line3({ x: cx + dx + 1, y: cy + 6, z: 0 }, { x: cx + 1, y: cy, z: cz }, PAL.steel);
    }
    p.box(cx - 18, cy - 8, 0, 36, 16, 3, 0x6a5a4a);
    // roda pada bidang x–z (y = cy)
    const pt = (a: number, r: number): Vec3 => ({ x: cx + Math.cos(a) * r, y: cy, z: cz + Math.sin(a) * r });
    for (let i = 0; i < 48; i++) {
      const a0 = (i / 48) * Math.PI * 2;
      const a1 = ((i + 1) / 48) * Math.PI * 2;
      p.line3(pt(a0, R), pt(a1, R), 0xd9dde2);
      p.line3(pt(a0, R - 3), pt(a1, R - 3), 0xa8b0b8);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      p.line3(pt(a, 0), pt(a, R), 0xc8ced4);
      const g = pt(a, R);
      p.box(g.x - 3, cy - 3, g.z - 8, 6, 6, 6, colors[i] as Color);
      p.box(g.x - 3.5, cy - 3.5, g.z - 2, 7, 7, 1.2, shade(colors[i] as Color, 0.7));
      lights.push({ x: g.x, y: cy, z: g.z, radius: 30, color: colors[i] as Color, intensity: 0.55, flicker: 0.15, glow: true, glowScale: 0.3 });
    }
    p.discY(cx, cy + 0.5, cz, 4, 0xf6c453);
  });
  return { key: objectTextureKey('ferris_wheel', 'default'), art, meta: { lights } };
}

/** Komidi putar: atap kerucut bergaris, kuda-kudaan, lampu bohlam di tepi atap. */
export function paintCarousel(): ArtEntry {
  const lights: LightAnchor[] = [];
  const art = paintIsoSprite({ footW: 48, footD: 48, height: 56, margin: 12 }, (p) => {
    const c = 24;
    p.discTop(c, c, 0, 23, 0x6a4a3a);
    p.discTop(c, c, 3, 22, 0xc8a46a);
    p.box(c - 1.5, c - 1.5, 3, 3, 3, 30, 0xf6c453);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const x = c + Math.cos(a) * 16;
      const y = c + Math.sin(a) * 16;
      p.box(x - 0.5, y - 0.5, 3, 1, 1, 28, 0xf6c453);
      p.box(x - 3, y - 1, 9 + (i % 2) * 3, 6, 2, 4, i % 3 === 0 ? 0xffffff : i % 3 === 1 ? 0x8a5a34 : 0x3a3436);
    }
    const stripes = [0xe0453a, 0xf2eee2];
    for (let i = 0; i < 16; i++) {
      const t0 = (i / 16) * Math.PI * 2;
      const t1 = ((i + 1) / 16) * Math.PI * 2;
      p.poly([{ x: c, y: c, z: 50 }, { x: c + Math.cos(t0) * 24, y: c + Math.sin(t0) * 24, z: 33 }, { x: c + Math.cos(t1) * 24, y: c + Math.sin(t1) * 24, z: 33 }], stripes[i % 2] as Color);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.4;
      lights.push({ x: c + Math.cos(a) * 24, y: c + Math.sin(a) * 24, z: 32, radius: 34, color: i % 2 ? 0xffd34a : 0xff8ae0, intensity: 0.5, flicker: 0.1, glow: true, glowScale: 0.3 });
    }
  });
  return { key: objectTextureKey('carousel', 'default'), art, meta: { lights } };
}

/** Untaian lampu warna-warni antara dua tiang (dekorasi pasar malam), membentang sepanjang sumbu y. */
export function paintStringLights(): ArtEntry {
  const lights: LightAnchor[] = [];
  const bulbs = [0xff5a5a, 0xffd34a, 0x5ad1ff, 0x7aff7a, 0xff8ae0];
  const art = paintIsoSprite({ footW: 4, footD: 64, height: 34, margin: 8 }, (p) => {
    p.box(1, 0, 0, 1.4, 1.4, 30, PAL.woodDark);
    p.box(1, 62, 0, 1.4, 1.4, 30, PAL.woodDark);
    let prev: Vec3 = { x: 1.7, y: 0.7, z: 29 };
    for (let i = 1; i <= 16; i++) {
      const y = (i / 16) * 62 + 0.7;
      const sag = Math.sin((i / 16) * Math.PI) * 7;
      const cur: Vec3 = { x: 1.7, y, z: 29 - sag };
      p.line3(prev, cur, PAL.black);
      const b = p.project(cur.x, cur.y, cur.z - 1);
      p.canvas.fillEllipse(b.x, b.y, 1, 1, bulbs[i % bulbs.length] as Color);
      if (i % 4 === 2) lights.push({ x: cur.x, y: cur.y, z: cur.z, radius: 28, color: bulbs[i % bulbs.length] as Color, intensity: 0.45, flicker: 0.12, glow: true, glowScale: 0.25 });
      prev = cur;
    }
  });
  return { key: objectTextureKey('string_lights', 'default'), art, meta: { lights } };
}
