/**
 * Objek kustom: gambar PNG buatan sendiri (editor peta → src/assets/custom-objects/<id>.png)
 * beserta datanya di src/data/customObjects.json.
 *
 * PNG berisi semua frame berjajar ke kanan, masing-masing frameWidth × frameHeight piksel.
 * (anchorX, anchorY) = piksel di frame yang menempel ke sudut belakang alas objek, sama seperti
 * titik jangkar aset prosedural.
 */
import type { DepthMode } from './objectTypes';

export interface CustomLightDef {
  /** Posisi bohlam dalam piksel frame. */
  readonly px: number;
  readonly py: number;
  readonly radius: number;
  /** Warna "#rrggbb". */
  readonly color: string;
  /** 0..1 */
  readonly intensity: number;
  /** 0..1 (0 = stabil). */
  readonly flicker: number;
  readonly glow: boolean;
}

export interface CustomObjectDef {
  readonly id: `c_${string}`;
  readonly label: string;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly frames: number;
  /** Lama tiap frame animasi (ms). */
  readonly frameMs: number;
  readonly anchorX: number;
  readonly anchorY: number;
  /** Alas dalam unit (16 = 1 ubin). */
  readonly footprint: { readonly w: number; readonly d: number };
  readonly depthMode: DepthMode;
  readonly blocking: boolean;
  /** Pelanggan bisa duduk di atasnya (letakkan kursi di atas objek). */
  readonly seating: boolean;
  /** Tinggi dudukan dalam piksel (0 = lesehan). */
  readonly seatLift: number;
  readonly lights: readonly CustomLightDef[];
}

export const CUSTOM_ID_PATTERN = /^c_[a-z0-9]+(?:_[a-z0-9]+)*$/;
const DEPTH_MODES: readonly DepthMode[] = ['center', 'front', 'ground'];
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function num(o: Record<string, unknown>, key: string, where: string, min: number, max: number, integer = false): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (integer && !Number.isInteger(v))) {
    throw new Error(`${where}: "${key}" harus ${integer ? 'bilangan bulat' : 'angka'} ${min}..${max}`);
  }
  return v;
}

/** Validasi isi customObjects.json. Melempar Error berbahasa Indonesia bila ada yang salah. */
export function parseCustomObjects(raw: unknown): CustomObjectDef[] {
  if (!isRecord(raw) || !Array.isArray(raw.objects)) throw new Error('customObjects.json harus berisi { "objects": [...] }');
  const seen = new Set<string>();
  return raw.objects.map((o, i) => {
    const where = `customObjects.json objek #${i + 1}`;
    if (!isRecord(o)) throw new Error(`${where}: harus berupa objek`);
    const id = o.id;
    if (typeof id !== 'string' || !CUSTOM_ID_PATTERN.test(id)) throw new Error(`${where}: id harus diawali "c_" lalu huruf kecil/angka/garis bawah`);
    if (seen.has(id)) throw new Error(`${where}: id "${id}" dipakai lebih dari sekali`);
    seen.add(id);
    const label = typeof o.label === 'string' && o.label.trim() ? o.label.trim() : id;
    const frameWidth = num(o, 'frameWidth', where, 1, 512, true);
    const frameHeight = num(o, 'frameHeight', where, 1, 512, true);
    const fp = isRecord(o.footprint) ? o.footprint : {};
    const depthMode = typeof o.depthMode === 'string' && (DEPTH_MODES as readonly string[]).includes(o.depthMode) ? (o.depthMode as DepthMode) : 'center';
    const lights = (Array.isArray(o.lights) ? o.lights : []).map((l, j) => {
      const lw = `${where} lampu #${j + 1}`;
      if (!isRecord(l)) throw new Error(`${lw}: harus berupa objek`);
      const color = typeof l.color === 'string' && COLOR_PATTERN.test(l.color) ? l.color.toLowerCase() : '#ffd27a';
      return {
        px: num(l, 'px', lw, -512, 1024),
        py: num(l, 'py', lw, -512, 1024),
        radius: num(l, 'radius', lw, 4, 400),
        color,
        intensity: num(l, 'intensity', lw, 0, 1),
        flicker: typeof l.flicker === 'number' ? Math.min(1, Math.max(0, l.flicker)) : 0,
        glow: l.glow === true,
      };
    });
    return {
      id: id as `c_${string}`,
      label,
      frameWidth,
      frameHeight,
      frames: num(o, 'frames', where, 1, 32, true),
      frameMs: typeof o.frameMs === 'number' ? Math.min(5000, Math.max(30, Math.round(o.frameMs))) : 150,
      anchorX: num(o, 'anchorX', where, -512, 1024),
      anchorY: num(o, 'anchorY', where, -512, 1024),
      footprint: { w: num(fp, 'w', `${where} alas`, 0, 512), d: num(fp, 'd', `${where} alas`, 0, 512) },
      depthMode,
      blocking: o.blocking !== false,
      seating: o.seating === true,
      seatLift: typeof o.seatLift === 'number' ? Math.min(40, Math.max(0, Math.round(o.seatLift))) : 6,
      lights,
    };
  });
}

/**
 * Posisi lampu (piksel frame) → titik relatif alas dalam unit (16 = 1 ubin) pada ketinggian 0,
 * sehingga tileToWorld(obj.x + x/16, obj.y + y/16) tepat jatuh di piksel bohlam.
 */
export function lightOffsetUnits(def: Pick<CustomObjectDef, 'anchorX' | 'anchorY'>, px: number, py: number): { x: number; y: number } {
  const dx = px + 0.5 - def.anchorX;
  const dy = py + 0.5 - def.anchorY;
  // tileToWorld: x = (tx - ty) * 16, y = (tx + ty) * 8
  const sum = dy / 8;
  const diff = dx / 16;
  return { x: ((sum + diff) / 2) * 16, y: ((sum - diff) / 2) * 16 };
}

export function hexToColor(hex: string): number {
  return Number.parseInt(hex.slice(1), 16) >>> 0;
}

/** Potong lembar PNG (RGBA) menjadi data per frame. */
export function sliceFrames(
  rgba: Uint8ClampedArray,
  sheetWidth: number,
  def: Pick<CustomObjectDef, 'frameWidth' | 'frameHeight' | 'frames'>,
): Uint8ClampedArray[] {
  const out: Uint8ClampedArray[] = [];
  const { frameWidth: w, frameHeight: h } = def;
  for (let f = 0; f < def.frames; f++) {
    const frame = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      const src = (y * sheetWidth + f * w) * 4;
      frame.set(rgba.subarray(src, src + w * 4), y * w * 4);
    }
    out.push(frame);
  }
  return out;
}
