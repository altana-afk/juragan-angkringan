import { forEachTextPixel, measureText } from '../pixelFont';
import { objectTextureKey } from '../../world/objectTypes';
import { hashNoise, SeededRandom } from '../../utils/random';
import { shade, type Color } from '../color';
import { boxColors, paintIsoSprite, type IsoPainter } from '../IsoPainter';
import { PAL } from '../palette';
import { foliageBlob, glassBox, kettle } from './helpers';
import type { ArtEntry } from './types';

const LAMP_WARM = 0xffc070;
const BULBS: readonly Color[] = [0xff5a5a, 0xffd34a, 0x5ad1ff, 0x7aff7a, 0xff8ae0];

interface CartStyle {
  readonly cabinet: Color;
  readonly top: Color;
  readonly pole: Color;
  readonly poleRing: Color;
  readonly trim?: Color;
  readonly lamp: Color;
  readonly sign?: string;
}

/** Varian tampilan gerobak (upgrade). */
export const CART_STYLES: Readonly<Record<string, CartStyle>> = {
  basic: { cabinet: PAL.wood, top: PAL.woodLight, pole: PAL.bamboo, poleRing: PAL.bambooDark, lamp: LAMP_WARM },
  standar: { cabinet: 0x3f7d4a, top: PAL.woodLight, pole: PAL.bamboo, poleRing: PAL.bambooDark, trim: 0xe7cf8f, lamp: LAMP_WARM, sign: 'WEDANG' },
  modern: { cabinet: 0x2f5f8a, top: 0xc9d2da, pole: 0x9aa4ad, poleRing: 0x5f6a74, trim: 0xe9eef2, lamp: 0xfff1d6, sign: 'MODERN' },
  premium: { cabinet: 0x5a2e1c, top: 0x8a5a34, pole: 0x6d3a22, poleRing: 0xd9a93a, trim: 0xe6b84a, lamp: 0xffcf7a, sign: 'JURAGAN' },
};

/** Gerobak angkringan: kabinet kayu, roda, etalase kaca, nasi kucing, gorengan, lampu gantung. */
export function paintCart(variant = 'basic'): ArtEntry {
  const st = CART_STYLES[variant] ?? (CART_STYLES.basic as CartStyle);
  const art = paintIsoSprite({ footW: 32, footD: 14, height: 58, margin: 12 }, (p) => {
    const topZ = 18.5;
    // kaki belakang & pegangan dorong
    p.box(1, 1, 0, 2, 2, 7, PAL.woodDark);
    p.box(29, 1, 0, 2, 2, 7, PAL.woodDark);
    p.box(-9, 2, 11, 10, 1.2, 1.2, PAL.woodDark);
    p.box(-9, 10.8, 11, 10, 1.2, 1.2, PAL.woodDark);
    // tiang bambu belakang
    p.box(0, 0, topZ, 1.5, 1.5, 34, st.pole);
    p.box(30.5, 0, topZ, 1.5, 1.5, 34, st.pole);
    // kaki depan
    p.box(1, 11, 0, 2, 2, 7, PAL.woodDark);
    p.box(29, 11, 0, 2, 2, 7, PAL.woodDark);
    // kabinet
    p.box(0, 0, 6, 32, 14, 11, st.cabinet, { noise: 0.05, seed: 3 });
    const groove = shade(st.cabinet, 0.68);
    for (const z of [9.5, 13]) {
      p.faceY(14, 0, z, 32, 1, groove);
      p.faceX(32, 0, z, 14, 1, shade(groove, 0.85));
    }
    for (const x of [8, 16, 24]) p.faceY(14, x, 6, 1, 11, groove);
    // pintu laci + gagang
    p.faceY(14, 2, 7.5, 5, 8, shade(st.cabinet, 0.8));
    if (st.trim) {
      p.faceY(14.02, 0, 16, 32, 1, st.trim);
      p.faceX(32.02, 0, 16, 14, 1, shade(st.trim, 0.8));
      p.faceY(14.02, 0, 6, 32, 0.8, st.trim);
    }
    if (st.sign) p.textYCentered(14.03, 2, 28, 16, st.sign, st.trim ?? PAL.cream);
    p.pixel3(6, 14, 11.5, PAL.emberHot);
    // roda (sisi depan)
    p.discY(20, 14.6, 7, 7.2, PAL.black);
    p.discY(20, 14.7, 7, 5.8, PAL.woodLight);
    p.discY(20, 14.8, 7, 4.6, PAL.woodDark);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      p.line3({ x: 20, y: 14.9, z: 7 }, { x: 20 + Math.cos(a) * 4.6, y: 14.9, z: 7 + Math.sin(a) * 4.6 }, PAL.woodLight);
    }
    p.discY(20, 15, 7, 1.4, PAL.steelLight);
    // meja atas
    p.box(-1, -1, 17, 34, 16, 1.5, st.top, { noise: 0.04, seed: 5 });

    // isi etalase (sate & bacem di piring)
    for (let i = 0; i < 6; i++) {
      p.box(3.5 + i * 4.4, 1.8, topZ, 3.2, 3.2, 0.6, PAL.white);
      p.box(4 + i * 4.4, 2.3, topZ + 0.6, 2.2, 2.2, 1.6, i % 2 ? 0x8a4a2a : 0xa86a3a);
    }
    glassBox(p, 2, 0.5, topZ, 28, 6, 8);
    p.line3({ x: 2, y: 6.5, z: topZ + 8 }, { x: 30, y: 6.5, z: topZ + 8 }, PAL.woodDark);
    p.line3({ x: 30, y: 0.5, z: topZ + 8 }, { x: 30, y: 6.5, z: topZ + 8 }, PAL.woodDark);
    p.line3({ x: 30, y: 6.5, z: topZ }, { x: 30, y: 6.5, z: topZ + 8 }, PAL.woodDark);

    // nasi kucing berbungkus kertas & daun
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 2; j++) {
        const x = 2.5 + i * 3.5;
        const y = 8 + j * 3;
        p.box(x, y, topZ, 2.8, 2.6, 1.6, { top: 0xdcc292, left: 0xb59a6c, right: 0x9a8058 });
        p.top(x, y + 1, topZ + 1.6, 2.8, 0.8, 0x6d9440);
      }
    }
    // toples kerupuk
    p.box(17.3, 8.3, topZ, 2.8, 2.8, 3.4, 0xf0dca8);
    glassBox(p, 17, 8, topZ, 3.4, 3.4, 5);
    // nampan gorengan
    p.box(21.5, 8, topZ, 9, 5.2, 0.8, PAL.steel);
    const rng = new SeededRandom('gorengan');
    for (let k = 0; k < 9; k++) {
      const pt = p.project(22.5 + rng.range(0, 7), 9 + rng.range(0, 3.4), topZ + 1.4);
      p.canvas.fillEllipse(pt.x, pt.y, 1.6, 1, rng.chance(0.5) ? 0xc98b3a : 0xe0a650);
    }
    // gelas teh
    p.box(13.5, 11.5, topZ, 1.6, 1.6, 2.4, { top: 0x7a3a14, left: 0xb5652c, right: 0x8f4c20 });

    // tiang bambu depan
    p.box(0, 12.5, topZ, 1.5, 1.5, 31, st.pole);
    p.box(30.5, 12.5, topZ, 1.5, 1.5, 31, st.pole);
    for (const [x, y] of [[0, 12.5], [30.5, 12.5]] as const) {
      for (const z of [topZ + 10, topZ + 21]) p.faceY(y + 1.5, x, z, 1.5, 1, st.poleRing);
    }
    // lampu gantung di tepi depan (terlihat di bawah spanduk tenda)
    p.line3({ x: 16, y: 13.5, z: 49 }, { x: 16, y: 13.5, z: 37 }, PAL.black);
    p.box(14.6, 12.1, 36, 2.8, 2.8, 1, PAL.steelDark);
    p.box(15.2, 12.7, 32.5, 1.6, 1.6, 3.5, { top: 0xfff6c8, left: 0xffe08a, right: 0xffd06a });
  });
  return {
    key: objectTextureKey('cart', variant),
    art,
    meta: {
      lights: [{ x: 16, y: 13.5, z: 33, radius: variant === 'basic' ? 112 : variant === 'standar' ? 120 : 136, color: st.lamp, intensity: 1, flicker: 0.05, glow: true, glowScale: 1 }],
    },
  };
}

/** Tenda terpal bergaris dengan spanduk "ANGKRINGAN". */
export function paintCanopy(variant = 'orange'): ArtEntry {
  const w = 52;
  const d = 34;
  const zBack = 54;
  const zFront = 48;
  const art = paintIsoSprite({ footW: w, footD: d, height: 62, margin: 8 }, (p) => {
    const stripes = 8;
    const sw = w / stripes;
    for (let i = 0; i < stripes; i++) {
      const x0 = i * sw;
      const x1 = x0 + sw;
      const color = i % 2 ? PAL.tarpCream : PAL.tarpOrange;
      p.poly(
        [
          { x: x0, y: 0, z: zBack },
          { x: x1, y: 0, z: zBack },
          { x: x1, y: d, z: zFront },
          { x: x0, y: d, z: zFront },
        ],
        p.noisy(color, 0.03, 61),
      );
    }
    // bayangan lipatan di tengah terpal
    p.poly(
      [
        { x: 0, y: d * 0.45, z: zBack - 6 * 0.45 },
        { x: w, y: d * 0.45, z: zBack - 6 * 0.45 },
        { x: w, y: d * 0.5, z: zBack - 6 * 0.5 },
        { x: 0, y: d * 0.5, z: zBack - 6 * 0.5 },
      ],
      0x000000,
      28,
    );
    // ketebalan sisi kanan
    p.poly(
      [
        { x: w, y: 0, z: zBack },
        { x: w, y: d, z: zFront },
        { x: w, y: d, z: zFront - 1.5 },
        { x: w, y: 0, z: zBack - 1.5 },
      ],
      shade(PAL.tarpOrange, 0.6),
    );
    // spanduk depan bergerigi
    const bannerH = 7;
    p.faceY(d, 0, zFront - bannerH, w, bannerH, PAL.tarpBlue);
    for (let x = 0; x < w; x += 4) {
      p.poly(
        [
          { x, y: d, z: zFront - bannerH },
          { x: x + 4, y: d, z: zFront - bannerH },
          { x: x + 2, y: d, z: zFront - bannerH - 2 },
        ],
        PAL.tarpBlue,
      );
    }
    p.faceY(d, 0, zFront - 1, w, 1, shade(PAL.tarpBlue, 1.25));
    p.textYCentered(d, 0, w, zFront - 1, 'ANGKRINGAN', PAL.tarpCream);
    if (variant === 'lights') {
      // untaian lampu warna-warni di bawah spanduk
      for (let x = 2; x < w; x += 4) {
        const sag = Math.sin(((x % 16) / 16) * Math.PI) * 1.6;
        p.line3({ x, y: d + 0.2, z: zFront - bannerH - 2 - sag }, { x: x + 4, y: d + 0.2, z: zFront - bannerH - 2 - Math.sin((((x + 4) % 16) / 16) * Math.PI) * 1.6 }, PAL.black);
        const pt = p.project(x, d + 0.3, zFront - bannerH - 3 - sag);
        p.canvas.fillEllipse(pt.x, pt.y, 1, 1, BULBS[Math.floor(x / 4) % BULBS.length] as Color);
      }
    }
  });
  if (variant !== 'lights') return { key: objectTextureKey('canopy', variant), art };
  return {
    key: objectTextureKey('canopy', variant),
    art,
    meta: {
      lights: [6, 20, 34, 48].map((x, i) => ({ x, y: d, z: zFront - 10, radius: 46, color: BULBS[i % BULBS.length] as Color, intensity: 0.55, flicker: 0.12, glow: true, glowScale: 0.35 })),
    },
  };
}

const STOVE_SPRITE = { footW: 12, footD: 14, height: 40, margin: 12 } as const;

/** Meja kecil dengan anglo (tungku arang) dan tiga ceret. */
export function paintStove(): ArtEntry {
  const art = paintIsoSprite(STOVE_SPRITE, (p) => {
    p.box(0.5, 0.5, 0, 1.5, 1.5, 14, PAL.woodDark);
    p.box(10, 0.5, 0, 1.5, 1.5, 14, PAL.woodDark);
    p.box(0.5, 12, 0, 1.5, 1.5, 14, PAL.woodDark);
    p.box(10, 12, 0, 1.5, 1.5, 14, PAL.woodDark);
    p.box(0, 0, 14, 12, 14, 2, PAL.woodLight, { noise: 0.05, seed: 9 });
    // anglo tanah liat
    p.box(1.5, 1.5, 16, 9, 8.5, 6, PAL.clay, { noise: 0.07, seed: 4 });
    p.box(1, 1, 22, 10, 9.5, 1.2, shade(PAL.clay, 1.15));
    p.top(2.2, 2.2, 23.3, 7.6, 7, (px, py) => (hashNoise(px, py, 77) > 0.7 ? PAL.ember : PAL.coal));
    p.faceY(10, 4, 17, 4, 3, PAL.coal);
    p.faceY(10.05, 4.8, 17.4, 2.4, 1.6, PAL.ember);
    // ceret besar di atas anglo + dua ceret kecil di depan
    kettle(p, 6, 5.5, 23.5, 4.2);
    kettle(p, 2.6, 12.3, 16, 2.6);
    kettle(p, 8.6, 12.6, 16, 2.6);
  });
  return {
    key: objectTextureKey('stove', 'anglo'),
    art,
    meta: {
      lights: [{ x: 6, y: 9, z: 20, radius: 58, color: 0xff8a3a, intensity: 0.85, flicker: 0.28, glow: true, glowScale: 0.55 }],
      smoke: { x: 6, y: 5.5, z: 34 },
    },
  };
}

/** Tiga frame api/bara berkedip di anglo; jangkar sama dengan sprite anglo. */
export function paintStoveFireFrames(): ArtEntry[] {
  return [0, 1, 2].map((frame) => {
    const art = paintIsoSprite({ ...STOVE_SPRITE, outline: false, trim: false }, (p) => {
      const rng = new SeededRandom(1000 + frame * 17);
      // lubang angin menyala
      p.faceY(10.08, 4.8, 17.4, 2.4, 1.6, frame === 1 ? PAL.emberHot : PAL.ember);
      // lidah api kecil di tepi depan anglo
      for (let k = 0; k < 7; k++) {
        const along = rng.range(0, 1);
        const onFront = rng.chance(0.55);
        const base = onFront ? p.project(2.4 + along * 7.4, 9.6, 23.4) : p.project(9.8, 2.4 + along * 7.2, 23.4);
        const h = rng.int(1, 3);
        for (let i = 0; i < h; i++) {
          const color: Color = i === h - 1 ? PAL.emberHot : i === 0 ? 0xff5a1f : PAL.ember;
          p.canvas.setPixel(Math.floor(base.x), Math.floor(base.y) - i, color, 235);
        }
      }
    });
    return { key: objectTextureKey('stove', 'anglo', frame), art };
  });
}

export function paintBenches(variant = 'wood'): ArtEntry[] {
  const premium = variant === 'premium';
  const wood = premium ? 0x8a4a28 : PAL.woodLight;
  const seat = { top: wood, left: shade(wood, 0.82), right: shade(wood, 0.64) };
  const cushion = 0xb8433a;
  const benchX = paintIsoSprite({ footW: 32, footD: 6, height: 12 }, (p) => {
    p.box(2, 0.5, 0, 1.5, 5, 6, PAL.woodDark);
    p.box(28.5, 0.5, 0, 1.5, 5, 6, PAL.woodDark);
    p.box(0, 0, 6, 32, 6, 1.8, seat, { noise: 0.05, seed: 21 });
    p.line3({ x: 0, y: 3, z: 7.8 }, { x: 32, y: 3, z: 7.8 }, shade(wood, 0.75));
    if (premium) {
      for (const x of [1.5, 12, 22.5]) p.box(x, 0.8, 7.8, 8, 4.4, 1.2, cushion);
      p.box(0, -0.5, 7.8, 32, 1, 6, seat);
    }
  });
  const benchY = paintIsoSprite({ footW: 6, footD: 32, height: 12 }, (p) => {
    p.box(0.5, 2, 0, 5, 1.5, 6, PAL.woodDark);
    p.box(0.5, 28.5, 0, 5, 1.5, 6, PAL.woodDark);
    p.box(0, 0, 6, 6, 32, 1.8, seat, { noise: 0.05, seed: 22 });
    p.line3({ x: 3, y: 0, z: 7.8 }, { x: 3, y: 32, z: 7.8 }, shade(wood, 0.75));
    if (premium) {
      for (const y of [1.5, 12, 22.5]) p.box(0.8, y, 7.8, 4.4, 8, 1.2, cushion);
      p.box(-0.5, 0, 7.8, 1, 32, 6, seat);
    }
  });
  return [
    { key: objectTextureKey('bench_x', variant), art: benchX },
    { key: objectTextureKey('bench_y', variant), art: benchY },
  ];
}

/** Papan nama/menu di pinggir jalan dengan lampu sorot kecil. */
export function paintSignBoard(): ArtEntry {
  const art = paintIsoSprite({ footW: 28, footD: 3, height: 34, margin: 10 }, (p) => {
    // Papan menghadap pemain (billboard) agar tulisan terbaca lurus, bukan miring mengikuti bidang iso.
    const c = p.project(14, 1.5, 21);
    const w = 31;
    const h = 16;
    const x0 = Math.round(c.x - w / 2);
    const y0 = Math.round(c.y - h / 2);
    const cv = p.canvas;
    const ground = Math.round(p.project(14, 1.5, 0).y);
    for (const px of [x0 + 5, x0 + w - 7]) {
      cv.fillRect(px, y0 + h - 1, 2, ground - (y0 + h) + 2, PAL.woodDark);
      cv.fillRect(px, y0 + h - 1, 1, ground - (y0 + h) + 2, shade(PAL.woodDark, 1.25));
    }
    cv.fillRect(x0, y0, w, h, 0x1b1416);
    cv.fillRect(x0 + 1, y0 + 1, w - 2, h - 2, 0xe7cf8f);
    cv.fillRect(x0 + 2, y0 + 2, w - 4, h - 4, 0x2c3a2e);
    cv.fillRect(x0 + 2, y0 + 2, w - 4, 1, 0x3c4e3e);
    const line = (text: string, y: number, color: Color): void => {
      const tx = Math.round(c.x - measureText(text) / 2);
      forEachTextPixel(text, (dx, dy) => cv.setPixel(tx + dx, y + dy, color));
    };
    line('NASI', y0 + 3, 0xfff2c4);
    line('KUCING', y0 + 9, 0xffc070);
    const lamp = p.project(14, 1.5, 30);
    cv.fillRect(Math.round(lamp.x) - 2, Math.round(lamp.y), 5, 2, PAL.steelDark);
    cv.fillRect(Math.round(lamp.x), Math.round(lamp.y) + 2, 1, y0 - Math.round(lamp.y) - 2, PAL.steelDark);
  });
  return {
    key: objectTextureKey('sign_board', 'default'),
    art,
    meta: { lights: [{ x: 14, y: 3.5, z: 28, radius: 48, color: 0xffe6bb, intensity: 0.7, flicker: 0.02, glow: true, glowScale: 0.3 }] },
  };
}

/** Tikar lesehan anyaman bergaris (tempel di tanah). */
export function paintMat(): ArtEntry {
  const art = paintIsoSprite({ footW: 28, footD: 28, height: 2, outline: false }, (p) => {
    const colors = [0xb8433a, 0xe7cf8f, 0x3f7d4a, 0xe7cf8f];
    for (let i = 0; i < 14; i++) {
      p.top(i * 2, 0, 0.5, 2, 28, p.noisy(colors[i % colors.length] as Color, 0.08, 90 + i));
    }
    const border = 0x7d2a24;
    p.top(0, 0, 0.6, 28, 1.2, border);
    p.top(0, 26.8, 0.6, 28, 1.2, border);
    p.top(0, 0, 0.6, 1.2, 28, border);
    p.top(26.8, 0, 0.6, 1.2, 28, border);
  });
  return { key: objectTextureKey('mat', 'striped'), art };
}

export function paintLowTable(): ArtEntry {
  const art = paintIsoSprite({ footW: 14, footD: 10, height: 12 }, (p) => {
    for (const [x, y] of [[1, 1], [11.5, 1], [1, 7.5], [11.5, 7.5]] as const) p.box(x, y, 0, 1.5, 1.5, 4, PAL.woodDark);
    p.box(0, 0, 4, 14, 10, 1.4, PAL.woodLight, { noise: 0.05, seed: 31 });
    p.box(2, 2, 5.4, 1.6, 1.6, 2.4, { top: 0x7a3a14, left: 0xb5652c, right: 0x8f4c20 });
    p.box(4.5, 6, 5.4, 1.6, 1.6, 2.4, { top: 0x2f1a10, left: 0x5a3420, right: 0x47291a });
    p.box(7.5, 2.5, 5.4, 5, 4, 0.5, PAL.white);
    p.box(8.5, 3.2, 5.9, 3, 2.4, 1, 0xc98b3a);
  });
  return { key: objectTextureKey('low_table', 'wood'), art };
}

export function paintTrashBin(): ArtEntry {
  const art = paintIsoSprite({ footW: 6, footD: 6, height: 14 }, (p) => {
    p.box(0, 0, 0, 6, 6, 10, 0x3f7d4a, { noise: 0.04, seed: 5 });
    p.faceY(6, 0, 3, 6, 1, 0x2f5f38);
    p.faceX(6, 0, 3, 6, 1, 0x284f30);
    p.box(-0.4, -0.4, 10, 6.8, 6.8, 1.2, 0x2f5f38);
  });
  return { key: objectTextureKey('trash_bin', 'green'), art };
}

export function paintPlantPot(): ArtEntry {
  const art = paintIsoSprite({ footW: 6, footD: 6, height: 18 }, (p) => {
    p.box(0.5, 0.5, 0, 5, 5, 4.5, PAL.clay, { noise: 0.05, seed: 8 });
    p.box(0, 0, 4.5, 6, 6, 1, shade(PAL.clay, 1.15));
    const c = p.project(3, 3, 9);
    foliageBlob(p.canvas, c.x - 2, c.y + 1, 3.6, 81);
    foliageBlob(p.canvas, c.x + 2, c.y + 1, 3.6, 82);
    foliageBlob(p.canvas, c.x, c.y - 2, 3.8, 83);
  });
  return { key: objectTextureKey('plant_pot', 'default'), art };
}

function drawMotorbike(p: IsoPainter, body: Color): void {
  const wheel = (x: number, y: number): void => {
    p.discY(x, y, 4, 4, PAL.black);
    p.discY(x, y + 0.1, 4, 2.4, PAL.steelDark);
    p.discY(x, y + 0.2, 4, 1, PAL.steelLight);
  };
  wheel(4, -0.2);
  wheel(18, -0.2);
  p.box(1.5, 1.8, 6, 3, 2.4, 2.5, body);
  p.box(4, 1.5, 4, 11, 3, 4, boxColors(body));
  p.line3({ x: 3, y: 6.2, z: 5 }, { x: 10, y: 6.2, z: 3 }, PAL.steelLight);
  p.box(6, 1.2, 8, 8, 3.6, 1.6, PAL.black);
  p.box(14.5, 1.2, 4, 2, 3.6, 7.5, body);
  p.line3({ x: 18, y: 3, z: 4 }, { x: 16.2, y: 3, z: 12 }, PAL.steelDark);
  p.box(15.2, 0, 12, 1.2, 6, 1, PAL.black);
  p.box(16.6, 2.2, 10, 1.6, 1.6, 1.6, PAL.cream);
  wheel(4, 6.2);
  wheel(18, 6.2);
}

export function paintMotorbikes(): ArtEntry[] {
  const variants: [string, Color][] = [
    ['red', 0xc0392b],
    ['blue', 0x2e6fb0],
  ];
  return variants.map(([variant, color]) => ({
    key: objectTextureKey('motorbike', variant),
    art: paintIsoSprite({ footW: 22, footD: 6, height: 18 }, (p) => drawMotorbike(p, color)),
  }));
}

/** Dua kursi plastik lipat merah + meja kecil (upgrade "Kursi plastik lipat"). */
export function paintPlasticChairs(): ArtEntry {
  const red = 0xc8423a;
  const art = paintIsoSprite({ footW: 28, footD: 10, height: 16 }, (p) => {
    const chair = (x: number): void => {
      for (const [dx, dy] of [[0, 0], [5, 0], [0, 5], [5, 5]] as const) p.box(x + dx, 2 + dy, 0, 1, 1, 5, shade(red, 0.75));
      p.box(x, 2, 5, 6, 6, 1.2, red);
      p.box(x, 1.4, 6.2, 6, 1, 6, shade(red, 0.9));
    };
    chair(1);
    chair(20);
    p.box(10, 2, 0, 1, 1, 6, PAL.steel);
    p.box(10, 1, 6, 8, 8, 1, 0xe9e2d0);
    p.box(12, 3, 7, 1.6, 1.6, 2.4, { top: 0x7a3a14, left: 0xb5652c, right: 0x8f4c20 });
  });
  return { key: objectTextureKey('plastic_chairs', 'red'), art };
}

/** Meja bundar dengan payung taman besar bergaris (upgrade "Meja payung taman"). */
export function paintUmbrellaTable(): ArtEntry {
  const a = 0x2f8a6a;
  const b = 0xf2eee2;
  const art = paintIsoSprite({ footW: 24, footD: 24, height: 40, margin: 12 }, (p) => {
    p.box(11, 11, 0, 2, 2, 7, PAL.steel);
    p.discTop(12, 12, 7, 8, PAL.woodLight);
    p.discTop(12, 12, 7.01, 7, shade(PAL.woodLight, 0.92));
    p.box(11.5, 11.5, 7, 1, 1, 26, PAL.steelLight);
    // kanopi payung: 8 segmen bergaris
    const r = 15;
    for (let i = 0; i < 8; i++) {
      const t0 = (i / 8) * Math.PI * 2;
      const t1 = ((i + 1) / 8) * Math.PI * 2;
      p.poly(
        [
          { x: 12, y: 12, z: 36 },
          { x: 12 + Math.cos(t0) * r, y: 12 + Math.sin(t0) * r, z: 29 },
          { x: 12 + Math.cos(t1) * r, y: 12 + Math.sin(t1) * r, z: 29 },
        ],
        i % 2 === 0 ? a : b,
      );
    }
    p.box(11, 11, 6.9, 2, 2, 0.1, 0x6e2418);
  });
  return { key: objectTextureKey('umbrella_table', 'green'), art };
}

/** Kunci tekstur pengantar pesanan online bermotor. */
export const RIDER_KEYS = { ojol: 'rider-ojol', kurir: 'rider-kurir' } as const;

/** Motor + pengendara berhelm + kotak antaran di belakang (pesanan online). */
export function paintRiders(): ArtEntry[] {
  const looks: [string, Color, Color, Color][] = [
    // kunci, warna motor, jaket/helm, kotak
    [RIDER_KEYS.ojol, 0x2b2b2f, 0x2fa04a, 0x2fa04a],
    [RIDER_KEYS.kurir, 0xc0392b, 0xe08a2c, 0x2e6fb0],
  ];
  return looks.map(([key, bike, jacket, box]) => ({
    key,
    art: paintIsoSprite({ footW: 22, footD: 6, height: 30 }, (p) => {
      drawMotorbike(p, bike);
      // Kotak antaran di jok belakang.
      p.box(0.5, 0.6, 9.6, 5, 5.2, 6, boxColors(box), { noise: 0.05, seed: 17 });
      p.box(0.5, 0.6, 15.6, 5, 5.2, 0.6, shade(box, 1.2));
      // Kaki, badan, lengan, kepala berhelm.
      p.box(9, 1.6, 6, 2.4, 3.2, 4, 0x2b3550);
      p.box(7.6, 1.4, 9.6, 3.4, 3.6, 6.4, boxColors(jacket));
      p.box(11, 1.6, 13.4, 4.6, 1, 1.2, shade(jacket, 0.85));
      p.box(11, 4.4, 13.4, 4.6, 1, 1.2, shade(jacket, 0.85));
      p.box(8, 1.7, 16, 2.8, 3, 2.6, 0xe0b48a);
      p.box(7.6, 1.4, 17.6, 3.6, 3.6, 2.6, boxColors(jacket));
      p.box(10.6, 1.8, 17.2, 0.8, 2.8, 1.2, 0x9fd3f0);
    }),
  }));
}

/** Kunci tekstur kendaraan penolong (0.18.0). */
export const VEHICLE_KEYS = { ambulans: 'vehicle-ambulans', polisi: 'vehicle-polisi' } as const;

/** Ambulans putih bergaris merah & mobil patroli biru-putih, membujur ke sumbu x seperti motor. */
export function paintRescueVehicles(): ArtEntry[] {
  const looks: [string, Color, Color, Color][] = [
    // kunci, badan, garis, lampu sirene
    [VEHICLE_KEYS.ambulans, 0xf4f4f0, 0xd23a32, 0xff4a3a],
    [VEHICLE_KEYS.polisi, 0x2a4a8a, 0xf4f4f0, 0x4aa0ff],
  ];
  return looks.map(([key, body, stripe, siren]) => ({
    key,
    art: paintIsoSprite({ footW: 34, footD: 14, height: 26 }, (p) => {
      const wheel = (x: number, y: number): void => {
        p.discY(x, y, 5, 5, PAL.black);
        p.discY(x, y + 0.1, 5, 2.6, PAL.steelDark);
      };
      wheel(7, -0.2);
      wheel(27, -0.2);
      // Badan bawah, kabin atas, kaca.
      p.box(1, 1, 3, 32, 12, 8, boxColors(body), { noise: 0.03, seed: 41 });
      p.box(1, 1, 11, 22, 12, 9, boxColors(body), { noise: 0.03, seed: 43 });
      p.box(23, 1.5, 11, 6, 11, 6, boxColors(0x7fb6d8));
      p.box(1, 0.9, 7, 32, 0.4, 2.4, stripe);
      p.box(1, 12.7, 7, 32, 0.4, 2.4, stripe);
      p.box(32.6, 1, 7, 0.6, 12, 2.4, stripe);
      // Sirene di atap.
      p.box(10, 4, 20, 5, 6, 2, siren);
      p.box(15, 4, 20, 3, 6, 2, shade(siren, 0.6));
      p.box(32.8, 2, 5, 0.5, 2, 2, PAL.cream);
      p.box(32.8, 10, 5, 0.5, 2, 2, PAL.cream);
      wheel(7, 13.2);
      wheel(27, 13.2);
    }),
  }));
}
