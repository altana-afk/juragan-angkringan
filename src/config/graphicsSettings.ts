/**
 * Kualitas grafis. "hemat" untuk ponsel lemah: dibatasi 30 FPS, peta cahaya resolusi setengah & diperbarui
 * lebih jarang, partikel hujan lebih sedikit. "auto" memilih sendiri dari kemampuan perangkat.
 */
export type GraphicsQuality = 'auto' | 'tinggi' | 'hemat';

const KEY = 'juragan-angkringan:graphics';

export interface DeviceHints {
  cores?: number;
  memoryGb?: number;
  touch?: boolean;
}

/** Tentukan apakah mode hemat aktif. */
export function resolveLowPower(quality: GraphicsQuality, hints: DeviceHints): boolean {
  if (quality === 'hemat') return true;
  if (quality === 'tinggi') return false;
  const weakCpu = (hints.cores ?? 8) <= 4;
  const lowMem = (hints.memoryGb ?? 8) <= 3;
  return Boolean(hints.touch) && (weakCpu || lowMem);
}

export function parseQuality(raw: string | null): GraphicsQuality {
  return raw === 'tinggi' || raw === 'hemat' || raw === 'auto' ? raw : 'auto';
}

export function loadQuality(): GraphicsQuality {
  try {
    return parseQuality(globalThis.localStorage?.getItem(KEY) ?? null);
  } catch {
    return 'auto';
  }
}

export function saveQuality(q: GraphicsQuality): void {
  try {
    globalThis.localStorage?.setItem(KEY, q);
  } catch {
    /* abaikan */
  }
}

export function deviceHints(): DeviceHints {
  const nav = globalThis.navigator as (Navigator & { deviceMemory?: number }) | undefined;
  const hints: DeviceHints = { touch: typeof window !== 'undefined' && 'ontouchstart' in window };
  if (nav?.hardwareConcurrency) hints.cores = nav.hardwareConcurrency;
  if (nav?.deviceMemory) hints.memoryGb = nav.deviceMemory;
  return hints;
}

/** Status kualitas grafis yang sedang berlaku (dibagikan ke scene & sistem). */
export const GRAPHICS = {
  quality: 'auto' as GraphicsQuality,
  lowPower: false,
  init(): void {
    this.quality = loadQuality();
    this.lowPower = resolveLowPower(this.quality, deviceHints());
  },
  set(q: GraphicsQuality): void {
    this.quality = q;
    saveQuality(q);
    this.lowPower = resolveLowPower(q, deviceHints());
  },
};
