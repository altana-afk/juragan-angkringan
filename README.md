# Juragan Angkringan Simulator

Game simulasi bisnis angkringan 2D isometrik berbasis web — **TypeScript + Phaser 3 + Vite**.
Pemain merintis angkringan dari satu gerobak: belanja bahan, menyiapkan masakan, melayani
pelanggan, dan mengembangkan usaha hari demi hari.

> **Status: v0.10.0.** 5 lokasi (Jalan Kampung, Dekat Kampus, Pinggir Pasar, Depan Stasiun, Pasar Malam) yang bisa dipindah saat persiapan,
> 30 menu, 31 upgrade (gudang, kursi, kenyamanan), 19 event harian, pencapaian, dan Bank. Lihat `docs/PROGRESS.md`.

## Menjalankan

Uji end-to-end: `npm run build && npx vite preview --port 4173`, lalu `npm run test:e2e` (butuh Python + Playwright).


Prasyarat: Node.js 20 atau lebih baru (diuji dengan Node 22).

```bash
npm install
npm run dev        # server pengembangan → http://localhost:5173
```

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | Server pengembangan dengan hot reload |
| `npm run build` | Cek TypeScript lalu build produksi ke `dist/` |
| `npm run preview` | Menjalankan hasil build (`dist/`) secara lokal |
| `npm run typecheck` | Pemeriksaan TypeScript (strict mode) |
| `npm test` | Menjalankan unit test (Vitest) |
| `npm run check` | Typecheck + test + build sekaligus |
| `npm run pack:itch` | Build + ZIP siap unggah ke itch.io (folder `release/`) |

Hasil `npm run build` adalah situs statis (`base: './'`), bisa diunggah ke hosting statis mana pun
(GitHub Pages, Netlify, itch.io, dll.).

## Rilis & main di HP / desktop

Game ini adalah **PWA**: cukup bagikan link, lalu pemain bisa menekan **"Pasang game"** di menu utama
untuk memasangnya ke layar utama dan bermain **offline**. Panduan lengkap (GitHub Pages otomatis,
itch.io, Netlify) ada di [docs/DEPLOY.md](docs/DEPLOY.md).

| Perintah | Fungsi |
| --- | --- |
| `git push` ke `main` | Build & publish otomatis ke GitHub Pages (pindahkan dulu `ci/deploy-pages.yml` ke `.github/workflows/`, lihat DEPLOY.md) |
| `npm run pack:itch` | Build lalu buat `release/juragan-angkringan-v<versi>-web.zip` untuk itch.io |

## Kontrol

| Aksi | Desktop | Ponsel / tablet |
| --- | --- | --- |
| Geser kamera | Seret mouse, atau WASD / panah | Geser satu jari |
| Zoom | Scroll mouse, Q / E, tombol − / + | Cubit dua jari, tombol − / + |
| Fokus ke gerobak | F, atau tombol ⌖ | Tombol ⌖ |
| Belanja / Persiapan | B / P, atau tombol bawah | Tombol bawah |
| Promosi / Statistik | I / S, atau tombol bawah | Tombol bawah |
| Mulai berjualan | Enter, atau tombol bawah | Tombol "Buka" |
| Kecepatan waktu | Spasi (jeda), 1 / 2 / 3 | Tombol ❚❚ 1× 2× 3× |
| Menu jeda | Esc, atau tombol ☰ | Tombol ☰ |

## Alat pengembang

- `?debug` di URL (mis. `http://localhost:5173/?debug`): panel FPS/zoom/ubin, tombol `[` dan `]`
  untuk memundurkan/memajukan jam 30 menit (pratinjau pencahayaan), dan `window.__game` di console.
- `?renderer=canvas`: paksa renderer Canvas 2D untuk menguji perangkat tanpa WebGL.

## Struktur proyek

```
src/
  main.ts                 Titik masuk: membuat GameContext, UIManager, dan Phaser.Game
  config/                 Angka-angka game (judul, kamera, ekonomi, balancing, popularitas)
  core/                   Inti tanpa Phaser: EventBus, GameState, GameStore, GameContext
  systems/                Sistem gameplay: inventaris (batch FEFO), ekonomi & harga harian,
                          resep & unlock menu, memasak, save berversi, GameActions, popularitas
  iso/                    Matematika proyeksi isometrik 2:1
  world/                  Dunia game: data peta, terrain, jenis objek, WorldBuilder,
                          kamera, pencahayaan siang–malam, urutan depth
  graphics/               PixelCanvas & IsoPainter (rasterizer pixel art), font pixel, palet
    art/                  Aset placeholder prosedural (lantai, gerobak, rumah, karakter, efek)
    TextureFactory.ts     Mendaftarkan aset ke Phaser + titik jangkar & metadata lampu
  scenes/                 BootScene → LoadingScene → MainMenuScene → AngkringanScene
  ui/                     UI DOM + CSS: HUD, kontrol kamera, menu utama, menu jeda, modal, toast
  data/                   ingredients.json, recipes.json, catalog.ts (validasi), maps/main-street.json
  styles/main.css         Gaya UI (responsif desktop & ponsel)
  pwa/                    Registrasi service worker, tombol "Pasang game", notifikasi update
  utils/                  Format Rupiah/jam, kalender, angka acak deterministik
tests/                    Unit test (Vitest)
docs/                     Arsitektur, catatan progres & panduan rilis (DEPLOY.md)
public/                   Manifest PWA, ikon aplikasi, aturan cache hosting (_headers)
pwa/sw.js                 Template service worker (diisi otomatis saat build)
scripts/pack-itch.mjs     Pembuat ZIP itch.io
ci/deploy-pages.yml       Workflow GitHub Pages (pindahkan ke .github/workflows/)
```

Penjelasan lengkap tiap modul dan alur datanya ada di [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Mengubah konten tanpa menyentuh logika

- **Judul, kamera, jam buka/tutup, tanggal mulai** → `src/config/gameConfig.ts`
- **Modal awal & biaya operasional** → `src/config/economyConfig.ts`
- **Popularitas awal & tingkatan popularitas** → `src/config/balanceConfig.ts`
- **Bahan baku** (kemasan, harga dasar, umur simpan, ikon) → `src/data/ingredients.json`
- **Resep** (bahan per porsi, harga jual, syarat unlock, ikon) → `src/data/recipes.json`
- **Pergerakan harga harian** → `ECONOMY_CONFIG.ingredientPrices` di `economyConfig.ts`
- **Tipe pelanggan** (budget, kesabaran, preferensi, jam ramai, warna) → `src/data/customers.json`
- **Iklan** (biaya, efek kedatangan) → `src/data/advertising.json`
- **Rumus popularitas** (bobot & batas harian) → `BALANCE_CONFIG.popularityWeights` di `balanceConfig.ts`
- **Keramaian, kepuasan, lama makan** → `src/config/demandConfig.ts`; kursi, antrean & jalur → `anchors` di peta JSON
- **Tata letak peta** (ubin & posisi objek) → `src/data/maps/main-street.json`
  (divalidasi otomatis saat dimuat; kesalahan data menghasilkan pesan error yang jelas)
- **Suasana sore/malam** → keyframe di `src/world/timeOfDay.ts`

## Aset

Semua grafis saat ini adalah **placeholder orisinal yang digambar secara prosedural** lewat kode
(`src/graphics/art`), tanpa aset atau kode dari game lain. Di Stage 6, sprite PNG final bisa
menggantikannya cukup dengan memuat file bertekstur sama di `LoadingScene` — kode gameplay tidak
perlu diubah selama kunci teksturnya sama (mis. `obj_cart_basic`).

## Penyimpanan

Progres disimpan otomatis ke LocalStorage browser (kunci `juragan-angkringan:save`) setiap ada
perubahan, saat tab ditutup, dan lewat tombol **Simpan sekarang** di menu jeda. Format save berversi
(`SAVE_VERSION` di `src/systems/SaveSystem.ts`) dengan migrasi otomatis; data rusak dicadangkan ke
`juragan-angkringan:save:rusak` sebelum pemain memulai ulang.
