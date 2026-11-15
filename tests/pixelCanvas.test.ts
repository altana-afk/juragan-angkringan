import { describe, expect, it } from 'vitest';
import { PixelCanvas } from '../src/graphics/PixelCanvas';

const diamond = (ox: number, oy: number) => [
  { x: ox + 16, y: oy },
  { x: ox + 32, y: oy + 8 },
  { x: ox + 16, y: oy + 16 },
  { x: ox, y: oy + 8 },
];

describe('PixelCanvas', () => {
  it('mengisi belah ketupat ubin 32×16 dengan tepat (256 piksel)', () => {
    const c = new PixelCanvas(32, 16);
    c.fillPolygon(diamond(0, 0), 0xffffff);
    expect(c.countOpaque()).toBe(256);
  });

  it('ubin bersebelahan tidak bertumpuk dan tidak berlubang', () => {
    const a = new PixelCanvas(64, 32);
    const b = new PixelCanvas(64, 32);
    a.fillPolygon(diamond(0, 0), 0xff0000);
    b.fillPolygon(diamond(16, 8), 0x00ff00);
    let overlap = 0;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) if (a.getAlpha(x, y) && b.getAlpha(x, y)) overlap++;
    expect(overlap).toBe(0);
    // Sepanjang tepi bersama, setiap baris harus tersambung tanpa celah.
    const combined = new PixelCanvas(64, 32);
    combined.blit(a, 0, 0);
    combined.blit(b, 0, 0);
    for (let y = 9; y < 16; y++) {
      let inside = false;
      let segments = 0;
      for (let x = 0; x < 64; x++) {
        const filled = combined.getAlpha(x, y) > 0;
        if (filled && !inside) segments++;
        inside = filled;
      }
      expect(segments).toBe(1);
    }
  });

  it('memotong area kosong dan mengembalikan offset', () => {
    const c = new PixelCanvas(20, 20);
    c.fillRect(5, 7, 3, 2, 0x123456);
    const { canvas, offsetX, offsetY } = c.trim();
    expect([canvas.width, canvas.height, offsetX, offsetY]).toEqual([3, 2, 5, 7]);
    expect(canvas.getColor(0, 0)).toBe(0x123456);
  });

  it('menambahkan garis tepi di sekeliling bentuk', () => {
    const c = new PixelCanvas(5, 5);
    c.setPixel(2, 2, 0xffffff);
    c.outline(0x000000);
    expect(c.countOpaque()).toBe(5);
    expect(c.getColor(2, 1)).toBe(0x000000);
  });

  it('mencampur warna transparan (alpha blending)', () => {
    const c = new PixelCanvas(1, 1);
    c.setPixel(0, 0, 0x000000);
    c.setPixel(0, 0, 0xffffff, 128);
    const v = c.getColor(0, 0) & 0xff;
    expect(v).toBeGreaterThan(120);
    expect(v).toBeLessThan(136);
    expect(c.getAlpha(0, 0)).toBe(255);
  });

  it('menolak ukuran tidak valid', () => {
    expect(() => new PixelCanvas(0, 5)).toThrow();
    expect(() => new PixelCanvas(2.5, 5)).toThrow();
  });
});
