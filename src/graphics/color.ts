/** Utilitas warna 0xRRGGBB. */

export type Color = number;

export function rgb(r: number, g: number, b: number): Color {
  return ((clampByte(r) << 16) | (clampByte(g) << 8) | clampByte(b)) >>> 0;
}

export function channels(color: Color): [number, number, number] {
  return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
}

/** Gelap/terangkan warna: factor < 1 menggelapkan, > 1 menerangkan. */
export function shade(color: Color, factor: number): Color {
  const [r, g, b] = channels(color);
  return rgb(r * factor, g * factor, b * factor);
}

/** Campur dua warna, t = 0 → a, t = 1 → b. */
export function mix(a: Color, b: Color, t: number): Color {
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  return rgb(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

/** Variasi kecerahan ±amount (0..1) memakai nilai noise 0..1. */
export function jitter(color: Color, amount: number, noise01: number): Color {
  return shade(color, 1 + (noise01 * 2 - 1) * amount);
}

/** Bagi warna a dengan b per kanal (kebalikan dari multiply), dibatasi 0..255. */
export function divide(a: Color, b: Color): Color {
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  return rgb((ar * 255) / Math.max(1, br), (ag * 255) / Math.max(1, bg), (ab * 255) / Math.max(1, bb));
}

export function toCss(color: Color, alpha = 1): string {
  const [r, g, b] = channels(color);
  return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}
