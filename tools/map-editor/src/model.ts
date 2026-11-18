/**
 * Model data editor peta + konversi dari/ke format JSON peta game (src/data/maps/*.json).
 * Murni (tanpa DOM) supaya bisa diuji dengan vitest.
 */
import type { Point } from '../../../src/iso/IsoMath';
import { objectType, isObjectTypeId, type ObjectTypeId } from '../../../src/world/objectTypes';
import { TERRAINS, isTerrainId, type TerrainId } from '../../../src/world/terrain';

export interface EObject {
  /** Penanda internal editor (tidak diekspor). */
  uid: number;
  type: ObjectTypeId;
  x: number;
  y: number;
  variant: string;
  /** Tulis "variant" di JSON (objek lama tanpa variant tetap tanpa variant). */
  explicitVariant: boolean;
  id?: string;
  requires?: string;
}

export interface ESpawn {
  id: string;
  path: Point[];
}

export interface ESeat {
  id: string;
  x: number;
  y: number;
  requires?: string;
  approach: Point[];
}

export interface ECustomers {
  lotEntry: Point | null;
  spawns: ESpawn[];
  seats: ESeat[];
  queue: Point[];
}

export interface EditorMap {
  id: string;
  name: string;
  width: number;
  height: number;
  /** terrain[y][x] */
  terrain: TerrainId[][];
  objects: EObject[];
  cameraHome: Point;
  customers: ECustomers;
}

/** Simbol tetap per terrain, sama dengan legend peta yang sudah ada. */
export const TERRAIN_SYMBOLS: Readonly<Record<TerrainId, string>> = {
  grass: 'g',
  dirt: 'd',
  paving: 'p',
  sidewalk: 's',
  asphalt: 'a',
  asphaltCenter: 'm',
  zebra: 'z',
  concrete: 'c',
};

export const TERRAIN_IDS = Object.keys(TERRAINS) as TerrainId[];

let uidCounter = 1;
export const nextUid = (): number => uidCounter++;

export const MAP_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const point = (v: unknown): Point => (isRecord(v) ? { x: num(v.x), y: num(v.y) } : { x: 0, y: 0 });
const points = (v: unknown): Point[] => (Array.isArray(v) ? v.map(point) : []);

/** Bulatkan koordinat agar file JSON rapi (0.05 ubin cukup halus). */
export const round = (n: number): number => Math.round(n * 1000) / 1000;

export function blankMap(id: string, name: string, width: number, height: number, base: TerrainId): EditorMap {
  return {
    id,
    name,
    width,
    height,
    terrain: Array.from({ length: height }, () => Array.from({ length: width }, () => base)),
    objects: [],
    cameraHome: { x: width / 2, y: height / 2 },
    customers: { lotEntry: null, spawns: [], seats: [], queue: [] },
  };
}

/**
 * JSON peta mentah → model editor. Toleran terhadap data setengah jadi; validasi
 * sebenarnya tetap memakai parseMapData milik game (lihat validate.ts).
 */
export function fromRaw(raw: unknown): EditorMap {
  if (!isRecord(raw)) throw new Error('File peta harus berupa objek JSON');
  const width = num(raw.width, 1);
  const height = num(raw.height, 1);
  const legend = new Map<string, TerrainId>();
  if (isRecord(raw.legend)) {
    for (const [sym, t] of Object.entries(raw.legend)) if (typeof t === 'string' && isTerrainId(t)) legend.set(sym, t);
  }
  const tiles = Array.isArray(raw.tiles) ? raw.tiles : [];
  const terrain: TerrainId[][] = Array.from({ length: height }, (_, y) => {
    const row = typeof tiles[y] === 'string' ? (tiles[y] as string) : '';
    return Array.from({ length: width }, (_, x) => legend.get(row[x] ?? '') ?? 'grass');
  });

  const objects: EObject[] = [];
  for (const o of Array.isArray(raw.objects) ? raw.objects : []) {
    if (!isRecord(o) || typeof o.type !== 'string' || !isObjectTypeId(o.type)) continue;
    const def = objectType(o.type);
    const variant = typeof o.variant === 'string' && def.variants.includes(o.variant) ? o.variant : (def.variants[0] as string);
    const obj: EObject = { uid: nextUid(), type: o.type, x: num(o.x), y: num(o.y), variant, explicitVariant: typeof o.variant === 'string' };
    if (typeof o.id === 'string' && o.id) obj.id = o.id;
    if (typeof o.requires === 'string' && o.requires) obj.requires = o.requires;
    objects.push(obj);
  }

  const anchors = isRecord(raw.anchors) ? raw.anchors : {};
  const customers: ECustomers = {
    lotEntry: isRecord(anchors.lotEntry) ? point(anchors.lotEntry) : null,
    spawns: (Array.isArray(anchors.spawns) ? anchors.spawns : []).map((s, i) => ({
      id: isRecord(s) && typeof s.id === 'string' ? s.id : `jalur-${i + 1}`,
      path: isRecord(s) ? points(s.path) : [],
    })),
    seats: (Array.isArray(anchors.seats) ? anchors.seats : []).filter(isRecord).map((s, i) => {
      const seat: ESeat = { id: typeof s.id === 'string' ? s.id : `kursi-${i + 1}`, x: num(s.x), y: num(s.y), approach: points(s.approach) };
      if (typeof s.requires === 'string' && s.requires) seat.requires = s.requires;
      return seat;
    }),
    queue: points(anchors.queue),
  };

  return {
    id: typeof raw.id === 'string' ? raw.id : 'peta-baru',
    name: typeof raw.name === 'string' ? raw.name : 'Peta baru',
    width,
    height,
    terrain,
    objects,
    cameraHome: point(anchors.cameraHome),
    customers,
  };
}

const pt = (p: Point): Point => ({ x: round(p.x), y: round(p.y) });

/** True jika peta punya data pelanggan (dipakai untuk berjualan). */
export function hasCustomerData(c: ECustomers): boolean {
  return c.lotEntry !== null || c.spawns.length > 0 || c.seats.length > 0 || c.queue.length > 0;
}

/** Model editor → JSON peta dengan urutan kunci yang sama seperti file yang sudah ada. */
export function toRaw(map: EditorMap): Record<string, unknown> {
  const legend: Record<string, TerrainId> = {};
  for (const t of TERRAIN_IDS) legend[TERRAIN_SYMBOLS[t]] = t;
  const tiles = map.terrain.map((row) => row.map((t) => TERRAIN_SYMBOLS[t]).join(''));

  const objects = map.objects.map((o) => {
    const out: Record<string, unknown> = { type: o.type, x: round(o.x), y: round(o.y) };
    if (o.explicitVariant || o.variant !== objectType(o.type).variants[0]) out.variant = o.variant;
    if (o.id) out.id = o.id;
    if (o.requires) out.requires = o.requires;
    return out;
  });

  const anchors: Record<string, unknown> = { cameraHome: pt(map.cameraHome) };
  const c = map.customers;
  if (hasCustomerData(c)) {
    if (c.lotEntry) anchors.lotEntry = pt(c.lotEntry);
    anchors.spawns = c.spawns.map((s) => ({ id: s.id, path: s.path.map(pt) }));
    anchors.seats = c.seats.map((s) => {
      const out: Record<string, unknown> = { id: s.id, x: round(s.x), y: round(s.y) };
      if (s.requires) out.requires = s.requires;
      out.approach = s.approach.map(pt);
      return out;
    });
    anchors.queue = c.queue.map(pt);
  }

  return { id: map.id, name: map.name, width: map.width, height: map.height, legend, tiles, objects, anchors };
}

/** Geser seluruh isi peta (objek & titik) sejauh (dx, dy) ubin. */
export function shiftContent(map: EditorMap, dx: number, dy: number): void {
  const mv = (p: Point): void => {
    p.x = round(p.x + dx);
    p.y = round(p.y + dy);
  };
  for (const o of map.objects) mv(o);
  mv(map.cameraHome);
  const c = map.customers;
  if (c.lotEntry) mv(c.lotEntry);
  for (const s of c.spawns) s.path.forEach(mv);
  for (const s of c.seats) {
    mv(s);
    s.approach.forEach(mv);
  }
  c.queue.forEach(mv);
}

/**
 * Ubah ukuran peta. offsetX/offsetY menggeser isi lama (mis. 2 = tambah 2 kolom di kiri).
 * Ubin baru diisi `fill`; objek yang keluar batas dihapus dan jumlahnya dikembalikan.
 */
export function resizeMap(map: EditorMap, width: number, height: number, offsetX: number, offsetY: number, fill: TerrainId): number {
  const old = map.terrain;
  map.terrain = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => old[y - offsetY]?.[x - offsetX] ?? fill));
  map.width = width;
  map.height = height;
  shiftContent(map, offsetX, offsetY);
  const before = map.objects.length;
  map.objects = map.objects.filter((o) => {
    const def = objectType(o.type);
    return o.x >= 0 && o.y >= 0 && o.x + def.footprint.w / 16 <= width + 1e-6 && o.y + def.footprint.d / 16 <= height + 1e-6;
  });
  return before - map.objects.length;
}

/** Isi berantai (flood fill) ubin yang terhubung & sejenis. Mengembalikan jumlah ubin berubah. */
export function floodFill(map: EditorMap, sx: number, sy: number, to: TerrainId): number {
  const from = map.terrain[sy]?.[sx];
  if (!from || from === to) return 0;
  const stack: [number, number][] = [[sx, sy]];
  let n = 0;
  while (stack.length) {
    const [x, y] = stack.pop() as [number, number];
    const row = map.terrain[y];
    if (!row || row[x] !== from) continue;
    row[x] = to;
    n++;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return n;
}

/** Id unik berikutnya dengan awalan tertentu (kursi-1, kursi-2, …). */
export function uniqueId(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  for (let i = 1; ; i++) {
    const id = `${prefix}-${i}`;
    if (!used.has(id)) return id;
  }
}

/** Ubah nama bebas menjadi id peta (huruf kecil & tanda hubung). */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
