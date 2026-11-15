import mainStreet from '../data/maps/main-street.json';
import kampus from '../data/maps/kampus.json';
import pasar from '../data/maps/pasar.json';
import stasiun from '../data/maps/stasiun.json';
import pasarMalam from '../data/maps/pasar-malam.json';
import { parseMapData, type MapData } from './MapData';

/** Daftar peta yang tersedia (data JSON di src/data/maps). */
const RAW_MAPS: Record<string, unknown> = {
  'main-street': mainStreet,
  kampus,
  pasar,
  stasiun,
  'pasar-malam': pasarMalam,
};

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
