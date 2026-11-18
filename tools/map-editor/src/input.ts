/**
 * Mouse, sentuhan & keyboard pada kanvas peta.
 */
import type { Point } from '../../../src/iso/IsoMath';
import { objectType } from '../../../src/world/objectTypes';
import type { TerrainId } from '../../../src/world/terrain';
import {
  anchorClick,
  deleteSelection,
  duplicateSelection,
  finishDraft,
  fitsInMap,
  moveSelection,
  nudgeSelection,
  placeObject,
  placementFor,
  snapTo,
  startPositions,
} from './actions';
import { floodFill } from './model';
import { selKey, type EditorState, type Sel, type Tool } from './state';
import type { Viewport } from './viewport';

export interface InputHooks {
  status(msg: string): void;
  coords(tile: Point | null, terrain: TerrainId | null): void;
  save(): void;
  pickedTerrain(t: TerrainId): void;
}

type Gesture =
  | { kind: 'pan'; sx: number; sy: number; ox: number; oy: number }
  | { kind: 'drag'; start: Map<Sel, Point>; from: Point; anchor: Point; moved: boolean }
  | { kind: 'marquee'; additive: boolean; base: Sel[] }
  | { kind: 'paint'; changed: boolean }
  | { kind: 'rect'; from: Point; to: Point };

const TOOL_KEYS: Record<string, Tool> = { v: 'select', b: 'terrain', o: 'object', p: 'anchor' };

export function attachInput(canvas: HTMLCanvasElement, state: EditorState, view: Viewport, hooks: InputHooks): void {
  let gesture: Gesture | null = null;
  let spaceDown = false;
  let wheelAcc = 0;

  const local = (e: PointerEvent | MouseEvent | WheelEvent): Point => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const brushTilesAt = (tile: Point | null): Point[] => {
    if (!tile) return [];
    if (state.brushMode !== 'brush') return [tile];
    const n = state.brushSize;
    const off = Math.floor((n - 1) / 2);
    const out: Point[] = [];
    for (let dy = 0; dy < n; dy++)
      for (let dx = 0; dx < n; dx++) {
        const x = tile.x - off + dx;
        const y = tile.y - off + dy;
        if (x >= 0 && y >= 0 && x < state.map.width && y < state.map.height) out.push({ x, y });
      }
    return out;
  };

  const rectTiles = (a: Point, b: Point): Point[] => {
    const out: Point[] = [];
    for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) out.push({ x, y });
    return out;
  };

  const paint = (tiles: Point[]): boolean => {
    let changed = false;
    for (const t of tiles) {
      const row = state.map.terrain[t.y];
      if (!row || row[t.x] === state.brush) continue;
      row[t.x] = state.brush;
      view.pending.set(`${t.x},${t.y}`, { x: t.x, y: t.y, t: state.brush });
      changed = true;
    }
    return changed;
  };

  const updateHover = (s: Point): void => {
    const tile = view.pickTile(s.x, s.y);
    view.cursorTile = tile;
    hooks.coords(view.screenToTile(s.x, s.y), tile ? (state.map.terrain[tile.y]?.[tile.x] ?? null) : null);
    view.hover = null;
    view.ghost = null;
    view.brushTiles = [];
    if (state.tool === 'select' || (state.tool === 'anchor' && !state.draft)) {
      const p = view.hitPoint(s.x, s.y);
      const o = state.tool === 'select' && !p ? view.hitObject(s.x, s.y) : null;
      view.hover = p ?? (o ? { k: 'object', uid: o.uid } : null);
      canvas.style.cursor = view.hover ? 'move' : state.tool === 'anchor' ? 'crosshair' : 'default';
    } else if (state.tool === 'object') {
      const t = view.screenToTile(s.x, s.y);
      const pos = placementFor(state, state.objType, t);
      view.ghost = { type: state.objType, variant: state.objVariant, x: pos.x, y: pos.y, valid: fitsInMap(state, state.objType, pos.x, pos.y) };
      canvas.style.cursor = 'crosshair';
    } else if (state.tool === 'terrain') {
      view.brushTiles = brushTilesAt(tile);
      canvas.style.cursor = 'crosshair';
    } else {
      canvas.style.cursor = 'crosshair';
    }
    view.requestDraw();
  };

  canvas.addEventListener('pointerdown', (e) => {
    canvas.focus();
    const s = local(e);
    const wantsPan = e.button === 1 || (e.button === 0 && spaceDown) || (e.button === 2 && state.tool === 'select');
    if (wantsPan) {
      gesture = { kind: 'pan', sx: s.x, sy: s.y, ox: state.view.ox, oy: state.view.oy };
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
      return;
    }
    const tile = view.screenToTile(s.x, s.y);

    if (state.tool === 'terrain') {
      const t = view.pickTile(s.x, s.y);
      if (!t) return;
      if (e.button === 2 || e.altKey) {
        const picked = state.map.terrain[t.y]?.[t.x];
        if (picked) hooks.pickedTerrain(picked);
        return;
      }
      if (e.button !== 0) return;
      if (state.brushMode === 'fill') {
        state.checkpoint();
        const n = floodFill(state.map, t.x, t.y, state.brush);
        if (n) {
          state.touched('terrain');
          hooks.status(`${n} ubin diisi.`);
        } else state.dropCheckpoint();
        return;
      }
      state.checkpoint();
      if (state.brushMode === 'rect') gesture = { kind: 'rect', from: t, to: t };
      else gesture = { kind: 'paint', changed: paint(brushTilesAt(t)) };
      canvas.setPointerCapture(e.pointerId);
      view.requestDraw();
      return;
    }

    if (state.tool === 'object') {
      if (e.button !== 0) return;
      const obj = placeObject(state, tile);
      hooks.status(obj ? `${objectType(obj.type).label} dipasang di (${obj.x}, ${obj.y}).` : 'Tidak bisa dipasang: objek keluar dari batas peta.');
      return;
    }

    if (state.tool === 'anchor') {
      if (e.button === 2) {
        hooks.status(finishDraft(state));
        return;
      }
      if (e.button !== 0) return;
      const hit = state.draft ? null : view.hitPoint(s.x, s.y);
      if (!hit) {
        hooks.status(anchorClick(state, tile));
        return;
      }
      // Klik titik yang sudah ada: pilih & seret.
      state.select([hit]);
    }

    if (state.tool === 'select' || state.tool === 'anchor') {
      if (e.button !== 0) return;
      const hit = view.hitPoint(s.x, s.y) ?? (state.tool === 'select' ? toSel(view.hitObject(s.x, s.y)?.uid) : null);
      if (hit) {
        if (e.shiftKey) {
          const key = selKey(hit);
          state.select(state.isSelected(hit) ? state.selection.filter((x) => selKey(x) !== key) : [...state.selection, hit]);
          return;
        }
        if (!state.isSelected(hit)) state.select([hit]);
        const primary = state.selection.find((x) => selKey(x) === selKey(hit)) ?? hit;
        const start = startPositions(state);
        const anchor = start.get(primary) ?? tile;
        gesture = { kind: 'drag', start, from: tile, anchor, moved: false };
        canvas.setPointerCapture(e.pointerId);
        return;
      }
      if (state.tool === 'select') {
        gesture = { kind: 'marquee', additive: e.shiftKey, base: e.shiftKey ? [...state.selection] : [] };
        view.marquee = { x0: s.x, y0: s.y, x1: s.x, y1: s.y };
        if (!e.shiftKey) state.select([]);
        canvas.setPointerCapture(e.pointerId);
      }
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const s = local(e);
    const g = gesture;
    if (!g) {
      updateHover(s);
      return;
    }
    switch (g.kind) {
      case 'pan':
        state.view.ox = g.ox + (s.x - g.sx);
        state.view.oy = g.oy + (s.y - g.sy);
        view.requestDraw();
        break;
      case 'drag': {
        const t = view.screenToTile(s.x, s.y);
        const nx = snapTo(g.anchor.x + (t.x - g.from.x), state.snap);
        const ny = snapTo(g.anchor.y + (t.y - g.from.y), state.snap);
        const dx = nx - g.anchor.x;
        const dy = ny - g.anchor.y;
        if (!g.moved && (dx !== 0 || dy !== 0)) {
          g.moved = true;
          state.checkpoint();
        }
        if (g.moved) {
          moveSelection(state, g.start, dx, dy);
          state.touched();
          hooks.coords(t, null);
        }
        break;
      }
      case 'marquee': {
        const m = view.marquee!;
        m.x1 = s.x;
        m.y1 = s.y;
        const inside = view.inRect(m.x0, m.y0, m.x1, m.y1);
        const keys = new Set(g.base.map(selKey));
        state.selection = [...g.base, ...inside.filter((x) => !keys.has(selKey(x)))];
        state.emit('selection');
        view.requestDraw();
        break;
      }
      case 'paint': {
        const t = view.pickTile(s.x, s.y);
        view.brushTiles = brushTilesAt(t);
        if (paint(view.brushTiles)) g.changed = true;
        view.requestDraw();
        break;
      }
      case 'rect': {
        const t = view.pickTile(s.x, s.y);
        if (t) g.to = t;
        view.brushTiles = rectTiles(g.from, g.to);
        view.requestDraw();
        break;
      }
    }
  });

  const endGesture = (): void => {
    const g = gesture;
    gesture = null;
    if (!g) return;
    if (g.kind === 'paint') {
      if (g.changed) state.touched('terrain');
      else state.dropCheckpoint();
    } else if (g.kind === 'rect') {
      const tiles = rectTiles(g.from, g.to);
      if (paint(tiles)) {
        state.touched('terrain');
        hooks.status(`${tiles.length} ubin dicat.`);
      } else state.dropCheckpoint();
      view.brushTiles = [];
    } else if (g.kind === 'marquee') {
      view.marquee = null;
      hooks.status(state.selection.length ? `${state.selection.length} dipilih.` : '');
      state.emit('selection');
    } else if (g.kind === 'drag' && g.moved) {
      state.touched();
    } else if (g.kind === 'pan') {
      canvas.style.cursor = '';
    }
    view.requestDraw();
  };
  canvas.addEventListener('pointerup', endGesture);
  canvas.addEventListener('pointercancel', endGesture);
  canvas.addEventListener('pointerleave', () => {
    if (gesture) return;
    view.ghost = null;
    view.brushTiles = [];
    view.hover = null;
    hooks.coords(null, null);
    view.requestDraw();
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('dblclick', () => {
    if (state.draft) hooks.status(finishDraft(state));
  });

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const s = local(e);
      if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        // Geser horizontal (trackpad).
        state.view.ox -= e.deltaX;
        view.requestDraw();
      } else {
        // Kumpulkan delta: satu "klik" roda mouse ≈ 100, trackpad mengirim banyak delta kecil.
        wheelAcc += e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
        if (Math.abs(wheelAcc) >= 60) {
          view.stepZoom(wheelAcc < 0 ? 1 : -1, s.x, s.y);
          wheelAcc = 0;
        }
      }
    },
    { passive: false },
  );

  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement | null;
    const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault();
      hooks.save();
      return;
    }
    if (typing || document.querySelector('dialog[open]')) return;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey ? state.redo() : state.undo()) hooks.status(e.shiftKey ? 'Diulangi.' : 'Diurungkan.');
      return;
    }
    if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      if (state.redo()) hooks.status('Diulangi.');
      return;
    }
    if (mod && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      const n = duplicateSelection(state);
      if (n) hooks.status(`${n} objek digandakan.`);
      return;
    }
    if (mod) return;
    if (e.key === ' ') {
      spaceDown = true;
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter' || e.key === 'Escape') {
      if (state.draft) {
        hooks.status(finishDraft(state));
        e.preventDefault();
      } else if (e.key === 'Escape') state.select([]);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      const n = deleteSelection(state);
      if (n) hooks.status(`${n} item dihapus.`);
      return;
    }
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const a = arrows[e.key];
    if (a && state.selection.length) {
      e.preventDefault();
      nudgeSelection(state, a[0], a[1]);
      return;
    }
    if (e.key === '+' || e.key === '=') view.stepZoom(1);
    else if (e.key === '-') view.stepZoom(-1);
    else if (e.key === '0') view.fit();
    else {
      const tool = TOOL_KEYS[e.key.toLowerCase()];
      if (tool) state.setTool(tool);
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === ' ') spaceDown = false;
  });
}

const toSel = (uid: number | undefined): Sel | null => (uid === undefined ? null : { k: 'object', uid });
