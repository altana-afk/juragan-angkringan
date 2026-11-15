/** Balancing permintaan & penjualan (Stage 3). */
export const DEMAND_CONFIG = {
  /** Rata-rata rombongan pelanggan per hari pada popularitas 10 tanpa iklan. */
  baseCustomersPerDay: 18,
  /** Tambahan kedatangan maksimum dari loyalitas 100 (+25%). */
  loyaltyArrivalBoost: 0.25,
  /** Mulai jam ini (menit) makanan mengenyangkan lebih dicari. */
  lateNightFrom: 22 * 60,
  lateNightFillingBoost: 1.6,
  /** Peluang mengganti pesanan yang habis dengan produk sekategori. */
  substituteChance: 0.6,
  /** Peluang tetap membeli sisa pesanan saat sebagian habis. */
  keepPartialChance: 0.75,
  /** Lama duduk/makan (menit permainan) per porsi. */
  eatMinutesPerItem: 6,
  eatMinutesMin: 8,
  eatMinutesMax: 30,
  /** Lama memesan & dilayani (menit permainan). */
  orderMinutes: 3,
  satisfaction: {
    base: 60,
    perFulfilled: 12,
    perSubstituted: 4,
    perMissing: -18,
    leftEmpty: 10,
    leftWaiting: 5,
    /** Penalti per menit menunggu tempat setelah 3 menit pertama. */
    perWaitMinute: -2,
  },
} as const;
