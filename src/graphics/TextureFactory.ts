import * as Phaser from 'phaser';
import type { ArtEntry, ArtMeta } from './art/types';
import type { GroundArt } from './art/ground';
import type { PixelCanvas } from './PixelCanvas';

export interface ArtInfo {
  readonly key: string;
  readonly width: number;
  readonly height: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly meta: ArtMeta;
}

const artRegistry = new Map<string, ArtInfo>();

function putCanvas(textures: Phaser.Textures.TextureManager, key: string, canvas: PixelCanvas): void {
  if (textures.exists(key)) textures.remove(key);
  const texture = textures.createCanvas(key, canvas.width, canvas.height);
  if (!texture) throw new Error(`Gagal membuat tekstur "${key}"`);
  const ctx = texture.getContext();
  const imageData = ctx.createImageData(canvas.width, canvas.height);
  imageData.data.set(canvas.data);
  ctx.putImageData(imageData, 0, 0);
  texture.refresh();
}

/** Daftarkan aset prosedural ke Phaser + catat titik jangkar & metadata-nya. */
export function registerArt(textures: Phaser.Textures.TextureManager, entry: ArtEntry): void {
  putCanvas(textures, entry.key, entry.art.canvas);
  artRegistry.set(entry.key, {
    key: entry.key,
    width: entry.art.canvas.width,
    height: entry.art.canvas.height,
    anchorX: entry.art.anchorX,
    anchorY: entry.art.anchorY,
    meta: entry.meta ?? {},
  });
}

export function registerGround(textures: Phaser.Textures.TextureManager, key: string, ground: GroundArt): void {
  registerArt(textures, { key, art: { canvas: ground.canvas, anchorX: ground.originX, anchorY: ground.originY } });
}

export function hasArt(key: string): boolean {
  return artRegistry.has(key);
}

export function getArtInfo(key: string): ArtInfo {
  const info = artRegistry.get(key);
  if (!info) throw new Error(`Aset "${key}" belum dibuat. Pastikan LoadingScene sudah berjalan.`);
  return info;
}

/** Atur origin game object agar titik jangkar aset berada di posisi (x, y)-nya. */
export function applyAnchor(object: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite, key: string): void {
  const info = getArtInfo(key);
  object.setOrigin(info.anchorX / info.width, info.anchorY / info.height);
}
