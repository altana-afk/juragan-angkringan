import type { GameState } from '../core/GameState';
import { totalQty } from './InventorySystem';

export const TUTORIAL_DONE = 99;

export interface TutorialStep {
  readonly title: string;
  readonly text: string;
  /** Tombol bilah aksi yang disorot (label). */
  readonly highlight: string | null;
  /** Langkah dianggap selesai jika kondisi ini terpenuhi. */
  readonly done: (s: Readonly<GameState>) => boolean;
}

const hasIngredients = (s: Readonly<GameState>): boolean => Object.values(s.inventory.ingredients).some((b) => totalQty(b) > 0);
const hasProducts = (s: Readonly<GameState>): boolean => Object.values(s.inventory.products).some((b) => totalQty(b) > 0);

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    title: 'Belanja bahan',
    text: 'Selamat datang, Juragan! Buka Belanja dan beli bahan untuk menu awal: beras, telur, tempe, tahu, teh, gula, es…',
    highlight: 'Belanja',
    done: (s) => hasIngredients(s) || s.phase !== 'persiapan',
  },
  {
    title: 'Masak dulu',
    text: 'Buka Persiapan, pilih menu & jumlah porsi, lalu tekan Masak. Pelanggan hanya bisa membeli produk yang sudah matang.',
    highlight: 'Persiapan',
    done: (s) => hasProducts(s) || s.phase !== 'persiapan',
  },
  {
    title: 'Buka angkringan',
    text: 'Stok siap! Tekan Mulai Berjualan. Kamu juga bisa mengatur harga jual di Persiapan.',
    highlight: 'Mulai Berjualan',
    done: (s) => s.phase !== 'persiapan',
  },
  {
    title: 'Layani pelanggan',
    text: 'Pelanggan datang, memesan & membayar otomatis. Percepat waktu dengan tombol 2×/3×, dan masak lagi lewat Persiapan jika stok menipis.',
    highlight: null,
    done: (s) => s.phase === 'evaluasi' || s.calendar.day > 1,
  },
  {
    title: 'Kembangkan usaha',
    text: 'Baca laporan harian, lalu lanjut ke hari berikutnya. Gunakan Promosi & Upgrade, dan ketuk 📍 lokasi di bawah jam untuk pindah tempat jualan saat persiapan.',
    highlight: null,
    done: (s) => s.calendar.day > 1,
  },
];

/** Langkah tutorial setelah memeriksa state (melompati langkah yang sudah terpenuhi). */
export function advanceTutorial(s: Readonly<GameState>): number {
  let step = s.tutorial;
  while (step < TUTORIAL_STEPS.length && (TUTORIAL_STEPS[step] as TutorialStep).done(s)) step++;
  return step >= TUTORIAL_STEPS.length ? TUTORIAL_DONE : step;
}
