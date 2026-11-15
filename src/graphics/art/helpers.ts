import { hashNoise } from '../../utils/random';
import { shade, type Color } from '../color';
import type { IsoPainter } from '../IsoPainter';
import type { PixelCanvas } from '../PixelCanvas';
import { PAL } from '../palette';

/** Gumpalan daun berbayang (cahaya dari kiri-atas) untuk pohon & tanaman pot. */
export interface LeafColors {
  dark: Color;
  mid: Color;
  light: Color;
}

const DEFAULT_LEAVES: LeafColors = { dark: PAL.leafDark, mid: PAL.leaf, light: PAL.leafLight };

export function foliageBlob(canvas: PixelCanvas, cx: number, cy: number, r: number, seed: number, colors: LeafColors = DEFAULT_LEAVES): void {
  canvas.fillCircle(cx + 1, cy + 1.5, r, colors.dark);
  canvas.fillCircle(cx, cy, r, (px, py) => {
    const lx = px + 0.5 - (cx - r * 0.35);
    const ly = py + 0.5 - (cy - r * 0.4);
    const light = 1 - Math.hypot(lx, ly) / (r * 1.45);
    const n = hashNoise(px, py, seed);
    let level = light > 0.5 ? 2 : light > 0.12 ? 1 : 0;
    if (n < 0.13) level = Math.max(0, level - 1);
    else if (n > 0.95) level = Math.min(2, level + 1);
    return level === 2 ? colors.light : level === 1 ? colors.mid : colors.dark;
  });
}

/** Ceret (teko besar khas angkringan) digambar di ruang layar pada titik (x,y,z). */
export function kettle(p: IsoPainter, x: number, y: number, z: number, radius: number): void {
  const c = p.canvas;
  const base = p.project(x, y, z);
  const bodyY = base.y - radius * 0.9;
  // badan
  c.fillEllipse(base.x, bodyY, radius, radius * 0.85, (px, py) => {
    const lx = px + 0.5 - (base.x - radius * 0.4);
    const ly = py + 0.5 - (bodyY - radius * 0.4);
    const d = Math.hypot(lx, ly) / (radius * 1.6);
    return d < 0.3 ? PAL.steelLight : d < 0.75 ? PAL.steel : PAL.steelDark;
  });
  // cerat (spout) ke kanan
  const sx = Math.round(base.x + radius * 0.8);
  const sy = Math.round(bodyY);
  c.line(sx, sy, sx + Math.round(radius * 0.8), sy - Math.round(radius * 0.7), PAL.steelDark);
  c.line(sx, sy - 1, sx + Math.round(radius * 0.7), sy - Math.round(radius * 0.7) - 1, PAL.steel);
  // tutup & pegangan
  c.fillEllipse(base.x, bodyY - radius * 0.75, radius * 0.5, radius * 0.25, PAL.steelLight);
  c.setPixel(Math.floor(base.x), Math.floor(bodyY - radius * 0.95), PAL.black);
  const hy = Math.round(bodyY - radius * 1.25);
  c.line(Math.round(base.x - radius * 0.55), hy + 1, Math.round(base.x - radius * 0.3), hy, PAL.black);
  c.line(Math.round(base.x - radius * 0.3), hy, Math.round(base.x + radius * 0.3), hy, PAL.black);
  c.line(Math.round(base.x + radius * 0.3), hy, Math.round(base.x + radius * 0.55), hy + 1, PAL.black);
}

/** Kaca transparan berbentuk kotak (etalase, toples). */
export function glassBox(p: IsoPainter, x: number, y: number, z: number, w: number, d: number, h: number, tint: Color = PAL.glass): void {
  p.faceY(y + d, x, z, w, h, shade(tint, 0.95), 120);
  p.faceX(x + w, y, z, d, h, shade(tint, 0.85), 130);
  p.top(x, y, z + h, w, d, shade(tint, 1.08), 110);
  // kilau di sudut kaca
  p.line3({ x: x + 1, y: y + d, z: z + h - 1 }, { x: x + 1, y: y + d, z: z + 1 }, PAL.white, 150);
}

/** Tiga warna gradasi untuk satu bahan. */
export function tones(base: Color): { dark: Color; mid: Color; light: Color } {
  return { dark: shade(base, 0.7), mid: base, light: shade(base, 1.18) };
}
