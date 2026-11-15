/**
 * Riwayat pembaruan game, terbaru di atas. Entri pertama HARUS sama dengan GAME_CONFIG.version
 * (dicek oleh test) — panel changelog muncul otomatis sekali tiap kali versi ini berubah.
 */
export interface ChangelogEntry {
  version: string;
  title: string;
  items: readonly string[];
}

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    version: '0.12.1',
    title: 'Suara jangkrik lebih nyaman',
    items: [
      'Jangkrik kini memakai suara rekaman asli, lebih lembut dan tidak menusuk telinga.',
      'Jangkrik berkicau bersahutan dengan jeda yang lebih panjang, dan sesekali hening.',
      'Suara jangkrik hanya terdengar saat sesi penjualan. Menu utama dan persiapan lebih tenang.',
    ],
  },
  {
    version: '0.12.0',
    title: 'Kabar Kampung & Buku Dapur Kardi',
    items: [
      'Cerita baru di Gang Melati: gerobak Mbah Kardi, Buku Dapur tulisan Sri, dan rencana ruko Pak Hendra yang mengancam ujung gang.',
      'Pelanggan bernama: Pak Gito, Bu Surti, Mas Bayu, dan Pak Hendra. Ketuk gelembung "..." di atas mereka untuk mengobrol. Waktu berhenti selama dialog.',
      'Tombol Kabar Kampung di pojok kanan atas (atau tombol N): log kabar, Buku Dapur Kardi (7 bab), kedekatan dengan warga, dan keputusan.',
      'Kedekatan naik kalau kamu melayani dengan baik, menyediakan menu favorit, dan mau mengobrol. Kedekatan membuka cerita pribadi.',
      'Empat pilihan di akhir cerita dengan akhir yang berbeda, plus menu rahasia Sego Sambal Sri.',
      'Kabar yang terlewat tidak hilang: setelah 5 hari kamu mendengarnya dari warga. Cerita tidak pernah menghalangi berjualan.',
      'Save lama tetap aman: cerita dimulai dari hari saat kamu memperbarui.',
    ],
  },
  {
    version: '0.11.1',
    title: 'Catatan Pembaruan',
    items: [
      'Panel "Apa yang baru" muncul sekali di halaman awal setiap ada pembaruan.',
      'Buka lagi kapan saja lewat ikon 📜 di pojok kanan atas halaman awal.',
      'Berisi riwayat lengkap dari versi pertama sampai sekarang.',
    ],
  },
  {
    version: '0.11.0',
    title: 'Panduan & Info, urutan menu',
    items: [
      'Tombol "Panduan & Info" di menu utama, menu jeda, dan tombol H saat bermain.',
      'Berisi 10 tab: cara main, event, cuaca, lokasi, pelanggan, menu, upgrade, bank & promosi, pencapaian, dan kontrol.',
      'Saat bermain, panduan menandai event & cuaca hari ini, lokasimu, menu yang terbuka, dan upgrade yang terpasang.',
      'Daftar menu di Persiapan kini rapi: yang terbuka di atas, yang terkunci di bawah, makanan dulu baru minuman.',
    ],
  },
  {
    version: '0.10.0',
    title: 'Pasar Malam, menu & upgrade baru, rilis web',
    items: [
      '10 menu baru (total 30), antara lain pisang goreng, jagung bakar, kopi susu, teh tarik, dan pisang bakar keju-cokelat.',
      'Lokasi baru Pasar Malam: ramai larut malam & akhir pekan, tapi sore sepi dan sewa mahal.',
      'Upgrade gudang (kapasitas sampai 4.100), kursi tambahan (total 30), dan kenyamanan: kipas, terpal anti hujan, Wi-Fi, radio, toilet.',
      '7 event baru: konser dangdut, kembang api, rombongan bus wisata (borongan minuman), dan lainnya.',
      'Game bisa dipasang ke layar utama HP/desktop lewat tombol "Pasang game" dan dimainkan offline.',
      'Pembaruan terpasang otomatis tanpa mengganggu permainan yang sedang berjalan.',
    ],
  },
  {
    version: '0.9.0',
    title: 'Pindah lokasi & peta baru',
    items: [
      'Pindah lokasi saat persiapan lewat chip 📍 (sekali sehari, bayar biaya pindah, sebagian pelanggan tetap tertinggal).',
      'Peta baru Pinggir Pasar (bahan lebih murah, ramai sore) dan Depan Stasiun (dua gelombang ramai, pelanggan kurang sabar).',
      'Upgrade Kulkas: minuman dan bahan dingin lebih awet.',
    ],
  },
  {
    version: '0.8.0',
    title: 'Event harian, pencapaian & Bank',
    items: [
      'Lokasi baru Dekat Kampus, dan hari kerja vs akhir pekan kini terasa bedanya.',
      'Event acak harian: nobar bola, hajatan (pesanan borongan), harga cabai naik, food vlogger, gajian, dan lainnya.',
      '16 pencapaian dengan hadiah uang.',
      'Bank: deposito berbunga dan pinjaman yang bisa dicicil.',
    ],
  },
  {
    version: '0.7.1',
    title: 'Etalase, gudang & pesanan rombongan',
    items: [
      'Papan "Siap Dijual" di kiri layar; menu yang habis tetap tampil sebagai "× 0".',
      'Panel Gudang: lihat isi, umur simpan, dan buang bahan yang tidak dipakai.',
      'Setiap anggota rombongan memesan minimal satu menu.',
    ],
  },
  {
    version: '0.7.0',
    title: 'Perbaikan & optimasi',
    items: [
      'Perbaikan: pelanggan tidak lagi tertutup bangku; panel tidak terbuka sendiri setelah kembali ke menu.',
      'Pengaturan kualitas grafis: Otomatis, Tinggi, atau Hemat baterai.',
      'Ukuran unduhan pembaruan lebih kecil.',
    ],
  },
  {
    version: '0.6.0',
    title: 'Suara, animasi & tutorial',
    items: [
      'Musik latar bernuansa gamelan, efek suara, serta suasana jangkrik & hujan.',
      'Koin memantul, angka kas melayang, dan kartu judul di awal setiap hari.',
      'Tutorial singkat 5 langkah untuk pemain baru.',
    ],
  },
  {
    version: '0.5.0',
    title: 'Harga jual, upgrade & cuaca',
    items: [
      'Atur harga jual sendiri: lebih murah lebih laris, lebih mahal untung lebih besar.',
      '17 upgrade gerobak, peralatan, kapasitas, dan lingkungan yang langsung terlihat di peta.',
      'Level usaha membuka menu baru: nasi kucing, wedang jahe, kopi joss, sego bakar.',
      'Cuaca harian (cerah, berawan, hujan, panas) dan aturan bangkrut.',
    ],
  },
  {
    version: '0.4.0',
    title: 'Laporan harian & popularitas',
    items: [
      'Laporan keuangan setiap tutup: omzet, modal, laba, menu terlaris, dan stok terbuang.',
      'Popularitas dan loyalitas pelanggan.',
      '5 jenis promosi satu hari dan panel Statistik.',
    ],
  },
  {
    version: '0.3.0',
    title: 'Pelanggan berdatangan',
    items: [
      '7 tipe pelanggan dengan uang, kesabaran, dan selera masing-masing.',
      'Kursi, antrean, kepuasan, serta kecepatan waktu 1×–3×.',
    ],
  },
  {
    version: '0.2.0',
    title: 'Belanja & memasak',
    items: [
      'Belanja bahan dengan harga yang berubah setiap hari.',
      '15 resep pertama, stok dengan tanggal basi, dan simpan otomatis.',
    ],
  },
  {
    version: '0.1.0',
    title: 'Versi pertama',
    items: ['Angkringan isometrik malam hari, kamera yang bisa digeser & di-zoom, menu utama, dan HUD.'],
  },
];
