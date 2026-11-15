import type { Color } from '../graphics/color';
import { PixelCanvas } from '../graphics/PixelCanvas';
import { FONT_HEIGHT, forEachTextPixel, measureText } from '../graphics/pixelFont';

/** Ubah PixelCanvas menjadi elemen <canvas> DOM (ditampilkan dengan CSS image-rendering: pixelated). */
export function toHtmlCanvas(source: PixelCanvas): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const image = ctx.createImageData(source.width, source.height);
    image.data.set(source.data);
    ctx.putImageData(image, 0, 0);
  }
  return canvas;
}

const urlCache = new Map<string, string>();

/** Data URL PNG dari PixelCanvas, di-cache berdasarkan kunci. */
export function pixelDataUrl(key: string, build: () => PixelCanvas): string {
  const cached = urlCache.get(key);
  if (cached) return cached;
  const url = toHtmlCanvas(build()).toDataURL('image/png');
  urlCache.set(key, url);
  return url;
}

export interface PixelTextLine {
  text: string;
  color: Color;
}

/** Teks judul pixel art dengan bayangan & garis tepi (dipakai di menu utama). */
export function renderPixelTitle(lines: PixelTextLine[], outline: Color, shadow: Color, lineGap = 2): PixelCanvas {
  const pad = 3;
  const width = Math.max(...lines.map((l) => measureText(l.text))) + pad * 2;
  const height = lines.length * FONT_HEIGHT + (lines.length - 1) * lineGap + pad * 2;
  const canvas = new PixelCanvas(width, height);
  const draw = (dx: number, dy: number, colorFor: (line: PixelTextLine) => Color): void => {
    lines.forEach((line, i) => {
      const offsetX = pad + Math.floor((width - pad * 2 - measureText(line.text)) / 2);
      const offsetY = pad + i * (FONT_HEIGHT + lineGap);
      forEachTextPixel(line.text, (x, y) => canvas.setPixel(offsetX + x + dx, offsetY + y + dy, colorFor(line)));
    });
  };
  draw(1, 1, () => shadow);
  draw(0, 0, (line) => line.color);
  canvas.outline(outline, 255, 1);
  return canvas;
}
