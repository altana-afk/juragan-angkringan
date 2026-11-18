import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatMapJson } from '../tools/map-editor/src/format';
import { buildEntry, draftFor, locationProblems } from '../tools/map-editor/src/locationDraft';
import { formatClock, parseClock, removeLocationText, upsertLocationText, type LocationEntry } from '../tools/map-editor/src/locationsFile';
import { blankMap, floodFill, fromRaw, resizeMap, slugify, toRaw } from '../tools/map-editor/src/model';
import { collectLayoutUpgrades, validateMap } from '../tools/map-editor/src/validate';
import { LOCATIONS } from '../src/data/locations';
import { parseMapData } from '../src/world/MapData';
import { getMap, listMapIds } from '../src/world/maps';

const MAP_FILES = readdirSync('src/data/maps').filter((f) => f.endsWith('.json'));
const raw = (file: string): unknown => JSON.parse(readFileSync(`src/data/maps/${file}`, 'utf8'));
const ctx = { upgrades: new Map([['bangku_tambahan', 'Bangku tambahan']]), layoutUpgrades: new Set<string>() };

describe('registrasi peta otomatis', () => {
  it('semua file di src/data/maps terdaftar & id di dalam file sama dengan nama file', () => {
    expect(listMapIds().sort()).toEqual(MAP_FILES.map((f) => f.replace('.json', '')).sort());
    for (const id of listMapIds()) expect(getMap(id).id).toBe(id);
  });

  it('setiap lokasi menunjuk peta yang ada', () => {
    for (const l of LOCATIONS) expect(listMapIds()).toContain(l.mapId);
  });
});

describe('editor peta: baca & tulis', () => {
  it.each(MAP_FILES)('%s tetap sama setelah dibuka lalu disimpan ulang', (file) => {
    const original = raw(file);
    const saved = JSON.parse(formatMapJson(toRaw(fromRaw(original))));
    expect(parseMapData(saved)).toEqual(parseMapData(original));
  });

  it('format tulisan sama dengan file yang ada (kecuali angka seperti 10.0 → 10)', () => {
    for (const file of MAP_FILES) {
      const text = readFileSync(`src/data/maps/${file}`, 'utf8');
      const out = formatMapJson(toRaw(fromRaw(JSON.parse(text))));
      expect(out.replace(/(\d)\.0(?=\D)/g, '$1')).toBe(text.replace(/(\d)\.0(?=\D)/g, '$1'));
    }
  });

  it('peta kosong tanpa data pelanggan tetap valid untuk game', () => {
    const m = blankMap('lapangan', 'Lapangan', 10, 8, 'grass');
    const parsed = parseMapData(toRaw(m));
    expect(parsed.customers).toBeNull();
    expect(parsed.width).toBe(10);
  });

  it('ubah ukuran menggeser isi & membuang objek di luar batas', () => {
    const m = fromRaw(raw('main-street.json'));
    const cart = m.objects.find((o) => o.id === 'cart')!;
    const before = { x: cart.x, y: cart.y };
    const removed = resizeMap(m, 22, 24, 2, 0, 'dirt');
    expect(m.width).toBe(22);
    expect(m.terrain[0]![0]).toBe('dirt');
    expect(cart.x).toBe(before.x + 2);
    expect(removed).toBeGreaterThan(0); // pohon di tepi kanan keluar peta (lebar dikurangi)
    expect(() => parseMapData(toRaw(m))).not.toThrow();
  });

  it('isi ember hanya mengubah ubin yang terhubung & sejenis', () => {
    const m = blankMap('a', 'A', 4, 3, 'grass');
    m.terrain[1] = ['grass', 'asphalt', 'asphalt', 'grass'];
    expect(floodFill(m, 1, 1, 'zebra')).toBe(2);
    expect(m.terrain[1]).toEqual(['grass', 'zebra', 'zebra', 'grass']);
  });

  it('slug id dari nama', () => {
    expect(slugify('Alun-Alun Kidul  Malam!')).toBe('alun-alun-kidul-malam');
  });
});

describe('editor peta: pemeriksaan', () => {
  it('peta bawaan tidak punya error', () => {
    const layout = collectLayoutUpgrades(MAP_FILES.map(raw));
    for (const file of MAP_FILES) {
      const issues = validateMap(fromRaw(raw(file)), { upgrades: new Map([...layout].map((u) => [u, u])), layoutUpgrades: layout });
      expect(issues.filter((i) => i.level === 'error'), file).toEqual([]);
    }
  });

  it('jumlah kursi upgrade dibandingkan dengan janji di upgrades.json', () => {
    const m = fromRaw(raw('main-street.json'));
    const seatUpgrades = new Map([['bangku_tambahan', 3]]);
    const ok = validateMap(m, { ...ctx, seatUpgrades });
    expect(ok.some((i) => i.message.includes('menjanjikan'))).toBe(false);
    m.customers.seats = m.customers.seats.filter((s) => s.id !== 'bangku-kiri-3');
    expect(validateMap(m, { ...ctx, seatUpgrades }).some((i) => i.message.includes('menjanjikan +3 kursi, tapi di peta ini ada 2'))).toBe(true);
  });

  it('kursi tanpa jalur & pintu masuk kosong dilaporkan sebagai error', () => {
    const m = blankMap('a', 'A', 8, 8, 'grass');
    m.customers.seats.push({ id: 'kursi-1', x: 2, y: 2, approach: [] });
    const msgs = validateMap(m, ctx).filter((i) => i.level === 'error').map((i) => i.message);
    expect(msgs.some((t) => t.includes('Pintu masuk'))).toBe(true);
    expect(msgs.some((t) => t.includes('belum punya jalur'))).toBe(true);
  });

  it('id peta tidak valid ditolak', () => {
    const m = blankMap('Peta Baru', 'X', 4, 4, 'grass');
    expect(validateMap(m, ctx).some((i) => i.level === 'error' && i.message.includes('Id peta'))).toBe(true);
  });
});

describe('editor peta: locations.json', () => {
  const text = readFileSync('src/data/locations.json', 'utf8');
  const entry = (id: string): LocationEntry => buildEntry({ ...draftFor('Alun-Alun', null), tagline: 'Ramai malam minggu' }, id);

  it('menambah lokasi baru tanpa mengubah entri lain', () => {
    const out = upsertLocationText(text, entry('alun-alun'));
    expect(out.startsWith(text.slice(0, text.lastIndexOf('}\n  ]')))).toBe(true);
    const data = JSON.parse(out) as { locations: LocationEntry[] };
    expect(data.locations.at(-1)?.id).toBe('alun-alun');
    expect(data.locations).toHaveLength(JSON.parse(text).locations.length + 1);
  });

  it('mengganti lokasi yang ada & menghapusnya kembali', () => {
    const added = upsertLocationText(text, entry('alun-alun'));
    const changed = upsertLocationText(added, { ...entry('alun-alun'), rent: 18000 });
    expect((JSON.parse(changed) as { locations: LocationEntry[] }).locations.find((l) => l.id === 'alun-alun')?.rent).toBe(18000);
    expect(removeLocationText(changed, 'alun-alun')).toBe(text);
  });

  it('menghapus lokasi pertama menjaga JSON tetap valid', () => {
    const out = removeLocationText(text, 'main-street');
    expect((JSON.parse(out) as { locations: LocationEntry[] }).locations[0]?.id).toBe('kampus');
  });

  it('entri yang tidak diubah sama persis dengan aslinya', () => {
    const original = (JSON.parse(text) as { locations: LocationEntry[] }).locations[2]!;
    expect(JSON.stringify(buildEntry(draftFor('x', original), original.id))).toBe(JSON.stringify(original));
  });

  it('isian lokasi diperiksa', () => {
    const d = { ...draftFor('', null), registered: true, weekday: [1, 1, 0, 1, 1, 1, 1] };
    expect(locationProblems(d).length).toBeGreaterThanOrEqual(3);
  });

  it('jam lewat tengah malam', () => {
    expect(parseClock('26:00')).toBe(1560);
    expect(parseClock('17.30')).toBe(1050);
    expect(parseClock('7:5')).toBeNull();
    expect(formatClock(1560)).toBe('26:00');
  });
});
