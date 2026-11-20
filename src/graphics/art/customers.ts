import { CUSTOMER_TYPES, type CustomerTypeDef } from '../../data/customers';
import { CATALOG } from '../../data/catalog';
import { NAMED_CUSTOMERS, namedById } from '../../data/story';
import { ALLIES } from '../../data/challenges';
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

function palette(type: Pick<CustomerTypeDef, 'id' | 'palettes'>, index: number, skin: Color): Record<string, Color> {
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
  // Pelanggan bernama (cerita) & kenalan tantangan (0.18.0): satu palet khusus per tokoh.
  [...NAMED_CUSTOMERS, ...ALLIES].forEach((c, i) => {
    namedFrames(c.id, i).forEach((canvas, fi) => {
      entries.push({ key: customerTextureKey(`named_${c.id}`, 0, fi), art: { canvas, anchorX: 6.5, anchorY: 20 } });
    });
  });
  return entries;
}

function namedFrames(id: string, index: number): PixelCanvas[] {
  const c = namedById(id);
  const pal = palette({ id: c.id, palettes: [c.palette] }, 0, SKINS[index % SKINS.length] as Color);
  return [
    frame([...UPPER, ...LEGS.stand], pal, 0),
    frame([...UPPER, ...LEGS.walkA], pal, 0),
    frame([...UPPER, ...LEGS.walkB], pal, 0),
    frame([...UPPER, ...SIT_LEGS], pal, 3),
  ];
}

/** Tokoh tantangan kampung (0.18.0): ODGJ, ormas (ketua & anggota), tim nakes, polisi. */
export const CHALLENGE_LOOKS: Record<string, readonly { hair: string; shirt: string; accent: string; pants: string }[]> = {
  odgj: [{ hair: '#8a8478', shirt: '#7a6a52', accent: '#5a4a3a', pants: '#4a4238' }],
  ormas: [
    { hair: '#141010', shirt: '#2a2a2e', accent: '#c0392b', pants: '#3a4a2e' },
    { hair: '#1e1612', shirt: '#4a5a34', accent: '#2a2a2e', pants: '#2a2a2e' },
  ],
  nakes: [{ hair: '#201818', shirt: '#f2f6f6', accent: '#d64545', pants: '#e8eeee' }],
  polisi: [{ hair: '#141212', shirt: '#7a5a34', accent: '#d9c08a', pants: '#3e3222' }],
};

export function paintChallengeFolk(): ArtEntry[] {
  const entries: ArtEntry[] = [];
  for (const [id, palettes] of Object.entries(CHALLENGE_LOOKS)) {
    palettes.forEach((look, pi) => {
      const pal = palette({ id, palettes: [look] }, 0, SKINS[(pi + id.length) % SKINS.length] as Color);
      const frames = [frame([...UPPER, ...LEGS.stand], pal, 0), frame([...UPPER, ...LEGS.walkA], pal, 0), frame([...UPPER, ...LEGS.walkB], pal, 0)];
      frames.forEach((canvas, fi) => entries.push({ key: customerTextureKey(id, pi, fi), art: { canvas, anchorX: 6.5, anchorY: 20 } }));
    });
  }
  return entries;
}

/** Potret tokoh tantangan untuk panel obrolan (mis. ketua ormas yang menagih). */
export function challengePortrait(id: string, paletteIndex = 0): PixelCanvas {
  const look = CHALLENGE_LOOKS[id]?.[paletteIndex] ?? CHALLENGE_LOOKS.ormas?.[0];
  if (!look) throw new Error(`Tokoh tantangan ${id} tidak ada`);
  const pal = palette({ id, palettes: [look] }, 0, SKINS[(paletteIndex + id.length) % SKINS.length] as Color);
  return frame([...UPPER, ...LEGS.stand], pal, 0);
}

/** Kucing 12×9: frame 0 duduk, 1 & 2 berlari. Varian 'liar' (abu kusam) dan 'belang' (peliharaan). */
export const catKey = (variant: 'liar' | 'belang', frameIndex: number): string => `cat_${variant}_${frameIndex}`;

export function paintCats(): ArtEntry[] {
  const SIT = ['.k......k.', '.kk....kk.', '.kKKKKKKk.', '.KeKKKKeK.', '..KKnKKK..', '...KKKK..t', '..KKwwKK.t', '..KKwwKKtt', '..KK..KK..'];
  const RUN_A = ['k.k.......', 'kKk.......', 'KeKKKKKK..', 'KKKKKKKKKt', '.KKwwKKKK.t', '.K.K..K.K.', 'K..K..K..K', '..........', '..........'];
  const RUN_B = ['k.k.......', 'kKk.......', 'KeKKKKKK.t', 'KKKKKKKKKt', '.KKwwKKKK.', '..KK..KK..', '..K.K.K.K.', '..........', '..........'];
  const looks: Record<'liar' | 'belang', Record<string, Color>> = {
    liar: { k: 0x5a5048, K: 0x7d7268, e: 0xe8d84a, n: 0xd08a8a, w: 0xa89c90, t: 0x5a5048 },
    belang: { k: 0xd07a2a, K: 0xf0a24a, e: 0x3a8a3a, n: 0xe89a9a, w: 0xfdf8ee, t: 0xd07a2a },
  };
  const entries: ArtEntry[] = [];
  for (const [variant, pal] of Object.entries(looks) as ['liar' | 'belang', Record<string, Color>][]) {
    [SIT, RUN_A, RUN_B].forEach((rows, fi) => {
      const c = new PixelCanvas(13, 11);
      c.drawPattern(1, 1, rows.map((r) => r.padEnd(11, '.').slice(0, 11)), pal);
      c.outline(0x1b1220, 235);
      entries.push({ key: catKey(variant, fi), art: { canvas: c, anchorX: 6.5, anchorY: 10 } });
    });
  }
  return entries;
}

/** Potret pelanggan bernama untuk panel dialog (sprite berdiri). */
export function namedPortrait(id: string): PixelCanvas {
  const index = NAMED_CUSTOMERS.findIndex((c) => c.id === id);
  return namedFrames(id, Math.max(0, index))[0] as PixelCanvas;
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
    talk: { rows: ['.........', '.........', 'oo.oo.oo.', 'oo.oo.oo.', 'oo.oo.oo.', '.........'], pal: { o: 0x1d6f8a } },
    alert: { rows: ['r..r..r..', 'r..r..r..', 'r..r..r..', 'r..r..r..', '.........', 'r..r..r..', '.........'], pal: { r: 0xe0302a } },
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
