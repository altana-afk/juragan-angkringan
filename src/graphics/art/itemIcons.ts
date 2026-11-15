import type { IconShape, ItemIcon } from '../../data/catalog';
import { shade, type Color } from '../color';
import { PixelCanvas } from '../PixelCanvas';

/** Ikon pixel 16×16 untuk bahan & produk, digambar dari data ikon (bentuk + 2 warna) di JSON. */

const OUTLINE: Color = 0x2a1a1e;
const WHITE: Color = 0xf4f1ea;
const PLATE: Color = 0xe9e4d8;
const GLASS: Color = 0xcfe6ef;

export function parseHex(hex: string): Color {
  return Number.parseInt(hex.slice(1), 16) >>> 0;
}

type Painter = (c: PixelCanvas, main: Color, accent: Color) => void;

const SHAPES: Record<IconShape, Painter> = {
  sack: (c, m, a) => {
    c.fillPolygon([{ x: 4, y: 4 }, { x: 12, y: 4 }, { x: 14, y: 14 }, { x: 2, y: 14 }], m);
    c.fillRect(5, 2, 6, 3, shade(m, 0.85));
    c.fillRect(4, 4, 8, 1, a);
    c.fillRect(5, 8, 6, 3, a);
  },
  egg: (c, m, a) => {
    c.fillEllipse(6, 9, 4, 5, m);
    c.fillEllipse(11, 10, 3.5, 4.5, shade(m, 0.92));
    c.fillRect(4, 6, 1, 2, WHITE);
    c.fillRect(10, 8, 1, 1, a);
  },
  sausage: (c, m, a) => {
    c.fillEllipse(8, 8, 6.5, 3, m);
    c.fillRect(3, 7, 9, 1, shade(m, 1.25));
    c.fillRect(1, 7, 1, 2, a);
    c.fillRect(14, 7, 1, 2, a);
  },
  block: (c, m, a) => {
    c.fillPolygon([{ x: 2, y: 6 }, { x: 8, y: 3 }, { x: 14, y: 6 }, { x: 8, y: 9 }], shade(m, 1.1));
    c.fillPolygon([{ x: 2, y: 6 }, { x: 8, y: 9 }, { x: 8, y: 14 }, { x: 2, y: 11 }], m);
    c.fillPolygon([{ x: 8, y: 9 }, { x: 14, y: 6 }, { x: 14, y: 11 }, { x: 8, y: 14 }], a);
  },
  skewer: (c, m, a) => {
    c.line(2, 14, 14, 2, 0xc2a25a);
    for (const [x, y] of [[5, 11], [8, 8], [11, 5]] as const) {
      c.fillEllipse(x, y, 2.6, 2.2, m);
      c.setPixel(x - 1, y - 1, shade(m, 1.3));
      c.setPixel(x + 1, y + 1, a);
    }
  },
  ball: (c, m, a) => {
    for (const [x, y] of [[5, 10], [11, 10], [8, 5]] as const) {
      c.fillCircle(x, y, 3.4, m);
      c.setPixel(x - 2, y - 2, shade(m, 1.35));
      c.setPixel(x + 1, y + 1, a);
    }
  },
  packet: (c, m, a) => {
    c.fillRect(2, 3, 12, 10, m);
    c.fillRect(2, 3, 12, 2, shade(m, 0.85));
    c.fillRect(2, 11, 12, 2, shade(m, 0.85));
    c.fillRect(5, 6, 6, 4, a);
    c.fillRect(6, 7, 4, 2, 0xf3d27a);
  },
  chili: (c, m, a) => {
    c.fillPolygon([{ x: 4, y: 4 }, { x: 8, y: 5 }, { x: 13, y: 13 }, { x: 11, y: 14 }, { x: 4, y: 8 }], m);
    c.setPixel(6, 6, shade(m, 1.35));
    c.fillRect(2, 3, 3, 2, a);
    c.fillRect(3, 1, 1, 2, a);
  },
  onion: (c, m, a) => {
    c.fillCircle(8, 10, 5, m);
    c.fillPolygon([{ x: 6, y: 6 }, { x: 10, y: 6 }, { x: 8, y: 1 }], m);
    c.line(8, 6, 8, 14, a);
    c.line(5, 8, 6, 13, a);
    c.line(11, 8, 10, 13, a);
    c.setPixel(5, 9, shade(m, 1.3));
  },
  bottle: (c, m, a) => {
    c.fillRect(6, 1, 4, 2, a);
    c.fillRect(6, 3, 4, 3, m);
    c.fillRect(4, 6, 8, 9, m);
    c.fillRect(4, 9, 8, 3, a);
    c.fillRect(5, 6, 1, 8, shade(m, 1.4));
  },
  bag: (c, m, a) => {
    c.fillRect(3, 3, 10, 12, m);
    c.fillRect(3, 3, 10, 1, shade(m, 0.8));
    c.fillRect(5, 7, 6, 5, a);
    c.fillRect(4, 4, 1, 10, shade(m, 1.15));
  },
  jug: (c, m, a) => {
    c.fillRect(6, 1, 4, 2, a);
    c.fillEllipse(8, 9, 6, 6, m);
    c.fillRect(3, 6, 1, 6, WHITE);
    c.fillRect(5, 12, 6, 1, shade(m, 0.8));
  },
  water: (c, m, a) => {
    c.fillRect(6, 1, 4, 2, a);
    c.fillRect(5, 3, 6, 12, m);
    c.fillRect(5, 7, 6, 3, a);
    c.fillRect(6, 4, 1, 10, WHITE);
  },
  cube: (c, m, a) => {
    for (const [x, y] of [[3, 7], [9, 5], [6, 10]] as const) {
      c.fillRect(x, y, 5, 5, m);
      c.fillRect(x, y, 5, 1, WHITE);
      c.fillRect(x + 4, y + 1, 1, 4, a);
    }
  },
  plate: (c, m, a) => {
    c.fillEllipse(8, 11, 7, 3.5, PLATE);
    c.fillEllipse(8, 9, 5, 3.5, m);
    c.fillRect(6, 7, 2, 1, shade(m, 1.3));
    c.fillRect(9, 9, 2, 1, a);
    c.fillRect(5, 10, 1, 1, 0x6d9440);
    c.fillRect(11, 8, 1, 1, 0xd63a2a);
  },
  fried: (c, m, a) => {
    c.fillEllipse(8, 12, 7, 2.5, PLATE);
    c.fillPolygon([{ x: 3, y: 9 }, { x: 9, y: 6 }, { x: 13, y: 9 }, { x: 7, y: 12 }], m);
    c.fillPolygon([{ x: 5, y: 7 }, { x: 10, y: 4 }, { x: 13, y: 7 }, { x: 8, y: 10 }], shade(m, 1.12));
    c.setPixel(7, 7, a);
    c.setPixel(10, 6, a);
    c.setPixel(6, 10, a);
  },
  glass: (c, m, _a) => {
    c.fillPolygon([{ x: 4, y: 2 }, { x: 12, y: 2 }, { x: 11, y: 15 }, { x: 5, y: 15 }], GLASS);
    c.fillPolygon([{ x: 4.5, y: 5 }, { x: 11.5, y: 5 }, { x: 11, y: 14 }, { x: 5, y: 14 }], m);
    c.fillRect(5, 6, 1, 7, shade(m, 1.35));
    c.fillRect(7, 0, 1, 3, 0xd8d0c0);
    c.fillRect(9, 0, 1, 2, 0xd8d0c0);
  },
  glass_ice: (c, m, a) => {
    c.fillPolygon([{ x: 4, y: 2 }, { x: 12, y: 2 }, { x: 11, y: 15 }, { x: 5, y: 15 }], GLASS);
    c.fillPolygon([{ x: 4.5, y: 4 }, { x: 11.5, y: 4 }, { x: 11, y: 14 }, { x: 5, y: 14 }], m);
    c.fillRect(6, 5, 2, 2, a);
    c.fillRect(9, 7, 2, 2, a);
    c.fillRect(6, 9, 2, 2, a);
    c.line(10, 0, 9, 6, 0xe74c3c);
  },
  cup: (c, m, a) => {
    c.fillEllipse(8, 14, 7, 1.5, PLATE);
    c.fillRect(3, 6, 9, 8, a);
    c.fillRect(12, 8, 2, 1, a);
    c.fillRect(13, 8, 1, 4, a);
    c.fillRect(12, 11, 2, 1, a);
    c.fillRect(4, 6, 7, 2, m);
    c.fillRect(5, 1, 1, 3, 0xd8d0c0);
    c.fillRect(8, 0, 1, 4, 0xd8d0c0);
  },
  skewer_dish: (c, m, a) => {
    c.fillEllipse(8, 12, 7, 3, PLATE);
    for (const off of [0, 3]) {
      c.line(2 + off, 12, 12 + off, 4, 0xc2a25a);
      for (const t of [0.35, 0.6, 0.85]) {
        const x = 2 + off + 10 * t;
        const y = 12 - 8 * t;
        c.fillEllipse(x, y, 1.8, 1.6, m);
        c.setPixel(Math.floor(x), Math.floor(y), a);
      }
    }
  },
  bowl: (c, m, a) => {
    c.fillPolygon([{ x: 1, y: 7 }, { x: 15, y: 7 }, { x: 12, y: 14 }, { x: 4, y: 14 }], PLATE);
    c.fillEllipse(8, 7, 6.5, 2, a);
    for (let x = 3; x < 13; x += 2) c.fillRect(x, 6 + (x % 4 === 1 ? 0 : 1), 2, 1, m);
    c.fillRect(6, 9, 4, 1, shade(PLATE, 0.85));
  },
};

export function drawItemIcon(icon: ItemIcon): PixelCanvas {
  const canvas = new PixelCanvas(18, 18);
  const inner = new PixelCanvas(16, 16);
  SHAPES[icon.shape](inner, parseHex(icon.color), parseHex(icon.accent));
  canvas.blit(inner, 1, 1);
  canvas.outline(OUTLINE, 255);
  return canvas;
}
