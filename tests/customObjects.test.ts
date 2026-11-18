import { describe, expect, it } from 'vitest';
import { tileToWorld } from '../src/iso/IsoMath';
import { lightOffsetUnits, parseCustomObjects, sliceFrames, type CustomObjectDef } from '../src/world/customObjects';
import { parseMapData } from '../src/world/MapData';
import { isObjectTypeId, objectType, registerCustomObjectType, unregisterCustomObjectType } from '../src/world/objectTypes';
import { findImage, listProviders } from '../tools/map-editor/generators';
import { generateFromDescription, parseDescription } from '../tools/map-editor/src/procedural';
import { contentBounds, downscale, fitIntoFrame, makeRaster, quantize, removeBackground, setPixel } from '../tools/map-editor/src/raster';
import { blankMap, toRaw } from '../tools/map-editor/src/model';

const base = {
  id: 'c_tong_biru',
  label: 'Tong biru',
  frameWidth: 20,
  frameHeight: 24,
  frames: 2,
  frameMs: 200,
  anchorX: 10,
  anchorY: 18,
  footprint: { w: 8, d: 8 },
  depthMode: 'center',
  blocking: true,
  seating: false,
  seatLift: 0,
  lights: [{ px: 10, py: 4, radius: 60, color: '#FFD27A', intensity: 0.8, flicker: 0.1, glow: true }],
};

describe('objek kustom: data', () => {
  it('membaca & merapikan definisi', () => {
    const [d] = parseCustomObjects({ objects: [base] });
    expect(d!.lights[0]!.color).toBe('#ffd27a');
    expect(d!.footprint).toEqual({ w: 8, d: 8 });
  });

  it('menolak id tanpa awalan c_, duplikat, dan ukuran tidak valid', () => {
    expect(() => parseCustomObjects({ objects: [{ ...base, id: 'tong' }] })).toThrow(/c_/);
    expect(() => parseCustomObjects({ objects: [base, base] })).toThrow(/lebih dari sekali/);
    expect(() => parseCustomObjects({ objects: [{ ...base, frameWidth: 0 }] })).toThrow(/frameWidth/);
  });

  it('posisi lampu jatuh tepat di piksel bohlam', () => {
    const def = parseCustomObjects({ objects: [base] })[0]!;
    const o = lightOffsetUnits(def, 10, 4);
    const obj = { x: 5, y: 7 };
    const origin = tileToWorld(obj.x, obj.y);
    const p = tileToWorld(obj.x + o.x / 16, obj.y + o.y / 16);
    // Piksel (10,4) relatif titik pijak (10,18): +0.5 tengah piksel.
    expect(p.x - origin.x).toBeCloseTo(0.5, 5);
    expect(p.y - origin.y).toBeCloseTo(-13.5, 5);
  });

  it('memotong lembar PNG per frame', () => {
    const sheet = new Uint8ClampedArray(4 * 2 * 4);
    sheet.set([1, 1, 1, 255], 0); // frame 0, (0,0)
    sheet.set([2, 2, 2, 255], 2 * 4); // frame 1, (0,0)
    const frames = sliceFrames(sheet, 4, { frameWidth: 2, frameHeight: 2, frames: 2 });
    expect(frames[0]![0]).toBe(1);
    expect(frames[1]![0]).toBe(2);
  });

  it('peta bisa memakai objek kustom yang terdaftar', () => {
    const def = parseCustomObjects({ objects: [base] })[0] as CustomObjectDef;
    registerCustomObjectType(def);
    try {
      expect(isObjectTypeId('c_tong_biru')).toBe(true);
      expect(objectType('c_tong_biru').custom?.frames).toBe(2);
      const m = blankMap('uji', 'Uji', 4, 4, 'grass');
      const raw = toRaw(m) as { objects: unknown[] };
      raw.objects.push({ type: 'c_tong_biru', x: 1, y: 1 });
      expect(parseMapData(raw).objects[0]?.type).toBe('c_tong_biru');
    } finally {
      unregisterCustomObjectType('c_tong_biru');
    }
    expect(isObjectTypeId('c_tong_biru')).toBe(false);
  });
});

describe('studio: pengolahan gambar', () => {
  const magenta = (w: number, h: number) => {
    const r = makeRaster(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) setPixel(r, x, y, '#ff00ff');
    return r;
  };

  it('membuang latar magenta & memperkecil ke frame, rata tengah-bawah', () => {
    const src = magenta(100, 100);
    for (let y = 20; y < 80; y++) for (let x = 30; x < 70; x++) setPixel(src, x, y, '#3060a0');
    expect(contentBounds(removeBackground(src))).toEqual({ x: 30, y: 20, w: 40, h: 60 });
    const out = fitIntoFrame(src, 20, 20, { removeBg: true, palette: null });
    const b = contentBounds(out)!;
    expect(b.h).toBe(18);
    expect(b.y + b.h).toBe(19);
    expect(Math.abs(b.x + b.w / 2 - 10)).toBeLessThanOrEqual(1);
  });

  it('memperkecil & menyesuaikan palet', () => {
    const src = makeRaster(4, 4);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) setPixel(src, x, y, '#f0f0f0');
    const small = downscale(src, 2, 2);
    expect(small.data[3]).toBe(255);
    const q = quantize(small, ['#000000', '#ffffff']);
    expect([...q.data.slice(0, 3)]).toEqual([255, 255, 255]);
  });
});

describe('studio: generator prosedural', () => {
  const samples = [
    'gerobak bakso merah atap biru',
    'lapak buah',
    'payung',
    'meja',
    'bangku panjang',
    'kursi plastik',
    'lampion',
    'lampu jalan',
    'obor api',
    'pohon',
    'pot bunga',
    'tong sampah',
    'papan menu',
    'peti kayu',
    'rumah',
    'pagar',
    'benda aneh tak dikenal',
  ];

  it.each(samples)('"%s" menghasilkan objek valid yang tidak kosong', (desc) => {
    const g = generateFromDescription(desc);
    expect(g.frames.length).toBeGreaterThan(0);
    for (const f of g.frames) expect(contentBounds(f)).not.toBeNull();
    expect(() => parseCustomObjects({ objects: [{ ...g, id: 'c_x', depthMode: 'center', frames: g.frames.length, footprint: g.footprint }] })).not.toThrow();
  });

  it('mengenali jenis, warna, dan efek dari kata kunci', () => {
    const p = parseDescription('Gerobak bakso merah atap biru, lampu berkedip');
    expect(p.kind.id).toBe('cart');
    expect(p.colors).toHaveLength(2);
    expect(p.lit && p.animated).toBe(true);
    expect(parseDescription('bangku panjang').long).toBe(1);
    expect(generateFromDescription('obor api').frames.length).toBe(3);
    expect(generateFromDescription('kursi').seating).toBe(true);
  });
});

describe('studio: penyedia AI', () => {
  it('menandai penyedia yang belum diatur', () => {
    const list = listProviders({ GEMINI_API_KEY: 'x' });
    expect(list.find((p) => p.id === 'procedural')?.ready).toBe(true);
    expect(list.find((p) => p.id === 'openai')?.ready).toBe(false);
    expect(list.find((p) => p.id === 'gemini')?.ready).toBe(true);
  });

  it('menemukan gambar di balasan JSON tool apa pun bentuknya', () => {
    const b64 = 'A'.repeat(240);
    expect(findImage({ data: [{ b64_json: b64 }] })).toBe(`data:image/png;base64,${b64}`);
    expect(findImage({ result: { image: 'data:image/png;base64,AAA' } })).toBe('data:image/png;base64,AAA');
    expect(findImage({ message: 'gagal' })).toBeNull();
  });
});
