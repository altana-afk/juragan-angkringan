import { describe, expect, it } from 'vitest';
import { depthKey, isInsideMap, mapWorldBounds, tileToWorld, worldToTile, worldToTileIndex } from '../src/iso/IsoMath';

describe('proyeksi isometrik 2:1', () => {
  it('memetakan ubin ke dunia', () => {
    expect(tileToWorld(0, 0)).toEqual({ x: 0, y: 0 });
    expect(tileToWorld(1, 0)).toEqual({ x: 16, y: 8 });
    expect(tileToWorld(0, 1)).toEqual({ x: -16, y: 8 });
    expect(tileToWorld(1, 1)).toEqual({ x: 0, y: 16 });
    expect(tileToWorld(2, 3, 10)).toEqual({ x: -16, y: 30 });
  });

  it('konversi bolak-balik konsisten', () => {
    for (const [x, y] of [[0, 0], [3.25, 7.5], [23.9, 0.1], [12, 12]] as const) {
      const w = tileToWorld(x, y);
      const t = worldToTile(w.x, w.y);
      expect(t.x).toBeCloseTo(x, 9);
      expect(t.y).toBeCloseTo(y, 9);
    }
  });

  it('memilih indeks ubin dari titik dunia', () => {
    const center = tileToWorld(5.5, 9.5);
    expect(worldToTileIndex(center.x, center.y)).toEqual({ x: 5, y: 9 });
  });

  it('menghitung batas dunia peta', () => {
    const b = mapWorldBounds(24, 24);
    expect(b).toEqual({ x: -384, y: -0, width: 768, height: 384 });
    const withExtra = mapWorldBounds(24, 24, 100, 10);
    expect(withExtra.y).toBe(-100);
    expect(withExtra.height).toBe(494);
  });

  it('objek lebih dekat kamera punya depth lebih besar', () => {
    expect(depthKey(5, 5)).toBeGreaterThan(depthKey(4, 5));
    expect(depthKey(5, 6)).toBeGreaterThan(depthKey(5, 5));
  });

  it('memeriksa batas peta', () => {
    expect(isInsideMap(0, 0, 24, 24)).toBe(true);
    expect(isInsideMap(23, 23, 24, 24)).toBe(true);
    expect(isInsideMap(24, 0, 24, 24)).toBe(false);
    expect(isInsideMap(-1, 3, 24, 24)).toBe(false);
  });
});
