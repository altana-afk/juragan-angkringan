/**
 * Studio objek: gambar objek sendiri piksel per piksel, impor PNG, atau buat dari deskripsi
 * (prosedural / AI), lalu atur alas, titik pijak, perilaku, animasi, dan lampu malam.
 */
import { CUSTOM_ID_PATTERN, type CustomObjectDef } from '../../../src/world/customObjects';
import { isObjectTypeId } from '../../../src/world/objectTypes';
import { ApiError, fetchProviders, generateRemote, type ProviderInfo } from './api';
import { customEntry, decodeImage, persistCustom, rasterToDataUrl, removeCustom } from './customStore';
import { h } from './dom';
import { gamePalette, generateFromDescription } from './procedural';
import {
  cloneRaster,
  contentBounds,
  fillPolygon,
  fitIntoFrame,
  floodFillRaster,
  getPixel,
  joinFrames,
  line,
  makeRaster,
  resizeCanvas,
  rgbToHex,
  setPixel,
  shiftRaster,
  type Raster,
} from './raster';

type StudioTool = 'pencil' | 'eraser' | 'fill' | 'picker' | 'line' | 'rect' | 'move' | 'anchor' | 'light';

interface LightDraft {
  px: number;
  py: number;
  radius: number;
  color: string;
  intensity: number;
  flicker: number;
  glow: boolean;
}

interface Doc {
  id: string;
  label: string;
  width: number;
  height: number;
  frames: Raster[];
  frameMs: number;
  anchorX: number;
  anchorY: number;
  autoAnchor: boolean;
  /** Alas dalam unit (16 = 1 ubin). */
  fw: number;
  fd: number;
  depthMode: 'center' | 'front' | 'ground';
  blocking: boolean;
  seating: boolean;
  seatLift: number;
  lights: LightDraft[];
}

const TOOLS: { id: StudioTool; label: string; key: string; help: string }[] = [
  { id: 'pencil', label: 'Pensil', key: 'B', help: 'Klik/seret untuk menggambar. Klik kanan = hapus.' },
  { id: 'eraser', label: 'Hapus', key: 'E', help: 'Klik/seret untuk menghapus piksel.' },
  { id: 'fill', label: 'Ember', key: 'G', help: 'Isi area yang warnanya sama.' },
  { id: 'picker', label: 'Pipet', key: 'I', help: 'Ambil warna dari gambar (Alt+klik juga bisa).' },
  { id: 'line', label: 'Garis', key: 'L', help: 'Seret untuk membuat garis lurus.' },
  { id: 'rect', label: 'Kotak', key: 'R', help: 'Seret untuk membuat kotak. Shift = kotak terisi.' },
  { id: 'move', label: 'Geser', key: 'M', help: 'Seret untuk menggeser seluruh isi frame.' },
  { id: 'anchor', label: 'Titik pijak', key: 'A', help: 'Klik titik yang menempel ke sudut belakang alas (belah ketupat kuning).' },
  { id: 'light', label: 'Lampu', key: 'T', help: 'Klik untuk memasang lampu malam; seret lampu untuk memindah.' },
];

export interface StudioOptions {
  /** Id objek kustom yang diedit, atau null untuk objek baru. */
  editId: string | null;
  onSaved(id: string): void;
  onDeleted(id: string): void;
  isUsedInOpenMap(id: string): boolean;
}

const slugId = (label: string): string =>
  `c_${
    label
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9\s_-]/g, '')
      .trim()
      .replace(/[\s_-]+/g, '_')
      .slice(0, 40) || 'objek'
  }`;

function autoAnchor(d: Pick<Doc, 'width' | 'height' | 'fw' | 'fd'>): { x: number; y: number } {
  // Belah ketupat alas: x dari -fd..+fw terhadap titik pijak, y sampai (fw+fd)/2 di bawahnya.
  return { x: Math.round((d.width - (d.fw + d.fd)) / 2 + d.fd), y: Math.max(0, Math.round(d.height - 2 - (d.fw + d.fd) / 2)) };
}

function blankDoc(): Doc {
  const d: Doc = {
    id: '',
    label: '',
    width: 40,
    height: 48,
    frames: [makeRaster(40, 48)],
    frameMs: 200,
    anchorX: 0,
    anchorY: 0,
    autoAnchor: true,
    fw: 16,
    fd: 16,
    depthMode: 'center',
    blocking: true,
    seating: false,
    seatLift: 6,
    lights: [],
  };
  const a = autoAnchor(d);
  d.anchorX = a.x;
  d.anchorY = a.y;
  return d;
}

function docFromEntry(id: string): Doc | null {
  const e = customEntry(id);
  if (!e) return null;
  const c = e.def;
  return {
    id: c.id,
    label: c.label,
    width: c.frameWidth,
    height: c.frameHeight,
    frames: e.frames.map(cloneRaster),
    frameMs: c.frameMs,
    anchorX: c.anchorX,
    anchorY: c.anchorY,
    autoAnchor: false,
    fw: c.footprint.w,
    fd: c.footprint.d,
    depthMode: c.depthMode,
    blocking: c.blocking,
    seating: c.seating,
    seatLift: c.seatLift,
    lights: c.lights.map((l) => ({ ...l })),
  };
}

let providersCache: ProviderInfo[] | null = null;

export function openStudio(opts: StudioOptions): void {
  const existing = opts.editId ? docFromEntry(opts.editId) : null;
  let doc: Doc = existing ?? blankDoc();
  const isNew = !existing;
  let idTouched = !isNew;
  let frame = 0;
  let tool: StudioTool = 'pencil';
  let color = '#c8443a';
  let brush = 1;
  let mirror = false;
  let showGrid = true;
  let showOnion = false;
  let showFootprint = true;
  let zoom = 8;
  let dirty = false;
  const recent: string[] = [];
  const undo: Doc[] = [];
  const redo: Doc[] = [];
  let playing: ReturnType<typeof setInterval> | null = null;
  let selectedLight = -1;

  const snapshot = (): void => {
    undo.push(structuredClone(doc));
    if (undo.length > 80) undo.shift();
    redo.length = 0;
    dirty = true;
  };
  const cur = (): Raster => doc.frames[frame]!;

  // ------------------------------------------------------------------ DOM
  const status = h('p', { class: 'studio-status', role: 'status', 'aria-live': 'polite' });
  const say = (msg: string, error = false): void => {
    status.textContent = msg;
    status.classList.toggle('is-error', error);
  };

  const labelInput = h('input', { type: 'text', id: 'studio-label', maxlength: 60, placeholder: 'mis. Gerobak bakso', value: doc.label });
  const idInput = h('input', { type: 'text', id: 'studio-id', value: doc.id, readonly: !isNew, spellcheck: 'false', pattern: 'c_[a-z0-9]+(_[a-z0-9]+)*' });
  labelInput.addEventListener('input', () => {
    doc.label = labelInput.value;
    dirty = true;
    if (!idTouched) idInput.value = doc.id = slugId(labelInput.value);
  });
  idInput.addEventListener('input', () => {
    idTouched = true;
    doc.id = idInput.value.trim();
  });

  const canvas = h('canvas', { class: 'studio-canvas', tabindex: '0', 'aria-label': 'Kanvas piksel objek' });
  const ctx = canvas.getContext('2d')!;
  const wrap = h('div', { class: 'studio-canvas-wrap' }, canvas);
  const zoomLabel = h('output', { class: 'zoom-label' });
  const framesStrip = h('div', { class: 'studio-frames', role: 'group', 'aria-label': 'Frame animasi' });
  const toolHelp = h('p', { class: 'help studio-tool-help' });
  const side = h('div', { class: 'studio-side' });

  const toolButtons = TOOLS.map((t) =>
    h(
      'button',
      { type: 'button', class: 'tool tool-small', 'aria-pressed': 'false', title: `${t.label} (${t.key})`, onclick: () => setTool(t.id) },
      h('span', {}, t.label),
      h('kbd', {}, t.key),
    ),
  );
  const toggle = (label: string, get: () => boolean, set: (v: boolean) => void): HTMLButtonElement => {
    const b = h('button', { type: 'button', class: 'layer', 'aria-pressed': String(get()) }, label);
    b.addEventListener('click', () => {
      set(!get());
      b.setAttribute('aria-pressed', String(get()));
      draw();
    });
    return b;
  };
  const brushSeg = h(
    'div',
    { class: 'seg', role: 'group', 'aria-label': 'Ukuran kuas' },
    ...[1, 2, 3].map((n) =>
      h(
        'button',
        {
          type: 'button',
          'aria-pressed': String(brush === n),
          onclick: (e: Event) => {
            brush = n;
            brushSeg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
          },
        },
        `${n}px`,
      ),
    ),
  );

  const dialog = h(
    'dialog',
    { class: 'dialog studio', 'aria-labelledby': 'studio-title' },
    h(
      'header',
      { class: 'studio-head' },
      h('h2', { id: 'studio-title' }, isNew ? 'Objek baru' : `Edit objek`),
      h('div', { class: 'field studio-name' }, h('label', { for: 'studio-label' }, 'Nama'), labelInput),
      h('div', { class: 'field studio-name' }, h('label', { for: 'studio-id' }, isNew ? 'Id (dipakai di peta)' : 'Id (tetap)'), idInput),
      h(
        'div',
        { class: 'studio-actions' },
        !isNew ? h('button', { type: 'button', class: 'btn btn-danger', onclick: () => void doDelete() }, 'Hapus objek') : null,
        h('button', { type: 'button', class: 'btn', onclick: () => close() }, 'Batal'),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => void doSave() }, 'Simpan objek'),
      ),
    ),
    h(
      'div',
      { class: 'studio-body' },
      h(
        'div',
        { class: 'studio-tools', role: 'toolbar', 'aria-label': 'Alat gambar' },
        ...toolButtons,
        h('p', { class: 'rail-title' }, 'Kuas'),
        brushSeg,
        h('p', { class: 'rail-title' }, 'Tampilan'),
        toggle(
          'Cermin X',
          () => mirror,
          (v) => (mirror = v),
        ),
        toggle(
          'Grid',
          () => showGrid,
          (v) => (showGrid = v),
        ),
        toggle(
          'Alas',
          () => showFootprint,
          (v) => (showFootprint = v),
        ),
        toggle(
          'Frame sebelumnya',
          () => showOnion,
          (v) => (showOnion = v),
        ),
      ),
      h(
        'div',
        { class: 'studio-center' },
        h(
          'div',
          { class: 'studio-zoom' },
          h('button', { type: 'button', class: 'btn btn-square', 'aria-label': 'Perkecil', onclick: () => setZoom(zoom - (zoom > 8 ? 2 : 1)) }, '−'),
          zoomLabel,
          h('button', { type: 'button', class: 'btn btn-square', 'aria-label': 'Perbesar', onclick: () => setZoom(zoom + (zoom >= 8 ? 2 : 1)) }, '+'),
          toolHelp,
        ),
        wrap,
        framesStrip,
        status,
      ),
      side,
    ),
  );
  document.body.append(dialog);

  // ------------------------------------------------------------------ gambar kanvas
  const off = document.createElement('canvas');
  const offCtx = off.getContext('2d')!;
  let preview: { kind: 'line' | 'rect'; x0: number; y0: number; x1: number; y1: number; filled: boolean } | null = null;
  let hover: { x: number; y: number } | null = null;

  function rasterCanvas(r: Raster): HTMLCanvasElement {
    off.width = r.width;
    off.height = r.height;
    offCtx.putImageData(new ImageData(new Uint8ClampedArray(r.data), r.width, r.height), 0, 0);
    return off;
  }

  function draw(): void {
    const W = doc.width * zoom;
    const H = doc.height * zoom;
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    ctx.imageSmoothingEnabled = false;
    // Papan catur = transparan.
    const cell = Math.max(4, zoom);
    for (let y = 0; y < H; y += cell)
      for (let x = 0; x < W; x += cell) {
        ctx.fillStyle = ((x + y) / cell) % 2 ? '#3a2f40' : '#2f2535';
        ctx.fillRect(x, y, cell, cell);
      }
    if (showOnion && doc.frames.length > 1) {
      ctx.globalAlpha = 0.3;
      ctx.drawImage(rasterCanvas(doc.frames[(frame - 1 + doc.frames.length) % doc.frames.length]!), 0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(rasterCanvas(cur()), 0, 0, W, H);

    if (preview) {
      const tmp = cloneRaster(cur());
      applyShape(tmp, preview);
      ctx.drawImage(rasterCanvas(tmp), 0, 0, W, H);
    }
    if (showGrid && zoom >= 6) {
      ctx.strokeStyle = 'rgba(255,243,223,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= doc.width; x++) {
        ctx.moveTo(x * zoom + 0.5, 0);
        ctx.lineTo(x * zoom + 0.5, H);
      }
      for (let y = 0; y <= doc.height; y++) {
        ctx.moveTo(0, y * zoom + 0.5);
        ctx.lineTo(W, y * zoom + 0.5);
      }
      ctx.stroke();
    }
    const ax = (doc.anchorX + 0.5) * zoom;
    const ay = (doc.anchorY + 0.5) * zoom;
    if (showFootprint) {
      // Belah ketupat alas (unit = piksel: x = u - v, y = (u + v) / 2).
      const P = (u: number, v: number): [number, number] => [ax + (u - v) * zoom, ay + ((u + v) / 2) * zoom];
      ctx.strokeStyle = '#ffcf5c';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      const pts = [P(0, 0), P(doc.fw, 0), P(doc.fw, doc.fd), P(0, doc.fd)];
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Titik pijak
    ctx.strokeStyle = '#ffcf5c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ax - zoom * 1.5, ay);
    ctx.lineTo(ax + zoom * 1.5, ay);
    ctx.moveTo(ax, ay - zoom * 1.5);
    ctx.lineTo(ax, ay + zoom * 1.5);
    ctx.stroke();
    // Lampu
    doc.lights.forEach((l, i) => {
      const x = (l.px + 0.5) * zoom;
      const y = (l.py + 0.5) * zoom;
      ctx.strokeStyle = l.color;
      ctx.globalAlpha = 0.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(x, y, Math.min(l.radius, 80) * zoom * 0.25, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = l.color;
      ctx.strokeStyle = i === selectedLight ? '#ffffff' : '#140f1f';
      ctx.beginPath();
      ctx.arc(x, y, Math.max(4, zoom * 0.6), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
    if (hover && (tool === 'pencil' || tool === 'eraser')) {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1;
      const o = Math.floor((brush - 1) / 2);
      ctx.strokeRect((hover.x - o) * zoom + 0.5, (hover.y - o) * zoom + 0.5, brush * zoom - 1, brush * zoom - 1);
    }
    zoomLabel.textContent = `${zoom}×`;
  }

  function applyShape(r: Raster, s: NonNullable<typeof preview>): void {
    if (s.kind === 'line') line(r, s.x0, s.y0, s.x1, s.y1, (x, y) => stamp(r, x, y, color));
    else {
      const [x0, x1] = [Math.min(s.x0, s.x1), Math.max(s.x0, s.x1)];
      const [y0, y1] = [Math.min(s.y0, s.y1), Math.max(s.y0, s.y1)];
      if (s.filled)
        fillPolygon(
          r,
          [
            [x0, y0],
            [x1 + 1, y0],
            [x1 + 1, y1 + 1],
            [x0, y1 + 1],
          ],
          color,
        );
      else {
        line(r, x0, y0, x1, y0, (x, y) => stamp(r, x, y, color));
        line(r, x0, y1, x1, y1, (x, y) => stamp(r, x, y, color));
        line(r, x0, y0, x0, y1, (x, y) => stamp(r, x, y, color));
        line(r, x1, y0, x1, y1, (x, y) => stamp(r, x, y, color));
      }
    }
  }

  function stamp(r: Raster, x: number, y: number, c: string | null): void {
    const o = Math.floor((brush - 1) / 2);
    for (let dy = 0; dy < brush; dy++)
      for (let dx = 0; dx < brush; dx++) {
        setPixel(r, x - o + dx, y - o + dy, c);
        if (mirror) setPixel(r, r.width - 1 - (x - o + dx), y - o + dy, c);
      }
  }

  // ------------------------------------------------------------------ input kanvas
  const pixelAt = (e: PointerEvent): { x: number; y: number } => {
    const r = canvas.getBoundingClientRect();
    return { x: Math.floor(((e.clientX - r.left) / r.width) * doc.width), y: Math.floor(((e.clientY - r.top) / r.height) * doc.height) };
  };
  const lightAt = (p: { x: number; y: number }): number => doc.lights.findIndex((l) => Math.abs(l.px - p.x) <= 1 && Math.abs(l.py - p.y) <= 1);

  let drag:
    | { kind: 'paint'; erase: boolean; last: { x: number; y: number } }
    | { kind: 'shape' }
    | { kind: 'move'; from: { x: number; y: number }; base: Raster }
    | { kind: 'light'; index: number }
    | null = null;

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    const p = pixelAt(e);
    if (e.altKey || tool === 'picker') {
      const px = getPixel(cur(), p.x, p.y);
      if (px[3]! > 0) pickColor(rgbToHex(px[0]!, px[1]!, px[2]!));
      if (tool === 'picker') setTool('pencil');
      return;
    }
    switch (tool) {
      case 'pencil':
      case 'eraser': {
        snapshot();
        const erase = tool === 'eraser' || e.button === 2;
        stamp(cur(), p.x, p.y, erase ? null : color);
        drag = { kind: 'paint', erase, last: p };
        if (!erase) rememberColor(color);
        break;
      }
      case 'fill':
        snapshot();
        if (!floodFillRaster(cur(), p.x, p.y, e.button === 2 ? null : color)) undo.pop();
        rememberColor(color);
        break;
      case 'line':
      case 'rect':
        preview = { kind: tool, x0: p.x, y0: p.y, x1: p.x, y1: p.y, filled: e.shiftKey };
        drag = { kind: 'shape' };
        break;
      case 'move':
        snapshot();
        drag = { kind: 'move', from: p, base: cloneRaster(cur()) };
        break;
      case 'anchor':
        snapshot();
        doc.anchorX = p.x;
        doc.anchorY = p.y;
        doc.autoAnchor = false;
        renderSide();
        say(`Titik pijak di (${p.x}, ${p.y}).`);
        break;
      case 'light': {
        const i = lightAt(p);
        snapshot();
        if (i >= 0) {
          selectedLight = i;
          drag = { kind: 'light', index: i };
        } else {
          doc.lights.push({ px: p.x, py: p.y, radius: 60, color: '#ffd27a', intensity: 0.8, flicker: 0.05, glow: true });
          selectedLight = doc.lights.length - 1;
          drag = { kind: 'light', index: selectedLight };
          say('Lampu dipasang. Atur warna & jangkauannya di panel kanan.');
        }
        renderSide();
        break;
      }
    }
    draw();
    renderFrames();
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pixelAt(e);
    hover = p;
    if (drag?.kind === 'paint') {
      const c = drag.erase ? null : color;
      line(cur(), drag.last.x, drag.last.y, p.x, p.y, (x, y) => stamp(cur(), x, y, c));
      drag.last = p;
    } else if (drag?.kind === 'shape' && preview) {
      preview.x1 = p.x;
      preview.y1 = p.y;
      preview.filled = e.shiftKey;
    } else if (drag?.kind === 'move') {
      doc.frames[frame] = shiftRaster(drag.base, p.x - drag.from.x, p.y - drag.from.y);
    } else if (drag?.kind === 'light') {
      const l = doc.lights[drag.index];
      if (l) {
        l.px = p.x;
        l.py = p.y;
      }
    }
    draw();
  });
  const end = (): void => {
    if (drag?.kind === 'shape' && preview) {
      snapshot();
      applyShape(cur(), preview);
      preview = null;
    }
    if (drag) renderFrames();
    if (drag?.kind === 'light') renderSide();
    drag = null;
    draw();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => {
    hover = null;
    draw();
  });
  wrap.addEventListener(
    'wheel',
    (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom(zoom + (e.deltaY < 0 ? 1 : -1));
    },
    { passive: false },
  );

  dialog.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      e.shiftKey ? doRedo() : doUndo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      doRedo();
      return;
    }
    if (mod) return;
    const t2 = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
    if (t2) setTool(t2.id);
    else if (e.key === '+' || e.key === '=') setZoom(zoom + 1);
    else if (e.key === '-') setZoom(zoom - 1);
    else if ((e.key === 'Delete' || e.key === 'Backspace') && tool === 'light' && selectedLight >= 0) {
      snapshot();
      doc.lights.splice(selectedLight, 1);
      selectedLight = -1;
      renderSide();
      draw();
    }
  });
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });

  function doUndo(): void {
    const prev = undo.pop();
    if (!prev) return;
    redo.push(structuredClone(doc));
    doc = prev;
    frame = Math.min(frame, doc.frames.length - 1);
    refreshAll();
    say('Diurungkan.');
  }
  function doRedo(): void {
    const next = redo.pop();
    if (!next) return;
    undo.push(structuredClone(doc));
    doc = next;
    frame = Math.min(frame, doc.frames.length - 1);
    refreshAll();
    say('Diulangi.');
  }

  function setTool(t: StudioTool): void {
    tool = t;
    TOOLS.forEach((x, i) => toolButtons[i]!.setAttribute('aria-pressed', String(x.id === t)));
    toolHelp.textContent = TOOLS.find((x) => x.id === t)?.help ?? '';
    canvas.style.cursor = t === 'move' ? 'move' : 'crosshair';
  }
  function setZoom(z: number): void {
    zoom = Math.max(2, Math.min(24, Math.round(z)));
    draw();
  }
  function fitZoom(): void {
    const r = wrap.getBoundingClientRect();
    const z = Math.floor(Math.min((r.width - 16) / doc.width, (r.height - 16) / doc.height));
    setZoom(Number.isFinite(z) && z > 0 ? z : 8);
  }

  // ------------------------------------------------------------------ frame
  function renderFrames(): void {
    framesStrip.replaceChildren(
      ...doc.frames.map((f, i) => {
        const thumb = h('canvas', { width: f.width, height: f.height, 'aria-hidden': 'true' });
        thumb.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(f.data), f.width, f.height), 0, 0);
        return h(
          'button',
          {
            type: 'button',
            class: 'studio-frame',
            'aria-pressed': String(i === frame),
            'aria-label': `Frame ${i + 1}`,
            onclick: () => ((frame = i), renderFrames(), draw()),
          },
          thumb,
          h('span', {}, String(i + 1)),
        );
      }),
      h(
        'div',
        { class: 'studio-frame-actions' },
        h('button', { type: 'button', class: 'btn btn-small', onclick: () => addFrame(false) }, 'Frame baru'),
        h('button', { type: 'button', class: 'btn btn-small', onclick: () => addFrame(true) }, 'Gandakan'),
        h('button', { type: 'button', class: 'btn btn-small btn-danger', disabled: doc.frames.length < 2, onclick: deleteFrame }, 'Hapus frame'),
        h(
          'button',
          { type: 'button', class: 'btn btn-small', disabled: doc.frames.length < 2, 'aria-pressed': String(playing !== null), onclick: togglePlay },
          playing ? 'Berhenti' : 'Putar',
        ),
        h(
          'label',
          { class: 'studio-ms' },
          'ms/frame ',
          h('input', {
            type: 'number',
            min: 30,
            max: 5000,
            step: 10,
            value: String(doc.frameMs),
            'aria-label': 'Lama tiap frame (milidetik)',
            onchange: (e: Event) => {
              snapshot();
              doc.frameMs = Math.max(30, Math.min(5000, Number((e.target as HTMLInputElement).value) || 200));
              if (playing) (togglePlay(), togglePlay());
            },
          }),
        ),
      ),
    );
  }
  function addFrame(copy: boolean): void {
    snapshot();
    doc.frames.splice(frame + 1, 0, copy ? cloneRaster(cur()) : makeRaster(doc.width, doc.height));
    frame++;
    renderFrames();
    draw();
  }
  function deleteFrame(): void {
    if (doc.frames.length < 2) return;
    snapshot();
    doc.frames.splice(frame, 1);
    frame = Math.min(frame, doc.frames.length - 1);
    renderFrames();
    draw();
  }
  function togglePlay(): void {
    if (playing) {
      clearInterval(playing);
      playing = null;
    } else if (doc.frames.length > 1) {
      playing = setInterval(() => {
        frame = (frame + 1) % doc.frames.length;
        draw();
      }, doc.frameMs);
    }
    renderFrames();
  }

  // ------------------------------------------------------------------ warna
  const colorInput = h('input', { type: 'color', value: color, 'aria-label': 'Warna aktif' });
  colorInput.addEventListener('input', () => (color = colorInput.value));
  function pickColor(c: string): void {
    color = c;
    colorInput.value = c;
    say(`Warna ${c}.`);
  }
  function rememberColor(c: string): void {
    if (recent[0] === c) return;
    const i = recent.indexOf(c);
    if (i >= 0) recent.splice(i, 1);
    recent.unshift(c);
    recent.length = Math.min(recent.length, 12);
    renderRecent();
  }
  const recentBox = h('div', { class: 'palette' });
  function renderRecent(): void {
    recentBox.replaceChildren(...recent.map((c) => swatchButton(c)));
  }
  const swatchButton = (c: string): HTMLButtonElement =>
    h('button', { type: 'button', class: 'pal', style: `background:${c}`, 'aria-label': `Warna ${c}`, title: c, onclick: () => pickColor(c) });

  // ------------------------------------------------------------------ panel samping
  const promptInput = h('textarea', { rows: 3, id: 'studio-prompt', placeholder: 'mis. gerobak bakso merah atap biru, lampu menyala' });
  const providerSelect = h('select', { id: 'studio-provider' });
  const providerNote = h('p', { class: 'help' });
  const removeBgBox = h('input', { type: 'checkbox', id: 'studio-rmbg', checked: true });
  const paletteBox = h('input', { type: 'checkbox', id: 'studio-pal', checked: true });
  const targetSelect = h(
    'select',
    { id: 'studio-target' },
    h('option', { value: 'replace' }, 'Ganti frame ini'),
    h('option', { value: 'add' }, 'Tambah sebagai frame baru'),
  );
  const genButton = h('button', { type: 'button', class: 'btn btn-primary', onclick: () => void doGenerate() }, 'Buat gambar');
  const providerHint = (): void => {
    const p = providersCache?.find((x) => x.id === providerSelect.value);
    providerNote.textContent = p?.note ?? '';
    const proc = providerSelect.value === 'procedural';
    removeBgBox.disabled = proc;
    targetSelect.disabled = proc;
    genButton.disabled = !!p && !p.ready;
  };
  providerSelect.addEventListener('change', providerHint);

  function fillProviders(list: ProviderInfo[]): void {
    const keep = providerSelect.value;
    providerSelect.replaceChildren(...list.map((p) => h('option', { value: p.id, disabled: !p.ready }, p.ready ? p.label : `${p.label} (belum diatur)`)));
    providerSelect.value = list.some((p) => p.id === keep && p.ready) ? keep : 'procedural';
    providerHint();
  }

  function renderSide(): void {
    const num = (value: number, onChange: (v: number) => void, attrs: Record<string, string | number> = {}): HTMLInputElement =>
      h('input', {
        type: 'number',
        value: String(value),
        ...attrs,
        onchange: (e: Event) => {
          const v = Number((e.target as HTMLInputElement).value.replace(',', '.'));
          if (Number.isFinite(v)) onChange(v);
        },
      });
    const fieldOf = (label: string, input: HTMLElement, id: string): HTMLElement => {
      input.id = id;
      return h('div', { class: 'field' }, h('label', { for: id }, label), input);
    };
    const check = (label: string, value: boolean, onChange: (v: boolean) => void, id: string): HTMLElement =>
      h(
        'label',
        { class: 'check', for: id },
        h('input', { type: 'checkbox', id, checked: value, onchange: (e: Event) => onChange((e.target as HTMLInputElement).checked) }),
        h('span', {}, label),
      );

    const wIn = num(doc.width, () => undefined, { min: 4, max: 256 });
    const hIn = num(doc.height, () => undefined, { min: 4, max: 256 });
    const lights = doc.lights.map((l, i) =>
      h(
        'div',
        { class: 'card', 'aria-current': String(i === selectedLight) },
        h(
          'div',
          { class: 'card-head' },
          h('span', { class: 'dot', style: `background:${l.color}`, 'aria-hidden': 'true' }),
          h('strong', {}, `Lampu ${i + 1}`),
          h('span', { class: 'meta' }, `(${l.px}, ${l.py})`),
        ),
        h(
          'div',
          { class: 'field-row' },
          fieldOf(
            'Warna',
            h('input', { type: 'color', value: l.color, onchange: (e: Event) => edit(() => (l.color = (e.target as HTMLInputElement).value)) }),
            `lc-${i}`,
          ),
          fieldOf(
            'Jangkauan',
            num(l.radius, (v) => edit(() => (l.radius = Math.max(4, Math.min(400, v)))), { min: 4, max: 400, step: 5 }),
            `lr-${i}`,
          ),
          fieldOf(
            'Terang',
            num(l.intensity, (v) => edit(() => (l.intensity = Math.max(0, Math.min(1, v)))), { min: 0, max: 1, step: 0.05 }),
            `li-${i}`,
          ),
          fieldOf(
            'Kedip',
            num(l.flicker, (v) => edit(() => (l.flicker = Math.max(0, Math.min(1, v)))), { min: 0, max: 1, step: 0.05 }),
            `lf-${i}`,
          ),
        ),
        check('Pendar bohlam', l.glow, (v) => edit(() => (l.glow = v)), `lg-${i}`),
        h('button', { type: 'button', class: 'btn btn-small btn-danger', onclick: () => edit(() => doc.lights.splice(i, 1), true) }, 'Hapus lampu'),
      ),
    );

    side.replaceChildren(
      h(
        'section',
        { class: 'studio-sec' },
        h('h3', {}, 'Buat dari deskripsi'),
        h('div', { class: 'field' }, h('label', { for: 'studio-prompt' }, 'Deskripsi'), promptInput),
        h('div', { class: 'field' }, h('label', { for: 'studio-provider' }, 'Mesin'), providerSelect),
        providerNote,
        h('div', { class: 'field' }, h('label', { for: 'studio-target' }, 'Hasil AI'), targetSelect),
        h('label', { class: 'check', for: 'studio-rmbg' }, removeBgBox, h('span', {}, 'Buang latar belakang')),
        h('label', { class: 'check', for: 'studio-pal' }, paletteBox, h('span', {}, 'Sesuaikan warna ke palet game')),
        genButton,
        h(
          'p',
          { class: 'help' },
          'Prosedural mengganti seluruh objek (ukuran, alas, lampu) dengan bentuk dasar. Hasil AI diperkecil ke ukuran kanvas sekarang. Semua hasil bisa diedit piksel per piksel.',
        ),
      ),
      h(
        'section',
        { class: 'studio-sec' },
        h('h3', {}, 'Warna'),
        h('div', { class: 'studio-color' }, colorInput, h('span', { class: 'help' }, 'Klik kanan di kanvas = hapus piksel.')),
        h('p', { class: 'rail-title' }, 'Terakhir dipakai'),
        recentBox,
        h('p', { class: 'rail-title' }, 'Palet game'),
        h('div', { class: 'palette' }, ...gamePalette().map(swatchButton)),
      ),
      h(
        'section',
        { class: 'studio-sec' },
        h('h3', {}, 'Ukuran & alas'),
        h('div', { class: 'field-row' }, fieldOf('Lebar kanvas', wIn, 'sz-w'), fieldOf('Tinggi kanvas', hIn, 'sz-h')),
        h('button', { type: 'button', class: 'btn btn-small', onclick: () => resizeDoc(Number(wIn.value), Number(hIn.value)) }, 'Ubah ukuran kanvas'),
        h('p', { class: 'help' }, 'Isi tetap rata tengah-bawah.'),
        h(
          'div',
          { class: 'field-row' },
          fieldOf(
            'Alas lebar (ubin)',
            num(doc.fw / 16, (v) => edit(() => (doc.fw = Math.round(Math.max(0, Math.min(32, v)) * 16)), true), { min: 0, max: 32, step: 0.25 }),
            'fp-w',
          ),
          fieldOf(
            'Alas dalam (ubin)',
            num(doc.fd / 16, (v) => edit(() => (doc.fd = Math.round(Math.max(0, Math.min(32, v)) * 16)), true), { min: 0, max: 32, step: 0.25 }),
            'fp-d',
          ),
        ),
        fieldOf(
          'Urutan gambar',
          h(
            'select',
            { onchange: (e: Event) => edit(() => (doc.depthMode = (e.target as HTMLSelectElement).value as Doc['depthMode'])) },
            h('option', { value: 'center', selected: doc.depthMode === 'center' }, 'Normal (tengah alas)'),
            h('option', { value: 'front', selected: doc.depthMode === 'front' }, 'Tinggi/atap (depan alas)'),
            h('option', { value: 'ground', selected: doc.depthMode === 'ground' }, 'Di lantai (tikar, karpet)'),
          ),
          'fp-depth',
        ),
        check('Titik pijak otomatis (tengah-bawah)', doc.autoAnchor, (v) => edit(() => (doc.autoAnchor = v), true), 'fp-auto'),
        h('p', { class: 'help' }, `Titik pijak (${doc.anchorX}, ${doc.anchorY}). Belah ketupat kuning = alas di peta.`),
      ),
      h(
        'section',
        { class: 'studio-sec' },
        h('h3', {}, 'Perilaku di game'),
        check('Menghalangi jalan', doc.blocking, (v) => edit(() => (doc.blocking = v)), 'bh-block'),
        check('Bisa jadi tempat duduk', doc.seating, (v) => edit(() => (doc.seating = v), true), 'bh-seat'),
        doc.seating
          ? fieldOf(
              'Tinggi dudukan (piksel, 0 = lesehan)',
              num(doc.seatLift, (v) => edit(() => (doc.seatLift = Math.max(0, Math.min(40, Math.round(v))))), { min: 0, max: 40 }),
              'bh-lift',
            )
          : null,
        doc.seating ? h('p', { class: 'help' }, 'Setelah dipasang di peta, taruh Kursi (alat Titik) di atas objek ini.') : null,
      ),
      h(
        'section',
        { class: 'studio-sec' },
        h('h3', {}, `Lampu malam (${doc.lights.length})`),
        h('p', { class: 'help' }, 'Pakai alat Lampu (T) lalu klik bohlam di gambar. Lampu menyala mengikuti jam sore-malam di game.'),
        ...lights,
      ),
      h(
        'section',
        { class: 'studio-sec' },
        h('h3', {}, 'File'),
        h(
          'div',
          { class: 'field' },
          h('label', { for: 'studio-import' }, 'Impor PNG (mis. dari Aseprite)'),
          h('input', { type: 'file', id: 'studio-import', accept: 'image/png,image/gif,image/webp', onchange: (e: Event) => void importFile(e) }),
        ),
        h('p', { class: 'help' }, 'Lembar dengan beberapa frame berjajar ke kanan (lebar = kelipatan tinggi kanvas) dipecah otomatis.'),
        h('button', { type: 'button', class: 'btn btn-small', onclick: downloadPng }, 'Unduh PNG'),
      ),
    );
    if (providersCache) fillProviders(providersCache);
  }

  function edit(fn: () => void, rerender = false): void {
    snapshot();
    fn();
    if (doc.autoAnchor) {
      const a = autoAnchor(doc);
      doc.anchorX = a.x;
      doc.anchorY = a.y;
    }
    if (rerender) renderSide();
    draw();
  }

  function resizeDoc(w: number, hh: number): void {
    w = Math.max(4, Math.min(256, Math.round(w) || doc.width));
    hh = Math.max(4, Math.min(256, Math.round(hh) || doc.height));
    if (w === doc.width && hh === doc.height) return;
    snapshot();
    const ox = Math.floor((w - doc.width) / 2);
    const oy = hh - doc.height;
    doc.frames = doc.frames.map((f) => resizeCanvas(f, w, hh, ox, oy));
    doc.anchorX += ox;
    doc.anchorY += oy;
    doc.lights.forEach((l) => {
      l.px += ox;
      l.py += oy;
    });
    doc.width = w;
    doc.height = hh;
    if (doc.autoAnchor) {
      const a = autoAnchor(doc);
      doc.anchorX = a.x;
      doc.anchorY = a.y;
    }
    refreshAll();
    fitZoom();
  }

  async function importFile(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const url = URL.createObjectURL(file);
      const img = await decodeImage(url);
      URL.revokeObjectURL(url);
      snapshot();
      const count = img.height === doc.height && img.width % doc.width === 0 ? img.width / doc.width : 1;
      if (count > 1) {
        doc.frames = Array.from({ length: count }, (_, i) => resizeCanvas(img, doc.width, doc.height, -i * doc.width, 0));
        frame = 0;
        say(`${count} frame diimpor dari ${file.name}.`);
      } else if (img.width <= doc.width && img.height <= doc.height) {
        doc.frames[frame] = resizeCanvas(img, doc.width, doc.height, Math.floor((doc.width - img.width) / 2), doc.height - img.height);
        say(`${file.name} diimpor (${img.width}×${img.height}).`);
      } else if (
        img.width <= 256 &&
        img.height <= 256 &&
        window.confirm(`Gambar ${img.width}×${img.height} lebih besar dari kanvas. Perbesar kanvas supaya pas (tanpa diperkecil)?`)
      ) {
        resizeDoc(Math.max(doc.width, img.width), Math.max(doc.height, img.height));
        doc.frames[frame] = resizeCanvas(img, doc.width, doc.height, Math.floor((doc.width - img.width) / 2), doc.height - img.height);
        say(`${file.name} diimpor, kanvas jadi ${doc.width}×${doc.height}.`);
      } else {
        doc.frames[frame] = fitIntoFrame(img, doc.width, doc.height, { removeBg: false, palette: null, margin: 0 });
        say(`${file.name} diperkecil agar muat di kanvas.`);
      }
      refreshAll();
    } catch (err) {
      say(`Gagal membaca gambar: ${err instanceof Error ? err.message : String(err)}`, true);
    }
  }

  function downloadPng(): void {
    const a = h('a', { href: rasterToDataUrl(joinFrames(doc.frames)), download: `${doc.id || 'objek'}.png` });
    document.body.append(a);
    a.click();
    a.remove();
  }

  async function doGenerate(): Promise<void> {
    const prompt = promptInput.value.trim();
    if (!prompt) {
      say('Tulis deskripsinya dulu.', true);
      promptInput.focus();
      return;
    }
    const provider = providerSelect.value || 'procedural';
    if (provider === 'procedural') {
      const hasDrawing = doc.frames.some((f) => contentBounds(f) !== null);
      if (hasDrawing && !window.confirm('Gambar sekarang akan diganti hasil prosedural. Lanjut? (Bisa diurungkan dengan Ctrl+Z.)')) return;
      snapshot();
      const g = generateFromDescription(prompt);
      doc = {
        ...doc,
        width: g.frameWidth,
        height: g.frameHeight,
        frames: g.frames,
        frameMs: g.frameMs,
        anchorX: g.anchorX,
        anchorY: g.anchorY,
        autoAnchor: false,
        fw: g.footprint.w,
        fd: g.footprint.d,
        blocking: g.blocking,
        seating: g.seating,
        seatLift: g.seatLift,
        lights: g.lights,
      };
      if (!doc.label.trim()) {
        doc.label = g.label;
        labelInput.value = g.label;
        if (!idTouched) idInput.value = doc.id = slugId(g.label);
      }
      frame = 0;
      refreshAll();
      fitZoom();
      say(
        `Dibuat sebagai "${g.kind}"${g.frames.length > 1 ? ` dengan ${g.frames.length} frame animasi` : ''}${g.lights.length ? ' dan lampu' : ''}. Silakan sempurnakan.`,
      );
      return;
    }
    const providerLabel = providerSelect.selectedOptions[0]?.textContent ?? provider;
    genButton.disabled = true;
    genButton.textContent = 'Membuat… (bisa sampai 1 menit)';
    say('Meminta gambar ke penyedia…');
    try {
      const { image } = await generateRemote(provider, prompt, doc.width, doc.height);
      const src = await decodeImage(image);
      const fitted = fitIntoFrame(src, doc.width, doc.height, { removeBg: removeBgBox.checked, palette: paletteBox.checked ? gamePalette() : null });
      snapshot();
      if (targetSelect.value === 'add') {
        doc.frames.splice(frame + 1, 0, fitted);
        frame++;
      } else doc.frames[frame] = fitted;
      if (!doc.label.trim()) {
        doc.label = prompt.slice(0, 40);
        labelInput.value = doc.label;
        if (!idTouched) idInput.value = doc.id = slugId(doc.label);
      }
      refreshAll();
      say(`Gambar dari ${providerLabel} dimasukkan (${src.width}×${src.height} → ${doc.width}×${doc.height}). Rapikan dengan pensil bila perlu.`);
    } catch (err) {
      say(`Gagal membuat gambar: ${err instanceof ApiError || err instanceof Error ? err.message : String(err)}`, true);
    } finally {
      genButton.disabled = false;
      genButton.textContent = 'Buat gambar';
      providerHint();
    }
  }

  async function doSave(): Promise<void> {
    const id = idInput.value.trim();
    const label = labelInput.value.trim();
    if (!label) return (say('Nama objek masih kosong.', true), labelInput.focus());
    if (!CUSTOM_ID_PATTERN.test(id)) return (say('Id harus diawali "c_" lalu huruf kecil, angka, atau garis bawah.', true), idInput.focus());
    if (isNew && isObjectTypeId(id)) return (say(`Id "${id}" sudah dipakai objek lain. Ganti id.`, true), idInput.focus());
    if (!doc.frames.some((f) => contentBounds(f) !== null)) return say('Gambarnya masih kosong.', true);
    const def: CustomObjectDef = {
      id: id as `c_${string}`,
      label,
      frameWidth: doc.width,
      frameHeight: doc.height,
      frames: doc.frames.length,
      frameMs: doc.frameMs,
      anchorX: doc.anchorX,
      anchorY: doc.anchorY,
      footprint: { w: doc.fw, d: doc.fd },
      depthMode: doc.depthMode,
      blocking: doc.blocking,
      seating: doc.seating,
      seatLift: doc.seatLift,
      lights: doc.lights.map((l) => ({ ...l })),
    };
    say('Menyimpan…');
    try {
      await persistCustom(def, doc.frames);
      dirty = false;
      opts.onSaved(id);
      close(true);
    } catch (err) {
      say(`Gagal menyimpan: ${err instanceof Error ? err.message : String(err)}`, true);
    }
  }

  async function doDelete(): Promise<void> {
    if (!opts.editId) return;
    if (opts.isUsedInOpenMap(opts.editId)) return say('Objek ini masih ada di peta yang sedang dibuka. Hapus dari peta dulu.', true);
    if (!window.confirm(`Hapus objek "${doc.label}" dari project? Gambar & datanya dihapus (cadangan disimpan di tools/map-editor/backups).`)) return;
    try {
      await removeCustom(opts.editId);
      opts.onDeleted(opts.editId);
      close(true);
    } catch (err) {
      say(`Gagal menghapus: ${err instanceof Error ? err.message : String(err)}`, true);
    }
  }

  function close(force = false): void {
    if (!force && dirty && !window.confirm('Perubahan di studio belum disimpan. Tutup tanpa menyimpan?')) return;
    if (playing) clearInterval(playing);
    dialog.close();
    dialog.remove();
  }

  function refreshAll(): void {
    renderSide();
    renderFrames();
    draw();
  }

  setTool('pencil');
  refreshAll();
  dialog.showModal();
  fitZoom();
  canvas.focus();
  void (async () => {
    try {
      providersCache ??= (await fetchProviders()).providers;
    } catch {
      providersCache = [
        { id: 'procedural', label: 'Prosedural (bawaan)', ready: true, note: 'Server editor tidak terhubung: hanya mesin prosedural yang tersedia.' },
      ];
    }
    fillProviders(providersCache);
  })();
}
