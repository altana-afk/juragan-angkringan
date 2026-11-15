/**
 * Angka acak deterministik (bisa diulang dengan seed yang sama).
 * Dipakai untuk aset prosedural sekarang dan untuk simulasi pelanggan nanti.
 */

/** Hash string → bilangan 32-bit (FNV-1a). */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Hash beberapa bilangan bulat → 0..1 (untuk noise per piksel / per ubin). */
export function hashNoise(...values: number[]): number {
  let h = 0x9e3779b1;
  for (const v of values) {
    h ^= Math.imul((v | 0) + 0x7f4a7c15, 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return (h >>> 0) / 4294967296;
}

export class SeededRandom {
  private state: number;

  constructor(seed: number | string) {
    this.state = (typeof seed === 'string' ? hashString(seed) : seed >>> 0) || 0x6d2b79f5;
  }

  /** 0 (inklusif) .. 1 (eksklusif) — algoritma mulberry32. */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Bilangan bulat min..max (keduanya inklusif). */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick() dari array kosong');
    return items[Math.floor(this.next() * items.length)] as T;
  }

  /** Memilih item berdasarkan bobot (bobot ≤ 0 tidak pernah terpilih). */
  weightedPick<T>(items: readonly { item: T; weight: number }[]): T {
    const total = items.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
    if (total <= 0) throw new Error('weightedPick() butuh minimal satu bobot > 0');
    let roll = this.next() * total;
    for (const entry of items) {
      const w = Math.max(0, entry.weight);
      if (roll < w) return entry.item;
      roll -= w;
    }
    // Fallback karena pembulatan floating point: kembalikan item terakhir berbobot > 0.
    for (let i = items.length - 1; i >= 0; i--) {
      const entry = items[i];
      if (entry && entry.weight > 0) return entry.item;
    }
    throw new Error('weightedPick() gagal');
  }
}
