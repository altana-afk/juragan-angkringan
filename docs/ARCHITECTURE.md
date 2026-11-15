# Arsitektur

## Prinsip

1. **Logika terpisah dari tampilan.** `core/`, `systems/`, `utils/`, `iso/`, data peta, dan
   generator aset tidak mengimpor Phaser maupun DOM, sehingga bisa diuji di Node.
2. **Satu sumber kebenaran.** Semua data permainan ada di `GameStore`. UI dan scene hanya
   membaca state dan mendengarkan event `state:changed`; tidak ada angka dekoratif.
3. **Komunikasi lewat event.** Modul tidak saling memanggil langsung; UI mengirim event
   (mis. `camera:zoom-in`) lewat `EventBus`, sistem/scene yang relevan menanggapinya.
4. **Data di konfigurasi.** Angka ekonomi, balancing, kamera, dan tata letak peta ada di
   `config/` dan `data/`, bukan di dalam UI atau scene.

## Lapisan & tanggung jawab

| Lapisan | Folder | Tanggung jawab | Bergantung pada |
| --- | --- | --- | --- |
| Core | `core/` | EventBus bertipe, GameState + validasi, GameStore, GameContext | config |
| Data | `data/` | JSON bahan, resep, peta + validator `catalog.ts` | — |
| Sistem gameplay | `systems/` | Inventaris, ekonomi, resep, memasak, save, GameActions, popularitas | core, data, config |
| Utilitas | `utils/`, `iso/` | Format angka/jam, kalender, RNG, proyeksi isometrik | — |
| Grafis | `graphics/` | Rasterizer pixel art, painter isometrik, aset prosedural | iso, world (tipe) |
| Dunia | `world/` | Data peta, terrain, objek, WorldBuilder, kamera, cahaya | Phaser, graphics |
| UI | `ui/` | HUD, menu, modal, toast (DOM + CSS) | core, systems |
| Scene | `scenes/` | Merangkai dunia + UI untuk tiap layar | semua di atas |

## Alur scene

```
BootScene ──► LoadingScene ──► MainMenuScene ──► AngkringanScene
                (membuat aset         (latar malam,      (permainan; ☰ / Esc → menu jeda,
                 prosedural &          kamera melayang)    "Kembali ke menu utama" → MainMenuScene)
                 lantai peta)
```

`GameContext` (EventBus + GameStore) dan `UIManager` dibuat sekali di `main.ts` lalu disimpan di
registry Phaser; scene mengambilnya lewat `getContext(scene)` dan `getUI(scene)`.

## Alur data

```
Aksi pemain (klik/tap/keyboard)
        │
        ▼
   UI (DOM) ── emit ──► EventBus ──► Scene / Sistem ──► GameStore.update(reason, mutate)
                                                              │ validasi (lempar error jika tidak valid)
                                                              ▼
                                                     event "state:changed" { state, prev, reason }
                                                              │
                                     ┌────────────────────────┼─────────────────────────┐
                                     ▼                        ▼                         ▼
                                   HUD                LightingSystem            (Stage 2+: autosave,
                             (uang, hari, jam,      (suasana sesuai jam)        laporan, notifikasi)
                              popularitas, cuaca)
```

## Sistem gameplay (Stage 2)

- **InventorySystem** — stok berbentuk *batch* `{qty, expiresDay, unitCost}`; dipakai FEFO
  (yang paling cepat kedaluwarsa duluan), tidak pernah negatif, `removeExpired` siap untuk tutup hari.
- **EconomySystem** — harga bahan per hari (inflasi pelan + fluktuasi deterministik, dibulatkan Rp100),
  `quotePurchase` & `applyPurchase` (ditolak jika uang kurang, tanpa mengubah state).
- **RecipeSystem** — kebutuhan bahan per porsi, gabungan beberapa pesanan, kekurangan, porsi maksimum,
  estimasi modal, syarat & pembukaan menu (`refreshUnlocks`).
- **CookingSystem** — memasak atomik: cek total kebutuhan semua pesanan dulu, lalu kurangi bahan tepat
  sekali per pesanan dan tambah stok produk matang beserta modal per porsi (dasar HPP di laporan Stage 4).
- **GameActions** — satu-satunya pintu UI untuk mengubah data: menjalankan aturan di dalam
  `GameStore.update`, membuka menu baru, dan mengembalikan `{ok, message}` untuk ditampilkan.
- **SaveSystem** — save berversi + migrasi, deteksi LocalStorage (cadangan memori), karantina data rusak.
  `GameContext` menjalankan autosave (debounce 400 ms) selama sesi bermain.

### Stage 3 — pelanggan

- **DemandSystem** — peluang kedatangan per menit = rata-rata harian × kurva jam (ramai ±19.45,
  gelombang kedua ±22.30) × faktor popularitas; tipe pelanggan & pesanan dipilih dengan bobot
  (kategori, tag resep, jam larut → makanan mengenyangkan, harga vs budget).
- **SalesSystem** — `resolveOrder` (stok habis → ganti produk sekategori / batal sebagian / pergi;
  budget dihormati; skor kepuasan) dan `applySale` (stok produk FEFO berkurang, uang & buku harian bertambah).
- **SalesSimulation** — simulasi murni berbasis menit permainan: rombongan berjalan lewat jalur peta,
  mencari kursi berdekatan (10 kursi), mengantre (3 tempat) dengan batas kesabaran, memesan, makan,
  membayar, lalu pergi. Seluruh hari bisa diuji di Node (`tests/sales.test.ts`).
- **SalesController + CustomerLayer** (Phaser) — menjalankan jam sesuai kecepatan, berhenti saat
  menu/panel terbuka, menggambar sprite pelanggan (berdiri/jalan/duduk), gelembung pesanan & emosi,
  dan teks uang melayang.

### Stage 4 — tutup hari, popularitas, iklan

- **DayCloseSystem** — saat simulasi selesai: tagih operasional, hitung popularitas & loyalitas, susun
  `DayReport` (arus kas: penjualan − belanja − promosi − operasional; plus laba kotor berbasis HPP),
  proyeksi stok basi, simpan ke `lastReport` & `history` (60 hari).
- **PopularitySystem** — `popularityDelta`: naik dari rombongan terlayani/sangat puas, turun dari yang kecewa,
  pergi, dan porsi yang dicari tapi habis; kenaikan melambat di popularitas tinggi; dibatasi ±6/hari.
  `nextLoyalty`: bergerak 25%/hari ke arah kepuasan; meningkatkan kedatangan (maks +25%) & pelanggan tetap.
- **AdvertisingSystem** — 5 iklan satu hari (`advertising.json`), bisa dibatalkan sebelum buka, efek beberapa
  iklan berkurang bertingkat (×0,7), tidak menaikkan popularitas langsung.

Bahan mentah dan produk matang disimpan terpisah (`inventory.ingredients` vs `inventory.products`),
sehingga bahan mentah tidak pernah bisa dijual langsung.

## Konvensi isometrik

- Proyeksi 2:1, ubin 32×16 piksel. Ubin `(x, y)` → dunia `((x − y)·16, (x + y)·8)`.
- Sumbu x mengarah ke kanan-bawah layar, sumbu y ke kiri-bawah. Sisi objek yang terlihat
  adalah sisi **x+** (kanan) dan **y+** (kiri).
- Objek digambar dalam **unit**: 16 unit = 1 ubin pada x/y, sedangkan z = piksel ke atas.
- **Depth**: objek di tanah memakai titik tengah alasnya (`x + y`); tenda di atas kepala memakai
  sudut depannya; tikar selalu di atas lantai tapi di bawah objek lain (`world/depth.ts`).
- Lantai seluruh peta dipanggang menjadi **satu tekstur** (cepat, tanpa celah antar-ubin);
  trotoar 2 px lebih tinggi dengan sisi tegak, dan tepi peta bergaya diorama.

## Aset prosedural

`graphics/PixelCanvas` adalah rasterizer kecil tanpa anti-aliasing (poligon scanline, elips,
garis, pola piksel, garis tepi otomatis). `graphics/IsoPainter` di atasnya menggambar kotak,
bidang, cakram, dan teks pada bidang isometrik. Setiap aset di `graphics/art` mengembalikan
kanvas + titik jangkar (posisi alas) + metadata (lampu, titik asap, pengait kabel).
`LoadingScene` menjalankan generator ini bertahap lalu mendaftarkannya lewat `TextureFactory`.

## Pencahayaan sore–malam

`world/timeOfDay.ts` berisi keyframe suasana (warna ambient, warna langit, kekuatan lampu)
dari 15.00 sampai 05.00 yang diinterpolasi sesuai jam permainan.

`world/LightingSystem.ts` (WebGL):
1. RenderTexture selebar layar diisi warna ambient (blend NORMAL).
2. Tiap lampu digambar sebagai cahaya radial berwarna (blend SCREEN) — posisinya dihitung
   dari kamera sehingga light map selalu menutupi seluruh layar pada zoom berapa pun.
3. RenderTexture ditumpuk di atas dunia dengan blend MULTIPLY; sprite pendar (ADD) di titik bohlam.

Catatan teknis: pass ambient dan pass lampu sengaja dipisah karena satu batch RenderTexture
yang mencampur blend mode menghasilkan artefak, dan mode ADD Phaser bergantung pada DST_ALPHA.
Untuk renderer Canvas 2D tersedia cadangan sederhana (lapisan gelap + sprite cahaya aditif).

## Kamera

`world/CameraController.ts`: seret (mouse/satu jari), cubit dua jari (zoom sekaligus geser),
scroll mouse (zoom ke arah kursor), keyboard (WASD/panah, Q/E, F), tombol UI (+, −, fokus).
Zoom default dihitung dari ukuran layar (`world/cameraMath.ts`) agar ponsel tidak sekadar
mengecilkan tampilan desktop. Ukuran kanvas disinkronkan dengan `ResizeObserver` (rotasi ponsel).

## UI

UI dibangun dengan DOM + CSS di atas kanvas (`#ui-root`), terbagi menjadi lapisan HUD, layar,
modal, dan toast. Elemen interaktif memakai `pointer-events: auto`; selebihnya meneruskan sentuhan
ke kanvas. Ikon dan judul adalah pixel art buatan sendiri (`ui/icons.ts`, `ui/pixelImage.ts`).

## Menambah jenis objek baru

1. Tambah id di `ObjectTypeId` dan definisinya di `OBJECT_TYPES` (`world/objectTypes.ts`).
2. Buat generator gambar di `graphics/art/` dengan kunci `objectTextureKey(type, varian)`,
   daftarkan di `graphics/art/catalog.ts` (sertakan `meta.lights` bila ada lampu).
3. Tempatkan di peta JSON. Unit test `tests/art.test.ts` memastikan setiap varian punya tekstur.

## Pengujian

`npm test` menjalankan unit test untuk: format & kalender, RNG, proyeksi isometrik, EventBus,
GameStore (validasi & event), tingkatan popularitas, validasi data peta, rasterizer, katalog aset,
kurva waktu, dan matematika kamera/depth. Alur di browser (menu, HUD, kamera sentuh & keyboard,
menu jeda, rotasi layar, renderer Canvas) diverifikasi dengan Chrome headless saat pengembangan.
