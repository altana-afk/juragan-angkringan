/**
 * Tekstur objek kustom (PNG dari editor peta). Gambar dimuat lewat loader Phaser,
 * lalu dipotong per frame dan didaftarkan dengan kunci yang sama seperti aset prosedural:
 *   obj_<id>_default      frame pertama (gambar diam)
 *   obj_<id>_default_<n>  frame animasi
 */
import type * as Phaser from 'phaser';
import { objectType, CUSTOM_VARIANT, listObjectTypeIds, objectTextureKey } from '../world/objectTypes';
import { hexToColor, lightOffsetUnits, sliceFrames, type CustomObjectDef } from '../world/customObjects';
import { PixelCanvas } from './PixelCanvas';
import { registerArt } from './TextureFactory';
import type { LightAnchor } from './art/types';

/** URL gambar hasil build (nama file = id objek). */
const IMAGE_URLS = import.meta.glob<string>('../assets/custom-objects/*.png', { eager: true, query: '?url', import: 'default' });

export function customObjectDefs(): CustomObjectDef[] {
  return listObjectTypeIds().flatMap((id) => {
    const c = objectType(id).custom;
    return c ? [c] : [];
  });
}

export function customImageUrl(id: string): string | null {
  for (const [path, url] of Object.entries(IMAGE_URLS)) if (path.endsWith(`/${id}.png`)) return url;
  return null;
}

const sourceKey = (id: string): string => `custom_src_${id}`;

/** Antrikan pemuatan semua PNG objek kustom (panggil di preload()). */
export function queueCustomImages(load: Phaser.Loader.LoaderPlugin): void {
  for (const def of customObjectDefs()) {
    const url = customImageUrl(def.id);
    if (url) load.image(sourceKey(def.id), url);
  }
}

export function customLights(def: CustomObjectDef): LightAnchor[] {
  return def.lights.map((l) => {
    const o = lightOffsetUnits(def, l.px, l.py);
    return { x: o.x, y: o.y, z: 0, radius: l.radius, color: hexToColor(l.color), intensity: l.intensity, flicker: l.flicker, glow: l.glow, glowScale: 1 };
  });
}

/** Potong gambar yang sudah dimuat menjadi tekstur per frame. Objek tanpa gambar diberi kotak pengganti. */
export function registerCustomArt(textures: Phaser.Textures.TextureManager): void {
  for (const def of customObjectDefs()) {
    let frames: Uint8ClampedArray[];
    const key = sourceKey(def.id);
    if (textures.exists(key)) {
      const img = textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      ctx.drawImage(img, 0, 0);
      frames = sliceFrames(ctx.getImageData(0, 0, img.width, img.height).data, img.width, def);
    } else {
      frames = [placeholderFrame(def)];
    }
    const meta = { lights: customLights(def) };
    frames.forEach((data, i) => {
      const pc = new PixelCanvas(def.frameWidth, def.frameHeight);
      pc.data.set(data);
      const art = { canvas: pc, anchorX: def.anchorX, anchorY: def.anchorY };
      if (i === 0) registerArt(textures, { key: objectTextureKey(def.id, CUSTOM_VARIANT), art, meta });
      if (def.frames > 1) registerArt(textures, { key: objectTextureKey(def.id, CUSTOM_VARIANT, i), art, meta });
    });
  }
}

/** Kotak ungu bila PNG hilang, supaya peta tetap bisa dibuka. */
function placeholderFrame(def: CustomObjectDef): Uint8ClampedArray {
  const data = new Uint8ClampedArray(def.frameWidth * def.frameHeight * 4);
  for (let y = 0; y < def.frameHeight; y++) {
    for (let x = 0; x < def.frameWidth; x++) {
      const i = (y * def.frameWidth + x) * 4;
      const edge = x === 0 || y === 0 || x === def.frameWidth - 1 || y === def.frameHeight - 1;
      data.set(edge ? [40, 20, 40, 255] : [200, 60, 200, 160], i);
    }
  }
  return data;
}

export const customAnimKey = (id: string): string => `anim_${id}`;
