/**
 * Aset visual editor: memakai generator pixel art yang sama dengan game
 * (src/graphics/art), lalu disalin ke <canvas> biasa. Tampilan editor = tampilan game.
 */
import { ART_JOBS } from '../../../src/graphics/art/catalog';
import { bakeGround } from '../../../src/graphics/art/ground';
import type { ArtMeta } from '../../../src/graphics/art/types';
import { PixelCanvas, PixelCanvas as PixelCanvasCtor } from '../../../src/graphics/PixelCanvas';
import type { MapData } from '../../../src/world/MapData';
import { objectType, objectTextureKey, type ObjectTypeId } from '../../../src/world/objectTypes';
import type { TerrainId } from '../../../src/world/terrain';
import type { EditorMap } from './model';

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** Data piksel asli untuk uji klik (alpha). */
  pixels: PixelCanvas;
  anchorX: number;
  anchorY: number;
  meta: ArtMeta;
}

const sprites = new Map<string, Sprite>();

export function toCanvas(pc: PixelCanvas): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = pc.width;
  canvas.height = pc.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D tidak tersedia');
  ctx.putImageData(new ImageData(new Uint8ClampedArray(pc.data), pc.width, pc.height), 0, 0);
  return canvas;
}

/** Bangun semua sprite objek. Dipanggil sekali saat editor dibuka (±0,2 detik). */
export async function loadSprites(onProgress: (label: string) => void): Promise<void> {
  for (const job of ART_JOBS) {
    onProgress(job.label);
    await new Promise((r) => setTimeout(r, 0));
    for (const entry of job.build()) {
      if (!entry.key.startsWith('obj_')) continue;
      sprites.set(entry.key, {
        canvas: toCanvas(entry.art.canvas),
        pixels: entry.art.canvas,
        anchorX: entry.art.anchorX,
        anchorY: entry.art.anchorY,
        meta: entry.meta ?? {},
      });
    }
  }
}

/** Sprite yang dipakai game untuk objek ini (penjual memakai frame 0). */
export function spriteFor(type: ObjectTypeId, variant: string): Sprite | null {
  const key = type === 'seller' ? objectTextureKey(type, variant, 0) : objectTextureKey(type, variant);
  return sprites.get(key) ?? null;
}

/** Api anglo (frame 0) digambar di atas anglo, sama seperti di game. */
export function fireSprite(): Sprite | null {
  return sprites.get(objectTextureKey('stove', 'anglo', 0)) ?? null;
}

export interface GroundImage {
  canvas: HTMLCanvasElement;
  originX: number;
  originY: number;
}

/** MapData minimal untuk generator lantai (objek tidak dipakai). */
export function asMapData(map: EditorMap): MapData {
  return {
    id: map.id,
    name: map.name,
    width: map.width,
    height: map.height,
    terrain: map.terrain,
    objects: [],
    anchors: { cameraHome: map.cameraHome },
    customers: null,
  };
}

export function bakeGroundImage(map: EditorMap): GroundImage {
  const g = bakeGround(asMapData(map));
  return { canvas: toCanvas(g.canvas), originX: g.originX, originY: g.originY };
}

const swatches = new Map<TerrainId, HTMLCanvasElement>();

/** Contoh satu ubin terrain (untuk palet & pratinjau cepat saat mengecat). */
export function terrainSwatch(t: TerrainId): HTMLCanvasElement {
  let c = swatches.get(t);
  if (!c) {
    c = bakeGroundImage({
      id: 'swatch',
      name: '',
      width: 1,
      height: 1,
      terrain: [[t]],
      objects: [],
      cameraHome: { x: 0, y: 0 },
      customers: { lotEntry: null, spawns: [], seats: [], queue: [] },
    }).canvas;
    swatches.set(t, c);
  }
  return c;
}

/** Gambar kecil objek untuk palet. */
export function objectThumb(type: ObjectTypeId, variant: string, size: number): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = size;
  out.height = size;
  const sprite = spriteFor(type, variant) ?? spriteFor(type, objectType(type).variants[0] as string);
  const ctx = out.getContext('2d');
  if (!sprite || !ctx) return out;
  const { width: w, height: h } = sprite.canvas;
  const scale = Math.min(size / w, size / h);
  const s = scale >= 1 ? Math.floor(scale) : scale;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite.canvas, Math.round((size - w * s) / 2), Math.round((size - h * s) / 2), w * s, h * s);
  return out;
}

/** Daftarkan / ganti sprite objek kustom (frame pertama dipakai di kanvas peta). */
export function registerCustomSprite(
  def: { id: string; anchorX: number; anchorY: number; frameWidth: number; frameHeight: number },
  frame0: Uint8ClampedArray,
): void {
  const pc = new PixelCanvasCtor(def.frameWidth, def.frameHeight);
  pc.data.set(frame0);
  sprites.set(objectTextureKey(def.id as ObjectTypeId, 'default'), { canvas: toCanvas(pc), pixels: pc, anchorX: def.anchorX, anchorY: def.anchorY, meta: {} });
}

export function removeCustomSprite(id: string): void {
  sprites.delete(objectTextureKey(id as ObjectTypeId, 'default'));
}
