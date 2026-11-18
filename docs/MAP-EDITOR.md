# Editor Peta

Editor visual untuk membuat & mengubah peta isometrik game, lalu menyimpannya **langsung ke project**
(`src/data/maps/<id>.json`, dan opsional `src/data/locations.json`). Ubin & objek digambar dengan
generator pixel art yang sama dengan game, jadi tampilan di editor = tampilan di game.

## Menjalankan

```bash
npm run editor
```

Browser terbuka di `http://localhost:5180/tools/map-editor/`. Server ini hanya bisa diakses dari
komputer sendiri karena ia menulis file. Game juga bisa dibuka di alamat yang sama (`/`, tombol
**Buka game**) untuk mencoba peta.

Editor tidak ikut ke hasil build game (`npm run build`).

## Alur kerja singkat

1. **Peta baru…** → isi nama (id file dibuat otomatis) → mulai dari *salinan peta yang ada* (paling
   cepat, area angkringan sudah lengkap) atau *kosong*.
2. **Tanah (B)**: kuas 1×1 sampai 5×5, kotak, atau ember. Klik kanan = ambil jenis tanah.
3. **Objek (O)**: pilih dari palet (gambar asli game), pilih varian & "Muncul" (selalu / setelah
   upgrade tertentu), klik peta untuk memasang.
4. **Pilih (V)**: klik/seret untuk memindah, seret area kosong untuk memilih banyak, panah untuk
   menggeser sejauh nilai Snap, Delete untuk menghapus, Ctrl+D untuk menggandakan.
5. **Titik (P)**: data pelanggan.
   - *Kursi*: klik tempat duduk, lalu klik jalur dari **Pintu masuk** menuju kursi secara berurutan,
     Enter / klik kanan untuk selesai.
   - *Jalur datang*: dari tepi/luar peta menuju Pintu masuk.
   - *Antrean*: dari depan gerobak ke belakang.
   - *Pintu masuk* & *Kamera*: satu titik saja.
6. Tab **Lokasi**: centang agar pemain bisa memilih peta ini sebagai lokasi usaha, isi nama, tagline,
   sewa, pengali hari, jam ramai/sepi, dll.
7. Tab **Cek**: error harus beres sebelum bisa disimpan (pemeriksaan memakai `parseMapData` milik
   game). Peringatan boleh diabaikan, tapi baca dulu: misalnya upgrade "Bangku tambahan" yang belum
   punya kursi di peta ini.
8. **Simpan ke project** (Ctrl+S).

Lalu buka game (muat ulang tab game bila sudah terbuka) dan pindah lokasi lewat chip 📍 di bawah jam (saat Persiapan).

## Studio objek (objek buatan sendiri)

Alat **Objek (O)** → **+ Objek baru** (atau pilih objek buatanmu → **Edit gambar**). Di studio:

- **Gambar sendiri**: Pensil (B), Hapus (E), Ember (G), Pipet (I / Alt+klik), Garis (L), Kotak (R, Shift = terisi),
  Geser (M). Kuas 1–3 px, Cermin X, grid, undo/redo (Ctrl+Z / Ctrl+Y), palet warna game + warna bebas.
  Klik kanan = hapus piksel.
- **Impor PNG** (mis. dari Aseprite). Lembar berisi beberapa frame berjajar ke kanan dipecah otomatis.
- **Buat dari deskripsi**, pilih mesinnya:
  - *Prosedural (bawaan)*: gratis & offline. Mengenali jenis (gerobak, lapak, payung, meja, bangku, kursi,
    lampion, lampu, obor, pohon, pot, tong, papan, peti, rumah, pagar), warna ("merah", "atap biru"),
    ukuran ("kecil", "besar", "tinggi", "panjang"), dan efek ("menyala", "berkedip", "api").
  - *OpenAI* / *Google Gemini*: kualitas lebih bagus, berbayar. Hasilnya otomatis dibuang latarnya,
    diperkecil ke ukuran kanvas, dan disesuaikan ke palet game.
  - *Tool pixel asset milikku*: mengirim `POST` JSON `{ prompt, full_prompt, width, height, transparent }`
    ke `PIXEL_TOOL_URL`. Tool boleh membalas PNG langsung, atau JSON yang berisi base64/data URL
    (mis. `{ "b64_json": "..." }`). Opsional `PIXEL_TOOL_TOKEN` dikirim sebagai `Authorization: Bearer`.
  Semua hasil bisa diedit lagi piksel per piksel.
- **Animasi**: Frame baru / Gandakan / Hapus frame, Putar untuk pratinjau, atur ms per frame.
- **Ukuran & alas**: ukuran kanvas, alas (ubin), urutan gambar, titik pijak (belah ketupat kuning = alas di peta).
- **Perilaku**: menghalangi jalan; bisa jadi tempat duduk (+ tinggi dudukan) lalu taruh Kursi di atasnya.
- **Lampu malam**: alat Lampu (T), klik bohlam; atur warna, jangkauan, terang, kedip, pendar.

Disimpan ke `src/assets/custom-objects/<id>.png` + `src/data/customObjects.json`, lalu langsung bisa dipasang
di peta dan dimuat game (ikut build & PWA). Objek yang masih dipakai peta tidak bisa dihapus.

### Mengaktifkan mesin AI

Buat file `.env.local` di root project (sudah diabaikan git, kunci tidak pernah dikirim ke browser), lalu jalankan
ulang `npm run editor`. Contoh ada di `.env.example`:

```
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
PIXEL_TOOL_URL=http://localhost:8000/api/generate
```

Model bawaan `gpt-image-2` dan `gemini-3.1-flash-image`; ganti lewat `OPENAI_IMAGE_MODEL` / `GEMINI_IMAGE_MODEL`.

## Yang perlu diingat

- **Jangan ganti id peta yang sudah dipakai pemain.** Save pemain menyimpan id lokasi; mengganti id
  di tab Peta membuat file baru, file lama tidak dihapus.
- Upgrade kursi (Bangku tambahan +3, Tikar kedua +4, Area makan luas +3, Kursi plastik +2,
  Tikar ketiga +4, Meja payung +4) sebaiknya punya kursi sebanyak itu di setiap peta. Tab Cek
  memperingatkan bila jumlahnya beda.
- Objek inti sebaiknya ber-id `cart`, `stove`, `seller`, `canopy` (otomatis saat dipasang) agar
  upgrade gerobak/tenda mengganti tampilannya.
- Setiap kali menimpa file, salinan lama disimpan di `tools/map-editor/backups/` (diabaikan git).
- Draf yang belum disimpan ikut tersimpan di browser; bila tab tertutup, editor menawarkan untuk
  memulihkannya.
- Peta di `src/data/maps/*.json` terdaftar otomatis (`src/world/maps.ts` memakai `import.meta.glob`),
  jadi tidak perlu mengubah kode untuk menambah peta.

## Struktur kode

| File | Isi |
|---|---|
| `vite.editor.config.ts` | Server khusus editor (port 5180) |
| `tools/map-editor/server.ts` | API baca/tulis file, validasi ulang di server, cadangan |
| `tools/map-editor/src/model.ts` | Model peta editor ⇄ JSON game |
| `tools/map-editor/src/format.ts` | Penulis JSON bergaya sama dengan file yang ada (diff kecil) |
| `tools/map-editor/src/validate.ts` | Error & peringatan |
| `tools/map-editor/src/locationsFile.ts` | Sisip/ganti/hapus satu entri `locations.json` tanpa menulis ulang file |
| `tools/map-editor/src/viewport.ts` | Kanvas: gambar, zoom, uji klik |
| `tools/map-editor/src/input.ts` | Mouse & keyboard |
| `tools/map-editor/src/panels.ts` | Panel kanan |
| `tools/map-editor/src/studio.ts` | Studio objek (editor piksel) |
| `tools/map-editor/src/procedural.ts` | Generator prosedural dari deskripsi |
| `tools/map-editor/src/raster.ts` | Olah gambar: buang latar, perkecil, palet, isi ember |
| `tools/map-editor/generators.ts` | Penyedia AI (OpenAI, Gemini, tool HTTP) di server editor |
| `src/world/customObjects.ts`, `src/graphics/customArt.ts` | Objek kustom di game: data, tekstur, animasi, lampu |
| `tests/mapEditor.test.ts`, `tests/customObjects.test.ts` | Uji editor & objek kustom |
