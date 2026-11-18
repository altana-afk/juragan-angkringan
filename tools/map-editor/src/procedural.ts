/**
 * Generator gambar objek tanpa AI: deskripsi bahasa Indonesia diurai menjadi jenis objek,
 * warna, ukuran, dan efek, lalu digambar dengan bentuk isometrik sederhana (kotak, tabung,
 * bola, atap). Hasilnya titik awal untuk disempurnakan di studio, bukan karya jadi.
 */
import { PAL } from '../../../src/graphics/palette';
import { fillPolygon, line, makeRaster, rgbToHex, setPixel, shadeHex, type Raster } from './raster';

export interface GeneratedLight {
  px: number;
  py: number;
  radius: number;
  color: string;
  intensity: number;
  flicker: number;
  glow: boolean;
}

export interface GeneratedObject {
  label: string;
  kind: string;
  frameWidth: number;
  frameHeight: number;
  anchorX: number;
  anchorY: number;
  /** Alas dalam unit (16 = 1 ubin). */
  footprint: { w: number; d: number };
  blocking: boolean;
  seating: boolean;
  seatLift: number;
  frames: Raster[];
  frameMs: number;
  lights: GeneratedLight[];
}

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

/** Nama warna → hex (sebagian dari palet game agar serasi). */
export const COLOR_WORDS: Record<string, string> = {
  merah: '#c8443a',
  marun: '#7d2a2a',
  oranye: hex(PAL.tarpOrange),
  jingga: hex(PAL.tarpOrange),
  kuning: '#e8b83a',
  emas: '#d9a531',
  hijau: '#4f8a3c',
  tosca: '#3f9a8f',
  biru: hex(PAL.tarpBlue),
  'biru muda': '#7fb6e8',
  ungu: '#7a4e9a',
  pink: '#e48aa8',
  merahmuda: '#e48aa8',
  coklat: hex(PAL.wood),
  cokelat: hex(PAL.wood),
  kayu: hex(PAL.wood),
  bambu: hex(PAL.bamboo),
  krem: hex(PAL.cream),
  putih: hex(PAL.white),
  hitam: '#2b2630',
  abu: hex(PAL.steel),
  'abu-abu': hex(PAL.steel),
  perak: hex(PAL.steelLight),
  besi: hex(PAL.steelDark),
  tanah: hex(PAL.clay),
  bata: hex(PAL.roofTile),
};

interface Kind {
  id: string;
  words: string[];
  label: string;
}

const KINDS: Kind[] = [
  { id: 'cart', words: ['gerobak', 'kereta dorong', 'rombong'], label: 'Gerobak' },
  { id: 'stall', words: ['tenda', 'lapak', 'warung', 'kios', 'stan', 'booth', 'stand'], label: 'Lapak' },
  { id: 'umbrella', words: ['payung'], label: 'Payung' },
  { id: 'table', words: ['meja'], label: 'Meja' },
  { id: 'bench', words: ['bangku', 'balai', 'lincak', 'amben'], label: 'Bangku' },
  { id: 'chair', words: ['kursi', 'dingklik'], label: 'Kursi' },
  { id: 'lantern', words: ['lampion', 'lentera', 'petromaks', 'teplok'], label: 'Lentera' },
  { id: 'lamp', words: ['lampu', 'tiang lampu', 'obor'], label: 'Lampu' },
  { id: 'tree', words: ['pohon', 'beringin', 'mangga', 'kelapa'], label: 'Pohon' },
  { id: 'plant', words: ['tanaman', 'pot', 'bunga', 'semak', 'perdu'], label: 'Tanaman pot' },
  { id: 'barrel', words: ['tong', 'drum', 'tempat sampah', 'ember', 'gentong', 'kendi', 'termos'], label: 'Tong' },
  { id: 'sign', words: ['papan', 'spanduk', 'banner', 'plang', 'baliho', 'menu'], label: 'Papan' },
  { id: 'crate', words: ['kotak', 'peti', 'kardus', 'krat', 'karung', 'galon', 'lemari', 'etalase', 'kulkas'], label: 'Peti' },
  { id: 'building', words: ['rumah', 'gedung', 'toko', 'masjid', 'musala', 'pos'], label: 'Bangunan' },
  { id: 'fence', words: ['pagar'], label: 'Pagar' },
];

/** Cari kata utuh (bukan bagian kata lain). */
const hasWord = (text: string, w: string): number => {
  const m = new RegExp(`(^|[^a-z])${w.replace(/[-]/g, '\\-')}([^a-z]|$)`).exec(text);
  return m ? m.index : -1;
};

export interface ParsedDescription {
  kind: Kind;
  colors: string[];
  scale: number;
  tall: number;
  long: number;
  lit: boolean;
  animated: boolean;
  fire: boolean;
  striped: boolean;
}

export function parseDescription(desc: string): ParsedDescription {
  const t = ` ${desc.toLowerCase()} `;
  let kind = KINDS[KINDS.length - 3]!; // peti sebagai bawaan
  let best = Infinity;
  for (const k of KINDS) {
    for (const w of k.words) {
      const at = hasWord(t, w);
      if (at >= 0 && at < best) {
        best = at;
        kind = k;
      }
    }
  }
  const colors: { at: number; hex: string }[] = [];
  for (const [w, c] of Object.entries(COLOR_WORDS)) {
    const at = hasWord(t, w);
    if (at >= 0 && !colors.some((x) => x.at === at)) colors.push({ at, hex: c });
  }
  // "biru muda" mengalahkan "biru" di posisi yang sama.
  colors.sort((a, b) => a.at - b.at);
  const scale = hasWord(t, 'kecil') >= 0 || hasWord(t, 'mini') >= 0 ? 0.75 : hasWord(t, 'besar') >= 0 || hasWord(t, 'raksasa') >= 0 ? 1.35 : 1;
  return {
    kind,
    colors: colors.map((c) => c.hex),
    scale,
    tall: hasWord(t, 'tinggi') >= 0 ? 1.4 : hasWord(t, 'pendek') >= 0 ? 0.75 : 1,
    // "bangku panjang" adalah nama bangku biasa, bukan ukuran.
    long: hasWord(t, 'panjang') >= 0 && hasWord(t, 'bangku panjang') < 0 ? 1.5 : 1,
    lit:
      ['menyala', 'nyala', 'terang', 'bercahaya', 'lampu', 'lentera', 'lampion', 'obor', 'neon'].some((w) => hasWord(t, w) >= 0) ||
      ['lamp', 'lantern'].includes(kind.id),
    animated: ['berkedip', 'kedip', 'api', 'obor', 'berputar', 'bergoyang'].some((w) => hasWord(t, w) >= 0),
    fire: ['api', 'obor', 'anglo', 'tungku', 'bara'].some((w) => hasWord(t, w) >= 0),
    striped: ['garis', 'belang', 'strip', 'loreng'].some((w) => hasWord(t, w) >= 0),
  };
}

// --------------------------------------------------------------------------- menggambar

class Iso {
  constructor(
    readonly r: Raster,
    readonly ax: number,
    readonly ay: number,
  ) {}

  p(u: number, v: number, z: number): [number, number] {
    return [this.ax + u - v, this.ay + (u + v) / 2 - z];
  }

  /** Kotak pejal; permukaan atas paling terang, sisi kanan paling gelap. */
  box(u: number, v: number, w: number, d: number, z: number, h: number, color: string, outline = true): void {
    const top = z + h;
    const P = this.p.bind(this);
    if (h > 0) {
      fillPolygon(this.r, [P(u, v + d, z), P(u + w, v + d, z), P(u + w, v + d, top), P(u, v + d, top)], shadeHex(color, 0.82));
      fillPolygon(this.r, [P(u + w, v, z), P(u + w, v + d, z), P(u + w, v + d, top), P(u + w, v, top)], shadeHex(color, 0.64));
    }
    fillPolygon(this.r, [P(u, v, top), P(u + w, v, top), P(u + w, v + d, top), P(u, v + d, top)], color);
    if (!outline) return;
    const dark = shadeHex(color, 0.42);
    const plot = (x: number, y: number): void => setPixel(this.r, x, y, dark);
    const seg = (a: [number, number], b: [number, number]): void => line(this.r, a[0], a[1] - 0.5, b[0], b[1] - 0.5, plot);
    seg(P(u, v, top), P(u + w, v, top));
    seg(P(u, v, top), P(u, v + d, top));
    if (h > 0) {
      seg(P(u, v + d, top), P(u, v + d, z));
      seg(P(u + w, v, top), P(u + w, v, z));
      seg(P(u, v + d, z), P(u + w, v + d, z));
      seg(P(u + w, v + d, z), P(u + w, v, z));
    }
    // Sorot tepi depan permukaan atas.
    const light = shadeHex(color, 1.18);
    line(this.r, ...P(u, v + d, top), ...P(u + w, v + d, top), (x, y) => setPixel(this.r, x, y - 1, light));
  }

  /** Tabung tegak (tong, pot, batang). r dalam unit. */
  cylinder(cu: number, cv: number, rad: number, z: number, h: number, color: string): void {
    const [cx, by] = this.p(cu, cv, z);
    const rx = Math.max(1, Math.round(rad * 1.4));
    const ry = Math.max(1, rx / 2);
    const ty = by - h;
    for (let x = -rx; x <= rx; x++) {
      const t = (x + rx) / (2 * rx);
      const c = shadeHex(color, 1.05 - t * 0.4);
      const e = ry * Math.sqrt(Math.max(0, 1 - (x / (rx + 0.5)) ** 2));
      for (let y = Math.round(ty); y <= Math.round(by + e); y++) setPixel(this.r, cx + x, y, c);
    }
    this.ellipse(cx, ty, rx, ry, shadeHex(color, 1.12), shadeHex(color, 0.5));
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, fill: string, edge?: string): void {
    for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) {
      for (let x = -rx; x <= rx; x++) {
        const d = (x / (rx + 0.5)) ** 2 + (y / (ry + 0.5)) ** 2;
        if (d <= 1) setPixel(this.r, cx + x, cy + y, edge && d > 0.72 ? edge : fill);
      }
    }
  }

  /** Bola bertekstur (tajuk pohon, semak). */
  blob(cx: number, cy: number, rad: number, color: string, seed: number): void {
    for (let y = -rad; y <= rad; y++) {
      for (let x = -rad; x <= rad; x++) {
        const d = Math.hypot(x, y * 1.1) / rad;
        const n = noise(cx + x, cy + y, seed);
        if (d > 1 - n * 0.12) continue;
        const light = (-x - y) / (rad * 2);
        let c = shadeHex(color, 0.9 + light * 0.45 + (n - 0.5) * 0.25);
        if (d > 0.88) c = shadeHex(color, 0.55);
        setPixel(this.r, cx + x, cy + y, c);
      }
    }
  }

  /** Tiang tipis. */
  pole(u: number, v: number, z: number, h: number, color: string, thick = 1): void {
    const [x, y] = this.p(u, v, z);
    for (let yy = Math.round(y - h); yy <= Math.round(y); yy++) {
      for (let k = 0; k < thick; k++) setPixel(this.r, x + k, yy, k === 0 ? color : shadeHex(color, 0.7));
    }
  }

  /** Atap miring dua sisi (pelana) di atas area u..u+w, v..v+d pada ketinggian z. */
  gableRoof(u: number, v: number, w: number, d: number, z: number, rise: number, color: string, stripes: string | null): void {
    const P = this.p.bind(this);
    const ridgeA = P(u, v + d / 2, z + rise);
    const ridgeB = P(u + w, v + d / 2, z + rise);
    const back = [P(u, v, z), P(u + w, v, z), ridgeB, ridgeA] as [number, number][];
    const front = [ridgeA, ridgeB, P(u + w, v + d, z), P(u, v + d, z)] as [number, number][];
    fillPolygon(this.r, back, shadeHex(color, 1.08));
    fillPolygon(this.r, front, shadeHex(color, 0.86));
    if (stripes) {
      const n = Math.max(2, Math.round(w / 6));
      for (let i = 0; i < n; i += 2) {
        const a = u + (w * i) / n;
        const b = u + (w * (i + 1)) / n;
        fillPolygon(this.r, [P(a, v + d / 2, z + rise), P(b, v + d / 2, z + rise), P(b, v + d, z), P(a, v + d, z)], shadeHex(stripes, 0.9));
        fillPolygon(this.r, [P(a, v, z), P(b, v, z), P(b, v + d / 2, z + rise), P(a, v + d / 2, z + rise)], stripes);
      }
    }
    const edge = shadeHex(color, 0.45);
    line(this.r, ...P(u, v + d, z), ...P(u + w, v + d, z), (x, y) => setPixel(this.r, x, y, edge));
    line(this.r, ...ridgeA, ...ridgeB, (x, y) => setPixel(this.r, x, y, shadeHex(color, 1.25)));
  }
}

function noise(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function hashText(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

interface Plan {
  w: number;
  d: number;
  /** Tinggi gambar di atas tanah (piksel). */
  height: number;
  blocking: boolean;
  seating: boolean;
  seatLift: number;
  draw(iso: Iso, frame: number): void;
  /** Titik lampu relatif (u, v, z). */
  light?: { u: number; v: number; z: number; radius: number; color: string };
}

function plan(p: ParsedDescription, seed: number): Plan {
  const s = p.scale;
  const main = p.colors[0];
  const accent = p.colors[1];
  const r = (n: number): number => Math.max(2, Math.round(n * s));
  const wood = hex(PAL.wood);
  const flame = (iso: Iso, u: number, v: number, z: number, f: number): void => {
    const [x, y] = iso.p(u, v, z);
    const hgt = 3 + ((f + seed) % 3);
    for (let k = 0; k < hgt; k++) {
      const wdt = Math.max(0, Math.round((hgt - k) / 2) - (k === 0 ? 0 : 0));
      for (let dx = -wdt; dx <= wdt; dx++) setPixel(iso.r, x + dx + (k === hgt - 1 ? f % 2 : 0), y - k, k < hgt / 2 ? hex(PAL.ember) : hex(PAL.emberHot));
    }
  };

  switch (p.kind.id) {
    case 'cart': {
      const w = r(32 * p.long);
      const d = r(14);
      const body = main ?? wood;
      const roof = accent ?? hex(PAL.tarpOrange);
      return {
        w,
        d,
        height: r(44 * p.tall),
        blocking: true,
        seating: false,
        seatLift: 0,
        draw(iso, f) {
          iso.box(0, 0, w, d, 4, r(14), body);
          iso.box(2, 1, w - 4, d - 2, 4 + r(14), r(7), hex(PAL.glass));
          for (const [u, v] of [
            [0, 0],
            [w, 0],
            [0, d],
            [w, d],
          ] as const)
            iso.pole(u, v, 4 + r(14), r(20), hex(PAL.woodDark));
          iso.gableRoof(-2, -2, w + 4, d + 4, 4 + r(34), r(6), roof, p.striped ? hex(PAL.tarpCream) : null);
          const [wx, wy] = iso.p(w * 0.75, d, 3);
          iso.ellipse(wx, wy, 3, 3, hex(PAL.woodDark), hex(PAL.black));
          const [wx2, wy2] = iso.p(w * 0.25, d, 3);
          iso.ellipse(wx2, wy2, 3, 3, hex(PAL.woodDark), hex(PAL.black));
          if (p.fire) flame(iso, w - 4, d / 2, 4 + r(14), f);
        },
        light: p.lit ? { u: w / 2, v: d / 2, z: 4 + r(30), radius: 60, color: '#ffd27a' } : undefined,
      };
    }
    case 'stall': {
      const w = r(32 * p.long);
      const d = r(24);
      const body = main ?? wood;
      const roof = accent ?? (main ? shadeHex(main, 1.1) : hex(PAL.tarpOrange));
      return {
        w,
        d,
        height: r(48 * p.tall),
        blocking: true,
        seating: false,
        seatLift: 0,
        draw(iso) {
          for (const [u, v] of [
            [1, 1],
            [w - 1, 1],
            [1, d - 1],
            [w - 1, d - 1],
          ] as const)
            iso.pole(u, v, 0, r(34 * p.tall), hex(PAL.woodDark));
          iso.box(0, d - 8, w, 8, 0, r(14), body);
          iso.box(0, d - 8, w, 8, r(14), 1, hex(PAL.woodLight));
          iso.gableRoof(-3, -3, w + 6, d + 6, r(34 * p.tall), r(8), roof, p.striped || !accent ? hex(PAL.tarpCream) : null);
        },
        light: p.lit ? { u: w / 2, v: d / 2, z: r(30), radius: 70, color: '#ffd27a' } : undefined,
      };
    }
    case 'umbrella': {
      const rad = r(12);
      const c = main ?? '#4f8a3c';
      return {
        w: r(24),
        d: r(24),
        height: r(40 * p.tall),
        blocking: true,
        seating: false,
        seatLift: 0,
        draw(iso) {
          const u = r(12);
          iso.box(u - 6, u - 6, 12, 12, 0, 8, hex(PAL.woodLight));
          iso.pole(u, u, 0, r(32 * p.tall), hex(PAL.steelDark));
          const [cx, cy] = iso.p(u, u, r(32 * p.tall));
          for (let y = 0; y <= rad / 2 + 2; y++) {
            const half = Math.round((y / (rad / 2 + 2)) * rad * 1.4);
            for (let x = -half; x <= half; x++) setPixel(iso.r, cx + x, cy + y - 2, Math.abs(x) % 6 < 3 && accent ? accent : shadeHex(c, 1 - y * 0.03));
          }
        },
      };
    }
    case 'table': {
      const w = r(18 * p.long);
      const d = r(12);
      const c = main ?? wood;
      return {
        w,
        d,
        height: r(14),
        blocking: true,
        seating: false,
        seatLift: 0,
        draw(iso) {
          for (const [u, v] of [
            [1, 1],
            [w - 2, 1],
            [1, d - 2],
            [w - 2, d - 2],
          ] as const)
            iso.box(u, v, 1.5, 1.5, 0, r(8), shadeHex(c, 0.8), false);
          iso.box(0, 0, w, d, r(8), 2, c);
        },
      };
    }
    case 'bench': {
      const w = r(32 * p.long);
      const d = 6;
      const c = main ?? wood;
      return {
        w,
        d,
        height: 10,
        blocking: false,
        seating: true,
        seatLift: 6,
        draw(iso) {
          for (const u of [2, w - 4]) iso.box(u, 1, 2, d - 2, 0, 5, shadeHex(c, 0.75), false);
          iso.box(0, 0, w, d, 5, 2, c);
        },
      };
    }
    case 'chair': {
      const c = main ?? '#c8443a';
      return {
        w: 8,
        d: 8,
        height: 18,
        blocking: true,
        seating: true,
        seatLift: 4,
        draw(iso) {
          for (const [u, v] of [
            [0, 0],
            [7, 0],
            [0, 7],
            [7, 7],
          ] as const)
            iso.pole(u, v, 0, 5, shadeHex(c, 0.6));
          iso.box(0, 0, 8, 8, 5, 1, c);
          iso.box(0, 0, 8, 1.5, 6, 9, shadeHex(c, 0.95));
        },
      };
    }
    case 'lantern': {
      const c = main ?? '#c8443a';
      return {
        w: 6,
        d: 6,
        height: r(40 * p.tall),
        blocking: true,
        seating: false,
        seatLift: 0,
        draw(iso, f) {
          iso.pole(3, 3, 0, r(36 * p.tall), hex(PAL.woodDark));
          const [x, y] = iso.p(3, 3, r(30 * p.tall));
          iso.ellipse(x + 2, y, 3, 4, f % 2 && p.animated ? shadeHex(c, 1.3) : c, shadeHex(c, 0.5));
          setPixel(iso.r, x + 2, y - 5, hex(PAL.black));
        },
        light: { u: 3, v: 3, z: r(30 * p.tall), radius: 48, color: '#ffb35c' },
      };
    }
    case 'lamp': {
      const c = main ?? hex(PAL.steelDark);
      const h = r(44 * p.tall);
      return {
        w: 4,
        d: 4,
        height: h + 6,
        blocking: true,
        seating: false,
        seatLift: 0,
        draw(iso, f) {
          iso.box(0, 0, 4, 4, 0, 3, shadeHex(c, 0.8));
          iso.pole(2, 2, 3, h, c, 2);
          if (p.fire) flame(iso, 2, 2, h + 3, f);
          else {
            const [x, y] = iso.p(2, 2, h + 3);
            iso.ellipse(x, y, 3, 2, f % 2 && p.animated ? '#fff3b0' : hex(PAL.windowLit), c);
          }
        },
        light: { u: 2, v: 2, z: h + 3, radius: p.fire ? 50 : 70, color: p.fire ? '#ff9a4a' : '#ffd27a' },
      };
    }
    case 'tree': {
      const crown = main ?? hex(PAL.leaf);
      const h = r(40 * p.tall);
      return {
        w: 16,
        d: 16,
        height: h + r(14),
        blocking: true,
        seating: false,
        seatLift: 0,
        draw(iso) {
          iso.cylinder(8, 8, 2, 0, h - r(6), accent ?? hex(PAL.woodDark));
          const [x, y] = iso.p(8, 8, h);
          iso.blob(x, y, r(13), crown, seed);
          iso.blob(x - r(6), y + r(5), r(8), crown, seed + 1);
          iso.blob(x + r(7), y + r(4), r(8), crown, seed + 2);
        },
      };
    }
    case 'plant': {
      const leaf = hex(PAL.leafLight);
      const flower = main;
      return {
        w: 8,
        d: 8,
        height: r(20),
        blocking: true,
        seating: false,
        seatLift: 0,
        draw(iso) {
          iso.cylinder(4, 4, 3, 0, 6, accent ?? hex(PAL.clay));
          const [x, y] = iso.p(4, 4, 8);
          iso.blob(x, y - r(4), r(6), leaf, seed);
          if (flower) {
            for (let i = 0; i < 7; i++) {
              const fx = x - 4 + Math.floor(noise(i, 1, seed) * 9);
              const fy = y - r(4) - 4 + Math.floor(noise(i, 2, seed) * 7);
              setPixel(iso.r, fx, fy, flower);
              setPixel(iso.r, fx + 1, fy, shadeHex(flower, 1.2));
            }
          }
        },
      };
    }
    case 'barrel': {
      const c = main ?? '#3f7d4a';
      return {
        w: 8,
        d: 8,
        height: r(14 * p.tall),
        blocking: true,
        seating: false,
        seatLift: 0,
        draw(iso, f) {
          iso.cylinder(4, 4, r(4), 0, r(12 * p.tall), c);
          if (accent) {
            const [x, y] = iso.p(4, 4, r(6 * p.tall));
            line(iso.r, x - r(4) * 1.4, y, x + r(4) * 1.4, y, (px, py) => setPixel(iso.r, px, py, accent));
          }
          if (p.fire) flame(iso, 4, 4, r(12 * p.tall), f);
        },
        light: p.fire ? { u: 4, v: 4, z: r(14 * p.tall), radius: 50, color: '#ff9a4a' } : undefined,
      };
    }
    case 'sign': {
      const w = r(28 * p.long);
      const board = main ?? hex(PAL.cream);
      return {
        w,
        d: 3,
        height: r(30 * p.tall),
        blocking: true,
        seating: false,
        seatLift: 0,
        draw(iso, f) {
          iso.pole(1, 2, 0, r(22 * p.tall), hex(PAL.woodDark));
          iso.pole(w - 1, 2, 0, r(22 * p.tall), hex(PAL.woodDark));
          iso.box(0, 1, w, 2, r(12 * p.tall), r(12), board);
          const text = accent ?? hex(PAL.clayDark);
          for (let i = 3; i < w - 3; i += 3) {
            const [x, y] = iso.p(i, 3, r(12 * p.tall) + r(6));
            setPixel(iso.r, x, y, text);
            setPixel(iso.r, x + 1, y, text);
          }
          if (p.animated && f % 2) {
            const [x, y] = iso.p(w / 2, 3, r(12 * p.tall) + r(12));
            setPixel(iso.r, x, y, '#fff3b0');
          }
        },
        light: p.lit ? { u: w / 2, v: 3, z: r(18 * p.tall), radius: 50, color: '#ffd27a' } : undefined,
      };
    }
    case 'building': {
      const w = r(48 * p.long);
      const d = r(40);
      const wall = main ?? hex(PAL.wallCream);
      const roof = accent ?? hex(PAL.roofTile);
      const h = r(30 * p.tall);
      return {
        w,
        d,
        height: h + r(20),
        blocking: true,
        seating: false,
        seatLift: 0,
        draw(iso) {
          iso.box(0, 0, w, d, 0, h, wall);
          for (let u = 6; u < w - 6; u += 12) iso.box(u, d, 6, 0.01, 6, 9, hex(PAL.windowLit), false);
          iso.gableRoof(-3, -3, w + 6, d + 6, h, r(16), roof, null);
        },
        light: p.lit ? { u: w / 2, v: d, z: 10, radius: 80, color: '#ffd27a' } : undefined,
      };
    }
    case 'fence': {
      const w = r(32 * p.long);
      const c = main ?? hex(PAL.woodLight);
      return {
        w,
        d: 2,
        height: 14,
        blocking: true,
        seating: false,
        seatLift: 0,
        draw(iso) {
          for (let u = 0; u <= w; u += 4) iso.pole(u, 1, 0, 11, shadeHex(c, 0.8));
          iso.box(0, 0.5, w, 1, 4, 1.5, c, false);
          iso.box(0, 0.5, w, 1, 8, 1.5, c, false);
        },
      };
    }
    default: {
      const w = r(14 * p.long);
      const d = r(12);
      const c = main ?? hex(PAL.woodLight);
      return {
        w,
        d,
        height: r(12 * p.tall),
        blocking: true,
        seating: false,
        seatLift: 0,
        draw(iso) {
          iso.box(0, 0, w, d, 0, r(12 * p.tall), c);
          const plank = shadeHex(c, 0.7);
          for (let z = 4; z < r(12 * p.tall); z += 4) line(iso.r, ...iso.p(0, d, z), ...iso.p(w, d, z), (x, y) => setPixel(iso.r, x, y, plank));
          if (accent) iso.box(1, 1, w - 2, d - 2, r(12 * p.tall), 1, accent);
        },
      };
    }
  }
}

/** Buat objek dari deskripsi. Selalu menghasilkan sesuatu (peti bila jenis tak dikenali). */
export function generateFromDescription(desc: string): GeneratedObject {
  const parsed = parseDescription(desc);
  const seed = hashText(desc);
  const pl = plan(parsed, seed);
  const pad = 3;
  const frameWidth = Math.ceil(pl.w + pl.d + pad * 2 + 4);
  const frameHeight = Math.ceil((pl.w + pl.d) / 2 + pl.height + pad * 2);
  // Sudut belakang alas: x = d (+pad), y = tinggi (+pad).
  const anchorX = pl.d + pad + 2;
  const anchorY = pl.height + pad;
  const frameCount = parsed.animated || parsed.fire ? 3 : 1;
  const frames: Raster[] = [];
  for (let f = 0; f < frameCount; f++) {
    const r = makeRaster(frameWidth, frameHeight);
    pl.draw(new Iso(r, anchorX, anchorY), f);
    frames.push(r);
  }
  const lights: GeneratedLight[] = [];
  if (pl.light && parsed.lit) {
    const [x, y] = new Iso(frames[0]!, anchorX, anchorY).p(pl.light.u, pl.light.v, pl.light.z);
    lights.push({
      px: Math.round(x),
      py: Math.round(y),
      radius: pl.light.radius,
      color: pl.light.color,
      intensity: 0.8,
      flicker: parsed.fire ? 0.35 : 0.05,
      glow: true,
    });
  }
  const label = desc.trim() ? desc.trim().charAt(0).toUpperCase() + desc.trim().slice(1, 40) : parsed.kind.label;
  return {
    label,
    kind: parsed.kind.id,
    frameWidth,
    frameHeight,
    anchorX,
    anchorY,
    footprint: { w: Math.round(pl.w), d: Math.round(pl.d) },
    blocking: pl.blocking,
    seating: pl.seating,
    seatLift: pl.seatLift,
    frames,
    frameMs: parsed.fire ? 140 : 450,
    lights,
  };
}

/** Warna palet game (tanpa duplikat), untuk palet studio & penyesuaian warna hasil AI. */
export function gamePalette(): string[] {
  const set = new Set<string>(Object.values(PAL).map((c) => hex(c)));
  for (const c of Object.values(COLOR_WORDS)) set.add(c);
  return [...set];
}

export { rgbToHex };
