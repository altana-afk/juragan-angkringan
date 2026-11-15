import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../src/config/gameConfig';
import { divide, mix } from '../src/graphics/color';
import { computeDefaultZoom, nextZoomStep } from '../src/world/cameraMath';
import { objectDepth, entityDepth } from '../src/world/depth';
import { OBJECT_TYPES } from '../src/world/objectTypes';
import { AMBIENT_KEYFRAMES, getAmbientAt } from '../src/world/timeOfDay';

describe('suasana waktu (day/night)', () => {
  it('tepat sama dengan keyframe pada jamnya', () => {
    for (const k of AMBIENT_KEYFRAMES) {
      expect(getAmbientAt(k.minutes)).toMatchObject({ ambient: k.ambient, sky: k.sky, lampFactor: k.lampFactor });
    }
  });

  it('menginterpolasi di antara keyframe', () => {
    const a = AMBIENT_KEYFRAMES[1]!;
    const b = AMBIENT_KEYFRAMES[2]!;
    const mid = getAmbientAt((a.minutes + b.minutes) / 2);
    expect(mid.ambient).toBe(mix(a.ambient, b.ambient, 0.5));
    expect(mid.lampFactor).toBeCloseTo((a.lampFactor + b.lampFactor) / 2);
  });

  it('lampu makin terang menjelang malam dan dibatasi di luar rentang', () => {
    let last = -1;
    for (let m = 15 * 60; m <= 19 * 60; m += 15) {
      const f = getAmbientAt(m).lampFactor;
      expect(f).toBeGreaterThanOrEqual(last);
      last = f;
    }
    expect(getAmbientAt(0)).toEqual(AMBIENT_KEYFRAMES[0]);
    expect(getAmbientAt(99 * 60)).toEqual(AMBIENT_KEYFRAMES.at(-1));
  });

  it('divide adalah kebalikan dari multiply', () => {
    expect(divide(0x404040, 0x808080)).toBe(0x808080);
    expect(divide(0xffffff, 0x101010)).toBe(0xffffff);
  });
});

describe('kamera', () => {
  it('zoom default lebih besar di layar lebar dan tetap dalam batas', () => {
    const desktop = computeDefaultZoom(1280, 760);
    const phone = computeDefaultZoom(390, 844);
    for (const z of [desktop, phone, computeDefaultZoom(4000, 3000), computeDefaultZoom(200, 200)]) {
      expect(z).toBeGreaterThanOrEqual(GAME_CONFIG.camera.defaultZoomMin);
      expect(z).toBeLessThanOrEqual(GAME_CONFIG.camera.defaultZoomMax);
      expect((z * 2) % 1).toBe(0);
    }
    expect(desktop).toBeGreaterThan(phone);
  });

  it('langkah zoom naik/turun mengikuti daftar dan berhenti di batas', () => {
    expect(nextZoomStep(2, 1)).toBe(2.5);
    expect(nextZoomStep(2.2, 1)).toBe(2.5);
    expect(nextZoomStep(2.2, -1)).toBe(2);
    expect(nextZoomStep(5, 1)).toBe(GAME_CONFIG.camera.maxZoom);
    expect(nextZoomStep(1, -1)).toBe(GAME_CONFIG.camera.minZoom);
  });
});

describe('urutan gambar (depth)', () => {
  it('objek di depan digambar setelah objek di belakang', () => {
    const cart = OBJECT_TYPES.cart;
    expect(objectDepth(cart, 8, 10)).toBeLessThan(objectDepth(cart, 8, 11));
    // Penjual di belakang gerobak harus tertutup gerobak.
    expect(entityDepth(9.5, 9.6)).toBeLessThan(objectDepth(cart, 8, 10));
  });

  it('tikar selalu di bawah objek lain dan tenda di atas yang ada di bawahnya', () => {
    expect(objectDepth(OBJECT_TYPES.mat, 23, 23)).toBeLessThan(objectDepth(OBJECT_TYPES.bench_x, 0, 0));
    expect(objectDepth(OBJECT_TYPES.canopy, 7.55, 9.25)).toBeGreaterThan(objectDepth(OBJECT_TYPES.cart, 8, 10));
  });
});
