import { GAME_CONFIG } from '../config/gameConfig';
import { clamp } from '../utils/formatting';

const CFG = GAME_CONFIG.camera;

/** Zoom default berdasarkan ukuran layar: ponsel menampilkan area lebih sempit agar tidak terlalu kecil. */
export function computeDefaultZoom(viewWidth: number, viewHeight: number): number {
  const narrow = viewWidth < CFG.narrowBreakpoint;
  const target = narrow ? CFG.targetViewWidthNarrow : CFG.targetViewWidthWide;
  const byWidth = viewWidth / target;
  // Pada layar pendek (landscape ponsel) batasi juga berdasarkan tinggi.
  const byHeight = viewHeight / (target * 0.62);
  const raw = Math.min(byWidth, byHeight);
  return clamp(Math.round(raw * 2) / 2, CFG.defaultZoomMin, CFG.defaultZoomMax);
}

/** Tingkat zoom berikutnya dari daftar zoomSteps (untuk tombol +/− dan keyboard). */
export function nextZoomStep(current: number, direction: 1 | -1, steps: readonly number[] = CFG.zoomSteps): number {
  if (direction > 0) return steps.find((s) => s > current + 0.01) ?? CFG.maxZoom;
  return [...steps].reverse().find((s) => s < current - 0.01) ?? CFG.minZoom;
}
