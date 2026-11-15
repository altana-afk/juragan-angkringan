import { HALF_TILE_HEIGHT, HALF_TILE_WIDTH } from '../../iso/IsoMath';
import { maxElevation, terrainAt, type MapData } from '../../world/MapData';
import { TERRAINS, type TerrainId } from '../../world/terrain';
import { hashNoise } from '../../utils/random';
import { jitter, shade, type Color } from '../color';
import { PixelCanvas } from '../PixelCanvas';
import { PAL } from '../palette';

/** Tebal "dasar diorama" di tepi peta (piksel). */
export const GROUND_BASE_DEPTH = 10;

export interface GroundArt {
  readonly canvas: PixelCanvas;
  /** Posisi piksel di kanvas yang bersesuaian dengan koordinat dunia (0, 0). */
  readonly originX: number;
  readonly originY: number;
}

interface TileContext {
  readonly tx: number;
  readonly ty: number;
  readonly px: number;
  readonly py: number;
  readonly map: MapData;
}

type TileShader = (u: number, v: number, ctx: TileContext) => Color | null;

const isRoad = (map: MapData, x: number, y: number): boolean => {
  const t = terrainAt(map, x, y);
  // Di luar peta dianggap jalan juga agar marka tepi tidak muncul di ujung peta.
  return t === null ? true : t.road;
};

function roadEdgeLine(u: number, v: number, ctx: TileContext): boolean {
  const { map, tx, ty } = ctx;
  if (u >= 1.5 && u < 2.6 && !isRoad(map, tx - 1, ty)) return true;
  if (u >= 13.4 && u < 14.5 && !isRoad(map, tx + 1, ty)) return true;
  if (v >= 1.5 && v < 2.6 && !isRoad(map, tx, ty - 1)) return true;
  if (v >= 13.4 && v < 14.5 && !isRoad(map, tx, ty + 1)) return true;
  return false;
}

function asphaltBase(ctx: TileContext): Color {
  const n = hashNoise(ctx.px, ctx.py, 31);
  if (n < 0.1) return shade(PAL.asphalt, 0.88);
  if (n > 0.9) return PAL.asphaltLight;
  return jitter(PAL.asphalt, 0.02, hashNoise(ctx.tx, ctx.ty, 5));
}

const SHADERS: Record<TerrainId, TileShader> = {
  grass: (_u, _v, ctx) => {
    const n = hashNoise(ctx.px, ctx.py, 11);
    const tint = jitter(PAL.grass, 0.05, hashNoise(ctx.tx, ctx.ty, 3));
    if (hashNoise(ctx.px, ctx.py, 17) > 0.996) return hashNoise(ctx.px, ctx.py, 19) > 0.5 ? 0xf3e27a : 0xf1efe6;
    if (n < 0.14) return PAL.grassDark;
    if (n > 0.9) return PAL.grassLight;
    // rumput kecil: piksel terang dengan piksel gelap di bawahnya
    if (hashNoise(ctx.px, ctx.py - 1, 11) > 0.93) return shade(PAL.grassDark, 0.92);
    return tint;
  },
  dirt: (_u, _v, ctx) => {
    const n = hashNoise(ctx.px, ctx.py, 23);
    if (n > 0.992) return PAL.steelLight;
    if (n < 0.16) return PAL.dirtDark;
    if (n > 0.88) return PAL.dirtLight;
    return jitter(PAL.dirt, 0.04, hashNoise(ctx.tx, ctx.ty, 7));
  },
  paving: (u, v, ctx) => {
    const gu = u % 8;
    const gv = v % 8;
    if (gu < 1 || gv < 1) return PAL.pavingDark;
    const block = hashNoise(Math.floor(u / 8), Math.floor(v / 8), ctx.tx * 7 + ctx.ty * 13);
    const base = jitter(PAL.paving, 0.06, block);
    return jitter(base, 0.03, hashNoise(ctx.px, ctx.py, 29));
  },
  sidewalk: (u, v, ctx) => {
    if (u % 8 < 0.8 || v % 8 < 0.8) return PAL.sidewalkDark;
    return jitter(PAL.sidewalk, 0.035, hashNoise(ctx.px, ctx.py, 37));
  },
  asphalt: (u, v, ctx) => (roadEdgeLine(u, v, ctx) ? PAL.roadPaint : asphaltBase(ctx)),
  asphaltCenter: (u, v, ctx) => {
    if (roadEdgeLine(u, v, ctx)) return PAL.roadPaint;
    if (u >= 14.6 && u < 15.8 && v >= 3 && v < 11 && hashNoise(ctx.px, ctx.py, 41) > 0.06) return PAL.roadPaint;
    return asphaltBase(ctx);
  },
  zebra: (u, v, ctx) => {
    const stripe = (u >= 2 && u < 6) || (u >= 10 && u < 14);
    if (stripe && v >= 1 && v < 15 && hashNoise(ctx.px, ctx.py, 43) > 0.05) return PAL.roadPaint;
    return asphaltBase(ctx);
  },
  concrete: (u, v, ctx) => {
    if (u < 0.8 || v < 0.8) return PAL.concreteDark;
    const n = hashNoise(ctx.px, ctx.py, 47);
    if (n < 0.06) return shade(PAL.concrete, 0.9);
    return jitter(PAL.concrete, 0.025, hashNoise(ctx.tx, ctx.ty, 9));
  },
};

/** Warna sisi tegak untuk tiap terrain (terlihat di tepi trotoar & tepi peta). */
const SIDE_COLORS: Record<TerrainId, Color> = {
  grass: PAL.grassDark,
  dirt: PAL.dirtDark,
  paving: PAL.pavingDark,
  sidewalk: PAL.curb,
  asphalt: shade(PAL.asphalt, 0.85),
  asphaltCenter: shade(PAL.asphalt, 0.85),
  zebra: shade(PAL.asphalt, 0.85),
  concrete: PAL.concreteDark,
};

/**
 * Panggang seluruh lantai peta menjadi satu kanvas.
 * Ubin digambar dari belakang ke depan (x + y menaik) sehingga trotoar yang
 * lebih tinggi menutupi tepi ubin di belakangnya dengan benar.
 */
export function bakeGround(map: MapData): GroundArt {
  const maxElev = maxElevation(map);
  const width = (map.width + map.height) * HALF_TILE_WIDTH;
  const height = (map.width + map.height) * HALF_TILE_HEIGHT + maxElev + GROUND_BASE_DEPTH + 2;
  const originX = map.height * HALF_TILE_WIDTH;
  const originY = maxElev + 1;
  const canvas = new PixelCanvas(width, height);

  const elevationAt = (x: number, y: number): number | null => {
    const t = terrainAt(map, x, y);
    return t ? t.elevation : null;
  };

  for (let s = 0; s <= map.width + map.height - 2; s++) {
    for (let tx = Math.max(0, s - map.height + 1); tx <= Math.min(map.width - 1, s); tx++) {
      const ty = s - tx;
      const terrainId = map.terrain[ty]?.[tx];
      if (!terrainId) continue;
      const terrain = TERRAINS[terrainId];
      const e = terrain.elevation;
      const topX = originX + (tx - ty) * HALF_TILE_WIDTH;
      const topY = originY + (tx + ty) * HALF_TILE_HEIGHT - e;

      drawSideFaces(canvas, topX, topY, e, elevationAt(tx + 1, ty), elevationAt(tx, ty + 1), SIDE_COLORS[terrainId], tx, ty);

      const shader = SHADERS[terrainId];
      canvas.fillPolygon(
        [
          { x: topX, y: topY },
          { x: topX + HALF_TILE_WIDTH, y: topY + HALF_TILE_HEIGHT },
          { x: topX, y: topY + HALF_TILE_HEIGHT * 2 },
          { x: topX - HALF_TILE_WIDTH, y: topY + HALF_TILE_HEIGHT },
        ],
        (px, py) => {
          const sx = px + 0.5 - topX;
          const sy = py + 0.5 - topY;
          const u = sy + sx / 2;
          const v = sy - sx / 2;
          return shader(Math.min(15.999, Math.max(0, u)), Math.min(15.999, Math.max(0, v)), { tx, ty, px, py, map });
        },
      );
    }
  }
  return { canvas, originX, originY };
}

function drawSideFaces(
  canvas: PixelCanvas,
  topX: number,
  topY: number,
  elevation: number,
  rightNeighbor: number | null,
  leftNeighbor: number | null,
  sideColor: Color,
  tx: number,
  ty: number,
): void {
  const faces: { from: { x: number; y: number }; to: { x: number; y: number }; neighbor: number | null; dark: number }[] = [
    // sisi x+ : dari sudut kanan ke sudut bawah
    { from: { x: topX + HALF_TILE_WIDTH, y: topY + HALF_TILE_HEIGHT }, to: { x: topX, y: topY + HALF_TILE_HEIGHT * 2 }, neighbor: rightNeighbor, dark: 0.72 },
    // sisi y+ : dari sudut kiri ke sudut bawah
    { from: { x: topX - HALF_TILE_WIDTH, y: topY + HALF_TILE_HEIGHT }, to: { x: topX, y: topY + HALF_TILE_HEIGHT * 2 }, neighbor: leftNeighbor, dark: 0.86 },
  ];
  for (const face of faces) {
    const isMapEdge = face.neighbor === null;
    const drop = isMapEdge ? elevation + GROUND_BASE_DEPTH : elevation - (face.neighbor ?? 0);
    if (drop <= 0) continue;
    const bandHeight = isMapEdge ? elevation + 2 : drop;
    const { from, to } = face;
    canvas.fillPolygon(
      [from, to, { x: to.x, y: to.y + drop }, { x: from.x, y: from.y + drop }],
      (px, py) => {
        const t = (px + 0.5 - from.x) / (to.x - from.x);
        const edgeY = from.y + t * (to.y - from.y);
        const depth = py + 0.5 - edgeY;
        if (depth < 1) return shade(sideColor, face.dark * 1.12);
        if (depth < bandHeight) return shade(sideColor, face.dark);
        // lapisan tanah di bawah diorama
        const n = hashNoise(px, py, tx * 3 + ty);
        const soil = depth > bandHeight + 4 ? PAL.soilDark : PAL.soil;
        return jitter(shade(soil, face.dark + 0.1), 0.06, n);
      },
    );
  }
}
