/**
 * Konfigurasi ekonomi. Harga dasar bahan & harga jual resep ada di
 * src/data/ingredients.json dan src/data/recipes.json.
 */
export const ECONOMY_CONFIG = {
  currencyCode: 'IDR',
  startingMoney: 500_000,
  dailyOperationalCost: 10_000,
  /** Harga bahan: naik pelan tiap hari + fluktuasi kecil harian. */
  ingredientPrices: {
    dailyInflation: 0.004,
    priceSwing: 0.08,
    minPriceFactor: 0.85,
  },
  /** Batas kemasan per bahan dalam satu transaksi (mencegah salah ketik). */
  maxPacksPerLine: 50,
} as const;
