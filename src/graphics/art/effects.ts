import { PixelCanvas } from '../PixelCanvas';
import type { ArtEntry } from './types';

export const FX_KEYS = {
  pixel: 'fx_pixel',
  light: 'fx_light',
  glow: 'fx_glow',
  smoke: 'fx_smoke',
  tileCursor: 'fx_tile_cursor',
} as const;

/** Ukuran tekstur cahaya (piksel). Jari-jari cahaya di dunia = skala × LIGHT_TEXTURE_SIZE / 2. */
export const LIGHT_TEXTURE_SIZE = 128;

/** Cahaya radial bertingkat (banded) — memberi kesan pixel art pada pencahayaan. */
function paintLight(): ArtEntry {
  const size = LIGHT_TEXTURE_SIZE;
  const canvas = new PixelCanvas(size, size);
  const c = size / 2;
  const bands = 10;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.hypot(x + 0.5 - c, y + 0.5 - c) / c;
      if (dist >= 1) continue;
      const f = Math.pow(1 - dist, 1.25);
      // floor → pita terluar bernilai 0 sehingga tepi cahaya memudar tanpa garis keras.
      const banded = Math.floor(f * bands + 0.5) / bands;
      canvas.setPixel(x, y, 0xffffff, Math.round(banded * 255));
    }
  }
  return { key: FX_KEYS.light, art: { canvas, anchorX: c, anchorY: c } };
}

/** Pendar lembut untuk bohlam (dipakai dengan blend ADD). */
function paintGlow(): ArtEntry {
  const size = 32;
  const canvas = new PixelCanvas(size, size);
  const c = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.hypot(x + 0.5 - c, y + 0.5 - c) / c;
      if (dist >= 1) continue;
      canvas.setPixel(x, y, 0xffffff, Math.round(Math.pow(1 - dist, 2.2) * 255));
    }
  }
  return { key: FX_KEYS.glow, art: { canvas, anchorX: c, anchorY: c } };
}

function paintSmoke(): ArtEntry {
  const canvas = new PixelCanvas(6, 6);
  canvas.fillCircle(3, 3, 3, 0xd8d4d0, 150);
  canvas.fillCircle(2.6, 2.6, 1.6, 0xf2efea, 120);
  return { key: FX_KEYS.smoke, art: { canvas, anchorX: 3, anchorY: 3 } };
}

/** Kursor ubin: garis tepi belah ketupat 1 px. */
function paintTileCursor(): ArtEntry {
  const canvas = new PixelCanvas(32, 16);
  const inside = (x: number, y: number, inset: number): boolean => {
    const sx = Math.abs(x + 0.5 - 16) / (16 - inset * 2);
    const sy = Math.abs(y + 0.5 - 8) / (8 - inset);
    return sx + sy <= 1;
  };
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 32; x++) {
      if (inside(x, y, 0) && !inside(x, y, 1)) canvas.setPixel(x, y, 0xffffff, 230);
    }
  }
  return { key: FX_KEYS.tileCursor, art: { canvas, anchorX: 16, anchorY: 0 } };
}

/** Piksel putih polos untuk mengisi bidang warna (mis. warna ambient light map). */
function paintPixel(): ArtEntry {
  const canvas = new PixelCanvas(4, 4);
  canvas.fillRect(0, 0, 4, 4, 0xffffff);
  return { key: FX_KEYS.pixel, art: { canvas, anchorX: 0, anchorY: 0 } };
}

export function paintEffects(): ArtEntry[] {
  return [paintPixel(), paintLight(), paintGlow(), paintSmoke(), paintTileCursor()];
}
