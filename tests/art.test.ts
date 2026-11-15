import { describe, expect, it } from 'vitest';
import mainStreet from '../src/data/maps/main-street.json';
import { ART_JOBS } from '../src/graphics/art/catalog';
import { bakeGround } from '../src/graphics/art/ground';
import type { ArtEntry } from '../src/graphics/art/types';
import { measureText } from '../src/graphics/pixelFont';
import { parseMapData } from '../src/world/MapData';
import { OBJECT_TYPES, objectTextureKey, type ObjectTypeId } from '../src/world/objectTypes';

const entries: ArtEntry[] = ART_JOBS.flatMap((job) => job.build());
const keys = new Set(entries.map((e) => e.key));

describe('aset prosedural', () => {
  it('semua generator berjalan dan menghasilkan gambar tidak kosong', () => {
    expect(entries.length).toBeGreaterThan(20);
    for (const e of entries) {
      expect(e.art.canvas.countOpaque(), e.key).toBeGreaterThan(0);
    }
  });

  it('kunci tekstur unik', () => {
    expect(keys.size).toBe(entries.length);
  });

  it('setiap jenis & varian objek punya tekstur', () => {
    const animated: Partial<Record<ObjectTypeId, number[]>> = { seller: [0, 1], stove: [0, 1, 2] };
    for (const def of Object.values(OBJECT_TYPES)) {
      for (const variant of def.variants) {
        if (def.id === 'seller') {
          for (const f of animated.seller ?? []) expect(keys.has(objectTextureKey(def.id, variant, f))).toBe(true);
          continue;
        }
        expect(keys.has(objectTextureKey(def.id, variant)), `${def.id}/${variant}`).toBe(true);
      }
    }
    for (const f of animated.stove ?? []) expect(keys.has(objectTextureKey('stove', 'anglo', f))).toBe(true);
  });

  it('frame animasi berukuran seragam', () => {
    const fire = [0, 1, 2].map((f) => entries.find((e) => e.key === objectTextureKey('stove', 'anglo', f))!);
    const [first, ...rest] = fire;
    for (const f of rest) {
      expect([f.art.canvas.width, f.art.canvas.height, f.art.anchorX, f.art.anchorY]).toEqual([
        first!.art.canvas.width,
        first!.art.canvas.height,
        first!.art.anchorX,
        first!.art.anchorY,
      ]);
    }
  });

  it('lampu memiliki parameter yang masuk akal', () => {
    for (const e of entries) {
      for (const l of e.meta?.lights ?? []) {
        expect(l.radius, e.key).toBeGreaterThan(0);
        expect(l.intensity).toBeGreaterThan(0);
        expect(l.intensity).toBeLessThanOrEqual(1);
      }
    }
  });

  it('memanggang lantai peta sesuai ukuran', () => {
    const map = parseMapData(mainStreet);
    const ground = bakeGround(map);
    expect(ground.canvas.width).toBe((24 + 24) * 16);
    expect(ground.originX).toBe(24 * 16);
    expect(ground.canvas.countOpaque()).toBeGreaterThan(24 * 24 * 256 * 0.95);
  });

  it('font pixel mengukur lebar teks spanduk', () => {
    expect(measureText('ANGKRINGAN')).toBe(42);
    expect(() => measureText('é')).toThrow();
  });
});
