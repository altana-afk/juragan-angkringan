import type { Color } from '../graphics/color';
import { PixelCanvas } from '../graphics/PixelCanvas';
import { pixelDataUrl } from './pixelImage';

/** Ikon pixel 9×9 buatan sendiri untuk HUD & tombol. */

interface IconDef {
  rows: string[];
  palette: Record<string, Color>;
}

const WHITE = { w: 0xfff3df };

const ICONS = {
  briefcase: {
    rows: ['...ooo...', '...o.o...', 'ooooooooo', 'obbbbbbbo', 'obbbybbbo', 'oBBByBBBo', 'obbbbbbbo', 'obbbbbbbo', 'ooooooooo'],
    palette: { o: 0x3a2414, b: 0xa86a3a, B: 0x7a4a26, y: 0xf2c14e },
  },
  phone: {
    rows: ['.ooooooo.', '.oKKKKKo.', '.oKgggKo.', '.oKgwgKo.', '.oKgggKo.', '.oKgggKo.', '.oKKKKKo.', '.oKKwKKo.', '.ooooooo.'],
    palette: { o: 0x1a1418, K: 0x3a3440, g: 0x5fd47a, w: 0xfff3df },
  },
  coin: {
    rows: ['..ooooo..', '.oYYyyyo.', 'oYyyyyydo', 'oYyyoyydo', 'oyyyoyydo', 'oyyyoyydo', 'oyyyyyddo', '.oyddddo.', '..ooooo..'],
    palette: { o: 0x5a3a10, y: 0xf2c14e, Y: 0xfff0a0, d: 0xc7902a },
  },
  calendar: {
    rows: ['..o...o..', 'ooooooooo', 'orrrrrrro', 'ooooooooo', 'owwwwwwwo', 'owkwkwkwo', 'owwwwwwwo', 'owkwkwwwo', 'ooooooooo'],
    palette: { o: 0x2a1d1a, r: 0xd9534f, w: 0xf4efe2, k: 0x5a4a40 },
  },
  clock: {
    rows: ['..ooooo..', '.owwwwwo.', 'owwwkwwwo', 'owwwkwwwo', 'owwwkkkwo', 'owwwwwwwo', 'owwwwwwwo', '.owwwwwo.', '..ooooo..'],
    palette: { o: 0x6b4a1a, w: 0xf4efe2, k: 0x2a1d1a },
  },
  star: {
    rows: ['....o....', '...oyo...', '...oyo...', 'oooyyyooo', 'oyyyYyyyo', '.oyyyyyo.', '..oyyyo..', '.oyyoyyo.', '.oo...oo.'],
    palette: { o: 0x6b3a10, y: 0xf6c453, Y: 0xfff0a0 },
  },
  sun: {
    rows: ['y...y...y', '.y.....y.', '...ooo...', '..oyyyo..', 'yyoyYyoyy', '..oyyyo..', '...ooo...', '.y.....y.', 'y...y...y'],
    palette: { y: 0xf6c453, Y: 0xfff0a0, o: 0xe09a2a },
  },
  hot: {
    rows: ['y...y...y', '.y.....y.', '...ooo...', '..oyyyo..', 'yyoyYyoyy', '..oyyyo..', '...ooo...', '.y.....y.', 'y...y...y'],
    palette: { y: 0xff8a3a, Y: 0xffd25a, o: 0xc0392b },
  },
  cloud: {
    rows: ['.........', '...ooo...', '..owwwoo.', '.owwwwwwo', 'owwwwwwwo', 'owwwwwwwo', '.ooooooo.', '.........', '.........'],
    palette: { o: 0x6a7686, w: 0xe8ecf2 },
  },
  rain: {
    rows: ['...ooo...', '..owwwoo.', '.owwwwwwo', 'owwwwwwwo', '.ooooooo.', '.b..b..b.', 'b..b..b..', '.........', '..b..b...'],
    palette: { o: 0x6a7686, w: 0xd5dbe4, b: 0x5aa0e6 },
  },
  menu: {
    rows: ['.........', 'wwwwwwwww', 'wwwwwwwww', '.........', 'wwwwwwwww', 'wwwwwwwww', '.........', 'wwwwwwwww', 'wwwwwwwww'],
    palette: WHITE,
  },
  plus: {
    rows: ['.........', '...www...', '...www...', '.wwwwwww.', '.wwwwwww.', '.wwwwwww.', '...www...', '...www...', '.........'],
    palette: WHITE,
  },
  minus: {
    rows: ['.........', '.........', '.........', '.wwwwwww.', '.wwwwwww.', '.wwwwwww.', '.........', '.........', '.........'],
    palette: WHITE,
  },
  target: {
    rows: ['....w....', '..wwwww..', '.w..w..w.', '.w.....w.', 'wwww.wwww', '.w.....w.', '.w..w..w.', '..wwwww..', '....w....'],
    palette: WHITE,
  },
  basket: {
    rows: ['...ooo...', '..o...o..', '.o.....o.', 'ooooooooo', 'obbbbbbbo', '.obBbBbo.', '.obbbbbo.', '..obBbo..', '..ooooo..'],
    palette: { o: 0x2a1d1a, b: 0xc98a46, B: 0x8a5a34 },
  },
  pot: {
    rows: ['..s.s.s..', '...s.s...', '.ooooooo.', 'oggggggo.', 'ogGGGGgoo', 'oggggggo.', '.ogggggo.', '..ooooo..', '.r.r.r.r.'],
    palette: { o: 0x2a1d1a, g: 0x8d96a3, G: 0xc3cad3, s: 0xe8ecf2, r: 0xff7a2f },
  },
  store: {
    rows: ['rwrwrwrwr', 'rwrwrwrwr', 'ooooooooo', '.o.....o.', '.o.yyy.o.', '.o.yyy.o.', '.obbbbbo.', '.ob...bo.', 'ooooooooo'],
    palette: { o: 0x2a1d1a, r: 0xd9643a, w: 0xf1dcb0, y: 0xffd27a, b: 0x8a5a34 },
  },
  megaphone: {
    rows: ['.......o.', '.....oor.', '...oorrr.', 'ooorrrrr.', 'owwrrrrr.', 'ooorrrrr.', '.o.oorrr.', '.o...oor.', '.oo....o.'],
    palette: { o: 0x2a1d1a, r: 0xd9643a, w: 0xf4efe2 },
  },
  chart: {
    rows: ['o........', 'o......g.', 'o......g.', 'o...y..g.', 'o...y..g.', 'o.b.y..g.', 'o.b.y..g.', 'o.b.y..g.', 'ooooooooo'],
    palette: { o: 0xe8ecf2, b: 0x4b8fcb, y: 0xf6c453, g: 0x7bd389 },
  },
  bank: {
    rows: ['....o....', '..ooYoo..', '.oYYYYYo.', 'ooooooooo', '.w.w.w.w.', '.w.w.w.w.', '.w.w.w.w.', 'ooooooooo', 'ooooooooo'],
    palette: { o: 0x2a1d1a, Y: 0xf6c453, w: 0xe9e2d0 },
  },
  hammer: {
    rows: ['.ooooo...', 'oggggGo..', 'oggggGo..', '.ooobo...', '....bo...', '....bo...', '....bo...', '....bo...', '....oo...'],
    palette: { o: 0x2a1d1a, g: 0x8d96a3, G: 0xc3cad3, b: 0xc98a46 },
  },
  save: {
    rows: ['ooooooooo', 'owwwwwbbo', 'owwwwwbbo', 'owwwwwbbo', 'oooooooo.', 'obbbbbbbo', 'obwwwwwbo', 'obwwwwwbo', 'ooooooooo'],
    palette: { o: 0x2a1d1a, w: 0xf4efe2, b: 0x4b8fcb },
  },
  fullscreen: {
    rows: ['www...www', 'w.......w', 'w.......w', '.........', '.........', '.........', 'w.......w', 'w.......w', 'www...www'],
    palette: WHITE,
  },
} satisfies Record<string, IconDef>;

export type IconName = keyof typeof ICONS;

export function iconUrl(name: IconName): string {
  return pixelDataUrl(`icon:${name}`, () => {
    const def: IconDef = ICONS[name];
    const canvas = new PixelCanvas(9, 9);
    canvas.drawPattern(0, 0, def.rows, def.palette);
    return canvas;
  });
}

/** Elemen <img> ikon pixel (dekoratif, aria-hidden). */
export function icon(name: IconName, className = 'px-icon'): HTMLImageElement {
  const img = document.createElement('img');
  img.src = iconUrl(name);
  img.alt = '';
  img.className = className;
  img.setAttribute('aria-hidden', 'true');
  img.draggable = false;
  return img;
}
