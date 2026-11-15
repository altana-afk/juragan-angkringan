import { CUSTOMER_TYPES, type CustomerTypeDef } from '../../data/customers';
import { CATALOG } from '../../data/catalog';
import { shade, type Color } from '../color';
import { PixelCanvas } from '../PixelCanvas';
import { drawItemIcon, parseHex } from './itemIcons';
import type { ArtEntry } from './types';

/**
 * Sprite pelanggan 13×21 (dengan garis tepi) dari satu templat + palet per tipe.
 * Frame: 0 berdiri, 1 & 2 berjalan, 3 duduk. Jangkar di tengah bawah (kaki).
 */

const UPPER = [
  '...HHHHH...',
  '..HHHHHHH..',
  '..HsssssH..',
  '..ssesess..',
  '..sssssss..',
  '...SsssS...',
  '....SSS....',
  '..cccaccC..',
  '.ccccaccCC.',
  '.scccaccCs.',
  '.scccaccCs.',
  '.sccccccCs.',
  '.s.CCCCC.s.',
  '...ppppP...',
];
const LEGS: Record<'stand' | 'walkA' | 'walkB', string[]> = {
  stand: ['...ppPpP...', '...pp.pP...', '...pp.pP...', '...pp.pP...', '...ff.ff...'],
  walkA: ['...ppPpP...', '..pp...pP..', '..pp...pP..', '.pp.....pP.', '.ff.....ff.'],
  walkB: ['....pPp....', '....pPp....', '....pPp....', '....pPp....', '....fff....'],
};
const SIT_LEGS = ['..pppppPP..', '..ff...ff..'];

const SKINS: readonly Color[] = [0xc68a5a, 0xa8704a, 0xdba67c];
export const CUSTOMER_FRAMES = 4;

function palette(type: CustomerTypeDef, index: number, skin: Color): Record<string, Color> {
  const p = type.palettes[index] ?? type.palettes[0];
  if (!p) throw new Error(`Tipe ${type.id} tidak punya palet`);
  const shirt = parseHex(p.shirt);
  const pants = parseHex(p.pants);
  return {
    H: parseHex(p.hair), s: skin, S: shade(skin, 0.8), e: 0x1a1010,
    c: shirt, C: shade(shirt, 0.78), a: parseHex(p.accent), p: pants, P: shade(pants, 0.75), f: 0x2a1d1a,
  };
}

function frame(rows: string[], pal: Record<string, Color>, offsetY: number): PixelCanvas {
  for (const r of rows) if (r.length !== 11) throw new Error(`Baris templat pelanggan harus 11 karakter: "${r}"`);
  const body = new PixelCanvas(13, 21);
  body.drawPattern(1, 1 + offsetY, rows, pal);
  body.outline(0x1b1220, 235);
  return body;
}

export function customerTextureKey(typeId: string, paletteIndex: number, frameIndex: number): string {
  return `cust_${typeId}_${paletteIndex}_${frameIndex}`;
}

export function paintCustomers(): ArtEntry[] {
  const entries: ArtEntry[] = [];
  for (const type of CUSTOMER_TYPES) {
    type.palettes.forEach((_, pi) => {
      const pal = palette(type, pi, SKINS[pi % SKINS.length] as Color);
      const frames = [
        frame([...UPPER, ...LEGS.stand], pal, 0),
        frame([...UPPER, ...LEGS.walkA], pal, 0),
        frame([...UPPER, ...LEGS.walkB], pal, 0),
        frame([...UPPER, ...SIT_LEGS], pal, 3),
      ];
      frames.forEach((canvas, fi) => {
        entries.push({ key: customerTextureKey(type.id, pi, fi), art: { canvas, anchorX: 6.5, anchorY: 20 } });
      });
    });
  }
  return entries;
}

/** Gelembung bicara, ikon emosi, dan ikon produk untuk gelembung pesanan. */
export const BUBBLE_KEY = 'fx_bubble';
export const emoteKey = (e: string): string => `emote_${e}`;
export const productIconKey = (id: string): string => `item_${id}`;

export function paintBubblesAndEmotes(): ArtEntry[] {
  const bubble = new PixelCanvas(24, 24);
  bubble.fillRect(2, 1, 20, 19, 0xfdf8ee);
  bubble.fillRect(1, 2, 22, 17, 0xfdf8ee);
  bubble.fillPolygon([{ x: 9, y: 19 }, { x: 15, y: 19 }, { x: 12, y: 23 }], 0xfdf8ee);
  bubble.outline(0x2a1a1e, 255);

  const emotes: Record<string, { rows: string[]; pal: Record<string, Color> }> = {
    wait: { rows: ['.........', '.........', '.........', '.........', 'oo.oo.oo.', 'oo.oo.oo.', '.........'], pal: { o: 0x5a4a40 } },
    happy: { rows: ['.rr...rr.', 'rRrr.rrrr', 'rRrrrrrrr', 'rrrrrrrrr', '.rrrrrrr.', '..rrrrr..', '...rrr...', '....r....'], pal: { r: 0xe0485a, R: 0xff9aa8 } },
    ok: { rows: ['..yyyyy..', '.yyyyyyy.', 'yyoyyyoyy', 'yyyyyyyyy', 'yoyyyyyoy', 'yyoooooyy', '.yyyyyyy.', '..yyyyy..'], pal: { y: 0xf6c453, o: 0x5a3a10 } },
    angry: { rows: ['r..r.r..r', '.r.r.r.r.', '..rrrrr..', 'rrr...rrr', '..rrrrr..', '.r.r.r.r.', 'r..r.r..r'], pal: { r: 0xd6382a } },
  };
  const entries: ArtEntry[] = [{ key: BUBBLE_KEY, art: { canvas: bubble, anchorX: 12, anchorY: 23 } }];
  for (const [name, def] of Object.entries(emotes)) {
    const c = new PixelCanvas(11, 10);
    c.drawPattern(1, 1, def.rows, def.pal);
    c.outline(0x2a1a1e, 200);
    entries.push({ key: emoteKey(name), art: { canvas: c, anchorX: 5.5, anchorY: 5 } });
  }
  for (const r of CATALOG.recipes) {
    entries.push({ key: productIconKey(r.id), art: { canvas: drawItemIcon(r.icon), anchorX: 9, anchorY: 9 } });
  }
  return entries;
}
