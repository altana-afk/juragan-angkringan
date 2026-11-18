# Rilis Game — Bisa Dimainkan di HP & Desktop

Juragan Angkringan adalah **web game**: siapa pun cukup membuka sebuah link di browser (Chrome, Safari,
Firefox, Edge — di HP Android, iPhone/iPad, laptop, atau PC). Tidak perlu unduh APK atau installer.

Game juga sudah menjadi **PWA (Progressive Web App)**:

- Bisa **dipasang ke layar utama** HP/desktop lewat tombol **"Pasang game"** di menu utama — terbuka
  layar penuh seperti aplikasi biasa, dengan ikon gerobak angkringan.
- Bisa **dimainkan offline** setelah sekali dibuka (seluruh game ±1,5 MB tersimpan di perangkat).
- **Update otomatis**: setelah kamu deploy versi baru, pemain mendapatkannya saat membuka game lagi.
  Kalau pemain sedang berjualan, update ditunda (tidak ada reload mendadak); Phaser (±1,2 MB) tidak
  diunduh ulang, jadi update hemat kuota.

> Progres pemain disimpan di browser masing-masing (LocalStorage), **per alamat situs**. Pilih satu
> alamat hosting dan pertahankan — kalau pindah alamat, pemain mulai dari nol di alamat baru.

---

## Pilihan hosting (semuanya gratis)

| Pilihan | Cocok untuk | Link contoh | PWA / offline |
| --- | --- | --- | --- |
| **A. GitHub Pages** (direkomendasikan) | Link sendiri, update otomatis tiap `git push` | `https://<username>.github.io/juragan-angkringan/` | ✅ Penuh |
| **B. itch.io** | Komunitas pemain indie, halaman game + komentar | `https://<username>.itch.io/juragan-angkringan` | ➖ Main di browser saja |
| **C. Netlify / Cloudflare Pages** | Drag-and-drop tanpa Git | `https://juragan-angkringan.netlify.app` | ✅ Penuh |

Boleh lebih dari satu sekaligus, misalnya GitHub Pages sebagai "rumah" + itch.io untuk promosi.

---

## A. GitHub Pages (otomatis dari Git)

Workflow sudah disiapkan di `ci/deploy-pages.yml`: setiap push ke branch `main`, GitHub
menjalankan typecheck + unit test + build, lalu mempublikasikan `dist/`. Kalau test gagal, versi lama tetap
tayang (aman).

**Sekali setup:**

1. Buat repository baru di GitHub, misalnya `juragan-angkringan` (boleh **Public**; repo Private butuh
   GitHub Pro untuk Pages).
2. Pindahkan workflow ke tempat yang dibaca GitHub (sekali saja). Di PowerShell, dari folder proyek:

   ```powershell
   New-Item -ItemType Directory -Force .github\workflows | Out-Null
   Move-Item ci\deploy-pages.yml .github\workflows\deploy-pages.yml
   ```

3. Masih di folder proyek, jalankan:

   ```bash
   git init
   git add .
   git commit -m "Juragan Angkringan v0.10.0"
   git branch -M main
   git remote add origin https://github.com/<username>/juragan-angkringan.git
   git push -u origin main
   ```

4. Di GitHub: **Settings → Pages → Build and deployment → Source: "GitHub Actions"**.
5. Buka tab **Actions**, tunggu workflow "Deploy ke GitHub Pages" hijau (±2 menit).
   Link game muncul di ringkasan workflow dan di Settings → Pages.

**Update berikutnya:** cukup `git add . && git commit -m "..." && git push`.

---

## B. itch.io

1. Buat paket ZIP:

   ```bash
   npm run pack:itch
   ```

   Hasil: `release/juragan-angkringan-v<versi>-web.zip` (±400 kB).
2. Di itch.io: **Dashboard → Create new project**.
   - **Kind of project:** HTML
   - **Uploads:** unggah ZIP tadi, centang **"This file will be played in the browser"**.
   - **Embed options:** pilih *Click to launch in fullscreen* (paling nyaman di HP), atau ukuran
     viewport mis. 1280 × 720 dengan **Mobile friendly** dicentang dan orientasi *Default*.
   - Centang **Fullscreen button**.
3. Isi judul, deskripsi, screenshot → **Save** → ubah *Visibility* ke **Public** saat siap.

Di itch.io game berjalan di dalam iframe, jadi fitur install/offline otomatis dinonaktifkan (game tetap
normal). Untuk versi yang bisa di-install, arahkan pemain ke link GitHub Pages / Netlify.

---

## C. Netlify atau Cloudflare Pages

**Paling cepat (tanpa Git):** jalankan `npm run build`, lalu buka <https://app.netlify.com/drop> dan seret
folder `dist/` ke halaman itu. Link langsung jadi; ganti nama situs di *Site configuration*.

**Otomatis dari GitHub:** hubungkan repo di Netlify / Cloudflare Pages dengan:

- Build command: `npm run build`
- Output / publish directory: `dist`
- Node version: 22 (env `NODE_VERSION=22`)

File `public/_headers` sudah mengatur cache yang benar di kedua layanan ini (aset ber-hash di-cache
selamanya, `sw.js` & `index.html` selalu dicek ulang).

---

## Uji sebelum dibagikan

```bash
npm run check      # typecheck + unit test + build
npm run preview    # buka http://localhost:4173 (juga dari HP di Wi-Fi yang sama: http://<IP-laptop>:4173)
```

Catatan: mode offline & tombol "Pasang game" hanya aktif di **HTTPS** atau `localhost`. Saat dibuka dari HP
lewat `http://<IP-laptop>:4173`, game tetap bisa dimainkan, tetapi fitur PWA baru terlihat setelah di-hosting.

Daftar cek di perangkat nyata setelah deploy:

- [ ] Android (Chrome): buka link → menu utama → **Pasang game** → ikon muncul di layar utama.
- [ ] iPhone (Safari): **Pasang game** menampilkan panduan *Bagikan → Tambah ke Layar Utama*.
- [ ] Buka dari ikon, mainkan sebentar, aktifkan **mode pesawat**, tutup & buka lagi → tetap jalan.
- [ ] Desktop (Chrome/Edge): ikon install di address bar / tombol **Pasang game**.

---

## Cara kerja teknis (untuk pengembang)

| File | Fungsi |
| --- | --- |
| `public/manifest.webmanifest` | Nama, ikon, warna, mode layar penuh aplikasi |
| `public/icons/*` | Ikon 192/512, ikon *maskable* Android, `apple-touch-icon` iOS |
| `pwa/sw.js` | Template service worker (cache offline & strategi update) |
| `vite.config.ts` → `pwaServiceWorker()` | Saat build, mengisi daftar file & versi cache lalu menulis `dist/sw.js` |
| `src/pwa/pwa.ts` | Registrasi service worker, tombol install, notifikasi update, penyimpanan permanen |
| `public/_headers` | Aturan cache HTTP untuk Netlify / Cloudflare Pages |
| `.github/workflows/deploy-pages.yml` | CI/CD GitHub Pages (awalnya di `ci/`, lihat langkah A.2) |
| `scripts/pack-itch.mjs` | Membuat ZIP untuk itch.io tanpa dependensi tambahan |

- Service worker hanya aktif di build produksi; `npm run dev` tidak terpengaruh.
- Versi cache = hash isi build, jadi setiap build yang berbeda otomatis menjadi update.
- Saat dijalankan sebagai aplikasi terpasang, game meminta *persistent storage* agar save tidak dihapus
  browser ketika memori HP penuh.

## Google Analytics 4 (opsional)

Kode ada di `src/analytics/analytics.ts`. Analytics hanya aktif jika ID pengukuran diisi, **tidak** di localhost atau `?debug`, dan pemain tidak mematikannya di Pengaturan → "Kirim statistik anonim".

1. Buka <https://analytics.google.com> → Admin → Buat properti → Platform **Web** → isi alamat situs game → salin **Measurement ID** (`G-XXXXXXX`).
2. GitHub Pages: repo → Settings → Secrets and variables → Actions → tab **Variables** → New repository variable `VITE_GA_ID` = ID tadi. Push berikutnya otomatis memakai ID ini.
3. Build manual (itch.io / Netlify): buat file `.env` dari `.env.example` dan isi `VITE_GA_ID`, lalu `npm run build`.

Event yang dikirim: `game_open`, `game_new`, `game_continue`, `sales_start`, `day_end` (hari, pendapatan, laba, pelanggan, kepuasan, popularitas, lokasi, cuaca, jumlah cabang, mode online), `upgrade_buy`, `branch_open`, `location_move`, `achievement_unlock`, `panel_open`, `bankrupt`. Waktu bermain dan jumlah pemain dicatat otomatis oleh GA4 (Engagement time, Active users).

Agar parameter `day_end` bisa dipakai di laporan: Admin → Custom definitions → buat dimensi/metrik kustom untuk `day`, `net_profit`, `revenue`, `location`, dll.

## Akun & simpan di awan (Firebase, opsional)

Pemain bisa memilih masuk dengan **Google** atau **email + kata sandi** lewat ikon 👤 di menu utama, supaya progres tersimpan di akun dan bisa dilanjutkan di perangkat lain. Tanpa login, save tetap di LocalStorage seperti biasa. Tombol Akun hanya muncul jika konfigurasi Firebase diisi. Kode: `src/cloud/`.

1. Buka <https://console.firebase.google.com> → **Add project** (Google Analytics di sini boleh dimatikan).
2. **Build → Authentication → Get started → Sign-in method**: aktifkan **Google** (isi email dukungan) dan **Email/Password**.
3. **Authentication → Settings → Authorized domains**: tambahkan domain game, mis. `altana-afk.github.io` (juga domain itch.io/Netlify jika dipakai).
4. **Build → Firestore Database → Create database** (mode produksi, lokasi `asia-southeast2` Jakarta). Tab **Rules**: tempel isi file `firestore.rules` → **Publish**.
5. **Project settings (⚙) → General → Your apps → Web (</>)** → daftarkan app → salin `apiKey`, `authDomain`, `projectId`, `appId`.
6. GitHub repo → Settings → Secrets and variables → Actions → **Variables**: buat `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`. Lalu di `.github/workflows/deploy-pages.yml`, pada langkah `npm run check`, tambahkan keempatnya di bagian `env:`.
7. Build manual: isi variabel yang sama di `.env` (lihat `.env.example`).

Nilai konfigurasi web Firebase bukan rahasia (memang dikirim ke browser); keamanan data dijaga oleh aturan Firestore: setiap pemain hanya bisa membaca/menulis `saves/{uid}` miliknya.

Cara kerja sinkron: saat login, save di perangkat dibandingkan dengan save di akun — jika keduanya ada dan berbeda, pemain memilih yang dipakai (yang lain dicadangkan di perangkat). Selama bermain, save diunggah paling cepat setiap 30 detik, saat kembali ke menu, dan saat tab/aplikasi ditutup.

### Pengaman save & username (paket gratis)

- **Segel save:** setiap save diberi segel (`seal` di file save, `sig` di Firestore). Save yang diedit manual di LocalStorage tetap bisa dimainkan tetapi ditandai `tampered: true` (untuk dikecualikan dari leaderboard). Di Firestore, aturan menolak unggahan yang segelnya tidak cocok atau angkanya tidak masuk akal, dan save akun yang diubah lewat Console diabaikan game. Ini pengaman tanpa server: orang yang membongkar kode game masih bisa memalsukan; untuk leaderboard yang benar-benar aman dibutuhkan validasi server (Cloud Functions, paket Blaze).
- **Username:** `users/{uid}` (profil publik: `username`, `usernameLower`, `changedAt`) dan `usernames/{nama_huruf_kecil}` (`uid`) sebagai kunci keunikan. Aturan menjamin satu nama satu akun, format 3–16 huruf/angka/_, dan ganti paling cepat 30 hari sekali.
- **Setiap kali `firestore.rules` berubah, tempel ulang ke Firebase Console → Firestore → Rules → Publish.**
