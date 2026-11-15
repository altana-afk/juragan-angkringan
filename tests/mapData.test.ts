import { describe, expect, it } from 'vitest';
import mainStreet from '../src/data/maps/main-street.json';
import { maxElevation, parseMapData, terrainAt } from '../src/world/MapData';
import { OBJECT_TYPES } from '../src/world/objectTypes';

const tinyMap = () => ({
  id: 'kecil',
  name: 'Peta kecil',
  width: 3,
  height: 2,
  legend: { g: 'grass', s: 'sidewalk' },
  tiles: ['ggs', 'ggs'],
  objects: [{ type: 'cart', x: 0, y: 0 }],
  anchors: { cameraHome: { x: 1, y: 1 } },
});

describe('peta main-street', () => {
  const map = parseMapData(mainStreet);

  it('valid dan berukuran 24×24', () => {
    expect(map.width).toBe(24);
    expect(map.height).toBe(24);
    expect(map.terrain).toHaveLength(24);
    expect(map.terrain.every((row) => row.length === 24)).toBe(true);
  });

  it('memiliki objek inti angkringan', () => {
    const types = new Set(map.objects.map((o) => o.type));
    for (const t of ['cart', 'stove', 'seller', 'canopy', 'bench_x'] as const) expect(types.has(t)).toBe(true);
  });

  it('semua objek berada di dalam peta', () => {
    for (const o of map.objects) {
      const def = OBJECT_TYPES[o.type];
      expect(o.x).toBeGreaterThanOrEqual(0);
      expect(o.y).toBeGreaterThanOrEqual(0);
      expect(o.x + def.footprint.w / 16).toBeLessThanOrEqual(map.width + 1e-6);
      expect(o.y + def.footprint.d / 16).toBeLessThanOrEqual(map.height + 1e-6);
    }
  });

  it('titik fokus kamera berada di dalam peta', () => {
    const { x, y } = map.anchors.cameraHome;
    expect(terrainAt(map, Math.floor(x), Math.floor(y))).not.toBeNull();
  });

  it('trotoar lebih tinggi dari jalan', () => {
    expect(maxElevation(map)).toBe(2);
    expect(terrainAt(map, 12, 5)?.id).toBe('sidewalk');
    expect(terrainAt(map, 13, 5)?.road).toBe(true);
  });
});

describe('validasi data peta', () => {
  it('menerima peta minimal yang benar', () => {
    const map = parseMapData(tinyMap());
    expect(map.objects[0]).toMatchObject({ type: 'cart', variant: 'basic', id: 'cart-0' });
    expect(terrainAt(map, 2, 1)?.id).toBe('sidewalk');
    expect(terrainAt(map, 3, 0)).toBeNull();
  });

  it('menolak data rusak dengan pesan jelas', () => {
    const cases: [string, (m: ReturnType<typeof tinyMap>) => void][] = [
      ['baris salah panjang', (m) => void (m.tiles[0] = 'gg')],
      ['simbol tak dikenal', (m) => void (m.tiles[1] = 'ggx')],
      ['tipe objek tak dikenal', (m) => void (m.objects[0] = { type: 'ufo', x: 0, y: 0 })],
      ['objek keluar peta', (m) => void (m.objects[0] = { type: 'cart', x: 2.5, y: 0 })],
      ['varian tak dikenal', (m) => void (m.objects[0] = { type: 'cart', x: 0, y: 0, variant: 'emas' } as never)],
      ['legend menunjuk terrain tak dikenal', (m) => void (m.legend = { g: 'lava', s: 'sidewalk' } as never)],
      ['tanpa titik kamera', (m) => void (m.anchors = {} as never)],
    ];
    for (const [label, breakIt] of cases) {
      const m = tinyMap();
      breakIt(m);
      expect(() => parseMapData(m), label).toThrow(/Peta "kecil"/);
    }
    expect(() => parseMapData(null)).toThrow();
  });

  it('menolak id objek ganda', () => {
    const m = tinyMap();
    m.objects = [
      { type: 'cart', x: 0, y: 0, id: 'a' } as never,
      { type: 'cart', x: 0, y: 1, id: 'a' } as never,
    ];
    expect(() => parseMapData(m)).toThrow(/ganda/);
  });
});
