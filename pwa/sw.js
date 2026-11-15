/*
 * Service worker Juragan Angkringan Simulator.
 *
 * File ini adalah TEMPLATE: saat build, plugin `pwaServiceWorker` di vite.config.ts mengisi
 * versi cache & daftar file (dua penanda bergaris bawah ganda di bawah) lalu menulis dist/sw.js.
 *
 * Strategi:
 *  - Install  : semua file hasil build disimpan ke cache → game bisa dimainkan offline sejak kunjungan pertama.
 *  - Halaman  : network-first (maks. 3 detik), jatuh ke index.html di cache kalau offline / sinyal lemah.
 *  - Aset lain: cache-first (nama file ber-hash, jadi isinya tidak pernah berubah).
 *  - Update   : versi baru menunggu sampai semua tab/aplikasi game ditutup, lalu aktif otomatis.
 *               Ini mencegah kode lama & baru tercampur saat pemain sedang bermain.
 */
const CACHE_PREFIX = 'juragan-angkringan-';
const CACHE_NAME = CACHE_PREFIX + '__CACHE_VERSION__';
const PRECACHE_URLS = __PRECACHE_MANIFEST__;
const NAVIGATION_TIMEOUT_MS = 3000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const toFetch = [];
      for (const url of PRECACHE_URLS) {
        // File di assets/ bernama ber-hash (isinya tak pernah berubah): ambil dari cache versi
        // lama kalau ada, supaya update game tidak mengunduh ulang Phaser (±1,2 MB).
        // Aset ber-hash juga boleh diambil dari cache HTTP browser (baru saja diunduh halaman),
        // jadi kunjungan pertama tidak mengunduh Phaser dua kali. File lain wajib versi terbaru.
        const hashed = url.startsWith('assets/');
        const reusable = hashed ? await caches.match(url) : undefined;
        if (reusable) await cache.put(url, reusable);
        else toFetch.push(new Request(url, { cache: hashed ? 'default' : 'reload' }));
      }
      await cache.addAll(toFetch);
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }
  event.respondWith(handleAsset(request));
});

async function handleNavigation(request) {
  // index.html di cache sengaja TIDAK ditimpa dari jaringan: ia harus tetap cocok dengan aset
  // versi cache ini. index.html versi baru dibawa oleh service worker versi baru.
  const cache = await caches.open(CACHE_NAME);
  // 'no-cache' = selalu tanya server (cepat, biasanya 304) agar tidak tersaji index.html basi
  // dari cache HTTP browser yang menunjuk ke aset versi lama.
  const fromNetwork = fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' }).then((response) =>
    response.redirected ? Response.redirect(response.url, 302) : response,
  );
  fromNetwork.catch(() => {}); // cegah "unhandled rejection" kalau timeout menang lebih dulu
  const timeout = new Promise((resolve) => setTimeout(resolve, NAVIGATION_TIMEOUT_MS, null));
  try {
    const response = await Promise.race([fromNetwork, timeout]);
    if (response) return response;
  } catch {
    // Offline → pakai salinan di cache.
  }
  const cached = (await cache.match('index.html')) || (await cache.match('./'));
  if (cached) return cached;
  return fromNetwork;
}

async function handleAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    const cache = await caches.open(CACHE_NAME);
    void cache.put(request, response.clone());
  }
  return response;
}
