import type { Point } from '../iso/IsoMath';
import { objectType, isObjectTypeId, type ObjectTypeId } from './objectTypes';
import { TERRAINS, isTerrainId, type TerrainDef, type TerrainId } from './terrain';

export interface MapObjectData {
  readonly id: string;
  readonly type: ObjectTypeId;
  /** Posisi sudut alas (ubin, boleh pecahan). Untuk karakter: posisi kaki. */
  readonly x: number;
  readonly y: number;
  readonly variant: string;
  /** Objek hanya muncul jika upgrade ini dimiliki. */
  readonly requires?: string;
}

export interface SeatAnchor {
  readonly id: string;
  /** Posisi duduk (ubin). */
  readonly x: number;
  readonly y: number;
  /** Titik-titik yang dilewati dari pintu masuk area (lotEntry) menuju kursi. */
  readonly approach: readonly Point[];
  /** Kursi hanya tersedia jika upgrade ini dimiliki. */
  readonly requires?: string;
}

export interface SpawnAnchor {
  readonly id: string;
  /** Jalur dari tepi peta sampai trotoar di depan angkringan. */
  readonly path: readonly Point[];
}

export interface CustomerAnchors {
  readonly lotEntry: Point;
  readonly spawns: readonly SpawnAnchor[];
  readonly seats: readonly SeatAnchor[];
  readonly queue: readonly Point[];
}

export interface MapData {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  /** terrain[y][x] */
  readonly terrain: readonly (readonly TerrainId[])[];
  readonly objects: readonly MapObjectData[];
  readonly anchors: {
    /** Titik fokus kamera (ubin) — biasanya gerobak angkringan. */
    readonly cameraHome: Point;
  };
  /** Titik untuk simulasi pelanggan (null jika peta tidak mendukung berjualan). */
  readonly customers: CustomerAnchors | null;
}

class MapDataError extends Error {
  constructor(mapId: string, message: string) {
    super(`[Peta "${mapId}"] ${message}`);
    this.name = 'MapDataError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumber(source: Record<string, unknown>, key: string, mapId: string, context: string): number {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new MapDataError(mapId, `${context}: "${key}" harus berupa angka`);
  }
  return value;
}

/**
 * Validasi & ubah JSON peta mentah menjadi MapData bertipe.
 * Melempar error deskriptif agar kesalahan data cepat ketahuan.
 */
export function parseMapData(raw: unknown): MapData {
  if (!isRecord(raw)) throw new MapDataError('?', 'data peta harus berupa objek');
  const id = typeof raw.id === 'string' && raw.id ? raw.id : '?';
  const name = typeof raw.name === 'string' ? raw.name : id;
  const width = readNumber(raw, 'width', id, 'header');
  const height = readNumber(raw, 'height', id, 'header');
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new MapDataError(id, `ukuran peta tidak valid: ${width}×${height}`);
  }

  if (!isRecord(raw.legend)) throw new MapDataError(id, '"legend" wajib ada');
  const legend = new Map<string, TerrainId>();
  for (const [symbol, terrainName] of Object.entries(raw.legend)) {
    if (symbol.length !== 1) throw new MapDataError(id, `simbol legend "${symbol}" harus 1 karakter`);
    if (typeof terrainName !== 'string' || !isTerrainId(terrainName)) {
      throw new MapDataError(id, `legend "${symbol}" menunjuk terrain tidak dikenal: ${String(terrainName)}`);
    }
    legend.set(symbol, terrainName);
  }

  if (!Array.isArray(raw.tiles) || raw.tiles.length !== height) {
    throw new MapDataError(id, `"tiles" harus berisi ${height} baris`);
  }
  const terrain: TerrainId[][] = raw.tiles.map((row: unknown, y: number) => {
    if (typeof row !== 'string' || row.length !== width) {
      throw new MapDataError(id, `baris ${y} harus string sepanjang ${width} karakter`);
    }
    return [...row].map((symbol, x) => {
      const t = legend.get(symbol);
      if (!t) throw new MapDataError(id, `simbol "${symbol}" di (${x}, ${y}) tidak ada di legend`);
      return t;
    });
  });

  if (!Array.isArray(raw.objects)) throw new MapDataError(id, '"objects" harus berupa array');
  const usedIds = new Set<string>();
  const objects: MapObjectData[] = raw.objects.map((entry: unknown, index: number) => {
    if (!isRecord(entry)) throw new MapDataError(id, `objek #${index} harus berupa objek`);
    const type = entry.type;
    if (typeof type !== 'string' || !isObjectTypeId(type)) {
      throw new MapDataError(id, `objek #${index} memiliki type tidak dikenal: ${String(type)}`);
    }
    const typeDef = objectType(type);
    const x = readNumber(entry, 'x', id, `objek #${index}`);
    const y = readNumber(entry, 'y', id, `objek #${index}`);
    const footW = typeDef.footprint.w / 16;
    const footD = typeDef.footprint.d / 16;
    if (x < 0 || y < 0 || x + footW > width + 1e-6 || y + footD > height + 1e-6) {
      throw new MapDataError(id, `objek #${index} (${type}) keluar dari batas peta di (${x}, ${y})`);
    }
    const variant = entry.variant === undefined ? (typeDef.variants[0] as string) : entry.variant;
    if (typeof variant !== 'string' || !typeDef.variants.includes(variant)) {
      throw new MapDataError(id, `objek #${index} (${type}) varian tidak dikenal: ${String(variant)}`);
    }
    const objectId = typeof entry.id === 'string' && entry.id ? entry.id : `${type}-${index}`;
    if (usedIds.has(objectId)) throw new MapDataError(id, `id objek ganda: ${objectId}`);
    usedIds.add(objectId);
    const requires = typeof entry.requires === 'string' ? entry.requires : undefined;
    return requires ? { id: objectId, type, x, y, variant, requires } : { id: objectId, type, x, y, variant };
  });

  if (!isRecord(raw.anchors) || !isRecord(raw.anchors.cameraHome)) {
    throw new MapDataError(id, '"anchors.cameraHome" wajib ada');
  }
  const home = raw.anchors.cameraHome;
  const cameraHome = { x: readNumber(home, 'x', id, 'cameraHome'), y: readNumber(home, 'y', id, 'cameraHome') };

  const customers = parseCustomerAnchors(raw.anchors, id);
  return { id, name, width, height, terrain, objects, anchors: { cameraHome }, customers };
}

function readPoint(v: unknown, mapId: string, where: string): Point {
  if (!isRecord(v)) throw new MapDataError(mapId, `${where} harus berupa titik {x, y}`);
  return { x: readNumber(v, 'x', mapId, where), y: readNumber(v, 'y', mapId, where) };
}

function readPath(v: unknown, mapId: string, where: string): Point[] {
  if (!Array.isArray(v) || v.length === 0) throw new MapDataError(mapId, `${where} harus berisi minimal satu titik`);
  return v.map((p, i) => readPoint(p, mapId, `${where}[${i}]`));
}

function parseCustomerAnchors(anchors: Record<string, unknown>, mapId: string): CustomerAnchors | null {
  if (anchors.seats === undefined) return null;
  if (!Array.isArray(anchors.seats) || anchors.seats.length === 0) throw new MapDataError(mapId, '"seats" harus berisi minimal satu kursi');
  if (!Array.isArray(anchors.spawns) || anchors.spawns.length === 0) throw new MapDataError(mapId, '"spawns" wajib ada');
  const seats = anchors.seats.map((s: unknown, i: number) => {
    if (!isRecord(s)) throw new MapDataError(mapId, `kursi #${i} tidak valid`);
    const p = readPoint(s, mapId, `kursi #${i}`);
    const seat: SeatAnchor = { id: typeof s.id === 'string' ? s.id : `kursi-${i}`, x: p.x, y: p.y, approach: readPath(s.approach, mapId, `kursi #${i}.approach`) };
    return typeof s.requires === 'string' ? { ...seat, requires: s.requires } : seat;
  });
  const spawns = anchors.spawns.map((s: unknown, i: number) => {
    if (!isRecord(s)) throw new MapDataError(mapId, `spawn #${i} tidak valid`);
    return { id: typeof s.id === 'string' ? s.id : `spawn-${i}`, path: readPath(s.path, mapId, `spawn #${i}.path`) };
  });
  const queue = Array.isArray(anchors.queue) ? anchors.queue.map((q, i) => readPoint(q, mapId, `antrean #${i}`)) : [];
  return { lotEntry: readPoint(anchors.lotEntry, mapId, 'lotEntry'), spawns, seats, queue };
}

export function terrainAt(map: MapData, x: number, y: number): TerrainDef | null {
  const id = map.terrain[y]?.[x];
  return id ? TERRAINS[id] : null;
}

export function maxElevation(map: MapData): number {
  let max = 0;
  for (const row of map.terrain) for (const t of row) max = Math.max(max, TERRAINS[t].elevation);
  return max;
}

/** Objek peta yang tampil untuk upgrade yang dimiliki, dengan varian tampilan dari upgrade. */
export function activeObjects(
  objects: readonly MapObjectData[],
  owned: readonly string[],
  variants: Readonly<Record<string, string>> = {},
): MapObjectData[] {
  return objects
    .filter((o) => !o.requires || owned.includes(o.requires))
    .map((o) => {
      const v = variants[o.id] ?? variants[o.type];
      return v && objectType(o.type).variants.includes(v) ? { ...o, variant: v } : o;
    });
}

/** Jangkar pelanggan dengan kursi yang tersedia sesuai upgrade. */
export function activeAnchors(anchors: CustomerAnchors, owned: readonly string[]): CustomerAnchors {
  return { ...anchors, seats: anchors.seats.filter((s) => !s.requires || owned.includes(s.requires)) };
}
