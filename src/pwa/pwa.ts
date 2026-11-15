/**
 * Dukungan PWA (Progressive Web App):
 *  - mendaftarkan service worker → game bisa dimainkan offline & di-install ke layar utama;
 *  - menangkap prompt "Install" Chrome/Edge/Android supaya bisa dipicu dari tombol di menu utama;
 *  - meminta penyimpanan permanen saat game dijalankan sebagai aplikasi (save tidak dihapus browser).
 *
 * Service worker hanya aktif di build produksi (`npm run build`), bukan saat `npm run dev`,
 * dan dilewati saat game disematkan di iframe (mis. halaman itch.io).
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** 'prompt' = browser punya dialog install; 'ios' = perlu panduan manual (Safari); 'none' = sembunyikan tombol. */
export type InstallMode = 'prompt' | 'ios' | 'none';

type Notify = (message: string, kind?: 'info' | 'success' | 'warning' | 'error', durationMs?: number) => void;

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emitChange = (): void => listeners.forEach((fn) => fn());

/** True jika game berjalan di dalam iframe (itch.io, Newgrounds, dll.). */
export function isEmbedded(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/** True jika game dibuka sebagai aplikasi yang sudah di-install (bukan tab browser biasa). */
export function isInstalled(): boolean {
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return (
    standalone ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches
  );
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function installMode(): InstallMode {
  if (isInstalled() || isEmbedded()) return 'none';
  if (deferredPrompt) return 'prompt';
  if (isIos()) return 'ios';
  return 'none';
}

/** Tampilkan dialog install bawaan browser. Mengembalikan true jika pemain menyetujui. */
export async function promptInstall(): Promise<boolean> {
  const event = deferredPrompt;
  if (!event) return false;
  deferredPrompt = null;
  emitChange();
  await event.prompt();
  const choice = await event.userChoice;
  return choice.outcome === 'accepted';
}

/** Daftarkan callback saat status "bisa di-install" berubah. Mengembalikan fungsi untuk berhenti. */
export function onInstallModeChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Panggil sedini mungkin (sebelum game dibuat) agar event beforeinstallprompt tidak terlewat. */
export function initPwa(notify: Notify): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    emitChange();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    emitChange();
    notify('Game terpasang! Sekarang bisa dibuka dari layar utama, bahkan tanpa internet.', 'success', 5000);
  });

  if (isInstalled()) void requestPersistentStorage();

  if (!import.meta.env.PROD || isEmbedded() || !('serviceWorker' in navigator) || !window.isSecureContext) return;
  window.addEventListener('load', () => void registerServiceWorker(notify));
}

/** Menu utama sedang tampil = belum ada hari berjualan yang berjalan, aman untuk memuat ulang. */
function isAtMainMenu(): boolean {
  return document.querySelector('.main-menu') !== null;
}

let updateApplied = false;

function applyWaitingUpdate(worker: ServiceWorker, notify: Notify): void {
  if (updateApplied) return;
  updateApplied = true;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
  notify('Memperbarui game ke versi terbaru…', 'info', 3000);
  worker.postMessage({ type: 'SKIP_WAITING' });
}

async function requestPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    // Tidak didukung: tidak masalah, save tetap di LocalStorage biasa.
  }
}

async function registerServiceWorker(notify: Notify): Promise<void> {
  let registration: ServiceWorkerRegistration;
  try {
    registration = await navigator.serviceWorker.register('./sw.js', { scope: './' });
  } catch (error) {
    console.warn('Service worker gagal didaftarkan; game tetap jalan tanpa mode offline.', error);
    return;
  }

  const announceUpdate = (): void =>
    notify('Versi baru game sudah diunduh — otomatis dipakai saat game dibuka lagi.', 'info', 7000);

  const watchInstalling = (worker: ServiceWorker | null): void => {
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state !== 'installed') return;
      // Tanpa controller = instalasi pertama (game kini siap offline).
      if (!navigator.serviceWorker.controller) {
        if (isInstalled()) notify('Game siap dimainkan offline.', 'success', 4000);
        return;
      }
      // Pembaruan: langsung pasang kalau pemain masih di menu utama, kalau tidak tunda.
      if (isAtMainMenu()) applyWaitingUpdate(worker, notify);
      else announceUpdate();
    });
  };

  // Versi baru yang sudah diunduh di kunjungan sebelumnya: pasang sekarang selagi pemain masih
  // di menu utama (belum ada permainan berjalan). Kalau sudah bermain, tunggu kunjungan berikutnya.
  if (registration.waiting && navigator.serviceWorker.controller) {
    if (isAtMainMenu()) applyWaitingUpdate(registration.waiting, notify);
    else announceUpdate();
  }
  watchInstalling(registration.installing);
  registration.addEventListener('updatefound', () => watchInstalling(registration.installing));
  // Browser tidak selalu mengecek sw.js baru saat halaman dibuka → cek sendiri setiap game dimulai.
  void registration.update().catch(() => undefined);

  // Aplikasi yang di-install bisa terbuka berhari-hari: cek pembaruan setiap kembali ke game.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void registration.update().catch(() => undefined);
  });
}
