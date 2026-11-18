/**
 * Gambar RGBA sederhana untuk studio objek (tanpa DOM, bisa diuji di Node).
 */

export interface Raster {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export const makeRaster = (width: number, height: number): Raster => ({ width, height, data: new Uint8ClampedArray(width * height * 4) });

export const cloneRaster = (r: Raster): Raster => ({ width: r.width, height: r.height, data: new Uint8ClampedArray(r.data) });

export function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const rgbToHex = (r: number, g: number, b: number): string => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

export function shadeHex(hex: string, f: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(Math.min(255, r * f), Math.min(255, g * f), Math.min(255, b * f));
}

export function getPixel(r: Raster, x: number, y: number): [number, number, number, number] {
  if (x < 0 || y < 0 || x >= r.width || y >= r.height) return [0, 0, 0, 0];
  const i = (y * r.width + x) * 4;
  return [r.data[i]!, r.data[i + 1]!, r.data[i + 2]!, r.data[i + 3]!];
}

/** color = null → hapus (transparan). */
export function setPixel(r: Raster, x: number, y: number, color: string | null): void {
  x = Math.floor(x);
  y = Math.floor(y);
  if (x < 0 || y < 0 || x >= r.width || y >= r.height) return;
  const i = (y * r.width + x) * 4;
  if (color === null) {
    r.data[i + 3] = 0;
    r.data[i] = r.data[i + 1] = r.data[i + 2] = 0;
    return;
  }
  const [cr, cg, cb] = hexToRgb(color);
  r.data[i] = cr;
  r.data[i + 1] = cg;
  r.data[i + 2] = cb;
  r.data[i + 3] = 255;
}

/** Garis Bresenham. */
export function line(r: Raster, x0: number, y0: number, x1: number, y1: number, plot: (x: number, y: number) => void): void {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    plot(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
  void r;
}

const sameColor = (a: number[], b: number[]): boolean => (a[3] === 0 && b[3] === 0) || (a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3]);

/** Isi ember (4 arah). Mengembalikan jumlah piksel yang berubah. */
export function floodFillRaster(r: Raster, sx: number, sy: number, color: string | null): number {
  const target = getPixel(r, sx, sy);
  const probe = makeRaster(1, 1);
  setPixel(probe, 0, 0, color);
  if (sameColor(target, getPixel(probe, 0, 0))) return 0;
  const stack: [number, number][] = [[sx, sy]];
  const seen = new Uint8Array(r.width * r.height);
  let n = 0;
  while (stack.length) {
    const [x, y] = stack.pop()!;
    if (x < 0 || y < 0 || x >= r.width || y >= r.height) continue;
    const k = y * r.width + x;
    if (seen[k]) continue;
    seen[k] = 1;
    if (!sameColor(getPixel(r, x, y), target)) continue;
    setPixel(r, x, y, color);
    n++;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return n;
}

/** Isi poligon (aturan genap-ganjil) pada pusat piksel. */
export function fillPolygon(r: Raster, pts: readonly [number, number][], color: string): void {
  if (pts.length < 3) return;
  const ys = pts.map((p) => p[1]);
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const y1 = Math.min(r.height - 1, Math.ceil(Math.max(...ys)));
  for (let y = y0; y <= y1; y++) {
    const cy = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i]!;
      const [bx, by] = pts[(i + 1) % pts.length]!;
      if ((ay <= cy && by > cy) || (by <= cy && ay > cy)) xs.push(ax + ((cy - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.ceil(xs[k]! - 0.5); x <= Math.floor(xs[k + 1]! - 0.5); x++) setPixel(r, x, y, color);
    }
  }
}

/** Geser seluruh isi (piksel yang keluar hilang). */
export function shiftRaster(r: Raster, dx: number, dy: number): Raster {
  const out = makeRaster(r.width, r.height);
  for (let y = 0; y < r.height; y++) {
    for (let x = 0; x < r.width; x++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= r.width || ny >= r.height) continue;
      const s = (y * r.width + x) * 4;
      out.data.set(r.data.subarray(s, s + 4), (ny * r.width + nx) * 4);
    }
  }
  return out;
}

/** Ubah ukuran kanvas; isi lama ditaruh dengan pergeseran (ox, oy). */
export function resizeCanvas(r: Raster, width: number, height: number, ox: number, oy: number): Raster {
  const out = makeRaster(width, height);
  for (let y = 0; y < r.height; y++) {
    for (let x = 0; x < r.width; x++) {
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const s = (y * r.width + x) * 4;
      out.data.set(r.data.subarray(s, s + 4), (ny * width + nx) * 4);
    }
  }
  return out;
}

/** Kotak pembatas piksel tidak transparan, atau null bila kosong. */
export function contentBounds(r: Raster, alphaMin = 1): { x: number; y: number; w: number; h: number } | null {
  let x0 = r.width;
  let y0 = r.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < r.height; y++) {
    for (let x = 0; x < r.width; x++) {
      if (r.data[(y * r.width + x) * 4 + 3]! < alphaMin) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export function crop(r: Raster, x: number, y: number, w: number, h: number): Raster {
  return resizeCanvas(r, w, h, -x, -y);
}

/**
 * Hapus latar: piksel yang tersambung dengan tepi gambar dan warnanya mirip warna tepi
 * (atau magenta #ff00ff) dijadikan transparan.
 */
export function removeBackground(r: Raster, tolerance = 48): Raster {
  const out = cloneRaster(r);
  const { width: w, height: h } = r;
  const corners = [getPixel(r, 0, 0), getPixel(r, w - 1, 0), getPixel(r, 0, h - 1), getPixel(r, w - 1, h - 1)];
  const keys: number[][] = [[255, 0, 255], ...corners.filter((c) => c[3]! > 0).map((c) => c.slice(0, 3))];
  const isBg = (p: number[]): boolean =>
    p[3]! < 16 || keys.some((k) => Math.abs(p[0]! - k[0]!) + Math.abs(p[1]! - k[1]!) + Math.abs(p[2]! - k[2]!) <= tolerance * 1.5);
  const seen = new Uint8Array(w * h);
  const stack: [number, number][] = [];
  for (let x = 0; x < w; x++) stack.push([x, 0], [x, h - 1]);
  for (let y = 0; y < h; y++) stack.push([0, y], [w - 1, y]);
  while (stack.length) {
    const [x, y] = stack.pop()!;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const k = y * w + x;
    if (seen[k]) continue;
    seen[k] = 1;
    if (!isBg(getPixel(r, x, y))) continue;
    out.data[k * 4 + 3] = 0;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  // Sisa piksel magenta (mis. di celah tertutup) juga dibuang.
  for (let k = 0; k < w * h; k++) {
    const p = [out.data[k * 4]!, out.data[k * 4 + 1]!, out.data[k * 4 + 2]!, out.data[k * 4 + 3]!];
    if (p[3]! > 0 && p[0]! > 200 && p[1]! < 70 && p[2]! > 200) out.data[k * 4 + 3] = 0;
  }
  return out;
}

/**
 * Perkecil dengan rata-rata area (hasil lebih rapi daripada nearest untuk gambar AI).
 * Alpha dibulatkan jadi 0/255 agar tetap pixel art.
 */
export function downscale(r: Raster, width: number, height: number): Raster {
  const out = makeRaster(width, height);
  const sx = r.width / width;
  const sy = r.height / height;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let tr = 0;
      let tg = 0;
      let tb = 0;
      let ta = 0;
      let n = 0;
      const xa = Math.floor(x * sx);
      const xb = Math.max(xa + 1, Math.floor((x + 1) * sx));
      const ya = Math.floor(y * sy);
      const yb = Math.max(ya + 1, Math.floor((y + 1) * sy));
      for (let yy = ya; yy < yb; yy++) {
        for (let xx = xa; xx < xb; xx++) {
          const p = getPixel(r, xx, yy);
          const a = p[3]! / 255;
          tr += p[0]! * a;
          tg += p[1]! * a;
          tb += p[2]! * a;
          ta += a;
          n++;
        }
      }
      if (n === 0 || ta / n < 0.5) continue;
      const i = (y * width + x) * 4;
      out.data[i] = tr / ta;
      out.data[i + 1] = tg / ta;
      out.data[i + 2] = tb / ta;
      out.data[i + 3] = 255;
    }
  }
  return out;
}

/** Ganti setiap warna dengan warna terdekat di palet. */
export function quantize(r: Raster, palette: readonly string[]): Raster {
  const pal = palette.map(hexToRgb);
  const out = cloneRaster(r);
  for (let k = 0; k < r.width * r.height; k++) {
    if (out.data[k * 4 + 3] === 0) continue;
    const c = [out.data[k * 4]!, out.data[k * 4 + 1]!, out.data[k * 4 + 2]!];
    let best = pal[0]!;
    let bd = Infinity;
    for (const p of pal) {
      // Bobot persepsi sederhana.
      const d = 2 * (p[0] - c[0]!) ** 2 + 4 * (p[1] - c[1]!) ** 2 + 3 * (p[2] - c[2]!) ** 2;
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    out.data.set(best, k * 4);
  }
  return out;
}

/**
 * Tempatkan gambar ke frame target: buang latar, potong ke isi, perkecil agar muat
 * (menjaga rasio), lalu taruh rata tengah-bawah.
 */
export function fitIntoFrame(
  src: Raster,
  frameW: number,
  frameH: number,
  opts: { removeBg: boolean; palette: readonly string[] | null; margin?: number },
): Raster {
  let img = opts.removeBg ? removeBackground(src) : src;
  const b = contentBounds(img, 16);
  if (!b) return makeRaster(frameW, frameH);
  img = crop(img, b.x, b.y, b.w, b.h);
  const margin = opts.margin ?? 1;
  const maxW = frameW - margin * 2;
  const maxH = frameH - margin * 2;
  const scale = Math.min(1, maxW / img.width, maxH / img.height);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  if (w !== img.width || h !== img.height) img = downscale(img, w, h);
  if (opts.palette?.length) img = quantize(img, opts.palette);
  return resizeCanvas(img, frameW, frameH, Math.floor((frameW - w) / 2), frameH - margin - h);
}

/** Gabungkan frame berjajar ke kanan (lembar PNG). */
export function joinFrames(frames: readonly Raster[]): Raster {
  const f0 = frames[0]!;
  const out = makeRaster(f0.width * frames.length, f0.height);
  frames.forEach((f, i) => {
    for (let y = 0; y < f.height; y++) out.data.set(f.data.subarray(y * f.width * 4, (y + 1) * f.width * 4), (y * out.width + i * f.width) * 4);
  });
  return out;
}
