/**
 * Riwayat pembaruan game, terbaru di atas. Entri pertama HARUS sama dengan GAME_CONFIG.version
 * (dicek oleh test) — panel changelog muncul otomatis sekali tiap kali versi ini berubah.
 */
import { isEnglish } from '../i18n/i18n';
import { CHANGELOG_EN } from '../i18n/en/changelog';

export interface ChangelogEntry {
  version: string;
  title: string;
  items: readonly string[];
}

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    version: '0.18.1',
    title: 'Minigame baru untuk tantangan kampung',
    items: [
      'Ormas: adu gertak diganti Kumpulkan warga. Ketuk tangan kuning warga dalam 10 detik sampai cukup orang berdiri di belakangmu. Hati-hati dengan tangan merah, itu anggota ormas yang menyamar.',
      'Pelanggan bernama yang sudah akrab (tahap 2 ke atas) dan sedang duduk di angkringan langsung berdiri membelamu.',
      'ODGJ, cara halus: Ikuti iramanya. Dia bersenandung lagu dolanan, dan kamu mengetuk mengikuti iramanya sampai dia tenang. Tetap bisa dimainkan tanpa suara.',
      'ODGJ, bantuan warga: Telepon berantai. Telepon Pak Gito, Bu Surti, Pak RT, dan lainnya saat mereka online. Makin akrab, makin sering mereka mengangkat telepon.',
      'Mbak Ratna dan Pak Bram sekarang menyebut pesanan kesukaannya dengan cara sendiri. Tebak dengan benar untuk hati +2.',
    ],
  },
  {
    version: '0.18.0',
    title: 'Kampung tidak selalu tenang',
    items: [
      'Mulai hari ke-4, ada tiga tamu tak diundang. Makin terkenal angkringanmu, makin sering mereka datang.',
      'Kucing liar suka mencuri 1–2 porsi dari papan Siap Dijual. Beli upgrade "Pelihara kucing", dan Si Belang yang berjaga di samping gerobak.',
      'ODGJ kadang berdiri di dekat gerobak sampai jam 22.00, dan sebagian pelanggan menjauh. Ketuk balon "!!!": tawarkan yang hangat sesuai petunjuknya, atau ketuk kentongan memanggil warga.',
      'Ormas datang meminta uang keamanan 10–15% dari hasil kemarin. Bayar, atau adu gertak 3 ronde dengan membaca gerak tubuh ketuanya. Kalah berarti bayar 20%.',
      'Setiap minigame cuma 10–20 detik, dan jam berhenti selama minigame terbuka. Tidak mau main? Ada tombol Lewati.',
      'Dua lokasi baru: Seberang RSJ dan Depan Mabes. Di sana kamu bisa berkenalan dengan Mbak Ratna (perawat) dan Pak Bram (polisi).',
      'Ngobrol dengan mereka sekali sehari sampai 5 hati. Setelah itu mereka mampir di lokasi mana pun, dan kalau tantangan datang saat mereka sedang makan, ambulans atau mobil patroli yang menyelesaikannya.',
      'Semua kejadian tercatat di laporan harian, termasuk uang keamanan yang keluar. Penjelasan lengkapnya ada di Panduan → Tantangan.',
    ],
  },
  {
    version: '0.17.0',
    title: 'Sekarang ada bahasa Inggris',
    items: [
      'Game kini tersedia dalam bahasa Inggris. Ganti bahasa di Pengaturan → Bahasa, dari menu utama atau menu jeda.',
      'Semua ikut diterjemahkan: menu, panduan, cerita Gang Melati, nama menu, upgrade, event, laporan, dan catatan pembaruan ini.',
      'Dalam bahasa Inggris, uang dan jam memakai format Inggris (Rp1,500 · Rp75K · 17:00). Progres tidak berubah saat bahasa diganti.',
      'Pemain baru mulai dengan bahasa browser-nya. Pemain lama tetap berbahasa Indonesia sampai menggantinya sendiri.',
    ],
  },
  {
    version: '0.16.0',
    title: 'Siapa juragan paling jago di kampung?',
    items: [
      'Sekarang ada Leaderboard di menu utama. Adu rekor dengan pemain lain di 5 kategori: hari terlama, pendapatan, laba, dan rugi terbesar dalam satu hari, plus kas terbanyak.',
      'Ya, rugi terbesar juga ada papannya. Kalau dagangan lagi apes, setidaknya bisa jadi juara di situ.',
      'Masuk lewat ikon 👤 pakai akun Google atau email, lalu pilih username. Rekormu terkirim sendiri setiap progres tersimpan, dan peringkatmu tetap kelihatan walau belum masuk 50 besar.',
      'Progres ikut tersimpan di akun. Ganti HP atau main di laptop? Masuk dengan akun yang sama, lanjutkan dari hari terakhir.',
      'Kalau progres di akun dan di perangkat berbeda, kamu yang memilih mana yang dipakai. Yang tidak dipilih tetap dicadangkan.',
      'Tidak mau login? Tidak apa-apa. Progres tetap tersimpan di perangkat seperti biasa, hanya rekormu tidak masuk leaderboard.',
      'Username bisa diganti 30 hari sekali dan tidak bisa kembar dengan pemain lain.',
      'Supaya adil, save yang diubah di luar game ditandai dan rekornya tidak dihitung di leaderboard.',
      'Belanja Bahan punya kolom pencarian. Ketik "teh", langsung ketemu. Di desktop, tekan / untuk mulai mencari.',
    ],
  },
  {
    version: '0.15.0',
    title: 'Pesanan dari cabang & filter Belanja',
    items: [
      'Pesanan online bisa dikirim dari cabang: pilih "Kirim dari" toko utama atau cabang, atau tekan Pilih terbaik untuk sumber tercepat yang stoknya cukup.',
      'Cabang selalu menyisakan 2 porsi atau 30% stok tiap menu untuk pembeli di tempat, dan butuh karyawan jaga untuk mengantar.',
      'Kirim dari cabang: tanpa komisi, ongkir pembeli masuk kas, biaya antar Rp2.000 per pesanan (Rp1.000 dengan motor pengantar cabang).',
      'Di desktop, pilihan sumber tampil berdampingan dengan tabel stok per menu.',
      'Belanja punya tab kategori (Lauk, Sayur, Karbo, Bumbu, Minuman, Lainnya) dan filter Harga turun, Daftar persiapan (bahan untuk menu di Daftar persiapan), Stok menipis, Cepat basi. Keranjang tetap tersimpan saat filter diganti.',
    ],
  },
  {
    version: '0.14.3',
    title: 'Daftar persiapan tetap tersimpan',
    items: [
      'Menu di Daftar persiapan tidak hilang lagi setelah tombol Masak ditekan. Hapus menu dengan tombol × atau Kosongkan.',
    ],
  },
  {
    version: '0.14.2',
    title: 'Riwayat hari lebih lengkap',
    items: [
      'Detail riwayat hari kini mencatat semua isi laporan: produk terlaris, kurang diminati, kehabisan stok, tersisa, dan terbuang; pelanggan; pesanan online; dan hasil tiap cabang.',
      'Setiap bagian menampilkan ringkasan singkat di judulnya, jadi tidak perlu dibuka satu per satu untuk tahu isinya.',
      'Rincian cabang di riwayat hari lengkap: pendapatan, selisih kas, operasional, gaji, dan tiap produk yang diterima, terjual, tersisa, dan terbuang.',
      'Perbaikan: tab Ringkasan/Riwayat di desktop tidak lagi tembus pandang saat digulir.',
    ],
  },
  {
    version: '0.14.1',
    title: 'Riwayat penjualan & gulir lebih nyaman',
    items: [
      'Tab Riwayat baru di Statistik: lihat penjualan 7, 30, atau 60 hari terakhir — ringkasan, grafik batang (hari rugi berwarna merah), dan daftar per hari.',
      'Ketuk batang atau baris hari untuk melihat detailnya: keuangan, menu terlaris, pelanggan, dan kejadian hari itu.',
      'Di desktop, riwayat tampil berdampingan: daftar hari di kiri, detail hari terpilih di kanan (pindah hari dengan tombol ↑/↓).',
      'Persiapan Dapur tidak lagi melompat ke atas setelah menekan "+ Tambah" — posisi gulir tetap di menu yang diketuk.',
      'Pengaturan → Tampilan: sakelar "Gulir otomatis" untuk kembali pindah ke Daftar persiapan setelah menambah menu (bawaan mati).',
    ],
  },
  {
    version: '0.14.0',
    title: 'Cabang Angkringan',
    items: [
      'Buka sampai 3 cabang lewat Usaha → Cabang.',
      'Cabang berjualan sendiri di latar belakang selama jam jualan toko utama — asal punya karyawan dan produk yang kamu kirim dari toko utama.',
      'Rekrut karyawan dengan gaji harian, mingguan, atau bulanan. Lebih murah berarti terikat lebih lama; gaji telat menurunkan kinerja, telat 3× karyawan keluar.',
      'Cabang buka membayar sewa + operasional setiap hari. Tutup sementara cabang yang tidak dipakai, atau pindahkan ke lokasi lain.',
      'Satu lokasi hanya untuk satu angkringan yang buka, dan cabang mengikuti event harian di lokasinya.',
      '5 upgrade yang tersedia untuk cabang',
      'Laporan harian menampilkan hasil tiap cabang, dengan rincian terjual, tersisa, dan terbuang.',
    ],
  },
  {
    version: '0.13.3',
    title: 'Pengaturan pesanan online',
    items: [
      'Panel Pengantaran menampilkan rating kemitraan dengan bintang di bagian atas.',
      'Sakelar baru untuk membuka atau menutup pesanan online kapan saja. Pesanan yang sudah diterima tetap diantar.',
      'Harga menu online bisa diatur terpisah dari harga di tempat. Harga yang lebih mahal membuat pesanan online lebih jarang masuk.',
      'Kurir sendiri tidak lagi dibatasi 2× antar per hari — Mas Joko bolak-balik sepanjang jam jualan (tetap maks. 3 pesanan sekali antar).',
    ],
  },
  {
    version: '0.13.2',
    title: 'Pengantar bermotor',
    items: [
      'Driver ojol kini terlihat datang naik motor ke jalan di samping gerobak, berhenti mengambil pesanan, lalu berangkat mengantar.',
      'Kurir sendiri siaga dengan motornya di samping gerobak, berangkat saat mengantar, dan kembali siaga setelah pesanan selesai.',
    ],
  },
  {
    version: '0.13.1',
    title: 'Saringan menu dapur & pesanan lebih santai',
    items: [
      'Panel Persiapan Dapur punya tombol Semua / Makanan / Minuman di judul Menu, jadi pemain ponsel tidak perlu menggulir jauh untuk membuat minuman.',
      'Saat pesanan online masuk dan kecepatan 2× atau 3×, permainan otomatis kembali ke 1× agar sempat membaca pesanan.',
    ],
  },
  {
    version: '0.13.0',
    title: 'Pesanan Online & tombol baru',
    items: [
      'Pesanan online! Saat berjualan, pesanan dari luar warung masuk lewat tombol Pesanan (atau O). Terima atau tolak sebelum waktunya habis.',
      'Pilih cara mengantar di Usaha → Pengantaran: kurir sendiri (gaji harian, ongkir masuk kas) atau kemitraan ojol (tanpa gaji, komisi 20%).',
      'Pesanan memakai stok yang sama dengan pembeli di tempat. Kalau stok keburu habis, pesanan batal dan rating turun.',
      'Rating kemitraan, catatan pembeli, hujan yang memperlambat kurir, dan 4 upgrade baru: sistem pemesanan (2 tingkat), motor kurir, kotak termos.',
      'Event pesanan online seperti Diskon Toko Online. Kalau ada dua event sekaligus, chip di atas menampilkan "2 event".',
      'Bar bawah lebih ringkas: Upgrade, Promosi, Statistik, dan Bank kini ada di tombol Usaha. Bank juga bisa dibuka dengan mengetuk kas.',
      'Info kursi pindah ke chip kecil di atas layar. Pintasan keyboard lama tetap berlaku.',
    ],
  },
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

/** Catatan pembaruan dalam bahasa aktif (versi Inggris dari src/i18n/en/changelog.ts). */
export function localizedChangelog(): readonly ChangelogEntry[] {
  if (!isEnglish()) return CHANGELOG;
  return CHANGELOG.map((e) => {
    const en = CHANGELOG_EN[e.version];
    return en ? { version: e.version, title: en.title, items: en.items } : e;
  });
}
