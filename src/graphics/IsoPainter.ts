import { jitter, shade, type Color } from './color';
import { PixelCanvas, type Paint } from './PixelCanvas';
import { forEachTextPixel, measureText } from './pixelFont';
import type { Point } from '../iso/IsoMath';
import { hashNoise } from '../utils/random';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface BoxColors {
  top: Color;
  /** Sisi y+ (menghadap kiri-bawah layar). */
  left: Color;
  /** Sisi x+ (menghadap kanan-bawah layar). */
  right: Color;
}

export interface BoxOptions {
  /** Variasi kecerahan acak per piksel (0..1), mis. 0.05 untuk tekstur kayu/tembok. */
  noise?: number;
  seed?: number;
  /** Gambar sisi atas (default true). */
  top?: boolean;
}

/** Warna sisi kotak dari satu warna dasar (cahaya datang dari kiri-atas). */
export function boxColors(base: Color): BoxColors {
  return { top: base, left: shade(base, 0.82), right: shade(base, 0.64) };
}

/**
 * Pelukis isometrik di atas PixelCanvas. Koordinat dalam unit
 * (16 unit = 1 ubin pada sumbu x/y, z = piksel ke atas).
 * Titik (0,0,0) dipetakan ke piksel (originX, originY).
 */
export class IsoPainter {
  constructor(
    readonly canvas: PixelCanvas,
    readonly originX: number,
    readonly originY: number,
  ) {}

  project(x: number, y: number, z = 0): Point {
    return { x: this.originX + (x - y), y: this.originY + (x + y) / 2 - z };
  }

  poly(points: readonly Vec3[], paint: Paint, alpha = 255): void {
    this.canvas.fillPolygon(points.map((p) => this.project(p.x, p.y, p.z)), paint, alpha);
  }

  /** Kotak isometrik dengan tiga sisi terlihat. */
  box(x: number, y: number, z: number, w: number, d: number, h: number, colors: Color | BoxColors, opts: BoxOptions = {}): void {
    const c = typeof colors === 'number' ? boxColors(colors) : colors;
    const paint = (color: Color): Paint => this.noisy(color, opts.noise, opts.seed);
    if (h > 0) {
      // Sisi kiri (bidang y = y + d)
      this.poly(
        [
          { x, y: y + d, z },
          { x: x + w, y: y + d, z },
          { x: x + w, y: y + d, z: z + h },
          { x, y: y + d, z: z + h },
        ],
        paint(c.left),
      );
      // Sisi kanan (bidang x = x + w)
      this.poly(
        [
          { x: x + w, y, z },
          { x: x + w, y: y + d, z },
          { x: x + w, y: y + d, z: z + h },
          { x: x + w, y, z: z + h },
        ],
        paint(c.right),
      );
    }
    if (opts.top !== false) this.top(x, y, z + h, w, d, paint(c.top));
  }

  /** Persegi datar (horizontal) pada ketinggian z. */
  top(x: number, y: number, z: number, w: number, d: number, paint: Paint, alpha = 255): void {
    this.poly(
      [
        { x, y, z },
        { x: x + w, y, z },
        { x: x + w, y: y + d, z },
        { x, y: y + d, z },
      ],
      paint,
      alpha,
    );
  }

  /** Persegi pada bidang x = konstan (sisi kanan objek), rentang y..y+d, z..z+h. */
  faceX(xPlane: number, y: number, z: number, d: number, h: number, paint: Paint, alpha = 255): void {
    this.poly(
      [
        { x: xPlane, y, z },
        { x: xPlane, y: y + d, z },
        { x: xPlane, y: y + d, z: z + h },
        { x: xPlane, y, z: z + h },
      ],
      paint,
      alpha,
    );
  }

  /** Persegi pada bidang y = konstan (sisi kiri objek), rentang x..x+w, z..z+h. */
  faceY(yPlane: number, x: number, z: number, w: number, h: number, paint: Paint, alpha = 255): void {
    this.poly(
      [
        { x, y: yPlane, z },
        { x: x + w, y: yPlane, z },
        { x: x + w, y: yPlane, z: z + h },
        { x, y: yPlane, z: z + h },
      ],
      paint,
      alpha,
    );
  }

  line3(a: Vec3, b: Vec3, color: Color, alpha = 255): void {
    const pa = this.project(a.x, a.y, a.z);
    const pb = this.project(b.x, b.y, b.z);
    this.canvas.line(pa.x, pa.y, pb.x, pb.y, color, alpha);
  }

  pixel3(x: number, y: number, z: number, color: Color, alpha = 255): void {
    const p = this.project(x, y, z);
    this.canvas.setPixel(Math.floor(p.x), Math.floor(p.y), color, alpha);
  }

  /**
   * Lingkaran tegak pada bidang y = konstan (mis. roda), pusat (cx, yPlane, cz).
   * Dibentuk sebagai poligon sehingga ikut terproyeksi isometrik.
   */
  discY(cx: number, yPlane: number, cz: number, radius: number, paint: Paint, segments = 20): void {
    const pts: Vec3[] = [];
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      pts.push({ x: cx + Math.cos(a) * radius, y: yPlane, z: cz + Math.sin(a) * radius });
    }
    this.poly(pts, paint);
  }

  /** Lingkaran tegak pada bidang x = konstan. */
  discX(xPlane: number, cy: number, cz: number, radius: number, paint: Paint, segments = 20): void {
    const pts: Vec3[] = [];
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      pts.push({ x: xPlane, y: cy + Math.cos(a) * radius, z: cz + Math.sin(a) * radius });
    }
    this.poly(pts, paint);
  }

  /** Lingkaran datar (horizontal) pada ketinggian z. */
  discTop(cx: number, cy: number, z: number, radius: number, paint: Paint, segments = 20): void {
    const pts: Vec3[] = [];
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      pts.push({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius, z });
    }
    this.poly(pts, paint);
  }

  /**
   * Tulis teks pada bidang y = konstan, terbaca kiri→kanan (miring turun ke kanan).
   * x = awal teks, zTop = tepi atas huruf.
   */
  textY(yPlane: number, x: number, zTop: number, text: string, color: Color): void {
    forEachTextPixel(text, (gx, gy) => {
      const p = this.project(x + gx + 0.5, yPlane, zTop - gy - 0.5);
      this.canvas.setPixel(Math.floor(p.x), Math.floor(p.y), color);
    });
  }

  /** Tulis teks pada bidang x = konstan, terbaca kiri→kanan (miring naik ke kanan). */
  textX(xPlane: number, yStart: number, zTop: number, text: string, color: Color): void {
    forEachTextPixel(text, (gx, gy) => {
      const p = this.project(xPlane, yStart - gx - 0.5, zTop - gy - 0.5);
      this.canvas.setPixel(Math.floor(p.x), Math.floor(p.y), color);
    });
  }

  /** Tulis teks di tengah rentang [from, from+length] pada bidang y. */
  textYCentered(yPlane: number, from: number, length: number, zTop: number, text: string, color: Color): void {
    this.textY(yPlane, from + Math.floor((length - measureText(text)) / 2), zTop, text, color);
  }

  /** Tulis teks di tengah rentang y [from, from+length] pada bidang x (dibaca dari y besar ke kecil). */
  textXCentered(xPlane: number, from: number, length: number, zTop: number, text: string, color: Color): void {
    this.textX(xPlane, from + length - Math.floor((length - measureText(text)) / 2), zTop, text, color);
  }

  /** Bungkus warna dengan noise deterministik per piksel. */
  noisy(color: Color, amount = 0, seed = 0): Paint {
    if (!amount) return color;
    return (px: number, py: number) => jitter(color, amount, hashNoise(px, py, seed));
  }
}

export interface SpriteArt {
  canvas: PixelCanvas;
  /** Posisi titik jangkar (alas objek) di dalam kanvas, dalam piksel. */
  anchorX: number;
  anchorY: number;
}

export interface IsoSpriteOptions {
  /** Lebar alas (unit, sumbu x). */
  footW: number;
  /** Kedalaman alas (unit, sumbu y). */
  footD: number;
  /** Tinggi maksimum yang mungkin digambar (piksel). */
  height: number;
  /** Ruang ekstra di sekeliling (untuk atap menjorok, daun, dsb.). */
  margin?: number;
  /** Warna garis tepi otomatis, atau false. */
  outline?: Color | false;
  outlineAlpha?: number;
  /** Potong area transparan (default true). Matikan untuk frame animasi agar ukurannya seragam. */
  trim?: boolean;
}

export const OUTLINE_COLOR: Color = 0x1b1220;

/**
 * Buat sprite isometrik: siapkan kanvas & painter dengan titik (0,0,0) di jangkar,
 * jalankan fungsi gambar, beri garis tepi, lalu potong area kosong.
 */
export function paintIsoSprite(options: IsoSpriteOptions, draw: (painter: IsoPainter) => void): SpriteArt {
  const margin = options.margin ?? 16;
  const width = Math.ceil(options.footW + options.footD + margin * 2);
  const height = Math.ceil(options.height + (options.footW + options.footD) / 2 + margin * 2);
  const originX = Math.round(options.footD + margin);
  const originY = Math.round(options.height + margin);
  const canvas = new PixelCanvas(width, height);
  const painter = new IsoPainter(canvas, originX, originY);
  draw(painter);
  const outline = options.outline === undefined ? OUTLINE_COLOR : options.outline;
  if (outline !== false) canvas.outline(outline, options.outlineAlpha ?? 230);
  if (options.trim === false) return { canvas, anchorX: originX, anchorY: originY };
  const trimmed = canvas.trim();
  return { canvas: trimmed.canvas, anchorX: originX - trimmed.offsetX, anchorY: originY - trimmed.offsetY };
}
