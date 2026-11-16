/** Pengaturan tampilan per perangkat (LocalStorage), terpisah dari save permainan. */
const KEY = 'juragan-angkringan:ui';

interface StoredUi {
  autoScroll?: boolean;
}

function load(): StoredUi {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as StoredUi;
  } catch {
    return {};
  }
}

export const UI_SETTINGS = {
  /** Gulir otomatis ke Daftar persiapan setelah menekan "+ Tambah" (bawaan: mati). */
  autoScroll: load().autoScroll === true,
  setAutoScroll(on: boolean): void {
    this.autoScroll = on;
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...load(), autoScroll: on }));
    } catch {
      /* penyimpanan tidak tersedia — berlaku untuk sesi ini saja */
    }
  },
};
