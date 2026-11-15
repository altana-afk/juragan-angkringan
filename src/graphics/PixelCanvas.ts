import { channels, type Color } from './color';
import type { Point } from '../iso/IsoMath';

/** Fungsi pewarna per piksel. Mengembalikan null untuk melewati piksel. */
export type Shader = (x: number, y: number) => Color | null;
export type Paint = Color | Shader;

/**
 * Kanvas piksel mandiri (tanpa DOM) untuk menggambar pixel art secara prosedural.
 * Semua bentuk dirasterisasi tanpa anti-aliasing sehingga hasilnya tajam,
 * dan bisa diuji di Node tanpa browser.
 */
export class PixelCanvas {
  readonly data: Uint8ClampedArray;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      throw new Error(`Ukuran PixelCanvas tidak valid: ${width}×${height}`);
    }
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  getAlpha(x: number, y: number): number {
    if (!this.inBounds(x, y)) return 0;
    return this.data[(y * this.width + x) * 4 + 3] ?? 0;
  }

  getColor(x: number, y: number): Color {
    if (!this.inBounds(x, y)) return 0;
    const i = (y * this.width + x) * 4;
    return (((this.data[i] ?? 0) << 16) | ((this.data[i + 1] ?? 0) << 8) | (this.data[i + 2] ?? 0)) >>> 0;
  }

  /** Gambar satu piksel dengan alpha blending (source-over). */
  setPixel(x: number, y: number, color: Color, alpha = 255): void {
    x = Math.floor(x);
    y = Math.floor(y);
    if (!this.inBounds(x, y) || alpha <= 0) return;
    const i = (y * this.width + x) * 4;
    const [r, g, b] = channels(color);
    const d = this.data;
    if (alpha >= 255) {
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
      return;
    }
    const sa = alpha / 255;
    const da = (d[i + 3] ?? 0) / 255;
    const oa = sa + da * (1 - sa);
    if (oa <= 0) return;
    d[i] = (r * sa + (d[i] ?? 0) * da * (1 - sa)) / oa;
    d[i + 1] = (g * sa + (d[i + 1] ?? 0) * da * (1 - sa)) / oa;
    d[i + 2] = (b * sa + (d[i + 2] ?? 0) * da * (1 - sa)) / oa;
    d[i + 3] = oa * 255;
  }

  /** Hapus piksel (jadikan transparan). */
  clearPixel(x: number, y: number): void {
    if (!this.inBounds(x, y)) return;
    const i = (y * this.width + x) * 4;
    this.data[i] = 0;
    this.data[i + 1] = 0;
    this.data[i + 2] = 0;
    this.data[i + 3] = 0;
  }

  private paintAt(x: number, y: number, paint: Paint, alpha: number): void {
    const color = typeof paint === 'number' ? paint : paint(x, y);
    if (color !== null) this.setPixel(x, y, color, alpha);
  }

  fillRect(x: number, y: number, w: number, h: number, paint: Paint, alpha = 255): void {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width, Math.floor(x + w));
    const y1 = Math.min(this.height, Math.floor(y + h));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) this.paintAt(px, py, paint, alpha);
    }
  }

  /**
   * Isi poligon dengan algoritma scanline (sampel di titik tengah piksel,
   * aturan ganjil-genap). Tepi bersama antar-poligon tidak bertumpuk / berlubang.
   */
  fillPolygon(points: readonly Point[], paint: Paint, alpha = 255): void {
    const n = points.length;
    if (n < 3) return;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    const yStart = Math.max(0, Math.ceil(minY - 0.5));
    const yEnd = Math.min(this.height - 1, Math.ceil(maxY - 0.5) - 1);
    const xs: number[] = [];
    for (let py = yStart; py <= yEnd; py++) {
      const sy = py + 0.5;
      xs.length = 0;
      for (let i = 0; i < n; i++) {
        const a = points[i] as Point;
        const b = points[(i + 1) % n] as Point;
        if ((a.y <= sy && b.y > sy) || (b.y <= sy && a.y > sy)) {
          const t = (sy - a.y) / (b.y - a.y);
          xs.push(a.x + t * (b.x - a.x));
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const left = xs[k] as number;
        const right = xs[k + 1] as number;
        const xStart = Math.max(0, Math.ceil(left - 0.5));
        const xEnd = Math.min(this.width - 1, Math.ceil(right - 0.5) - 1);
        for (let px = xStart; px <= xEnd; px++) this.paintAt(px, py, paint, alpha);
      }
    }
  }

  /** Garis Bresenham antara dua titik (dibulatkan ke piksel). */
  line(x0: number, y0: number, x1: number, y1: number, color: Color, alpha = 255): void {
    let ax = Math.round(x0);
    let ay = Math.round(y0);
    const bx = Math.round(x1);
    const by = Math.round(y1);
    const dx = Math.abs(bx - ax);
    const dy = -Math.abs(by - ay);
    const sx = ax < bx ? 1 : -1;
    const sy = ay < by ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.setPixel(ax, ay, color, alpha);
      if (ax === bx && ay === by) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        ax += sx;
      }
      if (e2 <= dx) {
        err += dx;
        ay += sy;
      }
    }
  }

  /** Elips terisi; pusat & jari-jari boleh pecahan. */
  fillEllipse(cx: number, cy: number, rx: number, ry: number, paint: Paint, alpha = 255): void {
    if (rx <= 0 || ry <= 0) return;
    const y0 = Math.max(0, Math.floor(cy - ry));
    const y1 = Math.min(this.height - 1, Math.ceil(cy + ry));
    const x0 = Math.max(0, Math.floor(cx - rx));
    const x1 = Math.min(this.width - 1, Math.ceil(cx + rx));
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const nx = (px + 0.5 - cx) / rx;
        const ny = (py + 0.5 - cy) / ry;
        if (nx * nx + ny * ny <= 1) this.paintAt(px, py, paint, alpha);
      }
    }
  }

  fillCircle(cx: number, cy: number, r: number, paint: Paint, alpha = 255): void {
    this.fillEllipse(cx, cy, r, r, paint, alpha);
  }

  /**
   * Gambar pola piksel dari array string. Karakter '.' atau spasi = transparan,
   * karakter lain dipetakan lewat palette.
   */
  drawPattern(x: number, y: number, rows: readonly string[], palette: Readonly<Record<string, Color>>, alpha = 255): void {
    rows.forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx++) {
        const ch = row[rx];
        if (ch === undefined || ch === '.' || ch === ' ') continue;
        const color = palette[ch];
        if (color === undefined) throw new Error(`Karakter pola "${ch}" tidak ada di palette`);
        this.setPixel(x + rx, y + ry, color, alpha);
      }
    });
  }

  /** Tempel kanvas lain di atas kanvas ini (dengan alpha blending). */
  blit(source: PixelCanvas, dx: number, dy: number): void {
    for (let y = 0; y < source.height; y++) {
      for (let x = 0; x < source.width; x++) {
        const a = source.getAlpha(x, y);
        if (a > 0) this.setPixel(dx + x, dy + y, source.getColor(x, y), a);
      }
    }
  }

  /** Tambahkan garis tepi 1 piksel di sekeliling bentuk (gaya stiker pixel art). */
  outline(color: Color, alpha = 255, threshold = 96): void {
    const marks: number[] = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.getAlpha(x, y) >= threshold) continue;
        if (
          this.getAlpha(x - 1, y) >= threshold ||
          this.getAlpha(x + 1, y) >= threshold ||
          this.getAlpha(x, y - 1) >= threshold ||
          this.getAlpha(x, y + 1) >= threshold
        ) {
          marks.push(x, y);
        }
      }
    }
    for (let i = 0; i < marks.length; i += 2) this.setPixel(marks[i] as number, marks[i + 1] as number, color, alpha);
  }

  /** Kotak pembatas piksel yang tidak transparan, atau null jika kosong. */
  bounds(): { x: number; y: number; width: number; height: number } | null {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.getAlpha(x, y) === 0) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < minX) return null;
    return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  }

  /** Potong area transparan di tepi. Mengembalikan kanvas baru + offset potongan. */
  trim(): { canvas: PixelCanvas; offsetX: number; offsetY: number } {
    const b = this.bounds();
    if (!b) return { canvas: new PixelCanvas(1, 1), offsetX: 0, offsetY: 0 };
    const out = new PixelCanvas(b.width, b.height);
    for (let y = 0; y < b.height; y++) {
      const srcStart = ((b.y + y) * this.width + b.x) * 4;
      out.data.set(this.data.subarray(srcStart, srcStart + b.width * 4), y * b.width * 4);
    }
    return { canvas: out, offsetX: b.x, offsetY: b.y };
  }

  countOpaque(): number {
    let count = 0;
    for (let i = 3; i < this.data.length; i += 4) if ((this.data[i] ?? 0) > 0) count++;
    return count;
  }
}
