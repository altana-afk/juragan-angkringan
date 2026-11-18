/**
 * Kanvas peta: menggambar lantai, objek (urutan kedalaman sama dengan game),
 * dan lapisan bantu editor (grid, alas objek, titik pelanggan, pilihan).
 */
import { mapWorldBounds, tileToWorld, worldToTile, type Point } from '../../../src/iso/IsoMath';
import { entityDepth, objectDepth } from '../../../src/world/depth';
import { objectType, type ObjectTypeId } from '../../../src/world/objectTypes';
import { TERRAINS, type TerrainId } from '../../../src/world/terrain';
import { bakeGroundImage, fireSprite, spriteFor, terrainSwatch, type GroundImage } from './art';
import type { EObject } from './model';
import { selKey, type EditorState, type Sel } from './state';

export const COLORS = {
  bg: '#140f1f',
  select: '#ffcf5c',
  hover: '#fff3df',
  camera: '#fff3df',
  lot: '#f2b544',
  spawn: '#7fb6e8',
  seat: '#7bd389',
  queue: '#ef6f6c',
  blocked: '#ef6f6c',
  grid: 'rgba(255, 243, 223, 0.18)',
};

export const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 6];

interface Ghost {
  type: ObjectTypeId;
  variant: string;
  x: number;
  y: number;
  valid: boolean;
}

interface PointHandle {
  sel: Sel;
  p: Point;
  color: string;
  label?: string;
}

export class Viewport {
  readonly ctx: CanvasRenderingContext2D;
  private ground: GroundImage | null = null;
  private rafPending = false;
  private width = 0;
  private height = 0;

  /** Lapisan sementara milik alat yang sedang dipakai. */
  ghost: Ghost | null = null;
  brushTiles: Point[] = [];
  /** Ubin yang sedang dicat tapi lantainya belum dipanggang ulang. */
  pending = new Map<string, { x: number; y: number; t: TerrainId }>();
  marquee: { x0: number; y0: number; x1: number; y1: number } | null = null;
  hover: Sel | null = null;
  cursorTile: Point | null = null;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly state: EditorState,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D tidak tersedia');
    this.ctx = ctx;
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.width = r.width;
    this.height = r.height;
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.requestDraw();
  }

  rebakeGround(): void {
    this.ground = bakeGroundImage(this.state.map);
    this.pending.clear();
    this.requestDraw();
  }

  /** Muat ulang tampilan untuk peta baru dan pas-kan ke layar. */
  fit(): void {
    const m = this.state.map;
    const b = mapWorldBounds(m.width, m.height, 90, 16);
    const zoomFit = Math.min(this.width / b.width, this.height / b.height) * 0.95;
    const zoom = [...ZOOMS].reverse().find((z) => z <= zoomFit) ?? ZOOMS[0]!;
    this.state.view.zoom = zoom;
    this.state.view.ox = this.width / 2 - (b.x + b.width / 2) * zoom;
    this.state.view.oy = this.height / 2 - (b.y + b.height / 2) * zoom;
    this.requestDraw();
  }

  centerOn(tile: Point): void {
    const w = tileToWorld(tile.x, tile.y);
    const z = this.state.view.zoom;
    this.state.view.ox = this.width / 2 - w.x * z;
    this.state.view.oy = this.height / 2 - w.y * z;
    this.requestDraw();
  }

  zoomAt(screenX: number, screenY: number, zoom: number): void {
    const v = this.state.view;
    const wx = (screenX - v.ox) / v.zoom;
    const wy = (screenY - v.oy) / v.zoom;
    v.zoom = zoom;
    v.ox = screenX - wx * zoom;
    v.oy = screenY - wy * zoom;
    this.state.emit('view');
    this.requestDraw();
  }

  stepZoom(dir: 1 | -1, screenX = this.width / 2, screenY = this.height / 2): void {
    const z = this.state.view.zoom;
    const next = dir > 0 ? ZOOMS.find((v) => v > z + 1e-6) : [...ZOOMS].reverse().find((v) => v < z - 1e-6);
    if (next) this.zoomAt(screenX, screenY, next);
  }

  screenToWorld(sx: number, sy: number): Point {
    const v = this.state.view;
    return { x: (sx - v.ox) / v.zoom, y: (sy - v.oy) / v.zoom };
  }

  worldToScreen(w: Point): Point {
    const v = this.state.view;
    return { x: w.x * v.zoom + v.ox, y: w.y * v.zoom + v.oy };
  }

  /** Posisi ubin (pecahan) di bawah kursor, pada permukaan tanah. */
  screenToTile(sx: number, sy: number): Point {
    const w = this.screenToWorld(sx, sy);
    return worldToTile(w.x, w.y);
  }

  /** Ubin bulat di bawah kursor, memperhitungkan trotoar yang lebih tinggi. */
  pickTile(sx: number, sy: number): Point | null {
    const m = this.state.map;
    const w = this.screenToWorld(sx, sy);
    let t = worldToTile(w.x, w.y);
    let tx = Math.floor(t.x);
    let ty = Math.floor(t.y);
    const elev = m.terrain[ty]?.[tx] ? TERRAINS[m.terrain[ty]![tx]!].elevation : 0;
    if (elev > 0) {
      t = worldToTile(w.x, w.y + elev);
      tx = Math.floor(t.x);
      ty = Math.floor(t.y);
    }
    return tx >= 0 && ty >= 0 && tx < m.width && ty < m.height ? { x: tx, y: ty } : null;
  }

  // ------------------------------------------------------------------ hit test

  visibleObjects(): EObject[] {
    const { map, layers } = this.state;
    const list = layers.upgrades ? map.objects : map.objects.filter((o) => !o.requires);
    return [...list].sort((a, b) => depthOf(a) - depthOf(b));
  }

  hitObject(sx: number, sy: number): EObject | null {
    const w = this.screenToWorld(sx, sy);
    const objs = this.visibleObjects();
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i]!;
      const sprite = spriteFor(o.type, o.variant);
      if (!sprite) continue;
      const pos = tileToWorld(o.x, o.y);
      const px = Math.floor(w.x - (pos.x - sprite.anchorX));
      const py = Math.floor(w.y - (pos.y - sprite.anchorY));
      if (sprite.pixels.getAlpha(px, py) > 40) return o;
    }
    return null;
  }

  pointHandles(): PointHandle[] {
    const { map } = this.state;
    const c = map.customers;
    const out: PointHandle[] = [{ sel: { k: 'camera' }, p: map.cameraHome, color: COLORS.camera }];
    if (c.lotEntry) out.push({ sel: { k: 'lot' }, p: c.lotEntry, color: COLORS.lot });
    c.spawns.forEach((s, si) => s.path.forEach((p, i) => out.push({ sel: { k: 'spawnPt', s: si, i }, p, color: COLORS.spawn })));
    c.queue.forEach((p, i) => out.push({ sel: { k: 'queue', i }, p, color: COLORS.queue, label: String(i + 1) }));
    c.seats.forEach((s, si) => {
      s.approach.forEach((p, i) => out.push({ sel: { k: 'approach', s: si, i }, p, color: COLORS.seat }));
      out.push({ sel: { k: 'seat', s: si }, p: s, color: COLORS.seat, label: String(si + 1) });
    });
    return out;
  }

  hitPoint(sx: number, sy: number, radius = 8): Sel | null {
    if (!this.state.layers.anchors) return null;
    let best: { sel: Sel; d: number } | null = null;
    for (const h of this.pointHandles()) {
      const s = this.worldToScreen(tileToWorld(h.p.x, h.p.y));
      const d = Math.hypot(s.x - sx, s.y - sy);
      if (d <= radius && (!best || d <= best.d)) best = { sel: h.sel, d };
    }
    return best?.sel ?? null;
  }

  /** Semua pilihan yang titiknya ada di dalam kotak layar. */
  inRect(x0: number, y0: number, x1: number, y1: number): Sel[] {
    const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)];
    const [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)];
    const hit = (p: Point): boolean => {
      const s = this.worldToScreen(tileToWorld(p.x, p.y));
      return s.x >= ax && s.x <= bx && s.y >= ay && s.y <= by;
    };
    const out: Sel[] = [];
    for (const o of this.visibleObjects()) {
      const def = objectType(o.type);
      if (hit({ x: o.x + def.footprint.w / 32, y: o.y + def.footprint.d / 32 })) out.push({ k: 'object', uid: o.uid });
    }
    if (this.state.layers.anchors) for (const h of this.pointHandles()) if (hit(h.p)) out.push(h.sel);
    return out;
  }

  // ------------------------------------------------------------------ drawing

  requestDraw(): void {
    if (this.rafPending) return;
    this.rafPending = true;
    requestAnimationFrame(() => {
      this.rafPending = false;
      this.draw();
    });
  }

  private draw(): void {
    const ctx = this.ctx;
    const { view, map, layers } = this.state;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr * view.zoom, 0, 0, dpr * view.zoom, dpr * view.ox, dpr * view.oy);
    ctx.imageSmoothingEnabled = false;
    const px = 1 / view.zoom;

    if (!this.ground) this.ground = bakeGroundImage(map);
    ctx.drawImage(this.ground.canvas, -this.ground.originX, -this.ground.originY);
    for (const p of this.pending.values()) this.drawPendingTile(p.x, p.y, p.t);

    if (layers.grid) this.drawGrid(px);

    const selected = new Set(this.state.selection.map(selKey));
    for (const o of this.visibleObjects()) {
      this.drawObject(o, 1);
    }
    if (this.ghost) this.drawObject({ ...this.ghost, uid: -1, explicitVariant: true }, 0.6);

    // Alas objek
    for (const o of this.visibleObjects()) {
      const isSel = selected.has(`o${o.uid}`);
      const isHover = this.hover?.k === 'object' && this.hover.uid === o.uid;
      if (isSel || isHover || layers.footprints) {
        const def = objectType(o.type);
        const color = isSel ? COLORS.select : isHover ? COLORS.hover : def.blocking ? 'rgba(239,111,108,0.7)' : 'rgba(127,182,232,0.7)';
        this.drawFootprint(o, color, isSel ? 2 * px : px);
      }
    }
    if (this.ghost) this.drawFootprint({ ...this.ghost, uid: -1, explicitVariant: true }, this.ghost.valid ? COLORS.select : COLORS.blocked, 2 * px);

    if (layers.anchors) this.drawAnchors(px, selected);

    // Kuas terrain
    if (this.brushTiles.length) {
      ctx.lineWidth = 2 * px;
      ctx.strokeStyle = COLORS.select;
      for (const t of this.brushTiles) this.diamond(t.x, t.y, 1, 1, this.elev(t.x, t.y));
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.marquee) {
      const m = this.marquee;
      ctx.fillStyle = 'rgba(255, 207, 92, 0.12)';
      ctx.strokeStyle = COLORS.select;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.fillRect(Math.min(m.x0, m.x1), Math.min(m.y0, m.y1), Math.abs(m.x1 - m.x0), Math.abs(m.y1 - m.y0));
      ctx.strokeRect(Math.min(m.x0, m.x1) + 0.5, Math.min(m.y0, m.y1) + 0.5, Math.abs(m.x1 - m.x0), Math.abs(m.y1 - m.y0));
      ctx.setLineDash([]);
    }
  }

  private elev(x: number, y: number): number {
    const t = this.state.map.terrain[y]?.[x];
    return t ? TERRAINS[t].elevation : 0;
  }

  /** Jalur garis belah ketupat untuk area ubin (x, y, w, d) pada ketinggian z. */
  private diamond(x: number, y: number, w: number, d: number, z = 0, fill?: string): void {
    const ctx = this.ctx;
    const a = tileToWorld(x, y, z);
    const b = tileToWorld(x + w, y, z);
    const c = tileToWorld(x + w, y + d, z);
    const e = tileToWorld(x, y + d, z);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(e.x, e.y);
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    ctx.stroke();
  }

  private drawPendingTile(x: number, y: number, t: TerrainId): void {
    const ctx = this.ctx;
    const e = TERRAINS[t].elevation;
    const top = tileToWorld(x, y, e);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(top.x + 16, top.y + 8);
    ctx.lineTo(top.x, top.y + 16);
    ctx.lineTo(top.x - 16, top.y + 8);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(terrainSwatch(t), top.x - 16, top.y - 1);
    ctx.restore();
  }

  private drawGrid(px: number): void {
    const ctx = this.ctx;
    const m = this.state.map;
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = px;
    for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) this.diamond(x, y, 1, 1, this.elev(x, y));
  }

  private drawObject(o: EObject, alpha: number): void {
    const sprite = spriteFor(o.type, o.variant);
    if (!sprite) return;
    const pos = tileToWorld(o.x, o.y);
    const ctx = this.ctx;
    ctx.globalAlpha = alpha;
    ctx.drawImage(sprite.canvas, Math.round(pos.x - sprite.anchorX), Math.round(pos.y - sprite.anchorY));
    if (o.type === 'stove') {
      const fire = fireSprite();
      if (fire) ctx.drawImage(fire.canvas, Math.round(pos.x - fire.anchorX), Math.round(pos.y - fire.anchorY));
    }
    ctx.globalAlpha = 1;
  }

  private drawFootprint(o: EObject, color: string, width: number): void {
    const ctx = this.ctx;
    const def = objectType(o.type);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    if (def.footprint.w === 0) {
      const p = tileToWorld(o.x, o.y);
      ctx.beginPath();
      ctx.moveTo(p.x - 4, p.y);
      ctx.lineTo(p.x + 4, p.y);
      ctx.moveTo(p.x, p.y - 2);
      ctx.lineTo(p.x, p.y + 2);
      ctx.stroke();
      return;
    }
    this.diamond(o.x, o.y, def.footprint.w / 16, def.footprint.d / 16);
  }

  private drawAnchors(px: number, selected: Set<string>): void {
    const ctx = this.ctx;
    const { map } = this.state;
    const c = map.customers;
    const w = (p: Point): Point => tileToWorld(p.x, p.y);
    const line = (pts: Point[], color: string, dashed: boolean, width = 1.5): void => {
      if (pts.length < 2) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = width * px;
      ctx.setLineDash(dashed ? [4 * px, 3 * px] : []);
      ctx.beginPath();
      pts.forEach((p, i) => {
        const s = w(p);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    };

    const focusSeat = this.focusSeat();
    // Jalur datang
    c.spawns.forEach((s, si) => {
      const focus = this.state.selection.some((x) => x.k === 'spawnPt' && x.s === si) || (this.state.draft?.kind === 'spawn' && this.state.draft.s === si);
      line(s.path, COLORS.spawn, false, focus ? 2.5 : 1.5);
      const last = s.path[s.path.length - 1];
      const prev = s.path[s.path.length - 2];
      if (last && prev) this.arrow(w(prev), w(last), COLORS.spawn, px);
    });
    // Jalur kursi: semua tipis, kursi terpilih tebal.
    c.seats.forEach((s, si) => {
      const pts = [...(c.lotEntry ? [c.lotEntry] : []), ...s.approach, s];
      const focus = focusSeat === si;
      if (focus || this.state.layers.footprints) line(pts, COLORS.seat, true, focus ? 2 : 1);
    });
    line(c.queue, COLORS.queue, true);

    for (const h of this.pointHandles()) {
      const s = w(h.p);
      const isSel = selected.has(selKey(h.sel));
      const isHover = this.hover !== null && selKey(this.hover) === selKey(h.sel);
      const r =
        (h.sel.k === 'seat' || h.sel.k === 'queue' ? 4.5 : h.sel.k === 'camera' || h.sel.k === 'lot' ? 5 : 3) * px * Math.max(1, 2 / this.state.view.zoom);
      ctx.lineWidth = 1.5 * px;
      ctx.strokeStyle = '#140f1f';
      ctx.fillStyle = h.color;
      ctx.beginPath();
      if (h.sel.k === 'lot' || h.sel.k === 'queue') ctx.rect(s.x - r, s.y - r, r * 2, r * 2);
      else if (h.sel.k === 'camera') {
        ctx.moveTo(s.x, s.y - r * 1.3);
        ctx.lineTo(s.x + r * 1.3, s.y);
        ctx.lineTo(s.x, s.y + r * 1.3);
        ctx.lineTo(s.x - r * 1.3, s.y);
        ctx.closePath();
      } else ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (isSel || isHover) {
        ctx.strokeStyle = isSel ? COLORS.select : COLORS.hover;
        ctx.lineWidth = 2 * px;
        ctx.beginPath();
        ctx.arc(s.x, s.y, r + 3 * px, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (h.label && this.state.view.zoom >= 1.5) {
        ctx.font = `bold ${9 * px}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#140f1f';
        ctx.fillText(h.label, s.x, s.y + 0.5 * px);
      }
    }
  }

  /** Kursi yang jalurnya ditebalkan (dipilih, salah satu titik jalurnya dipilih, atau sedang digambar). */
  private focusSeat(): number | null {
    const d = this.state.draft;
    if (d?.kind === 'approach') return d.s;
    for (const s of this.state.selection) if (s.k === 'seat' || s.k === 'approach') return s.s;
    return null;
  }

  private arrow(from: Point, to: Point, color: string, px: number): void {
    const ctx = this.ctx;
    const a = Math.atan2(to.y - from.y, to.x - from.x);
    const L = 6 * px * Math.max(1, 2 / this.state.view.zoom);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - L * Math.cos(a - 0.45), to.y - L * Math.sin(a - 0.45));
    ctx.lineTo(to.x - L * Math.cos(a + 0.45), to.y - L * Math.sin(a + 0.45));
    ctx.closePath();
    ctx.fill();
  }
}

/** Urutan gambar sama dengan WorldBuilder di game. */
export function depthOf(o: { type: ObjectTypeId; x: number; y: number }): number {
  return o.type === 'seller' ? entityDepth(o.x, o.y) : objectDepth(objectType(o.type), o.x, o.y);
}
