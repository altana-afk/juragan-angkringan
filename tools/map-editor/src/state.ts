/**
 * Status editor: peta yang disunting, pilihan, alat aktif, riwayat urungkan, tampilan kamera.
 */
import type { Point } from '../../../src/iso/IsoMath';
import type { ObjectTypeId } from '../../../src/world/objectTypes';
import type { TerrainId } from '../../../src/world/terrain';
import type { EditorMap } from './model';

export type Tool = 'select' | 'terrain' | 'object' | 'anchor';
export type BrushMode = 'brush' | 'rect' | 'fill';
export type AnchorMode = 'camera' | 'lot' | 'spawn' | 'seat' | 'queue';

export type Sel =
  | { k: 'object'; uid: number }
  | { k: 'camera' }
  | { k: 'lot' }
  | { k: 'spawnPt'; s: number; i: number }
  | { k: 'seat'; s: number }
  | { k: 'approach'; s: number; i: number }
  | { k: 'queue'; i: number };

export type Draft = { kind: 'spawn'; s: number } | { kind: 'approach'; s: number } | null;

export const selKey = (s: Sel): string => {
  switch (s.k) {
    case 'object':
      return `o${s.uid}`;
    case 'spawnPt':
    case 'approach':
      return `${s.k}${s.s}.${s.i}`;
    case 'seat':
      return `seat${s.s}`;
    case 'queue':
      return `q${s.i}`;
    default:
      return s.k;
  }
};

/** Titik (bisa diubah) yang ditunjuk oleh pilihan, atau null jika sudah tidak ada. */
export function selPoint(map: EditorMap, s: Sel): Point | null {
  const c = map.customers;
  switch (s.k) {
    case 'object':
      return map.objects.find((o) => o.uid === s.uid) ?? null;
    case 'camera':
      return map.cameraHome;
    case 'lot':
      return c.lotEntry;
    case 'spawnPt':
      return c.spawns[s.s]?.path[s.i] ?? null;
    case 'seat':
      return c.seats[s.s] ?? null;
    case 'approach':
      return c.seats[s.s]?.approach[s.i] ?? null;
    case 'queue':
      return c.queue[s.i] ?? null;
  }
}

export interface Layers {
  grid: boolean;
  footprints: boolean;
  anchors: boolean;
  upgrades: boolean;
}

export class EditorState {
  map: EditorMap;
  /** Id file asal di project (null = peta baru, belum pernah disimpan). */
  fileId: string | null;
  dirty = false;
  selection: Sel[] = [];
  tool: Tool = 'select';
  brush: TerrainId = 'grass';
  brushMode: BrushMode = 'brush';
  brushSize = 1;
  objType: ObjectTypeId = 'tree';
  objVariant = 'round';
  objRequires = '';
  anchorMode: AnchorMode = 'seat';
  draft: Draft = null;
  snap = 0.05;
  layers: Layers = { grid: false, footprints: false, anchors: true, upgrades: true };
  view = { zoom: 2, ox: 0, oy: 0 };

  private undoStack: EditorMap[] = [];
  private redoStack: EditorMap[] = [];
  private listeners = new Set<(what: ChangeKind) => void>();

  constructor(map: EditorMap, fileId: string | null) {
    this.map = map;
    this.fileId = fileId;
  }

  on(fn: (what: ChangeKind) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Beri tahu UI. 'map' = isi peta berubah, 'terrain' = lantai perlu dipanggang ulang. */
  emit(what: ChangeKind): void {
    for (const fn of this.listeners) fn(what);
  }

  /** Simpan keadaan sekarang ke riwayat, sebelum perubahan dibuat. */
  checkpoint(): void {
    this.undoStack.push(structuredClone(this.map));
    if (this.undoStack.length > 150) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  /** Batalkan checkpoint terakhir (perubahan ternyata tidak terjadi). */
  dropCheckpoint(): void {
    this.undoStack.pop();
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): boolean {
    const prev = this.undoStack.pop();
    if (!prev) return false;
    this.redoStack.push(structuredClone(this.map));
    this.restore(prev);
    return true;
  }

  redo(): boolean {
    const next = this.redoStack.pop();
    if (!next) return false;
    this.undoStack.push(structuredClone(this.map));
    this.restore(next);
    return true;
  }

  private restore(map: EditorMap): void {
    this.map = map;
    this.draft = null;
    this.selection = this.selection.filter((s) => selPoint(map, s) !== null);
    this.dirty = true;
    this.emit('terrain');
  }

  /** Ganti seluruh peta (buka file / peta baru). */
  load(map: EditorMap, fileId: string | null): void {
    this.map = map;
    this.fileId = fileId;
    this.dirty = false;
    this.selection = [];
    this.draft = null;
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.emit('load');
  }

  /** Tandai perubahan isi peta. */
  touched(kind: ChangeKind = 'map'): void {
    this.dirty = true;
    this.emit(kind);
  }

  isSelected(s: Sel): boolean {
    const key = selKey(s);
    return this.selection.some((x) => selKey(x) === key);
  }

  select(list: Sel[]): void {
    this.selection = list;
    this.emit('selection');
  }

  setTool(tool: Tool): void {
    this.tool = tool;
    this.draft = null;
    this.emit('tool');
  }
}

export type ChangeKind = 'map' | 'terrain' | 'selection' | 'tool' | 'view' | 'load' | 'layers';
