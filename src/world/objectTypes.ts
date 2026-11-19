/**
 * Definisi jenis objek dunia (properti, bangunan, karakter statis).
 * Ukuran alas dalam unit (16 unit = 1 ubin). Tekstur bawaan digambar oleh src/graphics/art;
 * objek kustom (gambar PNG dari editor peta) didaftarkan dari src/data/customObjects.json.
 */
import customObjectsJson from '../data/customObjects.json';
import { parseCustomObjects, type CustomObjectDef } from './customObjects';

export type BuiltinObjectTypeId =
  | 'cart'
  | 'canopy'
  | 'stove'
  | 'bench_x'
  | 'bench_y'
  | 'mat'
  | 'low_table'
  | 'street_lamp'
  | 'power_pole'
  | 'tree'
  | 'house_x'
  | 'house_y'
  | 'shop'
  | 'pos_ronda'
  | 'motorbike'
  | 'trash_bin'
  | 'plant_pot'
  | 'seller'
  | 'sign_board'
  | 'campus'
  | 'market_stall'
  | 'station'
  | 'rail'
  | 'plastic_chairs'
  | 'umbrella_table'
  | 'ferris_wheel'
  | 'carousel'
  | 'string_lights';

/** Id objek kustom selalu diawali "c_" (mis. c_gerobak_bakso). */
export type CustomObjectTypeId = `c_${string}`;

export type ObjectTypeId = BuiltinObjectTypeId | CustomObjectTypeId;

/**
 * Cara menentukan urutan gambar:
 * - center: berdasarkan titik tengah alas (umumnya benar untuk objek di tanah).
 * - front: berdasarkan sudut depan alas (untuk objek tinggi di atas kepala, mis. tenda).
 * - ground: selalu di atas tanah tapi di bawah semua objek (mis. tikar).
 */
export type DepthMode = 'center' | 'front' | 'ground';

export type ObjectFx = 'fire' | 'smoke' | 'idle';

export interface ObjectTypeDef {
  readonly id: ObjectTypeId;
  readonly label: string;
  readonly footprint: { readonly w: number; readonly d: number };
  readonly depthMode: DepthMode;
  /** Varian tampilan; elemen pertama adalah default. */
  readonly variants: readonly string[];
  /** Menghalangi jalan pelanggan (dipakai AI di Stage 3). */
  readonly blocking: boolean;
  readonly fx?: readonly ObjectFx[];
  /** Pelanggan bisa duduk di atasnya; lift = tinggi dudukan (piksel). */
  readonly seat?: { readonly lift?: number };
  /** Data gambar untuk objek kustom (PNG). */
  readonly custom?: CustomObjectDef;
}

const def = (d: ObjectTypeDef): ObjectTypeDef => d;

const BUILTIN_OBJECT_TYPES: Readonly<Record<BuiltinObjectTypeId, ObjectTypeDef>> = {
  cart: def({ id: 'cart', label: 'Gerobak angkringan', footprint: { w: 32, d: 14 }, depthMode: 'center', variants: ['basic', 'standar', 'modern', 'premium'], blocking: true }),
  canopy: def({ id: 'canopy', label: 'Tenda terpal', footprint: { w: 52, d: 34 }, depthMode: 'front', variants: ['orange', 'lights'], blocking: false }),
  stove: def({ id: 'stove', label: 'Anglo & ceret', footprint: { w: 12, d: 14 }, depthMode: 'center', variants: ['anglo'], blocking: true, fx: ['fire', 'smoke'] }),
  bench_x: def({ id: 'bench_x', label: 'Bangku panjang', footprint: { w: 32, d: 6 }, depthMode: 'center', variants: ['wood', 'premium'], blocking: false, seat: {} }),
  bench_y: def({ id: 'bench_y', label: 'Bangku panjang', footprint: { w: 6, d: 32 }, depthMode: 'center', variants: ['wood', 'premium'], blocking: false, seat: {} }),
  mat: def({ id: 'mat', label: 'Tikar lesehan', footprint: { w: 28, d: 28 }, depthMode: 'ground', variants: ['striped'], blocking: false }),
  low_table: def({ id: 'low_table', label: 'Meja lesehan', footprint: { w: 14, d: 10 }, depthMode: 'center', variants: ['wood'], blocking: true }),
  street_lamp: def({ id: 'street_lamp', label: 'Lampu jalan', footprint: { w: 4, d: 4 }, depthMode: 'center', variants: ['default'], blocking: true }),
  power_pole: def({ id: 'power_pole', label: 'Tiang listrik', footprint: { w: 3, d: 3 }, depthMode: 'center', variants: ['concrete'], blocking: true }),
  tree: def({ id: 'tree', label: 'Pohon', footprint: { w: 16, d: 16 }, depthMode: 'center', variants: ['round', 'tall'], blocking: true }),
  house_x: def({ id: 'house_x', label: 'Rumah', footprint: { w: 48, d: 64 }, depthMode: 'center', variants: ['cream', 'mint', 'peach'], blocking: true }),
  house_y: def({ id: 'house_y', label: 'Rumah', footprint: { w: 64, d: 48 }, depthMode: 'center', variants: ['blue', 'cream'], blocking: true }),
  shop: def({ id: 'shop', label: 'Ruko', footprint: { w: 64, d: 64 }, depthMode: 'center', variants: ['warung', 'laundry', 'pulsa', 'fotokopi'], blocking: true }),
  pos_ronda: def({ id: 'pos_ronda', label: 'Pos ronda', footprint: { w: 40, d: 24 }, depthMode: 'center', variants: ['default'], blocking: true }),
  motorbike: def({ id: 'motorbike', label: 'Motor parkir', footprint: { w: 22, d: 6 }, depthMode: 'center', variants: ['red', 'blue'], blocking: true }),
  trash_bin: def({ id: 'trash_bin', label: 'Tong sampah', footprint: { w: 6, d: 6 }, depthMode: 'center', variants: ['green'], blocking: true }),
  plant_pot: def({ id: 'plant_pot', label: 'Pot tanaman', footprint: { w: 6, d: 6 }, depthMode: 'center', variants: ['default'], blocking: true }),
  market_stall: def({ id: 'market_stall', label: 'Lapak pasar', footprint: { w: 32, d: 24 }, depthMode: 'center', variants: ['merah', 'biru', 'hijau', 'kuning'], blocking: true }),
  station: def({ id: 'station', label: 'Stasiun', footprint: { w: 64, d: 176 }, depthMode: 'center', variants: ['default'], blocking: true }),
  rail: def({ id: 'rail', label: 'Rel kereta', footprint: { w: 16, d: 64 }, depthMode: 'ground', variants: ['default'], blocking: false }),
  plastic_chairs: def({ id: 'plastic_chairs', label: 'Kursi plastik', footprint: { w: 28, d: 10 }, depthMode: 'center', variants: ['red'], blocking: true }),
  umbrella_table: def({ id: 'umbrella_table', label: 'Meja payung', footprint: { w: 24, d: 24 }, depthMode: 'center', variants: ['green'], blocking: true }),
  ferris_wheel: def({ id: 'ferris_wheel', label: 'Bianglala', footprint: { w: 48, d: 32 }, depthMode: 'center', variants: ['default'], blocking: true }),
  carousel: def({ id: 'carousel', label: 'Komidi putar', footprint: { w: 48, d: 48 }, depthMode: 'center', variants: ['default'], blocking: true }),
  string_lights: def({ id: 'string_lights', label: 'Lampu hias', footprint: { w: 4, d: 64 }, depthMode: 'front', variants: ['default'], blocking: false }),
  campus: def({ id: 'campus', label: 'Gedung kampus', footprint: { w: 64, d: 176 }, depthMode: 'center', variants: ['default', 'rsj', 'mabes'], blocking: true }),
  sign_board: def({ id: 'sign_board', label: 'Papan nama', footprint: { w: 28, d: 3 }, depthMode: 'center', variants: ['default'], blocking: true }),
  seller: def({ id: 'seller', label: 'Penjual', footprint: { w: 0, d: 0 }, depthMode: 'center', variants: ['default'], blocking: false, fx: ['idle'] }),
};

/** Variant tunggal untuk objek kustom. */
export const CUSTOM_VARIANT = 'default';

export function customObjectTypeDef(c: CustomObjectDef): ObjectTypeDef {
  return {
    id: c.id,
    label: c.label,
    footprint: c.footprint,
    depthMode: c.depthMode,
    variants: [CUSTOM_VARIANT],
    blocking: c.blocking,
    ...(c.seating ? { seat: { lift: c.seatLift } } : {}),
    custom: c,
  };
}

const registry: Record<string, ObjectTypeDef> = { ...BUILTIN_OBJECT_TYPES };
for (const c of parseCustomObjects(customObjectsJson)) registry[c.id] = customObjectTypeDef(c);

/** Jenis objek bawaan, diakses langsung (mis. OBJECT_TYPES.cart). Untuk id apa pun pakai objectType(). */
export const OBJECT_TYPES = registry as Readonly<Record<BuiltinObjectTypeId, ObjectTypeDef>>;

/** Definisi jenis objek (bawaan atau kustom). Id harus sudah dicek dengan isObjectTypeId. */
export function objectType(id: ObjectTypeId): ObjectTypeDef {
  const d = registry[id];
  if (!d) throw new Error(`Jenis objek "${id}" tidak dikenal`);
  return d;
}

export function isObjectTypeId(value: string): value is ObjectTypeId {
  return Object.prototype.hasOwnProperty.call(registry, value);
}

export function isCustomObjectTypeId(value: string): value is CustomObjectTypeId {
  return value.startsWith('c_');
}

export function listObjectTypeIds(): ObjectTypeId[] {
  return Object.keys(registry) as ObjectTypeId[];
}

/** Daftarkan / perbarui objek kustom saat aplikasi berjalan (dipakai editor peta). */
export function registerCustomObjectType(c: CustomObjectDef): void {
  registry[c.id] = customObjectTypeDef(c);
}

export function unregisterCustomObjectType(id: string): void {
  if (isCustomObjectTypeId(id)) delete registry[id];
}

/** Kunci tekstur Phaser untuk sebuah objek & varian. */
export function objectTextureKey(type: ObjectTypeId, variant: string, frame?: number): string {
  return frame === undefined ? `obj_${type}_${variant}` : `obj_${type}_${variant}_${frame}`;
}
