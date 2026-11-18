import { parseMapData, type MapData } from './MapData';

/**
 * Semua peta di src/data/maps/*.json terdaftar otomatis (id = nama file).
 * Peta baru dari editor peta (npm run editor) langsung ikut tanpa mengubah kode.
 */
const FILES = import.meta.glob<{ default: unknown }>('../data/maps/*.json', { eager: true });

const RAW_MAPS: Record<string, unknown> = {};
for (const [path, mod] of Object.entries(FILES)) {
  const id = path.slice(path.lastIndexOf('/') + 1, -'.json'.length);
  RAW_MAPS[id] = mod.default;
}

const cache = new Map<string, MapData>();

export function getMap(id: string): MapData {
  const cached = cache.get(id);
  if (cached) return cached;
  const raw = RAW_MAPS[id];
  if (raw === undefined) throw new Error(`Peta "${id}" tidak ditemukan`);
  const map = parseMapData(raw);
  cache.set(id, map);
  return map;
}

export function listMapIds(): string[] {
  return Object.keys(RAW_MAPS);
}
