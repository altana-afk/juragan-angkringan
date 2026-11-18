# Progres Pengembangan

## Stage 1 — Foundation ✅

Target: *game dapat dibuka dan lingkungan isometrik tampil dengan benar.*

| Item | Status | Catatan |
| --- | --- | --- |
| Setup project | ✅ | Vite 8, TypeScript strict (+ `noUncheckedIndexedAccess`), Vitest |
| Integrasi Phaser | ✅ | Phaser 3.90, pixel art mode, skala `RESIZE` penuh layar |
| Game canvas | ✅ | Responsif, sinkron saat rotasi ponsel, cadangan renderer Canvas 2D |
| Sistem kamera | ✅ | Seret, cubit, scroll, keyboard, tombol +/−/fokus, batas peta, zoom default per ukuran layar |
| Tilemap isometrik | ✅ | Peta 24×24 dari JSON tervalidasi; 8 jenis permukaan; trotoar bertingkat; tepi diorama |
| Main menu | ✅ | Mulai bermain, layar penuh, tentang game; latar angkringan malam |
| Lingkungan angkringan | ✅ | Gerobak, tenda terpal, anglo + ceret (api & asap), penjual, bangku, tikar lesehan, rumah, ruko, pos ronda, tiang listrik + kabel, lampu jalan, pohon, motor |
| HUD dasar | ✅ | Uang, hari & tanggal, jam & fase, popularitas (tingkatan + bar), cuaca, tombol menu |
| Ekstra | ✅ | Pencahayaan sore→malam berbasis jam, notifikasi toast, menu jeda (Esc), mode debug |

### Verifikasi

- `npm run typecheck` — bersih (strict mode).
- `npm test` — 11 file, 64 test lulus.
- `npm run build` — sukses.
- Chrome headless (desktop 1280×760 & ponsel 390×844): menu utama, mulai bermain, HUD,
  seret/cubit/scroll/keyboard, tombol kamera, menu jeda via Esc & tombol, kembali ke menu lalu
  mulai lagi (tanpa UI ganda), rotasi ponsel, dan renderer Canvas — **tanpa error di console**.

### Keputusan desain

- **Tombol Belanja, Persiapan, Mulai Berjualan, Upgrade, Statistik belum ditampilkan.** Sesuai aturan
  "tidak boleh ada tombol pajangan", setiap tombol muncul bersamaan dengan sistemnya
  (Belanja & Persiapan di Stage 2, Mulai Berjualan di Stage 3–4, Statistik di Stage 4, Upgrade di Stage 5).
- **Jam permainan belum berjalan.** Waktu hanya berjalan saat mode berjualan (Stage 3–4). Untuk
  meninjau pencahayaan malam, gunakan `?debug` lalu tekan `]`.
- **Save system** dijadwalkan di awal Stage 2, saat sudah ada progres (uang & stok) yang layak disimpan;
  `GameStore` sudah memvalidasi state sehingga siap untuk serialisasi berversi.
- Hari 1 = **Senin, 6 Juli 2026** (bisa diubah di `gameConfig.calendarStart`).
- Nama "Juragan Angkringan" masih nama sementara dan mudah diganti di `gameConfig.title`.

### Batasan yang diketahui

- Semua grafis adalah placeholder prosedural (akan dipoles di Stage 6).
- Belum ada audio (Stage 6).
- Pada renderer Canvas 2D (perangkat tanpa WebGL), cahaya lampu tampil lebih sederhana (putih).

## Stage 2 — Inventory & Resep ✅

Target: *pemain dapat membeli bahan dan mengolahnya menjadi produk jualan.*

| Item | Status | Catatan |
| --- | --- | --- |
| Sistem uang | ✅ | Semua transaksi lewat `GameActions` → `GameStore` (tervalidasi, uang tidak bisa pecahan/NaN) |
| Database bahan baku | ✅ | 21 bahan di `ingredients.json`: kemasan, harga dasar, umur simpan, ikon pixel art |
| Sistem belanja | ✅ | Harga berubah bertahap per hari (▲/▼), tombol +/−, subtotal, total, sisa uang; ditolak jika uang kurang |
| Sistem resep | ✅ | 15 resep di `recipes.json`; 5 terbuka sejak awal, sisanya terbuka lewat popularitas ≥ 20 atau kas ≥ Rp1,5 jt |
| Persiapan makanan | ✅ | Pilih produk, atur porsi (+/−, ketik, Maks), kebutuhan bahan per item, bahan kurang ditandai merah, masak per item / semua |
| Stok produk matang | ✅ | Terpisah dari bahan mentah, punya modal per porsi & batas masa simpan |
| Save system | ✅ | Autosave, Simpan sekarang, Lanjutkan, Mulai Baru (konfirmasi), Hapus simpanan (konfirmasi), versi + migrasi |

### Verifikasi

- `npm run typecheck` bersih · `npm test` 15 file / 89 test lulus · `npm run build` sukses.
- Test baru: katalog data, inventaris FEFO & kedaluwarsa, harga harian, pembelian (termasuk uang kurang),
  resep & kebutuhan gabungan, memasak atomik (bahan dikurangi tepat sekali), unlock menu, save/load/migrasi/data rusak.
- Chrome headless desktop & ponsel: belanja → masak → muat ulang halaman → Lanjutkan memulihkan uang & stok;
  memasak melebihi stok ditolak dengan daftar bahan yang kurang; tanpa error console.

### Keputusan desain

- Satuan resep abstrak per bahan (porsi nasi, butir, takar, tusuk). "Bumbu" pada tabel desain dipecah
  menjadi bahan nyata (bawang, cabai, kecap); "air" untuk minuman memakai bahan **Air matang (galon)**,
  terpisah dari **Air mineral** botol yang dijual langsung.
- Produk matang kedaluwarsa di akhir hari dimasak (air mineral botol 30 hari). Pembuangan stok basi
  dijalankan saat penutupan hari (Stage 4) — fungsinya sudah ada & teruji.
- Tombol **Mulai Berjualan** belum ditampilkan (tidak boleh ada tombol pajangan); hadir di Stage 3.

## Stage 3 — Customer Simulation ✅

Target: *pelanggan dapat datang, memesan, membayar, dan pergi.*

| Item | Status | Catatan |
| --- | --- | --- |
| AI pelanggan | ✅ | 7 tipe di `customers.json` (mahasiswa, pekerja, ojol, keluarga, tetap, penasaran, royal): budget, kesabaran, rombongan, preferensi, jam ramai, warna |
| Sistem antrean | ✅ | 10 kursi (bangku depan, bangku samping, lesehan) + 3 tempat antre; pergi jika penuh / kesabaran habis |
| Sistem permintaan | ✅ | Bobot probabilitas: jam, popularitas, tipe, kategori & tag resep, larut malam, harga vs budget |
| Sistem pembelian | ✅ | Stok habis → ganti produk sekategori / batal sebagian / pergi; budget dihormati |
| Sistem kepuasan | ✅ | Skor 0–100 per rombongan (pesanan terpenuhi, pengganti, yang habis, lama menunggu); emosi di gelembung |
| Stok saat penjualan | ✅ | Produk matang berkurang FEFO, uang & buku harian bertambah, tidak pernah negatif |
| Jam & kecepatan | ✅ | 17.00–02.00 (±6 menit nyata pada 1×), jeda/1×/2×/3×, berhenti saat panel atau menu terbuka |
| Animasi | ✅ | Jalan, duduk, gelembung pesanan/emosi, "+RpX" melayang, "Habis!", "Penuh!" |

Tambahan agar siklus tidak buntu: ringkasan setelah tutup dan **Lanjut ke Hari N+1** (stok basi dibuang,
buku harian direset). Laporan keuangan lengkap, biaya operasional, dan popularitas menyusul di Stage 4.

### Verifikasi

- `npm run typecheck` bersih · `npm test` 17 file / 101 test lulus · `npm run build` sukses.
- Test baru: data pelanggan & peta, kurva keramaian, pilihan pesanan berbobot, penjualan (ganti/batal/pergi,
  budget, stok), simulasi satu hari penuh (kursi tidak pernah melebihi kapasitas, uang = modal + penjualan,
  semua pelanggan tercatat), rata-rata kedatangan, hari berikutnya.
- Chrome headless desktop & ponsel: belanja → masak → mulai berjualan → pelanggan datang & membayar →
  ringkasan → Hari 2; tanpa error console.

## Stage 4 — Day Cycle & Popularity ✅

Target: *satu siklus permainan dapat berjalan secara utuh.*

| Item | Status | Catatan |
| --- | --- | --- |
| Sistem waktu | ✅ | Jam berjalan 17.00–02.00 (Stage 3), pencahayaan sore→malam mengikuti jam |
| Penutupan hari | ✅ | Operasional Rp10.000 ditagih, popularitas & loyalitas dihitung, fase evaluasi, lanjut hari berikutnya |
| Laporan penjualan | ✅ | Pelanggan, dilayani, kecewa, penjualan, biaya bahan, promosi, operasional, laba bersih, laba kotor, terlaris, kurang diminati, kehabisan, sisa, terbuang (dengan modal), perubahan popularitas & status, kas |
| Popularitas | ✅ | Rumus berbobot dari aktivitas pelayanan, dibatasi ±6/hari, melambat di atas; membuka menu (≥ 20) |
| Pengaruh popularitas | ✅ | Kedatangan (0,6 + pop/25), pelanggan penasaran & royal, plus loyalitas → pelanggan tetap kembali |
| Promosi satu hari | ✅ | Selebaran, WhatsApp, media sosial, spanduk, influencer; perkiraan tambahan pelanggan & peringatan stok |
| Statistik | ✅ | Grafik penjualan & laba 14 hari, total sepanjang usaha, laporan terakhir |

### Verifikasi

- `npm run typecheck` bersih · `npm test` 18 file / 112 test lulus · `npm run build` sukses.
- Test baru: rumus popularitas (naik/turun, batas, tidak ekstrem per pelanggan), loyalitas, 5 iklan, efek & pembatalan,
  laporan keuangan konsisten (contoh angka dari dokumen desain), alur tutup hari membuka menu baru, migrasi save v3 → v4.
- Chrome headless desktop & ponsel: pasang iklan → berjualan → laporan → hari 2 → statistik; tanpa error console.

### Catatan

- Kas boleh negatif (ditampilkan merah). Penanganan bangkrut dirancang di Stage 5 bersama balancing ekonomi.

## Stage 5 — Economy & Progression ✅

1. **Harga jual** (`PricingSystem`): pemain mengatur harga tiap menu di panel Persiapan (±Rp500, batas 50–200% harga wajar).
   Harga dipakai di transaksi & anggaran pelanggan. Kemahalan menurunkan minat (elastisitas, pelanggan urung memesan)
   dan kepuasan (penalti per item) → popularitas turun. Murah: kadang pelanggan menambah porsi, margin menipis.
2. **Upgrade** (`upgrades.json` 17 item, `UpgradeSystem`): kategori Gerobak (standar/modern/premium), Peralatan
   (kompor tambahan, wajan besar, lemari pendingin, rak penyimpanan, peralatan minuman, lampu dekorasi),
   Kapasitas (bangku tambahan, tikar kedua, gudang besar, area makan luas), Lingkungan (meja & kursi bagus, dekorasi,
   papan nama, penerangan). Tiap upgrade punya harga, syarat (upgrade lain / popularitas / hari), deskripsi dan efek nyata:
   kedatangan, pelanggan baru, kepuasan, kesabaran, kecepatan layanan, porsi per masak (dasar 40), kapasitas gudang
   (dasar 500 satuan), umur simpan produk/bahan, kursi baru, minat minuman.
3. **Visual upgrade**: objek & kursi di peta bisa ber-`requires`; dunia dibangun ulang setelah membeli
   (kamera tetap, panel dibuka lagi). Varian gerobak standar/modern/premium, tenda berlampu warna-warni, bangku premium
   berbantal, papan nama "NASI KUCING", lampu taman, pot tanaman, tikar & bangku tambahan (kursi 10 → 20).
4. **Level usaha** = tingkat gerobak; resep baru ber-unlock `level`: nasi kucing & wedang jahe (L2), kopi joss & susu jahe
   (L3), sego bakar spesial (L4). Bahan baru: jahe, susu kental manis, arang.
5. **Cuaca** (`WeatherSystem`): deterministik per hari (cerah 45%, berawan 25%, hujan 20% dan cenderung beruntun,
   panas 10%). Hujan: pelanggan −25%, menu hangat ×1,7, es ×0,45; panas: es ×1,75, hangat ×0,7. Visual: rintik hujan,
   suasana gelap kebiruan & lampu lebih terasa; tooltip HUD menjelaskan pengaruhnya.
6. **Bangkrut**: kas minus saat tutup 3 hari berturut-turut → layar bangkrut (mulai usaha baru / ke menu).
   Laporan harian memberi peringatan hitungan utang. Investasi upgrade dicatat terpisah di laporan.
7. Save **v5** (migrasi v4→v5: upgrade, harga, debtDays, bankrupt).

### Verifikasi
- `tsc` bersih, **128 test** lulus (18 file) termasuk `progression.test.ts`: upgrade & syarat, efek nyata,
  gudang penuh, lemari pendingin, menu level, harga & elastisitas, cuaca, bangkrut, migrasi v5.
- **Simulasi bot 30 hari** (`tests/helpers/bot.ts`): pemain wajar tidak bangkrut, kas+investasi ±Rp1–5 jt,
  popularitas ±50, membeli ±14 upgrade; harga 1,8× atau belanja 2,5× berlebihan berujung rugi/bangkrut (tidak dalam seminggu).
- Uji browser (Chrome headless) desktop 1280×800 & mobile 390×844: beli semua upgrade gerobak/kapasitas/lingkungan,
  dunia berubah, malam + hujan, atur harga, layar bangkrut → mulai baru; tanpa error konsol.

## Stage 6 — Visual Polish ✅

1. **Audio prosedural** (`src/audio`, Web Audio, tanpa file aset): efek suara (klik, koin, kasir, memasak,
   upgrade, error, pelanggan kecewa, buka/tutup, iklan, menu baru, bangkrut), musik latar bernuansa gamelan
   (tangga nada slendro, bonang/gong/bas), suasana jangkrik malam & hujan. Aktif setelah sentuhan/klik pertama
   (aturan autoplay browser). `SoundDirector` memetakan perubahan state → suara.
2. **Pengaturan suara**: volume musik, efek, suasana + bisukan; dari menu utama ("Suara") dan menu jeda.
   Disimpan terpisah dari save permainan.
3. **Umpan balik visual**: koin memantul saat pelanggan bayar, angka perubahan kas melayang di HUD,
   gelembung pesanan "pop", pelanggan muncul perlahan & badan naik-turun saat melangkah,
   percikan cahaya di gerobak setelah upgrade, kartu judul "Hari N · tanggal · cuaca" di awal hari.
4. **Tutorial singkat** (5 langkah, `TutorialSystem` + `TutorialCoach`): belanja → masak → buka → layani →
   kembangkan. Maju otomatis sesuai tindakan pemain, tombol yang dituju berdenyut, bisa dilewati.
   Save v6 (save lama dianggap sudah lewat tutorial).
5. Papan nama kini menghadap pemain sehingga tulisan "NASI KUCING" terbaca lurus.
6. Menghormati `prefers-reduced-motion`.

### Verifikasi
- `tsc` bersih · **133 test** (19 file) lulus · build sukses.
- Test baru: pengaturan audio rusak, pola musik, pemetaan suara, alur tutorial, migrasi v5→v6.
- Chrome headless desktop & ponsel: panel suara, tutorial maju 1→3 lalu hilang, koin & angka kas,
  kartu Hari 2, alur upgrade; tanpa error console.

## Stage 7 — Testing & Optimization ✅

**Perbaikan bug**
- Pelanggan yang duduk di bangku terpotong/tertutup papan dudukan (urutan gambar salah pada bangku panjang).
  Kini pelanggan di bangku digambar tepat di atas bangkunya dan diangkat setinggi dudukan; gelembung ikut naik.
- Setelah membeli upgrade lalu kembali ke menu dan "Lanjutkan", panel Upgrade terbuka sendiri & kartu hari
  tidak muncul (Phaser menyimpan data restart lama). Data start kini dikosongkan.

**Optimasi**
- Depth & tekstur pelanggan/gelembung hanya diubah jika berubah (setDepth selalu memicu pengurutan ulang
  seluruh display list setiap frame).
- **Kualitas grafis** di Pengaturan: Otomatis / Tinggi / Hemat baterai. Mode hemat: 30 FPS,
  peta cahaya digambar ulang ±15×/detik saat kamera diam, hujan lebih sedikit partikel. Otomatis memilih hemat
  untuk perangkat sentuh dengan ≤4 inti CPU atau ≤3 GB RAM. Bisa diubah tanpa memuat ulang.
- Phaser dipisah ke chunk sendiri (`phaser-*.js` ±318 kB gzip) dari kode game (±68 kB gzip), sehingga
  pembaruan game tidak mengunduh ulang Phaser.

**Pengujian**
- `tests/stability.test.ts`: bot 60 hari (state selalu valid, stok tidak negatif, uang bulat, simpan-muat identik,
  ukuran save < 200 kB), determinisme, pemilihan kualitas grafis.
- `tests/e2e/smoke.py` (`npm run test:e2e`): alur penuh desktop & ponsel + cek error console, kebocoran listener,
  panel yang terbuka sendiri.
- Profil (Chrome headless, GPU perangkat lunak): JS per frame median ±0,8 ms (p95 ±3,5 ms); listener event tetap
  27 setelah 4× bangun ulang dunia & 3× bolak-balik menu; heap ±17–23 MB.

### Verifikasi
- `tsc` bersih · **136 test** (20 file) lulus · build sukses · e2e desktop & ponsel **LULUS** ·
  mode hemat + renderer Canvas tanpa error.

## Pembaruan 0.7.1 — Etalase, Gudang & Pesanan Rombongan

- **Papan "Siap Dijual"** (UI terpisah di kiri layar) saat persiapan & berjualan: makanan & minuman siap jual
  dengan jumlahnya. Menu yang habis **tetap tampil** sebagai "Nasi goreng × 0 · Habis" (dicoret), stok menipis
  (≤3) ditandai kuning. Bisa diciutkan; di layar lebar tetap terlihat di samping panel Persiapan/Belanja.
- **Panel Gudang**: kapasitas terisi (bar), nilai modal, tiap bahan dengan jumlah & satuan, umur simpan per batch
  ("10 basi besok · 6 awet"), menu yang memakainya (atau "tidak dipakai — aman dibuang"). Bahan bisa
  **dikurangi** (pilih jumlah) atau **dibuang semua** (dengan konfirmasi); yang paling cepat basi dibuang dulu,
  tanpa pengembalian uang. Dibuka dari papan Siap Dijual atau tombol Gudang di panel Belanja.
- **Pesanan rombongan**: setiap anggota rombongan kini memesan minimal 1 menu (bisa lebih), jadi rombongan
  2 orang memesan ≥2 menu, dst. Anggaran pelanggan di data kini **per orang** dan dikalikan jumlah orang.
- Test baru: papan stok (yang habis tetap tampil), buang bahan, pesanan ≥ jumlah orang (juga saat harga mahal).
  Total **140 test** lulus.

## Pembaruan 0.8.0 — Lokasi, Hari Kerja/Akhir Pekan, Event, Pencapaian & Bank

- **Lokasi baru "Dekat Kampus"** (`data/maps/kampus.json`, `data/locations.json`), dipilih saat mulai permainan baru.
  Gedung kampus memanjang (art baru: 3 lantai, lobi berpilar, papan "KAMPUS"), ruko fotokopi, taman kampus dengan
  bangku & lampu. Keunikan: mahasiswa ×3, ramai lewat jam 22.00 (×1,45), anggaran pelanggan −10%, hari kuliah ramai,
  akhir pekan sepi, sewa Rp15.000/hari. Jalan Kampung: akhir pekan paling ramai, sewa Rp10.000.
- **Hari kerja vs akhir pekan**: pengali kedatangan per hari dalam seminggu per lokasi (`LocationSystem`). HUD hari &
  kartu awal hari menunjukkan "akhir pekan · pengunjung ramai/sepi".
- **Event acak harian** (`data/events.json`, `EventSystem`): ±50% hari, deterministik per hari & lokasi. 12 event:
  nobar bola, hajatan & pesanan himpunan (pesanan **borongan** yang dikirim saat buka jika stok cukup, dibayar lebih
  mahal; batal & popularitas −1,5 jika kurang), acara kampus, harga cabai/gula naik, telur murah, pemadaman,
  penertiban parkir, kopdar ojol, food vlogger (ulasan +4/−3 popularitas), tanggal gajian (hanya tgl 25–2).
  Ditampilkan sebagai chip di bawah jam (ketuk untuk rincian), di kartu hari, papan Siap Dijual, Belanja (tag harga), dan laporan.
- **Pencapaian** (16, `AchievementSystem`): dari porsi pertama sampai Rp10 juta omzet, popularitas 90, 7 hari untung,
  hari tanpa pelanggan kecewa, gerobak premium, borongan, deposito jatuh tempo, lunas utang, bertahan 30 hari,
  khusus lokasi kampus. Tiap pencapaian memberi hadiah uang kecil; panel dengan progres (menu jeda & Statistik).
- **BANK** (`BankSystem`, tombol Bank atau ketuk HUD kas):
  - Deposito tempo 1/2/4 minggu, bunga **0,5% per hari** dari pokok masuk ke saldo tiap tutup hari, **bisa ditarik
    kapan saja** (pokok + bunga). Jika ditahan sampai jatuh tempo, otomatis cair ke kas + bonus (1%/3%/8%).
  - Pinjaman satu aktif, plafon naik dengan level usaha & popularitas, bunga 1%/hari dari sisa pokok, bisa dicicil;
    saat jatuh tempo sisa utang dipotong otomatis. Bunga pinjaman > bunga deposito (tidak bisa "cetak uang").
  - Kas minus saat tutup ditutup otomatis dari deposito. Bunga & pencairan tampil di laporan harian.
- Save v7 (migrasi dari v6). Ponsel: bilah aksi selebar layar dengan label pendek, kontrol kamera di atasnya.
- **153 test** (22 file) lulus, e2e desktop & ponsel LULUS (termasuk deposito & tarik).

## Pembaruan 0.9.0 — Pindah Lokasi, 4 Peta & Kulkas

- **Pindah lokasi saat persiapan** (bukan lagi dipilih di awal): ketuk chip 📍 di bawah jam atau "Pindah lokasi" di
  menu jeda. Panel membandingkan keempat lokasi (sifat, sewa, **perkiraan ramai hari ini & event di sana**).
  Aturan: hanya saat persiapan, maksimal sekali sehari, bayar biaya pindah lokasi tujuan, loyalitas ×0,6 (sebagian
  pelanggan tetap tidak ikut), event & pesanan borongan mengikuti lokasi baru. Stok, upgrade, tabungan ikut pindah.
  Biaya pindah dicatat di laporan harian. Permainan baru selalu mulai di Jalan Kampung.
- **Peta baru "Pinggir Pasar"** (`maps/pasar.json`): deretan lapak pasar beratap terpal (art baru, 4 warna).
  Bahan baku −10%, sangat ramai 17.00–21.00, tapi sepi setelah 21.30 dan banyak pesaing; keluarga & pedagang,
  kantong pas-pasan, sewa Rp14.000. Tantangan: kursi & stok untuk lonjakan sore, jangan sisakan stok malam.
- **Peta baru "Depan Stasiun"** (`maps/stasiun.json`): gedung stasiun kolonial dengan menara jam & peron, rel kereta,
  deretan ojol. Dua gelombang (pulang kerja 17.00–19.30 & kereta terakhir 23.00–01.00), sepi di tengah,
  pekerja & ojol dominan, anggaran +15%, **pelanggan kurang sabar (−3 menit)**, sewa termahal Rp20.000.
  Tantangan: layanan cepat (kompor tambahan) dan kursi cukup saat gelombang.
- Sifat lokasi kini lengkap: jam ramai/sepi per lokasi, kesabaran, harga bahan, biaya pindah (`locations.json`).
- **Upgrade Kulkas** (Peralatan, Rp275.000): minuman matang +2 hari, es batu & bahan dingin (air, susu) +3 hari,
  bahan mentah lain +1 hari sebelum basi. Bahan dingin ditandai `chilled` di `ingredients.json`.
- Save v8 (migrasi dari v7). **161 test** (23 file) lulus; bot 20 hari di keempat lokasi tidak bangkrut;
  e2e desktop & ponsel LULUS (termasuk pindah lokasi).

## Pembaruan 0.10.0 — Pasar Malam, Menu & Upgrade Baru

- **10 menu baru** (total 30): pisang goreng, kacang rebus, es jeruk, jagung bakar, kopi susu, bihun goreng,
  roti bakar cokelat, teh tarik, es kopi susu, pisang bakar keju-cokelat. 7 bahan baru (pisang, jagung, kacang,
  roti, bihun, jeruk, cokelat). Terbuka bertahap lewat popularitas, kas, dan level usaha.
- **Gudang**: rak dinding (+200), gudang sewaan (+1.000), gudang berpendingin (+1.500 & bahan lebih awet) —
  kapasitas maksimal 4.100 satuan.
- **Tempat duduk**: kursi plastik lipat (+2), tikar lesehan ketiga (+4), meja payung taman (+4) — total 30 kursi.
  Objek & kursi baru (art kursi plastik dan meja payung) ada di kelima peta.
- **Kenyamanan pelanggan** (Lingkungan): kipas angin (kepuasan +4 saat panas), terpal anti hujan (pengunjung saat
  hujan 75% → 90%, kepuasan +4 saat hujan), Wi-Fi gratis (+3 menit sabar), radio musik (+2 kepuasan), obat nyamuk,
  bangku antre teduh (+4 menit sabar), toilet & cuci tangan (+2 kepuasan, +2 menit).
- **Lokasi baru "Pasar Malam"**: bianglala bercahaya, komidi putar, lapak & untaian lampu warna-warni.
  Keunggulan: ramai 20.30–02.00 (pengali larut malam), akhir pekan +45–60%, banyak pengunjung baru, anggaran +5%.
  Tantangan: sore sepi, hari kerja −10–15%, sedikit pelanggan tetap, bising (−1 menit sabar), bahan +8%,
  sewa Rp22.000, retribusi acara. Bot 28 hari: bertahan tapi lebih berat dari Jalan Kampung kalau mulai tanpa upgrade.
- **Event baru**: konser dangdut, pesta kembang api, pesanan panitia pasar malam (borongan makanan),
  rombongan bus wisata (borongan **minuman**, juga di stasiun), retribusi kebersihan (biaya Rp20.000),
  bianglala rusak, pesanan pedagang pasar (Pinggir Pasar). Pesanan borongan kini bisa makanan atau minuman.
- **167 test** (24 file) lulus.

## Rilis web & PWA (HP + desktop)

- **PWA**: manifest + ikon (termasuk *maskable* Android & `apple-touch-icon` iOS), service worker hasil build
  (`pwa/sw.js` + plugin di `vite.config.ts`) → game bisa **di-install** ke layar utama dan **dimainkan offline**
  sejak kunjungan pertama.
- Tombol **"Pasang game"** di menu utama: memicu dialog install Chrome/Edge/Android; di iPhone/iPad menampilkan
  panduan *Bagikan → Tambah ke Layar Utama*. Disembunyikan saat sudah terpasang atau saat game di dalam iframe.
- **Update aman**: versi baru dipasang otomatis saat game dibuka & pemain masih di menu utama; kalau sedang
  berjualan cukup notifikasi (tanpa reload). Aset ber-hash (Phaser) dipakai ulang → update hemat kuota.
- Saat berjalan sebagai aplikasi terpasang, game meminta *persistent storage* agar save tidak dihapus browser.
- **Hosting**: workflow GitHub Pages (`ci/deploy-pages.yml` → `.github/workflows/`), `npm run pack:itch` (ZIP itch.io
  tanpa dependensi baru), `public/_headers` untuk Netlify/Cloudflare. Panduan: `docs/DEPLOY.md`.
- Verifikasi (Chrome): 0 error installability, offline reload & mulai bermain offline OK, hosting di subfolder
  (`/juragan-angkringan/`) OK, emulasi iPhone 13 & Pixel 7 landscape tanpa error, iframe tidak mendaftarkan SW,
  alur update di menu & saat bermain sesuai.

## Pembaruan 0.11.0 — Panduan & Info, urutan menu

- **Tombol "Panduan & Info"** di menu utama, di menu jeda (☰ / Esc), dan pintasan **H** saat bermain.
  Isinya 10 tab yang dibaca langsung dari data game (selalu sesuai aturan terbaru):
  cara main & angka penting (popularitas, loyalitas, kepuasan, stok, bangkrut), **semua event** (lokasi, tanggal,
  efek, pesanan borongan), **cuaca** (peluang, efek pengunjung & menu hangat/dingin, upgrade penangkal),
  **lokasi** (sewa, biaya pindah, jam ramai, ramai per hari), **tipe pelanggan**, **menu** (bahan, syarat buka,
  harga wajar), **upgrade** (syarat & efek), **bank & promosi**, **pencapaian**, dan **kontrol**.
  Saat dibuka di dalam permainan, panel menandai event & cuaca hari ini, lokasimu, menu yang sudah terbuka,
  upgrade yang terpasang, dan pencapaian yang sudah didapat.
- **Urutan menu di Persiapan**: menu yang sudah terbuka di atas, yang masih terkunci di bawah; di tiap kelompok
  makanan (makanan → gorengan → sate & bakaran) dulu, baru minuman. Ada judul kelompok "Makanan", "Minuman",
  dan "Masih terkunci".
- 171 test (25 file) lulus, e2e desktop & ponsel LULUS.

## Pembaruan 0.11.1 — Catatan Pembaruan

- Panel **"Apa yang baru"** muncul sendiri **sekali** di halaman awal setiap kali versi game berubah
  (versi terakhir yang dilihat disimpan di `localStorage`, terpisah dari save). Versi yang lebih baru dari
  kunjungan terakhir diberi tanda "Baru".
- Ikon **📜 di pojok kanan atas** halaman awal membuka panel itu lagi kapan saja; titik merah menandai ada
  pembaruan yang belum dilihat.
- Isinya riwayat lengkap 0.1.0 → sekarang (`src/data/changelog.ts`). **Saat menaikkan versi, tambahkan entri baru
  di paling atas** — test memastikan entri teratas sama dengan `GAME_CONFIG.version`.
- 172 test lulus; e2e desktop & ponsel LULUS (muncul sekali, tidak muncul lagi setelah kembali ke menu/reload,
  bisa dibuka lewat ikon).

## Pembaruan 0.12.0 — Kabar Kampung & Buku Dapur Kardi

Implementasi `claude/rencana-0.12.0.md` dengan isi cerita dari `claude/alur-cerita.md`.

- **Data** (`src/data/news.json`, `storyChapters.json`, `namedCustomers.json`, dimuat & divalidasi oleh `data/story.ts`):
  18 kabar (5 penting: tanah diukur, tawaran Pak Hendra, penggusuran 14 hari, halaman Sambal Sri, keputusan),
  4 pelanggan bernama (Pak Gito, Bu Surti, Mas Bayu, Pak Hendra) dengan menu favorit dan obrolan per tahap,
  7 bab Buku Dapur Kardi, 4 pilihan, 5 akhir. Hari di data = *hari cerita* (save lama mulai dari hari saat diperbarui).
- **`systems/StorySystem.ts`**: status kabar `belum_dibaca | dibaca | diringkas`; kabar penting menahan kabar yang
  bergantung padanya; **pengaman 5 hari** (kabar tak dibaca → ringkasan "didengar dari warga", dianggap sudah
  didengar, cerita tak pernah terkunci); jadwal kunjungan deterministik (pembicara kabar pasti mampir, satu kabar per
  pembicara per hari); **tahap hubungan 0–3** (puas +1, menu favorit +1, mengobrol +1/hari, pergi −1; tahap tidak turun);
  syarat bab (bab 4 punya pengaman Pinggir Pasar 7 hari); babak 1–4; keputusan & efeknya; akhir 3 hari setelah memilih.
- **Save v9** (`StoryState` di `GameState`, migrasi v8→v9).
- **Simulasi**: `SalesSimulation` menerima `namedVisits`; pelanggan bernama datang sendirian, sedikit lebih sabar,
  mencari menu favorit (`planNamedCustomer`). Sprite & palet khusus per tokoh.
- **UI**: gelembung "..." di atas pelanggan bernama (berkedip jika ada kabar, bisa diketuk, nama di bawah kaki);
  `ui/DialoguePanel.ts` panel bawah gaya RPG (potret kiri, nama cyan, teks putih; Enter/Spasi/ketuk lanjut) —
  **jam ditahan selama dialog** (`UIManager.holdTime`) sehingga kesabaran pelanggan berhenti;
  tombol HUD **Kabar Kampung** dengan lencana (kabar belum dibaca + bab baru + keputusan), juga di menu jeda & tombol N;
  `ui/StoryPanel.ts` (tab Kabar, Buku Dapur, Warga, Keputusan); pengingat kabar penting / keputusan di laporan harian;
  petunjuk sekali "ketuk gelembung" di `TutorialCoach`; layar akhir cerita + Bab 7, lalu mode bebas.
- Resep cerita **Sego Sambal Sri** (unlock jenis baru `story`, dari Bab 6). Ekonomi lain tidak berubah kecuali lewat pilihan akhir.
- Perbaikan sentuh: klik sintetis setelah mengetuk gelembung tidak lagi langsung menutup dialog.
- Verifikasi: 184 test (26 file) lulus termasuk `tests/story.test.ts` (status kabar, pengaman 5 hari, jadwal kunjungan,
  hubungan, alur penuh pemain rajin → akhir lengkap, pemain cuek tetap sampai keputusan, efek pilihan, migrasi, simulasi);
  e2e desktop & ponsel LULUS; uji browser gelembung → dialog → log → keputusan → akhir di desktop & ponsel mendatar.

## Pembaruan 0.13.x — Pesanan Online

- 0.13.0: pesanan online (kurir sendiri / kemitraan ojol), rating kemitraan, event online, 4 upgrade; bar bawah ringkas + lembar Usaha; info kursi di HUD.
- 0.13.1: filter Semua/Makanan/Minuman di menu dapur; kecepatan otomatis 1× saat pesanan online masuk.
- 0.13.2: pengantar bermotor terlihat di jalan samping gerobak (`world/RiderLayer.ts`).
- 0.13.3: sakelar buka/tutup pesanan online, harga menu online terpisah (dengan filter), rating berbintang; kurir sendiri tanpa batas antar.

## Pembaruan 0.14.0 — Cabang Angkringan

| Item | Status | Catatan |
| --- | --- | --- |
| Data | ✅ | `branches.json` (3 slot: Rp1,5/3/5 jt, level usaha 2/3/4, popularitas 40/55/70), `branchUpgrades.json` (5), `branchStaff.json` (harian/mingguan/bulanan) |
| State & save | ✅ | `GameState.branches`, save v12 (save lama tanpa cabang tetap bisa dimuat) |
| Sistem | ✅ | `BranchSystem` (buka, tutup, pindah, upgrade, penjualan latar belakang saat tutup hari), `BranchStatusSystem`, `BranchStaffSystem` (gaji, ikatan, telat, keluar), `BranchSupplySystem` (kirim stok FEFO, ongkir gratis bila kurir sendiri/motor cabang) |
| Aturan lokasi | ✅ | Satu lokasi untuk satu angkringan buka (termasuk toko utama); cabang ikut event harian lokasinya |
| UI | ✅ | Cabang di lembar Usaha (titik merah), `ui/BranchPanel.ts` (slot, detail, pilih lokasi, kirim stok, upgrade), bagian Cabang di laporan + rincian (kartu di < 480 px), Panduan, petunjuk sekali |
| Tes | ✅ | `tests/branches.test.ts`, `tests/branchLocation.test.ts` — 227 test lulus |

## Status akhir

Ketujuh stage dari dokumen desain selesai. Ide lanjutan: lebih banyak peta/lokasi, event acak harian
(razia, pesanan rombongan), pencapaian, dan aset sprite buatan tangan menggantikan grafis prosedural.

## Alat: Editor Peta ✅

Editor visual untuk membuat & mengubah peta, simpan langsung ke project. Panduan: `docs/MAP-EDITOR.md`.

- `npm run editor` → `http://localhost:5180/tools/map-editor/` (server khusus, hanya localhost; tidak ikut build game).
- Gambar ubin & objek memakai generator art game yang sama; urutan kedalaman sama dengan `WorldBuilder`.
- Alat: Pilih (seret, pilih area, panah, gandakan), Tanah (kuas 1–5, kotak, ember, ambil warna), Objek (28 jenis, varian, "muncul setelah upgrade"), Titik (kursi + jalur, jalur datang, antrean, pintu masuk, kamera).
- Tab Peta (nama, id, ubah ukuran dengan geser isi, daftar objek), Lokasi (daftarkan ke `locations.json`: sewa, pengali hari, tipe pelanggan, jam khusus, keunggulan), Cek (error dari `parseMapData` + peringatan, misalnya jumlah kursi upgrade).
- Simpan: validasi ulang di server, cadangan otomatis ke `tools/map-editor/backups/`, hanya entri lokasi yang berubah yang ditulis ulang, editor tidak termuat ulang sendiri setelah menyimpan. Ada Unduh JSON, urungkan/ulangi, draf cadangan di browser.
- `src/world/maps.ts` kini memakai `import.meta.glob`: peta baru di `src/data/maps/` langsung terdaftar.
- Verifikasi: 23 test baru (`tests/mapEditor.test.ts`), semua peta bawaan tetap sama setelah dibuka & disimpan ulang; uji browser semua alat + simpan + peta baru dimuat di game tanpa error.

## Alat: Studio Objek (objek buatan sendiri) ✅

Bagian dari editor peta (alat Objek → **+ Objek baru**). Panduan & cara mengaktifkan AI: `docs/MAP-EDITOR.md`.

- Editor piksel: pensil, hapus, ember, pipet, garis, kotak, geser, cermin X, kuas 1–3 px, palet game, undo/redo, impor PNG (lembar frame dipecah otomatis), unduh PNG.
- Buat dari deskripsi dengan mesin yang bisa dipilih: prosedural bawaan (offline, 16 jenis bentuk + warna/ukuran/efek dari kata kunci), OpenAI, Google Gemini, atau tool pixel asset sendiri (HTTP generik). Kunci API di `.env.local`, hanya dibaca server editor. Hasil AI otomatis dibuang latarnya, diperkecil, dan disesuaikan ke palet game; semua hasil bisa diedit.
- Animasi beberapa frame (ms per frame), alas & titik pijak, urutan gambar, menghalangi jalan, bisa jadi tempat duduk (tinggi dudukan), lampu malam (warna, jangkauan, terang, kedip, pendar).
- Game: `objectTypes.ts` kini punya registri objek kustom (`objectType(id)`, id `c_...`), PNG dimuat di LoadingScene (`src/graphics/customArt.ts`), animasi & lampu ikut WorldBuilder, pelanggan duduk di objek kustom bertanda tempat duduk (CustomerLayer).
- Verifikasi: 287 test lulus (27 baru di `tests/customObjects.test.ts`), uji klik studio di browser (termasuk mesin AI tiruan), objek kustom tampil di game tanpa error.
