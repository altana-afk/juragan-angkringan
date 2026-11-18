/**
 * Pemeriksaan peta: error (game akan menolak peta) dan peringatan (peta jalan,
 * tapi kemungkinan ada yang terlewat). Memakai parseMapData asli dari game.
 */
import type { Point } from '../../../src/iso/IsoMath';
import { parseMapData } from '../../../src/world/MapData';
import { objectType } from '../../../src/world/objectTypes';
import { MAP_ID_PATTERN, toRaw, type EditorMap } from './model';

/** Rujukan ke hal yang bermasalah, supaya editor bisa langsung memilihnya. */
export type IssueRef =
  | { kind: 'object'; uid: number }
  | { kind: 'seat'; index: number }
  | { kind: 'spawn'; index: number }
  | { kind: 'lot' }
  | { kind: 'camera' }
  | { kind: 'queue'; index: number };

export interface Issue {
  level: 'error' | 'warning';
  message: string;
  ref?: IssueRef;
}

export interface ValidationContext {
  /** id upgrade yang ada di upgrades.json → nama. */
  upgrades: ReadonlyMap<string, string>;
  /** Upgrade yang di peta lain punya objek/kursi (mis. bangku_tambahan). */
  layoutUpgrades: ReadonlySet<string>;
  /** Upgrade yang menjanjikan tambahan kursi (id → jumlah kursi, dari upgrades.json). */
  seatUpgrades?: ReadonlyMap<string, number>;
}

const inside = (map: EditorMap, p: Point): boolean => p.x >= 0 && p.y >= 0 && p.x <= map.width && p.y <= map.height;

/** Objek tempat duduk: kursi memang berada di atasnya. */
const SEATING = new Set(['plastic_chairs', 'umbrella_table', 'bench_x', 'bench_y', 'mat', 'low_table']);

function blockingAt(map: EditorMap, p: Point, forSeat = false): string | null {
  for (const o of map.objects) {
    const def = objectType(o.type);
    if (!def.blocking || def.footprint.w === 0 || (forSeat && (SEATING.has(o.type) || def.seat))) continue;
    const w = def.footprint.w / 16;
    const d = def.footprint.d / 16;
    if (p.x > o.x + 0.02 && p.x < o.x + w - 0.02 && p.y > o.y + 0.02 && p.y < o.y + d - 0.02) return def.label;
  }
  return null;
}

export function validateMap(map: EditorMap, ctx: ValidationContext): Issue[] {
  const issues: Issue[] = [];
  const err = (message: string, ref?: IssueRef): void => void issues.push(ref ? { level: 'error', message, ref } : { level: 'error', message });
  const warn = (message: string, ref?: IssueRef): void => void issues.push(ref ? { level: 'warning', message, ref } : { level: 'warning', message });

  if (!MAP_ID_PATTERN.test(map.id)) err(`Id peta "${map.id}" hanya boleh huruf kecil, angka, dan tanda hubung (mis. "alun-alun").`);
  if (!map.name.trim()) err('Nama peta masih kosong.');

  const c = map.customers;
  const selling = c.lotEntry !== null || c.spawns.length > 0 || c.seats.length > 0 || c.queue.length > 0;
  if (selling) {
    if (!c.lotEntry) err('Titik "Pintu masuk" belum dipasang (alat Titik → Pintu masuk).', { kind: 'lot' });
    if (c.spawns.length === 0) err('Belum ada jalur datang pelanggan (alat Titik → Jalur datang).');
    if (c.seats.length === 0) err('Belum ada kursi pelanggan (alat Titik → Kursi).');
  }
  c.seats.forEach((s, i) => {
    if (s.approach.length === 0) err(`Kursi "${s.id}" belum punya jalur dari Pintu masuk.`, { kind: 'seat', index: i });
  });
  c.spawns.forEach((s, i) => {
    if (s.path.length === 0) err(`Jalur "${s.id}" belum punya titik.`, { kind: 'spawn', index: i });
  });

  // Validasi resmi game (pesan error pertama dari parseMapData).
  if (!issues.some((i) => i.level === 'error')) {
    try {
      parseMapData(toRaw(map));
    } catch (e) {
      err(e instanceof Error ? e.message : String(e));
    }
  }

  // ---- Peringatan ----
  const types = new Set(map.objects.map((o) => o.type));
  if (!types.has('cart')) warn('Belum ada Gerobak angkringan. Game memakai gerobak untuk kamera & animasi.');
  else if (!map.objects.some((o) => o.type === 'cart' && o.id === 'cart')) warn('Gerobak sebaiknya ber-ID "cart" agar upgrade gerobak mengganti tampilannya.');
  if (!types.has('seller')) warn('Belum ada Penjual di dekat gerobak.');
  if (!selling) warn('Peta tanpa kursi & jalur pelanggan hanya bisa jadi pemandangan, tidak bisa dipakai berjualan.');

  if (!inside(map, map.cameraHome)) warn('Titik kamera berada di luar peta.', { kind: 'camera' });
  if (c.lotEntry && !inside(map, c.lotEntry)) warn('Pintu masuk berada di luar peta.', { kind: 'lot' });

  c.spawns.forEach((s, i) => {
    const first = s.path[0];
    const last = s.path[s.path.length - 1];
    if (first) {
      const edge = Math.min(first.x, first.y, map.width - first.x, map.height - first.y);
      if (edge > 0.6) warn(`Jalur "${s.id}" sebaiknya dimulai dari tepi/luar peta supaya pelanggan tidak muncul tiba-tiba.`, { kind: 'spawn', index: i });
    }
    if (last && c.lotEntry && Math.hypot(last.x - c.lotEntry.x, last.y - c.lotEntry.y) > 1.5) {
      warn(`Jalur "${s.id}" berakhir jauh dari Pintu masuk (lebih dari 1,5 ubin).`, { kind: 'spawn', index: i });
    }
  });

  const seatIds = new Set<string>();
  c.seats.forEach((s, i) => {
    if (seatIds.has(s.id)) err(`Id kursi "${s.id}" dipakai lebih dari sekali.`, { kind: 'seat', index: i });
    seatIds.add(s.id);
    const block = blockingAt(map, s, true);
    if (block) warn(`Kursi "${s.id}" berada di dalam ${block}.`, { kind: 'seat', index: i });
    if (s.requires && !ctx.upgrades.has(s.requires)) warn(`Kursi "${s.id}" memakai upgrade tak dikenal "${s.requires}".`, { kind: 'seat', index: i });
  });
  c.queue.forEach((q, i) => {
    const block = blockingAt(map, q);
    if (block) warn(`Titik antrean #${i + 1} berada di dalam ${block}.`, { kind: 'queue', index: i });
  });

  for (const o of map.objects) {
    if (o.requires && !ctx.upgrades.has(o.requires))
      warn(`${objectType(o.type).label} memakai upgrade tak dikenal "${o.requires}".`, { kind: 'object', uid: o.uid });
  }

  const usedHere = new Set<string>([
    ...map.objects.flatMap((o) => (o.requires ? [o.requires] : [])),
    ...c.seats.flatMap((s) => (s.requires ? [s.requires] : [])),
  ]);
  if (selling) {
    for (const [up, promised] of ctx.seatUpgrades ?? []) {
      const have = c.seats.filter((s) => s.requires === up).length;
      if (have > 0 && have !== promised) {
        warn(`Upgrade "${ctx.upgrades.get(up) ?? up}" menjanjikan +${promised} kursi, tapi di peta ini ada ${have} kursi untuk upgrade itu.`);
      }
    }
    for (const up of ctx.layoutUpgrades) {
      if (!usedHere.has(up))
        warn(`Upgrade "${ctx.upgrades.get(up) ?? up}" belum punya objek/kursi di peta ini (peta lain punya). Pemain yang membelinya tidak melihat perubahan.`);
    }
  }
  return issues;
}

/** Kumpulkan upgrade yang menambah objek/kursi di peta-peta lain. */
export function collectLayoutUpgrades(raws: readonly unknown[]): Set<string> {
  const out = new Set<string>();
  for (const raw of raws) {
    const r = raw as { objects?: { requires?: unknown }[]; anchors?: { seats?: { requires?: unknown }[] } };
    for (const o of r.objects ?? []) if (typeof o.requires === 'string') out.add(o.requires);
    for (const s of r.anchors?.seats ?? []) if (typeof s.requires === 'string') out.add(s.requires);
  }
  return out;
}
