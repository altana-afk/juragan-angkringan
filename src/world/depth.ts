import { depthKey } from '../iso/IsoMath';
import type { ObjectTypeDef } from './objectTypes';

/** Lapisan urutan gambar. Objek dunia memakai rentang 0 … ~5.000. */
export const DEPTH = {
  ground: -1_000_000,
  groundDecal: -500_000,
  tileCursor: -400_000,
  cables: 900_000,
  lighting: 1_000_000,
  glow: 1_000_100,
  debug: 2_000_000,
} as const;

const OBJECT_DEPTH_SCALE = 100;

/** Depth untuk objek berdasarkan posisi alas (ubin) & mode depth-nya. */
export function objectDepth(def: ObjectTypeDef, tileX: number, tileY: number, bias = 0): number {
  const w = def.footprint.w / 16;
  const d = def.footprint.d / 16;
  switch (def.depthMode) {
    case 'ground':
      return DEPTH.groundDecal + depthKey(tileX, tileY);
    case 'front':
      return depthKey(tileX + w, tileY + d) * OBJECT_DEPTH_SCALE + bias;
    case 'center':
      return depthKey(tileX + w / 2, tileY + d / 2) * OBJECT_DEPTH_SCALE + bias;
  }
}

/** Depth untuk karakter / entitas bergerak berdasarkan posisi kaki (ubin). */
export function entityDepth(tileX: number, tileY: number): number {
  return depthKey(tileX, tileY) * OBJECT_DEPTH_SCALE;
}
