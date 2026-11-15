/**
 * Matematika proyeksi isometrik 2:1.
 *
 * Koordinat ubin (tile): x ke kanan-bawah layar, y ke kiri-bawah layar.
 * Ubin (i, j) menempati area [i, i+1] × [j, j+1]. Titik puncak (atas) ubin (0,0)
 * berada di koordinat dunia (0, 0).
 *
 * Unit (unit): 1 ubin = 16 unit pada sumbu x dan y; ketinggian z dalam piksel.
 * Dipakai untuk menggambar objek dengan presisi lebih halus daripada ubin.
 */

export const TILE_WIDTH = 32;
export const TILE_HEIGHT = 16;
export const HALF_TILE_WIDTH = TILE_WIDTH / 2;
export const HALF_TILE_HEIGHT = TILE_HEIGHT / 2;
export const UNITS_PER_TILE = 16;

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Koordinat ubin → koordinat dunia (piksel), pada ketinggian z. */
export function tileToWorld(tileX: number, tileY: number, z = 0): Point {
  return {
    x: (tileX - tileY) * HALF_TILE_WIDTH,
    y: (tileX + tileY) * HALF_TILE_HEIGHT - z,
  };
}

/** Koordinat dunia → koordinat ubin (pecahan), dengan asumsi ketinggian 0. */
export function worldToTile(worldX: number, worldY: number): Point {
  const a = worldX / HALF_TILE_WIDTH;
  const b = worldY / HALF_TILE_HEIGHT;
  return { x: (b + a) / 2, y: (b - a) / 2 };
}

/** Koordinat dunia → indeks ubin bulat. */
export function worldToTileIndex(worldX: number, worldY: number): Point {
  const t = worldToTile(worldX, worldY);
  return { x: Math.floor(t.x), y: Math.floor(t.y) };
}

/** Titik tengah ubin (i, j) dalam koordinat dunia. */
export function tileCenterToWorld(tileX: number, tileY: number): Point {
  return tileToWorld(tileX + 0.5, tileY + 0.5);
}

/** Konversi unit → ubin. */
export function unitsToTiles(units: number): number {
  return units / UNITS_PER_TILE;
}

/**
 * Kunci urutan gambar (depth) untuk objek yang titik tengah alasnya di (tileX, tileY).
 * Objek dengan x + y lebih besar berada lebih dekat ke kamera sehingga digambar belakangan.
 */
export function depthKey(tileX: number, tileY: number): number {
  return tileX + tileY;
}

/** Kotak pembatas dunia (piksel) untuk peta berukuran cols × rows. */
export function mapWorldBounds(cols: number, rows: number, extraTop = 0, extraBottom = 0): Rect {
  const left = -rows * HALF_TILE_WIDTH;
  const right = cols * HALF_TILE_WIDTH;
  const top = -extraTop;
  const bottom = (cols + rows) * HALF_TILE_HEIGHT + extraBottom;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function isInsideMap(tileX: number, tileY: number, cols: number, rows: number): boolean {
  return tileX >= 0 && tileY >= 0 && tileX < cols && tileY < rows;
}
