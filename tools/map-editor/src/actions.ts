/**
 * Perubahan peta yang dipakai bersama oleh kanvas (mouse/keyboard) dan panel.
 * Setiap fungsi membuat checkpoint riwayat sendiri.
 */
import type { Point } from '../../../src/iso/IsoMath';
import { objectType, type ObjectTypeId } from '../../../src/world/objectTypes';
import { nextUid, round, uniqueId, type EObject } from './model';
import { selPoint, type EditorState, type Sel } from './state';

export const snapTo = (v: number, step: number): number => round(Math.round(v / step) * step);

export function fitsInMap(state: EditorState, type: ObjectTypeId, x: number, y: number): boolean {
  const def = objectType(type);
  const m = state.map;
  return x >= 0 && y >= 0 && x + def.footprint.w / 16 <= m.width + 1e-6 && y + def.footprint.d / 16 <= m.height + 1e-6;
}

/** Posisi alas objek supaya titik tengah alasnya berada di bawah kursor. */
export function placementFor(state: EditorState, type: ObjectTypeId, tile: Point): Point {
  const def = objectType(type);
  return { x: snapTo(tile.x - def.footprint.w / 32, state.snap), y: snapTo(tile.y - def.footprint.d / 32, state.snap) };
}

export function placeObject(state: EditorState, tile: Point): EObject | null {
  const pos = placementFor(state, state.objType, tile);
  if (!fitsInMap(state, state.objType, pos.x, pos.y)) return null;
  state.checkpoint();
  const obj: EObject = { uid: nextUid(), type: state.objType, x: pos.x, y: pos.y, variant: state.objVariant, explicitVariant: true };
  if (state.objRequires) obj.requires = state.objRequires;
  // Objek inti diberi id yang dipakai upgrade (mis. variants.cart).
  if (['cart', 'stove', 'seller', 'canopy'].includes(obj.type) && !state.map.objects.some((o) => o.id === obj.type)) obj.id = obj.type;
  state.map.objects.push(obj);
  state.selection = [{ k: 'object', uid: obj.uid }];
  state.touched();
  return obj;
}

/** Hapus pilihan. Titik kamera & pintu masuk tidak bisa dihapus (hanya dipindah). */
export function deleteSelection(state: EditorState): number {
  const sel = state.selection;
  if (!sel.length) return 0;
  const c = state.map.customers;
  const objUids = new Set(sel.flatMap((s) => (s.k === 'object' ? [s.uid] : [])));
  const seats = new Set(sel.flatMap((s) => (s.k === 'seat' ? [s.s] : [])));
  const queue = new Set(sel.flatMap((s) => (s.k === 'queue' ? [s.i] : [])));
  const spawnPts = sel.filter((s): s is Extract<Sel, { k: 'spawnPt' }> => s.k === 'spawnPt');
  const approachPts = sel.filter((s): s is Extract<Sel, { k: 'approach' }> => s.k === 'approach' && !seats.has(s.s));
  const count = objUids.size + seats.size + queue.size + spawnPts.length + approachPts.length;
  if (!count) return 0;
  state.checkpoint();
  state.map.objects = state.map.objects.filter((o) => !objUids.has(o.uid));
  for (const p of approachPts) c.seats[p.s]?.approach.splice(p.i, 1, null as never);
  for (const seat of c.seats) seat.approach = seat.approach.filter(Boolean);
  for (const p of spawnPts) c.spawns[p.s]?.path.splice(p.i, 1, null as never);
  for (const s of c.spawns) s.path = s.path.filter(Boolean);
  c.spawns = c.spawns.filter((s) => s.path.length > 0);
  c.seats = c.seats.filter((_, i) => !seats.has(i));
  c.queue = c.queue.filter((_, i) => !queue.has(i));
  state.selection = [];
  state.draft = null;
  state.touched();
  return count;
}

/** Gandakan objek terpilih, sedikit bergeser. */
export function duplicateSelection(state: EditorState): number {
  const objs = state.selection.flatMap((s) => (s.k === 'object' ? [state.map.objects.find((o) => o.uid === s.uid)] : [])).filter((o): o is EObject => !!o);
  if (!objs.length) return 0;
  state.checkpoint();
  const copies: EObject[] = [];
  for (const o of objs) {
    let x = round(o.x + 0.5);
    let y = round(o.y + 0.5);
    if (!fitsInMap(state, o.type, x, y)) {
      x = o.x;
      y = o.y;
    }
    const copy: EObject = { ...o, uid: nextUid(), x, y };
    delete copy.id;
    copies.push(copy);
  }
  state.map.objects.push(...copies);
  state.selection = copies.map((o) => ({ k: 'object', uid: o.uid }));
  state.touched();
  return copies.length;
}

/** Pindahkan pilihan sejauh (dx, dy) dari posisi awal `start`. Objek tidak boleh keluar peta. */
export function moveSelection(state: EditorState, start: Map<Sel, Point>, dx: number, dy: number): void {
  for (const [sel, from] of start) {
    const p = selPoint(state.map, sel);
    if (!p) continue;
    let x = round(from.x + dx);
    let y = round(from.y + dy);
    if (sel.k === 'object') {
      const o = p as EObject;
      const def = objectType(o.type);
      x = Math.min(Math.max(0, x), state.map.width - def.footprint.w / 16);
      y = Math.min(Math.max(0, y), state.map.height - def.footprint.d / 16);
    }
    p.x = round(x);
    p.y = round(y);
  }
}

export function startPositions(state: EditorState): Map<Sel, Point> {
  const m = new Map<Sel, Point>();
  for (const s of state.selection) {
    const p = selPoint(state.map, s);
    if (p) m.set(s, { x: p.x, y: p.y });
  }
  return m;
}

export function nudgeSelection(state: EditorState, dx: number, dy: number): void {
  if (!state.selection.length) return;
  state.checkpoint();
  moveSelection(state, startPositions(state), dx * state.snap, dy * state.snap);
  state.touched();
}

/** Klik alat Titik: pasang/tambah titik sesuai mode. Mengembalikan pesan status. */
export function anchorClick(state: EditorState, raw: Point): string {
  const p = { x: snapTo(raw.x, state.snap), y: snapTo(raw.y, state.snap) };
  const c = state.map.customers;
  const d = state.draft;
  state.checkpoint();
  let msg = '';
  switch (state.anchorMode) {
    case 'camera':
      state.map.cameraHome = p;
      state.selection = [{ k: 'camera' }];
      msg = 'Titik kamera dipindah.';
      break;
    case 'lot':
      c.lotEntry = p;
      state.selection = [{ k: 'lot' }];
      msg = 'Pintu masuk dipasang.';
      break;
    case 'queue':
      c.queue.push(p);
      state.selection = [{ k: 'queue', i: c.queue.length - 1 }];
      msg = `Titik antrean #${c.queue.length} dipasang.`;
      break;
    case 'spawn':
      if (d?.kind === 'spawn' && c.spawns[d.s]) {
        c.spawns[d.s]!.path.push(p);
        msg = `Titik ${c.spawns[d.s]!.path.length} ditambahkan. Enter atau klik kanan untuk selesai.`;
      } else {
        c.spawns.push({
          id: uniqueId(
            'jalur',
            c.spawns.map((s) => s.id),
          ),
          path: [p],
        });
        state.draft = { kind: 'spawn', s: c.spawns.length - 1 };
        msg = 'Jalur baru dimulai. Klik titik-titik berikutnya menuju Pintu masuk.';
      }
      state.selection = [{ k: 'spawnPt', s: state.draft!.s, i: c.spawns[state.draft!.s]!.path.length - 1 }];
      break;
    case 'seat':
      if (d?.kind === 'approach' && c.seats[d.s]) {
        const seat = c.seats[d.s]!;
        // Titik jalur disisipkan berurutan dari Pintu masuk menuju kursi.
        seat.approach.push(p);
        state.selection = [{ k: 'seat', s: d.s }];
        msg = `Titik jalur ${seat.approach.length} untuk "${seat.id}". Enter atau klik kanan untuk selesai.`;
      } else {
        c.seats.push({
          id: uniqueId(
            'kursi',
            c.seats.map((s) => s.id),
          ),
          x: p.x,
          y: p.y,
          approach: [],
        });
        const s = c.seats.length - 1;
        state.draft = { kind: 'approach', s };
        state.selection = [{ k: 'seat', s }];
        msg = 'Kursi dipasang. Sekarang klik jalur dari Pintu masuk menuju kursi, berurutan.';
      }
      break;
  }
  state.touched();
  return msg;
}

export function finishDraft(state: EditorState): string {
  const d = state.draft;
  state.draft = null;
  state.emit('selection');
  if (!d) return '';
  const c = state.map.customers;
  if (d.kind === 'approach') {
    const seat = c.seats[d.s];
    return seat && seat.approach.length === 0 ? `Kursi "${seat.id}" belum punya jalur. Pilih kursinya lalu "Gambar ulang jalur".` : 'Jalur kursi selesai.';
  }
  return 'Jalur datang selesai.';
}
