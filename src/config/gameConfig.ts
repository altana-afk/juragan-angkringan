/**
 * Konfigurasi umum game: identitas, tampilan, kalender, kamera.
 * Semua angka yang memengaruhi gameplay ada di file config, bukan di UI/scene.
 */

export const GAME_CONFIG = {
  /** Nama sementara proyek — cukup ubah di sini untuk mengganti judul di seluruh game. */
  title: 'Juragan Angkringan',
  subtitle: 'Simulator',
  version: '0.16.0',
  stage: 'Akun & Leaderboard',
  backgroundColor: '#140f1f',

  /** Tanggal kalender untuk Hari 1 (bulan 1–12). 6 Juli 2026 jatuh pada hari Senin. */
  calendarStart: { year: 2026, month: 7, day: 6 },

  /** Jam buka & tutup dalam menit sejak 00.00 hari itu (02.00 dini hari = 26 × 60). */
  dayCycle: {
    openMinutes: 17 * 60,
    closeMinutes: 26 * 60,
  },

  /** Peta yang dimuat saat bermain. */
  world: {
    mapId: 'main-street',
  },

  camera: {
    minZoom: 1,
    maxZoom: 5,
    /** Tingkat zoom untuk tombol +/− (pixel art paling tajam di kelipatan 0,5). */
    zoomSteps: [1, 1.5, 2, 2.5, 3, 3.5, 4, 5],
    /** Lebar dunia (px) yang ingin terlihat saat zoom default. */
    targetViewWidthWide: 460,
    targetViewWidthNarrow: 250,
    /** Lebar layar (px CSS) di bawah ini dianggap layar sempit / ponsel. */
    narrowBreakpoint: 700,
    defaultZoomMin: 1.5,
    defaultZoomMax: 4,
    /** Kecepatan geser kamera via keyboard (px layar per detik). */
    keyboardPanSpeed: 520,
    /** Jarak minimal (px) sebelum sentuhan dianggap menggeser kamera. */
    dragThreshold: 6,
    /** Margin ekstra di sekitar peta (px dunia). */
    boundsPadding: 96,
  },

  /** Jam pratinjau suasana malam di menu utama. */
  mainMenuPreviewMinutes: 21 * 60 + 15,
} as const;

export type GameConfig = typeof GAME_CONFIG;

/** Mode debug aktif jika URL berisi ?debug */
export function isDebugMode(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).has('debug');
}
