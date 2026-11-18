/**
 * Objek kustom di editor: daftar, gambar per frame, sinkron dengan server & registri jenis objek game.
 */
import { hexToColor } from '../../../src/world/customObjects';
import { parseCustomObjects, type CustomObjectDef } from '../../../src/world/customObjects';
import { registerCustomObjectType, unregisterCustomObjectType } from '../../../src/world/objectTypes';
import { deleteCustom, fetchCustom, saveCustom } from './api';
import { registerCustomSprite, removeCustomSprite } from './art';
import { joinFrames, makeRaster, type Raster } from './raster';

export interface CustomEntry {
  def: CustomObjectDef;
  frames: Raster[];
}

const entries = new Map<string, CustomEntry>();
const listeners = new Set<() => void>();

export const onCustomChange = (fn: () => void): void => void listeners.add(fn);
const emit = (): void => listeners.forEach((fn) => fn());

export const customEntries = (): CustomEntry[] => [...entries.values()];
export const customEntry = (id: string): CustomEntry | undefined => entries.get(id);

function install(def: CustomObjectDef, frames: Raster[]): void {
  entries.set(def.id, { def, frames });
  registerCustomObjectType(def);
  registerCustomSprite(def, frames[0]!.data);
}

/** Muat dari server. Gagal (server mati) → pakai apa yang sudah terdaftar dari bundel tanpa gambar. */
export async function loadCustomObjects(): Promise<void> {
  const { objects, images } = await fetchCustom();
  const defs = parseCustomObjects({ objects });
  for (const def of defs) {
    const url = images[def.id];
    const frames = url ? await decodeFrames(url, def) : [placeholder(def)];
    install(def, frames);
  }
  emit();
}

function placeholder(def: CustomObjectDef): Raster {
  const r = makeRaster(def.frameWidth, def.frameHeight);
  for (let i = 0; i < def.frameWidth * def.frameHeight; i++) r.data.set([200, 60, 200, 160], i * 4);
  return r;
}

export async function decodeImage(url: string): Promise<Raster> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D tidak tersedia');
  ctx.drawImage(img, 0, 0);
  return { width: c.width, height: c.height, data: ctx.getImageData(0, 0, c.width, c.height).data };
}

async function decodeFrames(url: string, def: CustomObjectDef): Promise<Raster[]> {
  const sheet = await decodeImage(url);
  const frames: Raster[] = [];
  for (let f = 0; f < def.frames; f++) {
    const r = makeRaster(def.frameWidth, def.frameHeight);
    for (let y = 0; y < def.frameHeight; y++) {
      const s = (y * sheet.width + f * def.frameWidth) * 4;
      r.data.set(sheet.data.subarray(s, s + def.frameWidth * 4), y * def.frameWidth * 4);
    }
    frames.push(r);
  }
  return frames;
}

export function rasterToDataUrl(r: Raster): string {
  const c = document.createElement('canvas');
  c.width = r.width;
  c.height = r.height;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D tidak tersedia');
  ctx.putImageData(new ImageData(new Uint8ClampedArray(r.data), r.width, r.height), 0, 0);
  return c.toDataURL('image/png');
}

/** Simpan ke project lalu daftarkan langsung di editor. */
export async function persistCustom(def: CustomObjectDef, frames: Raster[]): Promise<void> {
  const [checked] = parseCustomObjects({ objects: [def] });
  await saveCustom(checked, rasterToDataUrl(joinFrames(frames)));
  install(checked!, frames);
  emit();
}

export async function removeCustom(id: string): Promise<void> {
  await deleteCustom(id);
  entries.delete(id);
  unregisterCustomObjectType(id);
  removeCustomSprite(id);
  emit();
}

export { hexToColor };
