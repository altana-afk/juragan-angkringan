/**
 * Font pixel 5 piksel tinggi buatan sendiri, untuk papan nama, spanduk, dan judul.
 * Lebar huruf bervariasi (M, N, W lebih lebar) agar mudah dibaca.
 */

export const FONT_HEIGHT = 5;
export const LETTER_SPACING = 1;

const G: Record<string, readonly string[]> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  O: ['###', '#.#', '#.#', '#.#', '###'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  Q: ['.#.', '#.#', '#.#', '##.', '.##'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'],
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['##.', '..#', '.#.', '#..', '###'],
  '3': ['##.', '..#', '.#.', '..#', '##.'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '##.', '..#', '##.'],
  '6': ['.##', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '##.'],
  ' ': ['..', '..', '..', '..', '..'],
  '.': ['.', '.', '.', '.', '#'],
  '-': ['...', '...', '###', '...', '...'],
  '!': ['#', '#', '#', '.', '#'],
  "'": ['#', '#', '.', '.', '.'],
};

export function hasGlyph(ch: string): boolean {
  return G[ch.toUpperCase()] !== undefined;
}

function glyphFor(ch: string): readonly string[] {
  const glyph = G[ch.toUpperCase()];
  if (!glyph) throw new Error(`Font pixel tidak punya karakter "${ch}"`);
  return glyph;
}

/** Lebar teks dalam piksel (tanpa spasi setelah huruf terakhir). */
export function measureText(text: string): number {
  let width = 0;
  for (let i = 0; i < text.length; i++) {
    const glyph = glyphFor(text[i] as string);
    width += (glyph[0]?.length ?? 0) + (i < text.length - 1 ? LETTER_SPACING : 0);
  }
  return width;
}

/** Panggil callback untuk setiap piksel "nyala" pada teks, koordinat relatif kiri-atas. */
export function forEachTextPixel(text: string, callback: (x: number, y: number) => void): void {
  let cursor = 0;
  for (const ch of text) {
    const glyph = glyphFor(ch);
    glyph.forEach((row, gy) => {
      for (let gx = 0; gx < row.length; gx++) {
        if (row[gx] === '#') callback(cursor + gx, gy);
      }
    });
    cursor += (glyph[0]?.length ?? 0) + LETTER_SPACING;
  }
}
